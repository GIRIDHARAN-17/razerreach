"""
Cart service — shopping cart CRUD, price snapshotting, stale price/stock validation,
server-side total calculations (integer paise), and checkout preview.
All financial totals originate from live database product records.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import HTTPException, status
from pymongo.errors import PyMongoError

from app.models.cart import cart_helper
from app.schemas.cart import CheckoutChange, CheckoutPreviewResponse

logger = logging.getLogger("razorreach.cart_service")


async def get_active_cart(db, user_id: str) -> dict:
    """Get customer's active cart or create one if it doesn't exist."""
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    try:
        cart = await db.carts.find_one({"user_id": user_id, "status": "active"})
        if not cart:
            now = datetime.now(timezone.utc).isoformat()
            new_cart = {
                "user_id": user_id,
                "merchant_id": None,
                "items": [],
                "subtotal": 0.0,
                "delivery_fee": 0.0,
                "tax": 0.0,
                "discount": 0.0,
                "total": 0.0,
                "currency": "INR",
                "status": "active",
                "created_at": now,
                "updated_at": now,
            }
            res = await db.carts.insert_one(new_cart)
            new_cart["_id"] = res.inserted_id
            cart = new_cart
        return cart
    except PyMongoError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")


def _recalculate_cart_totals(cart: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate subtotal and total deterministically from item price snapshots and quantities."""
    subtotal_paise = 0
    for item in cart.get("items", []):
        unit_paise = int(round(float(item.get("price_snapshot", 0)) * 100))
        qty = int(item.get("quantity", 0))
        subtotal_paise += unit_paise * qty

    delivery_paise = int(round(float(cart.get("delivery_fee", 0)) * 100))
    tax_paise = int(round(float(cart.get("tax", 0)) * 100))
    discount_paise = int(round(float(cart.get("discount", 0)) * 100))

    total_paise = max(0, subtotal_paise + delivery_paise + tax_paise - discount_paise)

    cart["subtotal"] = round(subtotal_paise / 100.0, 2)
    cart["total"] = round(total_paise / 100.0, 2)
    return cart


async def add_item(db, user_id: str, product_id: str, quantity: int) -> dict:
    """Add a product item to the customer's active cart with authoritative MongoDB pricing."""
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    if quantity <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quantity must be greater than 0")

    # Fetch product from live DB
    try:
        product = await db.products.find_one({"_id": ObjectId(product_id)})
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    if product.get("status") != "published":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Product is not currently available for purchase")

    live_stock = int(product.get("stock", 0))
    if live_stock < quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient stock. Requested: {quantity}, Available: {live_stock}",
        )

    live_price = float(product.get("price", 0))
    cart = await get_active_cart(db, user_id)
    items = cart.get("items", [])

    # Check if item already exists in cart
    existing = False
    for item in items:
        if str(item.get("product_id")) == product_id:
            new_qty = item["quantity"] + quantity
            if live_stock < new_qty:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Insufficient stock to add more. Requested total: {new_qty}, Available: {live_stock}",
                )
            item["quantity"] = new_qty
            item["price_snapshot"] = live_price
            item["name_snapshot"] = product.get("name", "")
            item["image_url"] = product.get("image_url")
            existing = True
            break

    if not existing:
        items.append({
            "product_id": product_id,
            "quantity": quantity,
            "price_snapshot": live_price,
            "name_snapshot": product.get("name", ""),
            "image_url": product.get("image_url"),
            "merchant_id": str(product.get("merchant_id", "")),
        })

    cart["items"] = items
    if items and not cart.get("merchant_id"):
        cart["merchant_id"] = str(product.get("merchant_id", ""))

    cart = _recalculate_cart_totals(cart)
    cart["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        await db.carts.update_one({"_id": cart["_id"]}, {"$set": cart})
        return cart_helper(cart)
    except PyMongoError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")


async def update_item(db, user_id: str, product_id: str, quantity: int) -> dict:
    """Update item quantity in active cart."""
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    if quantity <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quantity must be greater than 0. Use DELETE to remove item.")

    cart = await get_active_cart(db, user_id)
    items = cart.get("items", [])

    item_found = False
    for item in items:
        if str(item.get("product_id")) == product_id:
            # Re-fetch live product for stock & price validation
            try:
                p = await db.products.find_one({"_id": ObjectId(product_id)})
            except Exception:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

            if not p or p.get("status") != "published":
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Product is no longer available")

            live_stock = int(p.get("stock", 0))
            if live_stock < quantity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Insufficient stock. Requested: {quantity}, Available: {live_stock}",
                )

            item["quantity"] = quantity
            item["price_snapshot"] = float(p.get("price", 0))
            item["name_snapshot"] = p.get("name", "")
            item["image_url"] = p.get("image_url")
            item_found = True
            break

    if not item_found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found in cart")

    cart["items"] = items
    cart = _recalculate_cart_totals(cart)
    cart["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        await db.carts.update_one({"_id": cart["_id"]}, {"$set": cart})
        return cart_helper(cart)
    except PyMongoError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")


async def remove_item(db, user_id: str, product_id: str) -> dict:
    """Remove a product item from the active cart."""
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    cart = await get_active_cart(db, user_id)
    items = cart.get("items", [])

    new_items = [item for item in items if str(item.get("product_id")) != product_id]
    if len(new_items) == len(items):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found in cart")

    cart["items"] = new_items
    if not new_items:
        cart["merchant_id"] = None

    cart = _recalculate_cart_totals(cart)
    cart["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        await db.carts.update_one({"_id": cart["_id"]}, {"$set": cart})
        return cart_helper(cart)
    except PyMongoError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")


async def clear_cart(db, user_id: str) -> dict:
    """Clear all items from the customer's active cart."""
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    cart = await get_active_cart(db, user_id)
    cart["items"] = []
    cart["merchant_id"] = None
    cart["subtotal"] = 0.0
    cart["total"] = 0.0
    cart["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        await db.carts.update_one({"_id": cart["_id"]}, {"$set": cart})
        return cart_helper(cart)
    except PyMongoError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")


async def checkout_preview(db, user_id: str) -> CheckoutPreviewResponse:
    """
    Re-fetch live products for all cart items, revalidate stock and current prices,
    detect changes, and return a validated checkout summary.
    """
    cart = await get_active_cart(db, user_id)
    raw_items = cart.get("items", [])

    if not raw_items:
        return CheckoutPreviewResponse(
            items=[],
            subtotal=0.0,
            delivery_fee=0.0,
            tax=0.0,
            discount=0.0,
            total=0.0,
            amount_paise=0,
            currency="INR",
            valid=True,
            changes=[],
        )

    validated_items = []
    changes = []
    is_valid = True
    subtotal_paise = 0

    for item in raw_items:
        pid = str(item.get("product_id"))
        qty = int(item.get("quantity", 0))
        old_price = float(item.get("price_snapshot", 0))

        try:
            product = await db.products.find_one({"_id": ObjectId(pid)})
        except Exception:
            product = None

        if not product or product.get("status") != "published":
            is_valid = False
            changes.append(CheckoutChange(
                product_id=pid,
                reason="product_unavailable",
                old_price=old_price,
            ))
            continue

        live_price = float(product.get("price", 0))
        live_stock = int(product.get("stock", 0))
        stock_ok = live_stock >= qty

        if not stock_ok:
            is_valid = False
            changes.append(CheckoutChange(
                product_id=pid,
                reason="insufficient_stock",
                old_stock=live_stock,
                current_stock=live_stock,
            ))

        if live_price != old_price:
            changes.append(CheckoutChange(
                product_id=pid,
                reason="price_changed",
                old_price=old_price,
                current_price=live_price,
            ))

        unit_paise = int(round(live_price * 100))
        line_paise = unit_paise * qty
        subtotal_paise += line_paise

        validated_items.append({
            "product_id": pid,
            "name": product.get("name", ""),
            "quantity": qty,
            "unit_price": live_price,
            "line_total": round(line_paise / 100.0, 2),
            "image_url": product.get("image_url"),
            "stock_available": stock_ok,
        })

    total_paise = subtotal_paise  # delivery/tax/discount 0 for MVP
    total_val = round(total_paise / 100.0, 2)

    merchant_name = "RazorReach Store"
    if validated_items:
        first_pid = validated_items[0]["product_id"]
        try:
            p_doc = await db.products.find_one({"_id": ObjectId(first_pid)})
            if p_doc and p_doc.get("merchant_id"):
                m_doc = await db.merchants.find_one({"_id": ObjectId(p_doc["merchant_id"])})
                if m_doc and m_doc.get("business_name"):
                    merchant_name = m_doc["business_name"]
        except Exception:
            pass

    return CheckoutPreviewResponse(
        items=validated_items,
        subtotal=total_val,
        delivery_fee=0.0,
        tax=0.0,
        discount=0.0,
        total=total_val,
        amount_paise=total_paise,
        currency="INR",
        merchant_name=merchant_name,
        valid=is_valid and len(changes) == 0,
        changes=changes,
    )


async def prepare_checkout(db, user_id: str) -> dict:
    """
    Authoritative order preparation helper for Task 10.
    Re-fetches current live product records and calculates exact payable amount in paise.
    Raises HTTPException if checkout is invalid or items are out of stock.
    """
    preview = await checkout_preview(db, user_id)
    if not preview.items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cart is empty")

    if not preview.valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Checkout validation failed due to stock shortages or unavailable products. Preview checkout first.",
        )

    cart = await get_active_cart(db, user_id)
    first_item_pid = preview.items[0].product_id
    product = await db.products.find_one({"_id": ObjectId(first_item_pid)})
    merchant_id = str(product.get("merchant_id", "")) if product else ""

    return {
        "user_id": user_id,
        "merchant_id": merchant_id,
        "items": [item.model_dump() for item in preview.items],
        "subtotal": preview.subtotal,
        "delivery_fee": preview.delivery_fee,
        "tax": preview.tax,
        "discount": preview.discount,
        "total": preview.total,
        "amount_paise": preview.amount_paise,
        "currency": preview.currency,
    }

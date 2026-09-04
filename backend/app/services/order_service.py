"""
Order service — order state machine, immutable purchase pricing,
atomic inventory decrements on confirmed payment, and customer order retrieval.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import HTTPException, status
from pymongo.errors import PyMongoError

from app.models.order import order_helper
from app.schemas.audit import AuditAction, AuditResourceType, AuditResult
from app.schemas.order import OrderStatus
from app.services import cart_service
from app.services.audit_service import record_audit_event

logger = logging.getLogger("razorreach.order_service")


async def create_pending_order(db, user_id: str) -> dict:
    """
    Create an internal pending order from the customer's server-validated checkout preview.
    Stores historical price_at_purchase for every item.
    """
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    checkout = await cart_service.prepare_checkout(db, user_id)
    now = datetime.now(timezone.utc).isoformat()

    order_items = []
    for item in checkout["items"]:
        order_items.append({
            "product_id": item["product_id"],
            "name": item["name"],
            "quantity": item["quantity"],
            "price_at_purchase": item["unit_price"],
            "line_total": item["line_total"],
            "image_url": item.get("image_url"),
        })

    new_order = {
        "user_id": user_id,
        "merchant_id": checkout.get("merchant_id", ""),
        "merchant_name": checkout.get("merchant_name") or "RazorReach Store",
        "items": order_items,
        "subtotal": checkout["subtotal"],
        "delivery_fee": checkout["delivery_fee"],
        "tax": checkout["tax"],
        "discount": checkout["discount"],
        "total": checkout["total"],
        "amount_paise": checkout["amount_paise"],
        "currency": checkout["currency"],
        "status": OrderStatus.PAYMENT_PENDING.value,
        "razorpay_order_id": None,
        "created_at": now,
        "updated_at": now,
    }

    try:
        res = await db.orders.insert_one(new_order)
        new_order["_id"] = res.inserted_id
        order_id = str(res.inserted_id)

        await record_audit_event(
            db=db,
            action=AuditAction.ORDER_CREATED,
            resource_type=AuditResourceType.ORDER,
            actor_id=user_id,
            actor_role="customer",
            resource_id=order_id,
            metadata={"item_count": len(order_items), "total": checkout["total"]},
        )

        return new_order
    except PyMongoError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")


async def get_order(db, order_id: str, user_id: str) -> dict:
    """Retrieve an order by ID for the authenticated customer."""
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    try:
        query = {"_id": ObjectId(order_id)}
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    try:
        order = await db.orders.find_one(query)
    except PyMongoError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    if order.get("user_id") != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to requested order")

    return order_helper(order)


async def get_user_orders(db, user_id: str) -> List[dict]:
    """Retrieve all orders for the authenticated customer."""
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    try:
        cursor = db.orders.find({"user_id": user_id}).sort("created_at", -1)
        orders = await cursor.to_list(length=100)
        return [order_helper(o) for o in orders]
    except PyMongoError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")


async def mark_order_paid(db, order_id: str, razorpay_payment_id: Optional[str] = None) -> dict:
    """
    Transition order status to 'paid', perform atomic inventory decrements,
    and clear active customer cart. Idempotent — will not double-process.
    """
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    try:
        order = await db.orders.find_one({"_id": ObjectId(order_id)})
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    # Idempotency check: if already paid, return
    if order.get("status") == OrderStatus.PAID.value:
        return order_helper(order)

    now = datetime.now(timezone.utc).isoformat()

    # Perform atomic stock decrement for each purchased item
    for item in order.get("items", []):
        pid = item.get("product_id")
        qty = item.get("quantity", 1)
        try:
            res = await db.products.update_one(
                {"_id": ObjectId(pid), "stock": {"$gte": qty}},
                {"$inc": {"stock": -qty}},
            )
            if res.modified_count > 0:
                await record_audit_event(
                    db=db,
                    action=AuditAction.INVENTORY_DECREMENTED,
                    resource_type=AuditResourceType.INVENTORY,
                    actor_id=order.get("user_id"),
                    actor_role="customer",
                    resource_id=pid,
                    metadata={"decremented_by": qty, "order_id": order_id},
                )
            else:
                logger.warning(f"Atomic stock decrement skipped for product {pid}: insufficient stock at payment confirmation")
        except Exception as e:
            logger.error(f"Error decrementing stock for product {pid}: {type(e).__name__}")

    # Mark order paid
    update_data = {
        "status": OrderStatus.PAID.value,
        "updated_at": now,
    }
    if razorpay_payment_id:
        update_data["razorpay_payment_id"] = razorpay_payment_id

    await db.orders.update_one({"_id": order["_id"]}, {"$set": update_data})

    first_product_id = order.get("items", [{}])[0].get("product_id") if order.get("items") else None

    await record_audit_event(
        db=db,
        action=AuditAction.ORDER_PAID,
        resource_type=AuditResourceType.ORDER,
        actor_id=order.get("user_id"),
        actor_role="customer",
        resource_id=order_id,
        metadata={
            "total": order.get("total"),
            "merchant_id": order.get("merchant_id"),
            "product_id": first_product_id,
            "razorpay_payment_id": razorpay_payment_id or order.get("razorpay_payment_id"),
        },
    )

    # Clear customer active cart
    try:
        await cart_service.clear_cart(db, order["user_id"])
    except Exception as e:
        logger.warning(f"Failed to clear active cart after order paid: {type(e).__name__}")

    updated_order = await db.orders.find_one({"_id": order["_id"]})
    
    # Record payment_success analytics event
    try:
        from app.services import analytics_service
        await analytics_service.record_event(
            db=db,
            event_type="payment_success",
            user_id=order.get("user_id"),
            merchant_id=order.get("merchant_id"),
            product_id=first_product_id,
            metadata={"order_id": str(order["_id"]), "amount": order.get("total", 0.0)},
        )
    except Exception as e:
        logger.warning(f"Payment success analytics event warning: {type(e).__name__}")

    return order_helper(updated_order)


async def mark_order_failed(db, order_id: str) -> dict:
    """Transition order status to 'payment_failed' without reducing inventory or clearing cart."""
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    try:
        order = await db.orders.find_one({"_id": ObjectId(order_id)})
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    if order.get("status") == OrderStatus.PAID.value:
        return order_helper(order)  # Paid orders cannot become failed

    now = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one(
        {"_id": order["_id"]},
        {"$set": {"status": OrderStatus.PAYMENT_FAILED.value, "updated_at": now}},
    )
    updated_order = await db.orders.find_one({"_id": order["_id"]})

    await record_audit_event(
        db=db,
        action=AuditAction.ORDER_FAILED,
        resource_type=AuditResourceType.ORDER,
        actor_id=order.get("user_id"),
        actor_role="customer",
        resource_id=order_id,
        result=AuditResult.FAILURE,
    )

    # Record payment_failed analytics event
    try:
        from app.services import analytics_service
        await analytics_service.record_event(
            db=db,
            event_type="payment_failed",
            user_id=order.get("user_id"),
            merchant_id=order.get("merchant_id"),
            metadata={"order_id": str(order["_id"]), "amount": order.get("total", 0.0)},
        )
    except Exception as e:
        logger.warning(f"Payment failed analytics event warning: {type(e).__name__}")

    return order_helper(updated_order)

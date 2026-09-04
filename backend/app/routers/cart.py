"""
Cart router — customer shopping cart CRUD and checkout preview.
Authorization and request handling; delegates business logic to cart_service.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import db_manager
from app.core.dependencies import require_customer
from app.schemas.audit import AuditAction, AuditResourceType
from app.schemas.cart import (
    CartItemAdd,
    CartItemUpdate,
    CartResponse,
    CheckoutPreviewResponse,
)
from app.services import cart_service
from app.services.audit_service import record_audit_event

logger = logging.getLogger("razorreach.cart")

router = APIRouter(prefix="", tags=["Cart & Checkout"])


@router.get("/cart", response_model=CartResponse)
async def get_cart(current_user: dict = Depends(require_customer)):
    """Retrieve authenticated customer's active shopping cart."""
    db = db_manager.get_db()
    cart = await cart_service.get_active_cart(db, current_user["id"])
    from app.models.cart import cart_helper
    return cart_helper(cart)


@router.post("/cart/items", response_model=CartResponse, status_code=status.HTTP_200_OK)
async def add_item_to_cart(
    item_data: CartItemAdd,
    current_user: dict = Depends(require_customer),
):
    """Add a product item to active cart. Authoritative price fetched from MongoDB."""
    db = db_manager.get_db()
    res = await cart_service.add_item(db, current_user["id"], item_data.product_id, item_data.quantity)
    if db is not None:
        from app.services import analytics_service
        await analytics_service.record_event(
            db=db,
            event_type="cart_add",
            user_id=current_user["id"],
            product_id=item_data.product_id,
            metadata={"quantity": item_data.quantity},
        )
        await record_audit_event(
            db=db,
            action=AuditAction.CART_ITEM_ADDED,
            resource_type=AuditResourceType.CART,
            actor_id=current_user["id"],
            actor_role="customer",
            resource_id=item_data.product_id,
            metadata={"quantity": item_data.quantity},
        )
    return res


@router.put("/cart/items/{product_id}", response_model=CartResponse)
async def update_cart_item(
    product_id: str,
    item_data: CartItemUpdate,
    current_user: dict = Depends(require_customer),
):
    """Update quantity of an item in active cart."""
    db = db_manager.get_db()
    res = await cart_service.update_item(db, current_user["id"], product_id, item_data.quantity)
    await record_audit_event(
        db=db,
        action=AuditAction.CART_ITEM_UPDATED,
        resource_type=AuditResourceType.CART,
        actor_id=current_user["id"],
        actor_role="customer",
        resource_id=product_id,
        metadata={"new_quantity": item_data.quantity},
    )
    return res


@router.delete("/cart/items/{product_id}", response_model=CartResponse)
async def remove_cart_item(
    product_id: str,
    current_user: dict = Depends(require_customer),
):
    """Remove a product item from active cart."""
    db = db_manager.get_db()
    res = await cart_service.remove_item(db, current_user["id"], product_id)
    await record_audit_event(
        db=db,
        action=AuditAction.CART_ITEM_REMOVED,
        resource_type=AuditResourceType.CART,
        actor_id=current_user["id"],
        actor_role="customer",
        resource_id=product_id,
    )
    return res


@router.delete("/cart", response_model=CartResponse)
async def clear_cart(current_user: dict = Depends(require_customer)):
    """Clear all items from active cart."""
    db = db_manager.get_db()
    res = await cart_service.clear_cart(db, current_user["id"])
    await record_audit_event(
        db=db,
        action=AuditAction.CART_CLEARED,
        resource_type=AuditResourceType.CART,
        actor_id=current_user["id"],
        actor_role="customer",
    )
    return res


@router.post("/checkout/preview", response_model=CheckoutPreviewResponse)
async def preview_checkout(current_user: dict = Depends(require_customer)):
    """
    Revalidate cart items against live database records for price changes & stock shortages.
    Returns authoritative checkout preview without creating payment order.
    """
    db = db_manager.get_db()
    res = await cart_service.checkout_preview(db, current_user["id"])
    if db is not None:
        from app.services import analytics_service
        await analytics_service.record_event(
            db=db,
            event_type="checkout_started",
            user_id=current_user["id"],
            metadata={"item_count": len(res.items), "total": res.total},
        )
        await record_audit_event(
            db=db,
            action=AuditAction.CHECKOUT_STARTED,
            resource_type=AuditResourceType.CHECKOUT,
            actor_id=current_user["id"],
            actor_role="customer",
            metadata={"item_count": len(res.items), "total": res.total, "amount_paise": res.amount_paise},
        )
    return res

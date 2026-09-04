"""
Payment service — Razorpay order creation, HMAC signature verification,
webhook signature verification, idempotency checking, and payment state updates.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from bson import ObjectId
from fastapi import HTTPException, status
from pymongo.errors import PyMongoError

from app.core.config import settings
from app.integrations import razorpay as razorpay_integration
from app.models.payment import payment_helper
from app.schemas.audit import AuditAction, AuditResourceType, AuditResult
from app.schemas.payment import PaymentCreateResponse, PaymentStatus
from app.services import order_service
from app.services.audit_service import record_audit_event

logger = logging.getLogger("razorreach.payment_service")


async def create_payment_order(db, user_id: str) -> PaymentCreateResponse:
    """
    Create a payment order end-to-end:
    1. Revalidates live product prices and stock to create internal pending order.
    2. Server calculates authoritative amount in paise.
    3. Calls Razorpay API to create Razorpay Order.
    4. Links razorpay_order_id to internal order and records payment document.
    """
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    # Step 1: Create internal pending order (validates live prices & stock)
    order = await order_service.create_pending_order(db, user_id)
    order_id = str(order["_id"])
    amount_paise = order["amount_paise"]

    # Step 2: Create Razorpay order via SDK
    try:
        rzp_res = razorpay_integration.create_razorpay_order(
            amount_paise=amount_paise,
            currency="INR",
            receipt=f"rcpt_{order_id}",
        )
    except RuntimeError as e:
        logger.warning(f"Payment order creation failed: {str(e)}")
        await record_audit_event(
            db=db,
            action=AuditAction.PAYMENT_ORDER_CREATED,
            resource_type=AuditResourceType.PAYMENT,
            actor_id=user_id,
            actor_role="customer",
            resource_id=order_id,
            result=AuditResult.FAILURE,
            metadata={"error": str(e)},
        )
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))

    rzp_order_id = rzp_res["razorpay_order_id"]
    now = datetime.now(timezone.utc).isoformat()

    # Step 3: Link razorpay_order_id to internal order
    try:
        await db.orders.update_one(
            {"_id": order["_id"]},
            {"$set": {"razorpay_order_id": rzp_order_id, "updated_at": now}},
        )

        # Step 4: Create payment record in database
        payment_doc = {
            "order_id": order_id,
            "razorpay_order_id": rzp_order_id,
            "amount_paise": amount_paise,
            "currency": "INR",
            "status": PaymentStatus.CREATED.value,
            "signature_verified": False,
            "webhook_verified": False,
            "created_at": now,
            "updated_at": now,
        }
        await db.payments.insert_one(payment_doc)
    except PyMongoError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    await record_audit_event(
        db=db,
        action=AuditAction.PAYMENT_ORDER_CREATED,
        resource_type=AuditResourceType.PAYMENT,
        actor_id=user_id,
        actor_role="customer",
        resource_id=order_id,
        metadata={"razorpay_order_id": rzp_order_id, "amount_paise": amount_paise, "currency": "INR"},
    )

    return PaymentCreateResponse(
        order_id=order_id,
        razorpay_order_id=rzp_order_id,
        razorpay_key_id=settings.RAZORPAY_KEY_ID or "rzp_test_placeholder",
        amount=amount_paise,
        currency="INR",
    )


async def verify_payment_signature(
    db,
    user_id: str,
    razorpay_order_id: str,
    razorpay_payment_id: str,
    signature: str,
) -> dict:
    """
    Verify payment HMAC signature returned by Razorpay Checkout.
    Validates payment amount against internal order and transitions order to 'paid'.
    """
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    # Find internal order by razorpay_order_id
    try:
        order = await db.orders.find_one({"razorpay_order_id": razorpay_order_id})
    except PyMongoError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order associated with payment not found")

    if order.get("user_id") != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to order payment")

    # Verify HMAC SHA256 signature
    is_valid = razorpay_integration.verify_payment_signature(
        razorpay_order_id=razorpay_order_id,
        razorpay_payment_id=razorpay_payment_id,
        razorpay_signature=signature,
    )

    now = datetime.now(timezone.utc).isoformat()
    order_id = str(order["_id"])
    m_id = order.get("merchant_id")
    p_id = order.get("items", [{}])[0].get("product_id") if order.get("items") else None

    if is_valid:
        # Update payment document
        await db.payments.update_one(
            {"razorpay_order_id": razorpay_order_id},
            {"$set": {
                "razorpay_payment_id": razorpay_payment_id,
                "status": PaymentStatus.CAPTURED.value,
                "signature_verified": True,
                "updated_at": now,
            }},
        )
        # Mark order paid & atomic stock decrement
        await order_service.mark_order_paid(db, order_id, razorpay_payment_id)

        await record_audit_event(
            db=db,
            action=AuditAction.PAYMENT_VERIFIED,
            resource_type=AuditResourceType.PAYMENT,
            actor_id=user_id,
            actor_role="customer",
            resource_id=order_id,
            metadata={
                "razorpay_order_id": razorpay_order_id,
                "razorpay_payment_id": razorpay_payment_id,
                "merchant_id": m_id,
                "product_id": p_id,
                "order_id": order_id,
                "amount": order.get("total"),
                "amount_paise": order.get("amount_paise"),
                "currency": order.get("currency", "INR"),
                "verification_source": "checkout",
                "payment_status": "captured",
            },
        )

        return {
            "message": "Payment verified successfully",
            "order_id": order_id,
            "status": "paid",
        }
    else:
        # Update payment document & mark order failed
        await db.payments.update_one(
            {"razorpay_order_id": razorpay_order_id},
            {"$set": {
                "razorpay_payment_id": razorpay_payment_id,
                "status": PaymentStatus.FAILED.value,
                "signature_verified": False,
                "updated_at": now,
            }},
        )
        await order_service.mark_order_failed(db, order_id)

        await record_audit_event(
            db=db,
            action=AuditAction.PAYMENT_FAILED,
            resource_type=AuditResourceType.PAYMENT,
            actor_id=user_id,
            actor_role="customer",
            resource_id=order_id,
            result=AuditResult.FAILURE,
            metadata={
                "razorpay_order_id": razorpay_order_id,
                "merchant_id": m_id,
                "product_id": p_id,
                "reason": "invalid_signature",
            },
        )

        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payment signature")


async def process_webhook(db, body_bytes: bytes, signature: str, event_data: dict, header_event_id: Optional[str] = None) -> dict:
    """
    Process Razorpay webhook events with HMAC signature verification and idempotency protection.
    """
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    # Step 1: Verify webhook HMAC signature
    is_valid = razorpay_integration.verify_webhook_signature(body_bytes, signature)
    if not is_valid:
        await record_audit_event(
            db=db,
            action=AuditAction.PAYMENT_WEBHOOK_PROCESSED,
            resource_type=AuditResourceType.PAYMENT,
            actor_role="system",
            result=AuditResult.FAILURE,
            metadata={"reason": "invalid_webhook_signature"},
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook signature")

    # Step 2: Idempotency Check — check if event was already processed
    event_type = event_data.get("event", "")
    event_id = header_event_id or event_data.get("event_id") or f"{event_type}_{datetime.now(timezone.utc).timestamp()}"

    existing = await db.processed_webhooks.find_one({"event_id": event_id})
    if existing:
        return {"status": "ignored", "reason": "duplicate_webhook"}

    # Step 3: Process event payload
    payload = event_data.get("payload", {}).get("payment", {}).get("entity", {})
    rzp_order_id = payload.get("order_id")
    rzp_payment_id = payload.get("id")
    paid_amount = payload.get("amount")

    now = datetime.now(timezone.utc).isoformat()
    m_id = None
    p_id = None
    u_id = None

    if rzp_order_id:
        order = await db.orders.find_one({"razorpay_order_id": rzp_order_id})
        if order:
            order_id = str(order["_id"])
            expected_amount = order.get("amount_paise")
            m_id = order.get("merchant_id")
            p_id = order.get("items", [{}])[0].get("product_id") if order.get("items") else None
            u_id = order.get("user_id")

            # Verify amount match
            if paid_amount and expected_amount and int(paid_amount) != int(expected_amount):
                logger.error(f"Payment amount mismatch for order {order_id}: expected {expected_amount}, received {paid_amount}")
                await order_service.mark_order_failed(db, order_id)
            elif event_type in ("payment.captured", "order.paid"):
                await db.payments.update_one(
                    {"razorpay_order_id": rzp_order_id},
                    {"$set": {
                        "razorpay_payment_id": rzp_payment_id,
                        "status": PaymentStatus.CAPTURED.value,
                        "webhook_verified": True,
                        "updated_at": now,
                    }},
                )
                await order_service.mark_order_paid(db, order_id, rzp_payment_id)
            elif event_type in ("payment.failed",):
                await order_service.mark_order_failed(db, order_id)

    # Record event in processed_webhooks for idempotency
    try:
        await db.processed_webhooks.insert_one({
            "event_id": event_id,
            "event_type": event_type,
            "razorpay_order_id": rzp_order_id,
            "processed_at": now,
        })
    except Exception:
        pass

    await record_audit_event(
        db=db,
        action=AuditAction.PAYMENT_WEBHOOK_PROCESSED,
        resource_type=AuditResourceType.PAYMENT,
        actor_id=u_id,
        actor_role="system",
        resource_id=event_id,
        metadata={
            "event_type": event_type,
            "event_id": event_id,
            "razorpay_order_id": rzp_order_id,
            "razorpay_payment_id": rzp_payment_id,
            "merchant_id": m_id,
            "product_id": p_id,
            "webhook_verified": True,
        },
    )

    return {"status": "success", "event_id": event_id}

"""
Payments router — payment order creation, HMAC signature verification, and customer order history.
"""

import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import db_manager
from app.core.dependencies import require_customer
from app.schemas.order import OrderResponse
from app.schemas.payment import (
    PaymentCreateResponse,
    PaymentVerifyRequest,
    PaymentVerifyResponse,
)
from app.services import order_service, payment_service

logger = logging.getLogger("razorreach.payments")

router = APIRouter(prefix="", tags=["Payments & Orders"])


@router.post("/payments/create", response_model=PaymentCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_payment(current_user: dict = Depends(require_customer)):
    """
    Create a payment order on Razorpay.
    Server calculates authoritative amount in paise from live DB product prices.
    Requires customer authentication.
    """
    db = db_manager.get_db()
    return await payment_service.create_payment_order(db, current_user["id"])


@router.post("/payments/verify", response_model=PaymentVerifyResponse)
async def verify_payment(
    verify_data: PaymentVerifyRequest,
    current_user: dict = Depends(require_customer),
):
    """
    Verify payment signature from Razorpay Checkout.
    Transitions order to 'paid', performs atomic inventory decrement, and clears cart on success.
    """
    db = db_manager.get_db()
    res = await payment_service.verify_payment_signature(
        db=db,
        user_id=current_user["id"],
        razorpay_order_id=verify_data.razorpay_order_id,
        razorpay_payment_id=verify_data.razorpay_payment_id,
        signature=verify_data.razorpay_signature,
    )
    return PaymentVerifyResponse(**res)


@router.get("/orders", response_model=List[OrderResponse])
async def list_user_orders(current_user: dict = Depends(require_customer)):
    """List authenticated customer's historical orders."""
    db = db_manager.get_db()
    return await order_service.get_user_orders(db, current_user["id"])


@router.get("/orders/{order_id}", response_model=OrderResponse)
async def get_order_details(
    order_id: str,
    current_user: dict = Depends(require_customer),
):
    """Get single order details for authenticated customer."""
    db = db_manager.get_db()
    return await order_service.get_order(db, order_id, current_user["id"])

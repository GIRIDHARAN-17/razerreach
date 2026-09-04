"""
Webhooks router — Razorpay webhook listener with HMAC SHA256 signature verification and idempotency protection.
"""

import json
import logging

from fastapi import APIRouter, Header, HTTPException, Request, status

from app.core.database import db_manager
from app.services import payment_service

logger = logging.getLogger("razorreach.webhooks")

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


@router.post("/razorpay")
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: str = Header(None, alias="X-Razorpay-Signature"),
    x_razorpay_event_id: str = Header(None, alias="X-Razorpay-Event-Id"),
):
    """
    Public webhook endpoint for Razorpay payment events.
    Verifies HMAC SHA256 header signature and enforces idempotency.
    """
    if not x_razorpay_signature:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing X-Razorpay-Signature header",
        )

    body_bytes = await request.body()
    try:
        event_data = json.loads(body_bytes.decode("utf-8"))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON webhook payload",
        )

    db = db_manager.get_db()
    return await payment_service.process_webhook(
        db=db,
        body_bytes=body_bytes,
        signature=x_razorpay_signature,
        event_data=event_data,
        header_event_id=x_razorpay_event_id,
    )

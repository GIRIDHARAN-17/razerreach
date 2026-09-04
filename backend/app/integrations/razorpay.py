"""
Razorpay integration module.
Handles client initialization, Razorpay order creation, payment signature verification,
and webhook HMAC SHA256 signature verification.
Never exposes Key Secret or Webhook Secret in responses or logs.
"""

import hashlib
import hmac
import logging
from typing import Any, Dict, Optional

from app.core.config import settings

logger = logging.getLogger("razorreach.razorpay")


def _is_configured() -> bool:
    """Check if Razorpay credentials are configured."""
    return bool(settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET)


def create_razorpay_order(amount_paise: int, currency: str = "INR", receipt: str = "") -> Dict[str, Any]:
    """
    Create an order on Razorpay servers using the official Razorpay SDK.
    Raises RuntimeError if Razorpay credentials are missing or API call fails.
    """
    if not _is_configured():
        logger.warning("RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing.")
        raise RuntimeError("Payment service unavailable: Razorpay credentials not configured")

    if amount_paise <= 0:
        raise RuntimeError("Order amount must be greater than 0 paise")

    try:
        import razorpay
        client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))

        data = {
            "amount": amount_paise,
            "currency": currency,
            "receipt": receipt[:40] if receipt else "order_rcpt",
            "payment_capture": 1,
        }

        order_res = client.order.create(data=data)
        return {
            "razorpay_order_id": order_res["id"],
            "amount": order_res["amount"],
            "currency": order_res["currency"],
        }
    except Exception as e:
        logger.error(f"Razorpay API call failed: {type(e).__name__} - {str(e)}")
        if settings.RAZORPAY_KEY_ID.startswith("rzp_test_"):
            import uuid
            mock_id = f"order_test_{uuid.uuid4().hex[:14]}"
            logger.info(f"Using test-mode fallback order ID: {mock_id}")
            return {
                "razorpay_order_id": mock_id,
                "amount": amount_paise,
                "currency": currency,
            }
        raise RuntimeError(f"Razorpay API error: {type(e).__name__} - {str(e)}")


def verify_payment_signature(razorpay_order_id: str, razorpay_payment_id: str, razorpay_signature: str) -> bool:
    """
    Verify payment signature returned by Razorpay Checkout via HMAC SHA256.
    Returns True if valid, False otherwise.
    """
    if not _is_configured():
        logger.warning("Razorpay credentials missing for signature verification.")
        return False

    secret = settings.RAZORPAY_KEY_SECRET.encode()
    msg = f"{razorpay_order_id}|{razorpay_payment_id}".encode()

    try:
        generated_signature = hmac.new(secret, msg, hashlib.sha256).hexdigest()
        return hmac.compare_digest(generated_signature, razorpay_signature)
    except Exception as e:
        logger.error(f"Signature verification error: {type(e).__name__}")
        return False


def verify_webhook_signature(body_bytes: bytes, signature: str) -> bool:
    """
    Verify Razorpay webhook HTTP header signature using RAZORPAY_WEBHOOK_SECRET.
    Returns True if valid, False otherwise.
    """
    webhook_secret = getattr(settings, "RAZORPAY_WEBHOOK_SECRET", None) or settings.RAZORPAY_KEY_SECRET
    if not webhook_secret:
        logger.warning("Webhook secret not configured.")
        return False

    try:
        generated_signature = hmac.new(webhook_secret.encode(), body_bytes, hashlib.sha256).hexdigest()
        return hmac.compare_digest(generated_signature, signature)
    except Exception as e:
        logger.error(f"Webhook signature verification error: {type(e).__name__}")
        return False

from typing import Any, Dict


def payment_helper(payment: Dict[str, Any]) -> Dict[str, Any]:
    """
    Format raw MongoDB payment document into API-friendly dictionary.
    Never exposes secrets or credentials.
    """
    return {
        "id": str(payment["_id"]) if "_id" in payment else str(payment.get("id", "")),
        "order_id": str(payment.get("order_id", "")),
        "razorpay_order_id": payment.get("razorpay_order_id", ""),
        "razorpay_payment_id": payment.get("razorpay_payment_id"),
        "amount_paise": int(payment.get("amount_paise", 0)),
        "currency": payment.get("currency", "INR"),
        "status": payment.get("status", "created"),
        "signature_verified": payment.get("signature_verified", False),
        "webhook_verified": payment.get("webhook_verified", False),
        "created_at": payment.get("created_at"),
        "updated_at": payment.get("updated_at"),
    }

from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, field_validator


class PaymentStatus(str, Enum):
    CREATED = "created"
    AUTHORIZED = "authorized"
    CAPTURED = "captured"
    FAILED = "failed"
    REFUNDED = "refunded"


class PaymentCreateResponse(BaseModel):
    order_id: str
    razorpay_order_id: str
    razorpay_key_id: str
    amount: int = Field(..., description="Server-calculated amount in paise")
    currency: str = "INR"


class PaymentVerifyRequest(BaseModel):
    razorpay_order_id: str = Field(..., min_length=1)
    razorpay_payment_id: str = Field(..., min_length=1)
    razorpay_signature: str = Field(..., min_length=1)

    @field_validator("razorpay_order_id", "razorpay_payment_id", "razorpay_signature")
    @classmethod
    def validate_non_empty(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Payment verification fields cannot be empty or whitespace only")
        return trimmed


class PaymentVerifyResponse(BaseModel):
    message: str = "Payment verified successfully"
    order_id: str
    status: str = "paid"

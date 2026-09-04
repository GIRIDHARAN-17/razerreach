from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class OrderStatus(str, Enum):
    PAYMENT_PENDING = "payment_pending"
    PAID = "paid"
    PAYMENT_FAILED = "payment_failed"
    PROCESSING = "processing"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class OrderItem(BaseModel):
    product_id: str
    name: str
    quantity: int
    price_at_purchase: float
    line_total: float
    image_url: Optional[str] = None


class OrderResponse(BaseModel):
    id: str
    user_id: str
    merchant_id: str
    merchant: Optional[str] = Field(None, description="Merchant business name")
    items: List[OrderItem]
    subtotal: float
    delivery_fee: float = 0.0
    tax: float = 0.0
    discount: float = 0.0
    total: float
    amount_paise: int
    currency: str = "INR"
    status: OrderStatus
    razorpay_order_id: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


class CartItemAdd(BaseModel):
    product_id: str = Field(..., min_length=1, description="Target product ObjectId string")
    quantity: int = Field(..., gt=0, le=100, description="Quantity to add (must be > 0)")


class CartItemUpdate(BaseModel):
    quantity: int = Field(..., gt=0, le=100, description="New quantity (must be > 0)")


class CartItemResponse(BaseModel):
    product_id: str
    name: str
    quantity: int
    unit_price: float
    line_total: float
    image_url: Optional[str] = None
    stock_available: bool = True


class CartResponse(BaseModel):
    id: str
    items: List[CartItemResponse] = Field(default_factory=list)
    subtotal: float = 0.0
    delivery_fee: float = 0.0
    tax: float = 0.0
    discount: float = 0.0
    total: float = 0.0
    currency: str = "INR"


class CheckoutChange(BaseModel):
    product_id: str
    reason: str
    old_price: Optional[float] = None
    current_price: Optional[float] = None
    old_stock: Optional[int] = None
    current_stock: Optional[int] = None


class CheckoutPreviewResponse(BaseModel):
    items: List[CartItemResponse] = Field(default_factory=list)
    subtotal: float = 0.0
    delivery_fee: float = 0.0
    tax: float = 0.0
    discount: float = 0.0
    total: float = 0.0
    amount_paise: int = 0
    currency: str = "INR"
    merchant_name: Optional[str] = Field(None, description="Merchant business name")
    valid: bool = True
    changes: List[CheckoutChange] = Field(default_factory=list)

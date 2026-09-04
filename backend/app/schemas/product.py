from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class ProductStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200, description="Product name")
    description: str = Field(..., min_length=1, max_length=5000, description="Product description")
    category: str = Field(..., min_length=1, max_length=100, description="Product category")
    price: float = Field(..., gt=0, le=10_000_000, description="Product price in INR")
    stock: int = Field(..., ge=0, description="Available stock quantity")
    attributes: Optional[Dict[str, Any]] = Field(default=None, description="Optional product attributes")
    status: Optional[ProductStatus] = Field(default=ProductStatus.PUBLISHED, description="Product status")

    @field_validator("name", "description", "category")
    @classmethod
    def validate_non_empty(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Field cannot be empty or whitespace only")
        return trimmed

    @field_validator("category")
    @classmethod
    def normalize_category(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("price")
    @classmethod
    def validate_finite_price(cls, v: float) -> float:
        if v != v:  # NaN check
            raise ValueError("Price must be a finite number")
        return round(v, 2)


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, min_length=1, max_length=5000)
    category: Optional[str] = Field(None, min_length=1, max_length=100)
    price: Optional[float] = Field(None, gt=0, le=10_000_000)
    stock: Optional[int] = Field(None, ge=0)
    attributes: Optional[Dict[str, Any]] = None
    status: Optional[ProductStatus] = None

    @field_validator("name", "description", "category")
    @classmethod
    def validate_non_empty_optional(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            trimmed = v.strip()
            if not trimmed:
                raise ValueError("Field cannot be empty or whitespace only")
            return trimmed
        return v

    @field_validator("category")
    @classmethod
    def normalize_category(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return v.strip().lower()
        return v

    @field_validator("price")
    @classmethod
    def validate_finite_price(cls, v: Optional[float]) -> Optional[float]:
        if v is not None:
            if v != v:
                raise ValueError("Price must be a finite number")
            return round(v, 2)
        return v


class ProductResponse(BaseModel):
    id: str
    merchant_id: str
    name: str
    description: str
    category: str
    price: float
    currency: str = "INR"
    stock: int
    attributes: Optional[Dict[str, Any]] = None
    image_url: Optional[str] = None
    images: List[str] = Field(default_factory=list, description="List of uploaded image URLs")
    status: ProductStatus
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ProductListResponse(BaseModel):
    count: int
    products: List[ProductResponse]


class ImageUploadResponse(BaseModel):
    image_url: str
    images: List[str] = Field(default_factory=list, description="List of all uploaded image URLs for the product")
    message: str = "Image uploaded successfully"

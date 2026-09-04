from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


class SearchSort(str, Enum):
    RELEVANCE = "relevance"
    PRICE_LOW = "price_low"
    PRICE_HIGH = "price_high"


class SearchIntent(BaseModel):
    search_text: Optional[str] = Field(None, description="Normalized search keywords extracted from request")
    category: Optional[str] = Field(None, description="Product category constraint")
    color: Optional[str] = Field(None, description="Color constraint")
    brand: Optional[str] = Field(None, description="Brand constraint")
    min_price: Optional[float] = Field(None, ge=0, description="Minimum price constraint in INR")
    max_price: Optional[float] = Field(None, ge=0, description="Maximum price constraint in INR")
    use_case: Optional[str] = Field(None, description="Primary use case or application e.g. coding, gaming, college")
    preferences: Dict[str, Any] = Field(default_factory=dict, description="Structured preference key-values e.g. portability, performance")
    required_features: List[str] = Field(default_factory=list, description="List of required features")
    sort: SearchSort = Field(default=SearchSort.RELEVANCE, description="Result sorting preference")

    @field_validator("search_text", "category", "color", "brand", "use_case")
    @classmethod
    def clean_optional_str(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            trimmed = v.strip()
            return trimmed.lower() if trimmed else None
        return None


    @field_validator("min_price", "max_price")
    @classmethod
    def validate_finite_price(cls, v: Optional[float]) -> Optional[float]:
        if v is not None:
            if v != v:  # NaN
                return None
            return round(v, 2)
        return v


class AISearchRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000, description="Natural language shopping query")
    previous_intent: Optional[SearchIntent] = Field(None, description="Optional previous intent for refinement")
    session_id: Optional[str] = Field(None, description="Optional session ID for stateful agent interactions")

    @field_validator("message")
    @classmethod
    def validate_message_non_empty(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Message cannot be empty or whitespace only")
        return trimmed


class AIRecommendedProduct(BaseModel):
    id: str
    name: str
    price: float
    category: str
    merchant_name: Optional[str] = Field(None, description="Business name of merchant")
    image_url: Optional[str] = None
    images: List[str] = Field(default_factory=list, description="List of all product image URLs")
    stock: int
    why_recommended: List[str] = Field(default_factory=list, description="Verifiable grounded recommendation reasons")


class AISearchResponse(BaseModel):
    session_id: Optional[str] = Field(None, description="Active agent session ID for stateful continuity")
    message: str = Field(..., description="Assistant response summary")
    intent: SearchIntent = Field(..., description="Extracted structured intent")
    products: List[AIRecommendedProduct] = Field(default_factory=list, description="Recommended catalog products")
    response_mode: Optional[str] = Field("AI", description="Response generation mode: AI, DETERMINISTIC_FALLBACK, CLARIFICATION, or ERROR")

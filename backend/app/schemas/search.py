from typing import List, Optional
from pydantic import BaseModel, Field


class SearchProductResponse(BaseModel):
    """Public-safe product fields for search results."""
    id: str
    name: str
    description: str
    price: float
    category: str
    image_url: Optional[str] = None
    images: List[str] = Field(default_factory=list, description="List of uploaded image URLs")
    stock: int


class SearchResponse(BaseModel):
    """Search API response envelope."""
    query: Optional[str] = None
    count: int
    products: List[SearchProductResponse]

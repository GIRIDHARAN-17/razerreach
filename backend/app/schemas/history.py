from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ConversationMessage(BaseModel):
    role: str
    content: str


class SearchRequirements(BaseModel):
    brand: Optional[str] = None
    product_type: Optional[str] = None
    budget_max: Optional[float] = None
    currency: Optional[str] = "INR"


class SearchSessionItem(BaseModel):
    session_id: str
    created_at: str
    conversation: List[ConversationMessage] = Field(default_factory=list)
    requirements: SearchRequirements = Field(default_factory=SearchRequirements)
    recommendations: List[Dict[str, Any]] = Field(default_factory=list)


class HistoryResponse(BaseModel):
    sessions: List[SearchSessionItem]
    total: int
    limit: int
    skip: int

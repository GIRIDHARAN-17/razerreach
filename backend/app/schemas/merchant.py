from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class MerchantStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    SUSPENDED = "suspended"


class MerchantAddress(BaseModel):
    city: str = Field(..., min_length=1, max_length=100)
    state: str = Field(..., min_length=1, max_length=100)


class MerchantCreate(BaseModel):
    business_name: str = Field(..., min_length=1, max_length=150)
    category: str = Field(..., min_length=1, max_length=100)
    phone: str = Field(..., min_length=5, max_length=20)
    address: MerchantAddress

    @field_validator("business_name", "category", "phone")
    @classmethod
    def validate_non_empty(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Field cannot be empty or whitespace only")
        return trimmed


class MerchantUpdate(BaseModel):
    business_name: Optional[str] = Field(None, min_length=1, max_length=150)
    category: Optional[str] = Field(None, min_length=1, max_length=100)
    phone: Optional[str] = Field(None, min_length=5, max_length=20)
    address: Optional[MerchantAddress] = None

    @field_validator("business_name", "category", "phone")
    @classmethod
    def validate_non_empty_optional(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            trimmed = v.strip()
            if not trimmed:
                raise ValueError("Field cannot be empty or whitespace only")
            return trimmed
        return v


class MerchantResponse(BaseModel):
    id: str
    user_id: str
    business_name: str
    category: str
    phone: str
    address: MerchantAddress
    status: MerchantStatus

    model_config = ConfigDict(from_attributes=True)


class MerchantStatusUpdate(BaseModel):
    status: MerchantStatus


class MerchantSummaryInfo(BaseModel):
    id: str
    business_name: str
    status: MerchantStatus


class DashboardSummary(BaseModel):
    products: int = 0
    orders: int = 0
    revenue: float = 0.0


class DashboardOpportunities(BaseModel):
    total: int = 0
    high_priority: int = 0


class RevenueAgentImpact(BaseModel):
    demand_signals: int = 0
    opportunities_detected: int = 0
    opportunities_analyzed: int = 0
    estimated_potential_revenue: float = 0.0
    verified_revenue: float = 0.0


class DashboardActivityEvent(BaseModel):
    id: Optional[str] = None
    action: str
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    created_at: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class MerchantDashboardResponse(BaseModel):
    merchant: MerchantSummaryInfo
    summary: DashboardSummary = Field(default_factory=DashboardSummary)
    opportunities: DashboardOpportunities = Field(default_factory=DashboardOpportunities)
    impact: RevenueAgentImpact = Field(default_factory=RevenueAgentImpact)
    opportunities_by_signal: Dict[str, int] = Field(default_factory=dict)
    recent_activity: List[DashboardActivityEvent] = Field(default_factory=list)


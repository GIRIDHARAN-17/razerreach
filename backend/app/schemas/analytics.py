from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class AnalyticsEventType(str, Enum):
    SEARCH = "search"
    PRODUCT_VIEW = "product_view"
    CART_ADD = "cart_add"
    CHECKOUT_STARTED = "checkout_started"
    PAYMENT_SUCCESS = "payment_success"
    PAYMENT_FAILED = "payment_failed"


class OpportunityType(str, Enum):
    UNSERVED_DEMAND = "unserved_demand"
    LOW_CONVERSION = "low_conversion"
    CART_ABANDONMENT = "cart_abandonment"
    STOCK_GAP = "stock_gap"
    HIGH_DEMAND_CATEGORY = "high_demand_category"


class AnalyticsEventCreate(BaseModel):
    event_type: AnalyticsEventType
    user_id: Optional[str] = None
    merchant_id: Optional[str] = None
    product_id: Optional[str] = None
    query: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AnalyticsSummaryResponse(BaseModel):
    merchant_id: str
    period_days: int
    total_searches: int = 0
    total_views: int = 0
    cart_adds: int = 0
    checkouts_started: int = 0
    successful_purchases: int = 0
    failed_payments: int = 0
    total_revenue: float = 0.0
    conversion_rate: float = Field(0.0, description="Purchases / product views (range 0.0 to 1.0)")


class OpportunityEvidence(BaseModel):
    search_count: Optional[int] = None
    zero_result_count: Optional[int] = None
    zero_result_rate: Optional[float] = None
    views_count: Optional[int] = None
    cart_count: Optional[int] = None
    purchases_count: Optional[int] = None
    current_stock: Optional[int] = None
    estimated_potential_revenue: Optional[float] = None


class OpportunityCandidate(BaseModel):
    id: str
    type: OpportunityType
    priority: str = Field("medium", description="high, medium, or low")
    score: float = Field(..., ge=0.0, le=1.0)
    title: str
    summary: str
    evidence: OpportunityEvidence
    suggested_action: str
    merchant_id: str


class RevenueOpportunitiesResponse(BaseModel):
    merchant_id: str
    period_days: int
    opportunities: List[OpportunityCandidate] = Field(default_factory=list)

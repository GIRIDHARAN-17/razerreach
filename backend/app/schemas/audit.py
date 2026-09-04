from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class AuditAction(str, Enum):
    # Auth
    USER_REGISTERED = "USER_REGISTERED"
    USER_LOGIN = "USER_LOGIN"
    USER_LOGOUT = "USER_LOGOUT"
    
    # Merchant
    MERCHANT_CREATED = "MERCHANT_CREATED"
    MERCHANT_APPROVED = "MERCHANT_APPROVED"
    MERCHANT_REJECTED = "MERCHANT_REJECTED"
    MERCHANT_UPDATED = "MERCHANT_UPDATED"
    
    # Product
    PRODUCT_CREATED = "PRODUCT_CREATED"
    PRODUCT_UPDATED = "PRODUCT_UPDATED"
    PRODUCT_DELETED = "PRODUCT_DELETED"
    PRODUCT_REINDEXED = "PRODUCT_REINDEXED"
    
    # Cart & Checkout
    CART_ITEM_ADDED = "CART_ITEM_ADDED"
    CART_ITEM_UPDATED = "CART_ITEM_UPDATED"
    CART_ITEM_REMOVED = "CART_ITEM_REMOVED"
    CART_CLEARED = "CART_CLEARED"
    CHECKOUT_STARTED = "CHECKOUT_STARTED"
    
    # Payment & Order
    PAYMENT_ORDER_CREATED = "PAYMENT_ORDER_CREATED"
    PAYMENT_VERIFIED = "PAYMENT_VERIFIED"
    PAYMENT_FAILED = "PAYMENT_FAILED"
    PAYMENT_WEBHOOK_PROCESSED = "PAYMENT_WEBHOOK_PROCESSED"
    ORDER_CREATED = "ORDER_CREATED"
    ORDER_PAID = "ORDER_PAID"
    ORDER_FAILED = "ORDER_FAILED"
    
    # Inventory
    INVENTORY_DECREMENTED = "INVENTORY_DECREMENTED"
    
    # Analytics & Opportunity
    OPPORTUNITY_GENERATED = "OPPORTUNITY_GENERATED"
    OPPORTUNITY_ANALYZED = "OPPORTUNITY_ANALYZED"
    
    # AI
    BUYER_AGENT_USED = "BUYER_AGENT_USED"
    BUYER_AGENT_DECISION = "BUYER_AGENT_DECISION"
    BUYER_AGENT_POLICY_DECISION = "BUYER_AGENT_POLICY_DECISION"
    BUYER_AGENT_REFERENCE_RESOLVED = "BUYER_AGENT_REFERENCE_RESOLVED"
    BUYER_AGENT_CLARIFICATION = "BUYER_AGENT_CLARIFICATION"
    BUYER_AGENT_AI_FALLBACK = "BUYER_AGENT_AI_FALLBACK"
    REVENUE_AGENT_USED = "REVENUE_AGENT_USED"
    AGENT_SESSION_CREATED = "AGENT_SESSION_CREATED"
    AGENT_SESSION_RESET = "AGENT_SESSION_RESET"
    AGENT_SESSION_EXPIRED = "AGENT_SESSION_EXPIRED"


class AuditResourceType(str, Enum):
    USER = "user"
    MERCHANT = "merchant"
    PRODUCT = "product"
    CART = "cart"
    CHECKOUT = "checkout"
    PAYMENT = "payment"
    ORDER = "order"
    INVENTORY = "inventory"
    ANALYTICS = "analytics"
    OPPORTUNITY = "opportunity"
    AI_AGENT = "ai_agent"


class AuditResult(str, Enum):
    SUCCESS = "success"
    FAILURE = "failure"


class AuditLogRecord(BaseModel):
    id: str
    actor_id: Optional[str] = Field(None, description="Authenticated user ID performing the action")
    actor_role: str = Field(..., description="Role of actor (customer, merchant, admin, system, ai)")
    action: AuditAction
    resource_type: AuditResourceType
    resource_id: Optional[str] = None
    result: AuditResult = AuditResult.SUCCESS
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Sanitized event metadata (no secrets/passwords)")
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: str = Field(..., description="Server-generated UTC ISO timestamp")


class AuditSummaryStats(BaseModel):
    total_events: int = 0
    revenue_agent_runs: int = 0
    buyer_agent_runs: int = 0
    policy_decisions: int = 0
    ai_fallbacks: int = 0
    payments_verified: int = 0


class AuditLogQueryResponse(BaseModel):
    total_count: int
    limit: int
    offset: int
    logs: List[AuditLogRecord] = Field(default_factory=list)
    summary: Optional[AuditSummaryStats] = None


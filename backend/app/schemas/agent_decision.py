"""
Decision schemas and action allowlist for Task 16D Controlled Buyer Agent Decision Loop.
Enforces strict model validation and rejects arbitrary function names or unrecognized actions.
"""

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


class AgentAction(str, Enum):
    SEARCH = "SEARCH"
    GET_PRODUCT = "GET_PRODUCT"
    COMPARE = "COMPARE"
    CHECK_INVENTORY = "CHECK_INVENTORY"
    SELECT_PRODUCT = "SELECT_PRODUCT"
    VIEW_CART = "VIEW_CART"
    ADD_TO_CART = "ADD_TO_CART"
    UPDATE_CART = "UPDATE_CART"
    REMOVE_FROM_CART = "REMOVE_FROM_CART"
    PREPARE_CHECKOUT = "PREPARE_CHECKOUT"
    ASK_CLARIFICATION = "ASK_CLARIFICATION"
    RESPOND = "RESPOND"
    FAIL = "FAIL"


# Read-only actions that do not mutate user state or commerce records
READ_ACTIONS = {
    AgentAction.SEARCH,
    AgentAction.GET_PRODUCT,
    AgentAction.COMPARE,
    AgentAction.CHECK_INVENTORY,
    AgentAction.VIEW_CART,
}

# Write actions that mutate shopping cart state
WRITE_ACTIONS = {
    AgentAction.ADD_TO_CART,
    AgentAction.UPDATE_CART,
    AgentAction.REMOVE_FROM_CART,
}

# High risk actions that interact with checkout boundaries
HIGH_RISK_ACTIONS = {
    AgentAction.PREPARE_CHECKOUT,
}

# Blocked actions that are strictly prohibited from autonomous execution
BLOCKED_ACTIONS = {
    "PAYMENT",
    "PAY",
    "CHARGE",
    "CAPTURE_PAYMENT",
    "VERIFY_PAYMENT",
    "MARK_PAID",
    "CREATE_RAZORPAY_PAYMENT",
    "EXECUTE_CODE",
    "SET_STATE",
    "DELETE_DATABASE",
}


class RiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    BLOCKED = "BLOCKED"


class PolicyReasonCode(str, Enum):
    ALLOWED = "ALLOWED"
    DENIED = "DENIED"
    REQUIRES_CONFIRMATION = "REQUIRES_CONFIRMATION"
    INVALID_CONTEXT = "INVALID_CONTEXT"
    UNAUTHORIZED = "UNAUTHORIZED"
    RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND"
    RESOURCE_UNAVAILABLE = "RESOURCE_UNAVAILABLE"
    FSM_BLOCKED = "FSM_BLOCKED"
    ACTION_NOT_ALLOWED = "ACTION_NOT_ALLOWED"
    RATE_LIMITED = "RATE_LIMITED"
    STALE_CONTEXT = "STALE_CONTEXT"
    QUANTITY_INVALID = "QUANTITY_INVALID"


ACTION_RISK_MAP: Dict[AgentAction, RiskLevel] = {
    AgentAction.SEARCH: RiskLevel.LOW,
    AgentAction.GET_PRODUCT: RiskLevel.LOW,
    AgentAction.COMPARE: RiskLevel.LOW,
    AgentAction.CHECK_INVENTORY: RiskLevel.LOW,
    AgentAction.VIEW_CART: RiskLevel.LOW,
    AgentAction.SELECT_PRODUCT: RiskLevel.LOW,
    AgentAction.ADD_TO_CART: RiskLevel.MEDIUM,
    AgentAction.UPDATE_CART: RiskLevel.MEDIUM,
    AgentAction.REMOVE_FROM_CART: RiskLevel.MEDIUM,
    AgentAction.PREPARE_CHECKOUT: RiskLevel.HIGH,
    AgentAction.ASK_CLARIFICATION: RiskLevel.LOW,
    AgentAction.RESPOND: RiskLevel.LOW,
    AgentAction.FAIL: RiskLevel.LOW,
}


# Tool mapping allowlist for authorized actions
ACTION_TOOL_MAP: Dict[AgentAction, str] = {
    AgentAction.SEARCH: "tool_search_products",
    AgentAction.GET_PRODUCT: "tool_get_product_details",
    AgentAction.COMPARE: "tool_compare_products",
    AgentAction.CHECK_INVENTORY: "tool_check_inventory",
    AgentAction.SELECT_PRODUCT: "verify_selected_product",
    AgentAction.VIEW_CART: "cart_service.get_active_cart",
    AgentAction.ADD_TO_CART: "cart_service.add_item",
    AgentAction.UPDATE_CART: "cart_service.update_item",
    AgentAction.REMOVE_FROM_CART: "cart_service.remove_item",
    AgentAction.PREPARE_CHECKOUT: "cart_service.checkout_preview",
    AgentAction.ASK_CLARIFICATION: "none",
    AgentAction.RESPOND: "none",
    AgentAction.FAIL: "none",
}


class PolicyDecision(BaseModel):
    """
    Structured outcome of the Policy / Action Safety Gate.
    Determines whether a proposed action is allowed, denied, or requires confirmation.
    """
    allowed: bool = Field(..., description="Whether the action is permitted to execute")
    reason_code: PolicyReasonCode = Field(..., description="Deterministic reason code")
    reason: str = Field(..., max_length=300, description="Internal operational reason")
    requires_confirmation: bool = Field(default=False, description="Whether explicit human confirmation is required")
    risk_level: RiskLevel = Field(..., description="Risk tier for the evaluated action")
    safe_response: Optional[str] = Field(None, description="Safe user-facing explanation on denial")


class AgentDecision(BaseModel):
    """
    Structured action proposed by Gemini during a turn step.
    Does NOT write directly to FSM state or execute arbitrary tools.
    """
    action: AgentAction = Field(..., description="Action selected strictly from the allowed AgentAction enum")
    target_product_id: Optional[str] = Field(None, max_length=100, description="Optional single product ID target")
    target_product_ids: List[str] = Field(default_factory=list, description="Optional product IDs for multi-product operations (capped at 5)")
    quantity: Optional[int] = Field(default=1, ge=1, le=10, description="Quantity for cart write operations")
    reasoning_summary: Optional[str] = Field(None, max_length=200, description="Short safe operational reason (NOT hidden chain-of-thought)")
    response_intent: Optional[str] = Field(None, max_length=100, description="Intent label for the proposed action")

    @field_validator("target_product_ids")
    @classmethod
    def cap_target_ids(cls, v: List[str]) -> List[str]:
        if not v:
            return []
        # Deduplicate while preserving order and bound to 5 max
        seen = set()
        cleaned = []
        for item in v:
            s = str(item).strip()
            if s and s not in seen:
                seen.add(s)
                cleaned.append(s)
        return cleaned[:5]

    @field_validator("reasoning_summary")
    @classmethod
    def clean_reasoning_summary(cls, v: Optional[str]) -> Optional[str]:
        if v:
            trimmed = v.strip()
            return trimmed[:200] if trimmed else None
        return None


def is_action_allowed(action_val: Any) -> bool:
    """Check if an action exists within the deterministic allowlist."""
    if isinstance(action_val, AgentAction):
        return True
    if hasattr(action_val, "value"):
        raw = action_val.value
    else:
        raw = str(action_val)
    try:
        AgentAction(str(raw).strip().upper())
        return True
    except (ValueError, KeyError, AttributeError):
        return False

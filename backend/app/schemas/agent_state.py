from enum import Enum
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field, field_validator

from app.schemas.ai_search import SearchIntent


class AgentStateEnum(str, Enum):
    START = "START"
    UNDERSTANDING = "UNDERSTANDING"
    SEARCHING = "SEARCHING"
    SHOWING_RESULTS = "SHOWING_RESULTS"
    PRODUCT_SELECTED = "PRODUCT_SELECTED"
    COMPARING = "COMPARING"
    CART_REVIEW = "CART_REVIEW"
    CHECKOUT_READY = "CHECKOUT_READY"
    AWAITING_CONFIRMATION = "AWAITING_CONFIRMATION"
    PAYMENT_PENDING = "PAYMENT_PENDING"
    ORDER_CONFIRMED = "ORDER_CONFIRMED"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class TransitionReason(str, Enum):
    SEARCH_STARTED = "SEARCH_STARTED"
    SEARCH_RESULTS_RETURNED = "SEARCH_RESULTS_RETURNED"
    PRODUCT_SELECTED = "PRODUCT_SELECTED"
    COMPARISON_REQUESTED = "COMPARISON_REQUESTED"
    CART_REVIEW_REQUESTED = "CART_REVIEW_REQUESTED"
    CHECKOUT_PREPARED = "CHECKOUT_PREPARED"
    CONFIRMATION_REQUIRED = "CONFIRMATION_REQUIRED"
    PAYMENT_STARTED = "PAYMENT_STARTED"
    PAYMENT_CONFIRMED = "PAYMENT_CONFIRMED"
    ORDER_COMPLETED = "ORDER_COMPLETED"
    RECOVERABLE_ERROR = "RECOVERABLE_ERROR"
    UNRECOVERABLE_ERROR = "UNRECOVERABLE_ERROR"
    USER_INTENT_PARSED = "USER_INTENT_PARSED"
    SESSION_RESET = "SESSION_RESET"
    SESSION_EXPIRED = "SESSION_EXPIRED"


class AgentState(BaseModel):
    session_id: str = Field(..., description="Unique opaque session identifier")
    user_id: str = Field(..., description="Authenticated user ID owner of session")
    current_state: AgentStateEnum = Field(default=AgentStateEnum.START, description="Current FSM state")
    goal: Optional[str] = Field(None, max_length=500, description="Current shopping goal summary")
    intent: Optional[SearchIntent] = Field(None, description="Current parsed SearchIntent")
    clarification_count: int = Field(default=0, ge=0, description="Counter for clarification questions asked in session (capped at 3)")
    preference_context: Dict[str, Any] = Field(default_factory=dict, description="Bounded stateful preference context")
    candidate_product_ids: List[str] = Field(default_factory=list, description="List of product IDs currently in active result/comparison context (capped at 10)")
    selected_product_id: Optional[str] = Field(None, description="Currently selected verified product ID")
    last_referenced_product_id: Optional[str] = Field(None, description="Most recently referenced product ID")
    comparison_product_ids: List[str] = Field(default_factory=list, description="Currently active comparison product IDs (capped at 5)")
    last_cart_product_id: Optional[str] = Field(None, description="Most recently added or modified cart product ID")
    cart_id: Optional[str] = Field(None, description="Optional active cart ID reference")
    last_tool: Optional[str] = Field(None, max_length=100, description="Last executed buyer tool name")
    last_tool_result_summary: Optional[str] = Field(None, max_length=500, description="Compact summary of last tool execution")
    pending_action: Optional[str] = Field(None, max_length=200, description="Pending workflow action")
    confirmation_required: bool = Field(default=False, description="Flag requiring user confirmation boundary")
    last_transition: Optional[str] = Field(None, description="Format: PREVIOUS_STATE->NEXT_STATE")
    last_transition_reason: Optional[str] = Field(None, description="Reason identifier for last transition")
    turn_count: int = Field(default=0, ge=0, description="Turn counter incremented once per user turn")
    version: int = Field(default=0, ge=0, description="Optimistic concurrency version counter")
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    @field_validator("comparison_product_ids")
    @classmethod
    def cap_comparison_product_ids(cls, v: List[str]) -> List[str]:
        if not v:
            return []
        seen = set()
        cleaned = []
        for item in v:
            s = str(item).strip()
            if s and s not in seen:
                seen.add(s)
                cleaned.append(s)
        return cleaned[:5]


class AgentContext(BaseModel):
    """
    Intentionally bounded context payload sent to LLM/tools for turn processing.
    Prevents serializing full MongoDB state or sensitive provider/auth tokens.
    """
    session_id: str
    current_state: AgentStateEnum
    goal: Optional[str] = None
    intent: Optional[SearchIntent] = None
    clarification_count: int = 0
    preference_context: Dict[str, Any] = Field(default_factory=dict)
    candidate_product_ids: List[str] = Field(default_factory=list)
    selected_product_id: Optional[str] = None
    last_referenced_product_id: Optional[str] = None
    comparison_product_ids: List[str] = Field(default_factory=list)
    last_cart_product_id: Optional[str] = None
    cart_id: Optional[str] = None
    last_tool: Optional[str] = None
    last_tool_result_summary: Optional[str] = None
    pending_action: Optional[str] = None
    confirmation_required: bool = False
    turn_count: int = 0


def build_agent_context(agent_state: AgentState, message: Optional[str] = None) -> AgentContext:
    """
    Construct a clean, bounded AgentContext object from AgentState.
    Caps candidate_product_ids at 10 items and comparison_product_ids at 5 items.
    """
    bounded_candidates = (agent_state.candidate_product_ids or [])[:10]
    bounded_comparison = (agent_state.comparison_product_ids or [])[:5]
    bounded_goal = (agent_state.goal[:200] if agent_state.goal else None)
    bounded_summary = (agent_state.last_tool_result_summary[:200] if agent_state.last_tool_result_summary else None)

    return AgentContext(
        session_id=agent_state.session_id,
        current_state=agent_state.current_state,
        goal=bounded_goal,
        intent=agent_state.intent,
        clarification_count=agent_state.clarification_count,
        preference_context=agent_state.preference_context or {},
        candidate_product_ids=bounded_candidates,
        selected_product_id=agent_state.selected_product_id,
        last_referenced_product_id=agent_state.last_referenced_product_id,
        comparison_product_ids=bounded_comparison,
        last_cart_product_id=agent_state.last_cart_product_id,
        cart_id=agent_state.cart_id,
        last_tool=agent_state.last_tool,
        last_tool_result_summary=bounded_summary,
        pending_action=agent_state.pending_action,
        confirmation_required=agent_state.confirmation_required,
        turn_count=agent_state.turn_count,
    )


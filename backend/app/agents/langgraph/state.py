"""
State definition for LangGraph Buyer Agent orchestration (Task 20).
Wraps authoritative AgentState and tracks execution flow without duplicating business models.
"""

from typing import Any, Dict, List, Optional, TypedDict
from app.schemas.agent_decision import AgentDecision, PolicyDecision
from app.schemas.agent_state import AgentState
from app.schemas.ai_search import AIRecommendedProduct, SearchIntent


class BuyerGraphState(TypedDict, total=False):
    """
    LangGraph execution state representing a single customer turn.
    Coordinates observation, action proposal, reference resolution,
    policy evaluation, tool execution, and session state updates.
    """

    # Session & Identity Context
    db: Any
    user_id: str
    session_id: str
    message: str
    previous_intent: Optional[SearchIntent]
    effective_intent: Optional[SearchIntent]

    # Authoritative Persistent Domain State
    agent_state: AgentState

    # Turn & Bounded Step Counters
    step_count: int
    max_steps: int

    # Ephemeral Step Decisions
    decision: Optional[AgentDecision]
    policy_decision: Optional[PolicyDecision]

    # Output Payloads
    recommended_products: List[AIRecommendedProduct]
    final_message: Optional[str]
    is_terminal: bool
    fallback_active: bool
    requires_clarification: bool
    clarification_question: Optional[str]
    missing_preference: Optional[str]
    error: Optional[str]


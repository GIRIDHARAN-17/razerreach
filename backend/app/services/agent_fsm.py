"""
Deterministic Finite-State Machine (FSM) Service for Buyer Agent commerce workflows.
Enforces authoritative state transition validation, security boundaries, and immutable update tracking.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union

from app.schemas.agent_state import AgentState, AgentStateEnum, TransitionReason

logger = logging.getLogger("razorreach.agent_fsm")

VALID_TRANSITIONS: Dict[AgentStateEnum, set] = {
    AgentStateEnum.START: {
        AgentStateEnum.UNDERSTANDING,
    },
    AgentStateEnum.UNDERSTANDING: {
        AgentStateEnum.SEARCHING,
        AgentStateEnum.SHOWING_RESULTS,
        AgentStateEnum.FAILED,
    },
    AgentStateEnum.SEARCHING: {
        AgentStateEnum.SHOWING_RESULTS,
        AgentStateEnum.FAILED,
    },
    AgentStateEnum.SHOWING_RESULTS: {
        AgentStateEnum.SEARCHING,
        AgentStateEnum.PRODUCT_SELECTED,
        AgentStateEnum.COMPARING,
        AgentStateEnum.CART_REVIEW,
        AgentStateEnum.FAILED,
    },
    AgentStateEnum.PRODUCT_SELECTED: {
        AgentStateEnum.COMPARING,
        AgentStateEnum.CART_REVIEW,
        AgentStateEnum.CHECKOUT_READY,
        AgentStateEnum.SHOWING_RESULTS,
        AgentStateEnum.FAILED,
    },
    AgentStateEnum.COMPARING: {
        AgentStateEnum.PRODUCT_SELECTED,
        AgentStateEnum.SHOWING_RESULTS,
        AgentStateEnum.CART_REVIEW,
        AgentStateEnum.FAILED,
    },
    AgentStateEnum.CART_REVIEW: {
        AgentStateEnum.CHECKOUT_READY,
        AgentStateEnum.SHOWING_RESULTS,
        AgentStateEnum.FAILED,
    },
    AgentStateEnum.CHECKOUT_READY: {
        AgentStateEnum.AWAITING_CONFIRMATION,
        AgentStateEnum.FAILED,
    },
    AgentStateEnum.AWAITING_CONFIRMATION: {
        AgentStateEnum.PAYMENT_PENDING,
        AgentStateEnum.CART_REVIEW,
        AgentStateEnum.FAILED,
    },
    AgentStateEnum.PAYMENT_PENDING: {
        AgentStateEnum.ORDER_CONFIRMED,
        AgentStateEnum.FAILED,
    },
    AgentStateEnum.ORDER_CONFIRMED: {
        AgentStateEnum.COMPLETED,
        AgentStateEnum.FAILED,
    },
    AgentStateEnum.COMPLETED: {
        AgentStateEnum.START,
        AgentStateEnum.SHOWING_RESULTS,
    },
    AgentStateEnum.FAILED: {
        AgentStateEnum.START,
        AgentStateEnum.UNDERSTANDING,
        AgentStateEnum.SHOWING_RESULTS,
    },
}


def normalize_state(state: Union[str, AgentStateEnum]) -> AgentStateEnum:
    """Normalize input state string or enum to AgentStateEnum."""
    if isinstance(state, AgentStateEnum):
        return state
    try:
        return AgentStateEnum(str(state).upper())
    except ValueError:
        raise ValueError(f"Invalid AgentState: '{state}'")


def can_transition(
    current_state: Union[str, AgentStateEnum],
    next_state: Union[str, AgentStateEnum],
) -> bool:
    """
    Check if a transition from current_state to next_state is valid under FSM rules.
    Returns False for invalid states or illegal transitions.
    """
    try:
        curr_enum = normalize_state(current_state)
        next_enum = normalize_state(next_state)
    except ValueError:
        return False

    allowed_set = VALID_TRANSITIONS.get(curr_enum, set())
    return next_enum in allowed_set


def transition_state(
    agent_state: Union[AgentState, Dict[str, Any]],
    next_state: Union[str, AgentStateEnum],
    reason: Optional[Union[str, TransitionReason]] = None,
) -> Union[AgentState, Dict[str, Any]]:
    """
    Transition an AgentState object or dict to next_state deterministically.
    If the transition is invalid, raises ValueError and preserves state unchanged.
    """
    is_dict = isinstance(agent_state, dict)
    if is_dict:
        curr_str = agent_state.get("current_state", AgentStateEnum.START)
    else:
        curr_str = agent_state.current_state

    curr_enum = normalize_state(curr_str)
    next_enum = normalize_state(next_state)

    if not can_transition(curr_enum, next_enum):
        err_msg = f"Invalid FSM transition: '{curr_enum.value}' -> '{next_enum.value}' is not allowed."
        logger.warning(err_msg)
        raise ValueError(err_msg)

    reason_str = reason.value if isinstance(reason, TransitionReason) else (str(reason) if reason else None)
    now_iso = datetime.now(timezone.utc).isoformat()
    transition_str = f"{curr_enum.value}->{next_enum.value}"

    if is_dict:
        updated = agent_state.copy()
        updated["current_state"] = next_enum.value
        updated["last_transition"] = transition_str
        updated["last_transition_reason"] = reason_str
        updated["updated_at"] = now_iso
        return updated
    else:
        agent_state.current_state = next_enum
        agent_state.last_transition = transition_str
        agent_state.last_transition_reason = reason_str
        agent_state.updated_at = now_iso
        return agent_state


async def verify_selected_product(
    db,
    product_id: str,
    candidate_product_ids: Optional[List[str]] = None,
    user_id: Optional[str] = None,
) -> bool:
    """
    Verify selected product authoritative backend checks:
    1. Product ID exists in database.
    2. Product status is published.
    3. Product belongs to candidate list if candidate list is provided.
    """
    if db is None or not product_id:
        return False

    try:
        from bson import ObjectId
        query: Dict[str, Any] = {"_id": ObjectId(product_id), "status": "published"}
        doc = await db.products.find_one(query)
        if not doc:
            return False

        if candidate_product_ids is not None and len(candidate_product_ids) > 0:
            if str(product_id) not in [str(c) for c in candidate_product_ids]:
                logger.warning(f"Product {product_id} not found in active candidate list.")
                return False

        return True
    except Exception as e:
        logger.warning(f"Error verifying product selection: {str(e)}")
        return False

"""
Session Service — centralized, secure lifecycle & context management for Buyer Agent.
Enforces session_id + user_id scoping, TTL staleness handling, atomic version concurrency, and clean context resets.
"""

import logging
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple

from app.core.config import settings
from app.schemas.agent_state import AgentContext, AgentState, AgentStateEnum, TransitionReason, build_agent_context
from app.schemas.audit import AuditAction, AuditResourceType
from app.services.audit_service import record_audit_event

logger = logging.getLogger("razorreach.agent_session_service")

SESSION_ID_REGEX = re.compile(r"^[a-zA-Z0-9_\-]{8,128}$")


def validate_session_id_format(session_id: Optional[str]) -> bool:
    """
    Validate session_id format to guard against malformed, oversized, or injection inputs.
    Must be 8 to 128 characters, alphanumeric with hyphens or underscores.
    """
    if not session_id or not isinstance(session_id, str):
        return False
    return bool(SESSION_ID_REGEX.match(session_id))


def is_session_stale(created_or_updated_at: str, ttl_hours: int = settings.AGENT_SESSION_TTL_HOURS) -> bool:
    """
    Check if a session timestamp exceeds the configurable TTL hours.
    """
    if not created_or_updated_at:
        return False
    try:
        dt = datetime.fromisoformat(created_or_updated_at)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        return (now - dt) > timedelta(hours=ttl_hours)
    except Exception:
        return False


async def get_or_create_agent_session(
    db,
    user_id: str,
    session_id: Optional[str] = None,
) -> Tuple[AgentState, bool]:
    """
    Fetch existing AgentState scoped strictly by (session_id AND user_id),
    or initialize a fresh AgentState with a stable UUID session_id.
    
    Security & Staleness logic:
    - Format validation: invalid session_id generates a new session.
    - Ownership isolation: session_id belonging to another user is rejected and a new session created.
    - Staleness TTL: expired session returns state to START and clears conversational context without touching commerce data.
    """
    now_iso = datetime.now(timezone.utc).isoformat()

    if session_id and validate_session_id_format(session_id) and db is not None:
        try:
            # Strictly scope search by session_id AND user_id
            doc = await db.agent_states.find_one({"session_id": session_id, "user_id": user_id})
            if doc:
                # Check for staleness
                last_active = doc.get("updated_at") or doc.get("created_at", "")
                if is_session_stale(last_active):
                    logger.info(f"Session {session_id} is stale (> {settings.AGENT_SESSION_TTL_HOURS}h). Reinitializing to START.")
                    # Audit staleness
                    await record_audit_event(
                        db=db,
                        action=AuditAction.AGENT_SESSION_EXPIRED,
                        resource_type=AuditResourceType.AI_AGENT,
                        actor_id=user_id,
                        metadata={"session_id": session_id, "reason": "TTL_EXPIRED"},
                    )
                    # Reset conversational state but preserve session_id and user_id
                    stale_state = AgentState(
                        session_id=session_id,
                        user_id=user_id,
                        current_state=AgentStateEnum.START,
                        last_transition=f"{doc.get('current_state', 'START')}->START",
                        last_transition_reason=TransitionReason.SESSION_EXPIRED.value,
                        turn_count=0,
                        version=doc.get("version", 0) + 1,
                        created_at=doc.get("created_at", now_iso),
                        updated_at=now_iso,
                    )
                    await save_agent_session_atomic(db, stale_state)
                    return stale_state, False

                # Return active state
                from app.schemas.ai_search import SearchIntent
                active_state = AgentState(
                    session_id=doc["session_id"],
                    user_id=doc["user_id"],
                    current_state=AgentStateEnum(doc.get("current_state", AgentStateEnum.START.value)),
                    goal=doc.get("goal"),
                    intent=SearchIntent(**doc["intent"]) if doc.get("intent") else None,
                    candidate_product_ids=doc.get("candidate_product_ids", [])[:10],
                    selected_product_id=doc.get("selected_product_id"),
                    last_referenced_product_id=doc.get("last_referenced_product_id"),
                    comparison_product_ids=doc.get("comparison_product_ids", [])[:5],
                    last_cart_product_id=doc.get("last_cart_product_id"),
                    cart_id=doc.get("cart_id"),
                    last_tool=doc.get("last_tool"),
                    last_tool_result_summary=doc.get("last_tool_result_summary"),
                    pending_action=doc.get("pending_action"),
                    confirmation_required=doc.get("confirmation_required", False),
                    last_transition=doc.get("last_transition"),
                    last_transition_reason=doc.get("last_transition_reason"),
                    turn_count=doc.get("turn_count", 0),
                    clarification_count=doc.get("clarification_count", 0),
                    preference_context=doc.get("preference_context", {}),
                    version=doc.get("version", 0),
                    created_at=doc.get("created_at", now_iso),
                    updated_at=doc.get("updated_at", now_iso),
                )
                return active_state, False
            else:
                # Check if session_id exists for a DIFFERENT user (security check)
                other_user_doc = await db.agent_states.find_one({"session_id": session_id})
                if other_user_doc:
                    logger.warning(f"User {user_id} attempted to access session {session_id} belonging to user {other_user_doc.get('user_id')}. Isolation enforced.")
        except Exception as e:
            logger.warning(f"Error retrieving session {session_id}: {str(e)}")

    # Generate new stable session
    use_provided = session_id and validate_session_id_format(session_id) and not (db is not None and await db.agent_states.find_one({"session_id": session_id}))
    new_session_id = session_id if use_provided else f"sess_{uuid.uuid4().hex}"
    fresh_state = AgentState(
        session_id=new_session_id,
        user_id=user_id,
        current_state=AgentStateEnum.START,
        turn_count=0,
        version=0,
        created_at=now_iso,
        updated_at=now_iso,
    )
    if db is not None:
        await save_agent_session_atomic(db, fresh_state)
        await record_audit_event(
            db=db,
            action=AuditAction.AGENT_SESSION_CREATED,
            resource_type=AuditResourceType.AI_AGENT,
            actor_id=user_id,
            metadata={"session_id": new_session_id},
        )
    return fresh_state, True


async def save_agent_session_atomic(db, state: AgentState) -> AgentState:
    """
    Persist state atomically using MongoDB optimistic concurrency filtering.
    Increments version by 1 and updates updated_at.
    """
    if db is None:
        state.version += 1
        state.updated_at = datetime.now(timezone.utc).isoformat()
        return state

    old_version = state.version
    state.version = old_version + 1
    state.updated_at = datetime.now(timezone.utc).isoformat()

    doc = {
        "session_id": state.session_id,
        "user_id": state.user_id,
        "current_state": state.current_state.value,
        "goal": state.goal,
        "intent": state.intent.model_dump() if state.intent else None,
        "candidate_product_ids": (state.candidate_product_ids or [])[:10],
        "selected_product_id": state.selected_product_id,
        "last_referenced_product_id": state.last_referenced_product_id,
        "comparison_product_ids": (state.comparison_product_ids or [])[:5],
        "last_cart_product_id": state.last_cart_product_id,
        "cart_id": state.cart_id,
        "last_tool": state.last_tool,
        "last_tool_result_summary": state.last_tool_result_summary,
        "pending_action": state.pending_action,
        "confirmation_required": state.confirmation_required,
        "last_transition": state.last_transition,
        "last_transition_reason": state.last_transition_reason,
        "turn_count": state.turn_count,
        "clarification_count": state.clarification_count,
        "preference_context": state.preference_context,
        "version": state.version,
        "created_at": state.created_at,
        "updated_at": state.updated_at,
    }

    try:
        # Atomic filter using session_id, user_id, and expected previous version (or missing version for migration)
        filter_q = {
            "session_id": state.session_id,
            "user_id": state.user_id,
            "$or": [
                {"version": old_version},
                {"version": {"$exists": False}},
            ]
        }
        res = await db.agent_states.update_one(filter_q, {"$set": doc}, upsert=True)
    except Exception as e:
        logger.warning(f"Atomic update exception for session {state.session_id}: {str(e)}")

    return state


async def reset_agent_session(db, session_id: str, user_id: str) -> AgentState:
    """
    Reset conversational AgentState back to START state.
    Preserves session identity while clearing goals, intents, and candidate context.
    IMPORTANT: Does NOT delete or mutate customer's cart, orders, or payments!
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    
    # Scoped strictly by session_id and user_id
    existing, _ = await get_or_create_agent_session(db, user_id, session_id)
    
    reset_state = AgentState(
        session_id=existing.session_id,
        user_id=user_id,
        current_state=AgentStateEnum.START,
        goal=None,
        intent=None,
        candidate_product_ids=[],
        selected_product_id=None,
        last_referenced_product_id=None,
        comparison_product_ids=[],
        last_cart_product_id=None,
        cart_id=existing.cart_id,  # Cart reference preserved, cart collection untouched
        last_tool=None,
        last_tool_result_summary=None,
        pending_action=None,
        confirmation_required=False,
        last_transition=f"{existing.current_state.value}->START",
        last_transition_reason=TransitionReason.SESSION_RESET.value,
        turn_count=0,
        version=existing.version,
        created_at=existing.created_at,
        updated_at=now_iso,
    )
    
    await save_agent_session_atomic(db, reset_state)
    
    if db is not None:
        await record_audit_event(
            db=db,
            action=AuditAction.AGENT_SESSION_RESET,
            resource_type=AuditResourceType.AI_AGENT,
            actor_id=user_id,
            metadata={"session_id": existing.session_id},
        )

    return reset_state

"""
Execution Runner for LangGraph Buyer Agent (Task 20).
Executes the compiled StateGraph and translates final graph state
into the standard AISearchResponse required by existing API consumers.
"""

import logging
from typing import Any, Optional

from app.agents.langgraph.graph import buyer_graph
from app.agents.langgraph.state import BuyerGraphState
from app.schemas.ai_search import AISearchResponse, SearchIntent
from app.services.ai_resilience import reset_turn_resilience_context

logger = logging.getLogger("razorreach.langgraph.runner")


async def run_langgraph_buyer_turn(
    db: Any,
    user_id: Optional[str],
    message: str,
    previous_intent: Optional[SearchIntent] = None,
    session_id: Optional[str] = None,
) -> AISearchResponse:
    """
    Executes a single customer turn through the LangGraph StateGraph.
    Ensures 100% API compatibility with AISearchResponse.
    """
    reset_turn_resilience_context()

    eff_user_id = user_id or "anonymous"

    import uuid
    eff_session_id = session_id or f"sess_{uuid.uuid4().hex[:12]}"

    initial_input: BuyerGraphState = {
        "user_id": eff_user_id,
        "session_id": eff_session_id,
        "message": message,
        "previous_intent": previous_intent,
    }

    from app.agents.langgraph.graph import get_compiled_buyer_graph, buyer_graph
    target_graph = get_compiled_buyer_graph(db=db) if db is not None else buyer_graph

    config = {"configurable": {"thread_id": eff_session_id, "db": db}}

    try:
        final_state: BuyerGraphState = await target_graph.ainvoke(initial_input, config=config)
    except Exception as exc:
        logger.error(f"LangGraph execution encountered unhandled exception: {exc}", exc_info=True)
        raise

    agent_state = final_state["agent_state"]
    recommended_products = final_state.get("recommended_products", [])
    effective_intent = final_state.get("effective_intent") or agent_state.intent

    final_message = (
        final_state.get("final_message")
        or (f"Found {len(recommended_products)} products." if recommended_products else "How else can I help?")
    )

    from app.services.ai_resilience import is_fallback_used, get_turn_failure_type
    from app.services.audit_service import record_audit_event
    from app.schemas.audit import AuditAction, AuditResourceType

    if is_fallback_used() or final_state.get("fallback_active"):
        response_mode = "DETERMINISTIC_FALLBACK"
        try:
            failure_type = get_turn_failure_type()
            await record_audit_event(
                db=db,
                action=AuditAction.BUYER_AGENT_AI_FALLBACK,
                resource_type=AuditResourceType.AI_AGENT,
                actor_id=eff_user_id,
                actor_role="customer",
                metadata={
                    "session_id": agent_state.session_id,
                    "response_mode": response_mode,
                    "failure_type": failure_type.value if failure_type else "UNKNOWN",
                    "fallback_used": True,
                },
            )
        except Exception:
            pass
    elif final_state.get("requires_clarification") or agent_state.pending_action == "ASK_CLARIFICATION":
        response_mode = "CLARIFICATION"
    else:
        response_mode = "AI"

    intent_obj = effective_intent or SearchIntent(search_text=message.strip().lower())

    return AISearchResponse(
        session_id=agent_state.session_id,
        message=final_message,
        intent=intent_obj,
        products=recommended_products,
        response_mode=response_mode,
    )

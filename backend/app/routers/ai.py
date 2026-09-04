"""
AI router — natural language shopping search endpoint using Gemini AI Buyer Agent.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.agents import buyer_agent
from app.core.database import db_manager
from app.core.dependencies import get_current_user
from app.schemas.ai_search import AISearchRequest, AISearchResponse
from app.schemas.audit import AuditAction, AuditResourceType
from app.services.audit_service import record_audit_event

logger = logging.getLogger("razorreach.ai_router")

router = APIRouter(prefix="/ai", tags=["AI Agent"])


@router.post("/search", response_model=AISearchResponse)
async def ai_search(
    request: AISearchRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Natural language product search endpoint powered by Gemini AI Buyer Agent.
    Parses intent, searches products, and returns grounded recommendations.
    Requires authenticated user.
    """
    db = db_manager.get_db()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable",
        )

    try:
        user_id = current_user.get("id")
        res = await buyer_agent.process_buyer_query(
            db=db,
            user_id=user_id,
            message=request.message,
            previous_intent=request.previous_intent,
            session_id=request.session_id,
        )

        await record_audit_event(
            db=db,
            action=AuditAction.BUYER_AGENT_USED,
            resource_type=AuditResourceType.AI_AGENT,
            actor_id=user_id,
            actor_role=current_user.get("role", "customer"),
            metadata={"message_length": len(request.message)},
        )

        return res
    except RuntimeError as e:
        logger.warning(f"AI search service error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected AI search failure: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI search service temporarily unavailable",
        )


@router.post("/session/reset")
async def reset_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Reset conversational state of an active buyer agent session.
    Preserves session identity while returning FSM state to START.
    Does NOT delete cart, orders, or payment history.
    """
    db = db_manager.get_db()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable",
        )

    from app.services.agent_session_service import reset_agent_session
    user_id = current_user.get("id")
    state = await reset_agent_session(db, session_id=session_id, user_id=user_id)
    return {
        "message": "Agent session conversational context reset successfully",
        "session_id": state.session_id,
        "current_state": state.current_state.value,
    }

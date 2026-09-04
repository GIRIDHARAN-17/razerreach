"""
History router — GET /api/history endpoint for AI Buyer decision sessions.
Enforces customer authentication, strict user_id isolation, and bounded pagination.
"""

import logging
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.database import db_manager
from app.core.dependencies import get_current_user
from app.schemas.history import (
    ConversationMessage,
    HistoryResponse,
    SearchRequirements,
    SearchSessionItem,
)

logger = logging.getLogger("razorreach.history_router")

router = APIRouter(prefix="/history", tags=["History"])


@router.get("", response_model=HistoryResponse)
async def get_user_history(
    limit: int = Query(20, ge=1, le=50, description="Maximum number of historical sessions to return"),
    skip: int = Query(0, ge=0, description="Number of sessions to skip for pagination"),
    current_user: dict = Depends(get_current_user),
):
    """
    Retrieve authenticated user's own decision history and search sessions.
    Strictly isolated by user_id derived from the authentication token.
    Never exposes passwords, tokens, API keys, or raw chain-of-thought internal state.
    """
    db = db_manager.get_db()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable",
        )

    user_id = current_user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user session identity",
        )

    query = {"user_id": user_id}

    try:
        total = await db.agent_states.count_documents(query)
        cursor = db.agent_states.find(query).sort("updated_at", -1).skip(skip).limit(limit)

        sessions: List[SearchSessionItem] = []
        async for doc in cursor:
            intent = doc.get("intent") or {}
            goal = doc.get("goal") or "Product Search"
            last_summary = doc.get("last_tool_result_summary") or "Product decision session completed"
            candidate_ids = doc.get("candidate_product_ids") or []

            conv = [
                ConversationMessage(role="user", content=goal),
                ConversationMessage(role="assistant", content=last_summary),
            ]

            reqs = SearchRequirements(
                brand=intent.get("brand"),
                product_type=intent.get("category") or intent.get("search_text"),
                budget_max=float(intent["max_price"]) if intent.get("max_price") is not None else None,
                currency="INR",
            )

            recs = [{"id": pid} for pid in candidate_ids]

            created_at_val = doc.get("created_at") or doc.get("updated_at") or datetime.now(timezone.utc).isoformat()

            sessions.append(
                SearchSessionItem(
                    session_id=doc["session_id"],
                    created_at=created_at_val,
                    conversation=conv,
                    requirements=reqs,
                    recommendations=recs,
                )
            )

        return HistoryResponse(
            sessions=sessions,
            total=total,
            limit=limit,
            skip=skip,
        )
    except Exception as e:
        logger.error(f"Error retrieving history for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve history",
        )

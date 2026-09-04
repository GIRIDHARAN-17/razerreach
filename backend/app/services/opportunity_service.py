"""
Opportunity service facade — delegates opportunity generation to authoritative opportunity_engine.py.
Maintains backwards compatibility for Task 11 imports.
"""

import logging
from typing import List

from app.schemas.analytics import (
    AnalyticsSummaryResponse,
    OpportunityCandidate,
    OpportunityEvidence,
    OpportunityType,
)
from app.services import opportunity_engine

logger = logging.getLogger("razorreach.opportunity_service")


async def get_merchant_analytics_summary(
    db,
    merchant_id: str,
    period_days: int = 30,
) -> AnalyticsSummaryResponse:
    """Delegate analytics summary calculation."""
    return await opportunity_engine.get_merchant_analytics_summary(db, merchant_id, period_days)


async def detect_merchant_opportunities(
    db,
    merchant_id: str,
    period_days: int = 30,
) -> List[OpportunityCandidate]:
    """
    Delegate deterministic opportunity detection to opportunity_engine and map to OpportunityCandidate.
    """
    records = await opportunity_engine.generate_and_persist_opportunities(
        db=db,
        merchant_id=merchant_id,
        period_days=period_days,
    )

    candidates = []
    for r in records:
        candidates.append(OpportunityCandidate(
            id=r.id,
            type=OpportunityType(r.type.value),
            priority=r.priority.value,
            score=r.score,
            title=r.title,
            summary=r.summary,
            evidence=OpportunityEvidence(
                search_count=r.evidence.search_count,
                zero_result_count=r.evidence.zero_result_count,
                zero_result_rate=r.evidence.zero_result_rate,
                views_count=r.evidence.view_count,
                cart_count=r.evidence.cart_add_count,
                purchases_count=r.evidence.purchase_count,
                current_stock=r.evidence.current_stock,
                estimated_potential_revenue=r.estimated_potential_revenue,
            ),
            suggested_action=r.suggested_action,
            merchant_id=r.merchant_id,
        ))

    return candidates

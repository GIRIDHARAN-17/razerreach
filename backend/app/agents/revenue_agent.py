"""
Revenue Opportunity Agent — Task 13 AI interpretation layer.
Consumes structured opportunity records from Task 12 (opportunity_engine.py)
and produces grounded explanations, evidence summaries, hypotheses, and suggested merchant actions.

Grounding & Anti-Hallucination Rules:
1. Task 12 metrics, evidence, score, priority, and revenue estimates are authoritative and immutable.
2. AI responses cannot modify or overwrite numerical evidence.
3. Prompt injection defense: target strings are sanitized and treated strictly as parameter data.
4. Robust fallback: returns deterministic evidence analysis if Gemini fails or is unconfigured.
"""

import json
import logging
import re
from typing import Any, Dict, List, Optional

from app.agents.prompts import REVENUE_AGENT_SYSTEM_PROMPT
from app.core.config import settings
from app.schemas.analytics import (
    OpportunityCandidate,
    OpportunityEvidence as AnalyticsEvidence,
    OpportunityType as AnalyticsType,
    RevenueOpportunitiesResponse,
)
from app.schemas.opportunity import (
    BulkOpportunityAnalysisResponse,
    RevenueAgentAnalysis,
    RevenueOpportunityAnalysisResponse,
    RevenueOpportunityRecord,
)
from app.services import opportunity_engine

logger = logging.getLogger("razorreach.revenue_agent")


def _sanitize_string(text: str) -> str:
    """Sanitize target/query strings to defend against prompt injection."""
    if not text:
        return ""
    # Strip potential instruction overrides or excessive delimiters
    cleaned = re.sub(r'[\r\n"\'`{}]', ' ', text)
    return cleaned.strip()[:200]


def _build_deterministic_fallback_analysis(opportunity: RevenueOpportunityRecord) -> RevenueAgentAnalysis:
    """
    Generate a 100% deterministic fallback analysis if Gemini is unavailable,
    unconfigured, or returns an error.
    """
    ev = opportunity.evidence
    evidence_items = []

    if ev.search_count is not None:
        evidence_items.append(f"Recorded {ev.search_count} total customer searches in period.")
    if ev.zero_result_count is not None:
        evidence_items.append(f"Found {ev.zero_result_count} zero-result search queries.")
    if ev.view_count is not None:
        evidence_items.append(f"Product received {ev.view_count} customer views.")
    if ev.cart_add_count is not None:
        evidence_items.append(f"Product was added to cart {ev.cart_add_count} times.")
    if ev.purchase_count is not None:
        evidence_items.append(f"Recorded {ev.purchase_count} completed purchases.")
    if ev.current_stock is not None:
        evidence_items.append(f"Current product inventory stock is {ev.current_stock} units.")

    if not evidence_items:
        evidence_items.append("Aggregated behavioral demand signals from platform events.")

    interpretation = f"Backend analytics detected an opportunity signal for target '{opportunity.target}' with heuristic score {opportunity.score}."
    if opportunity.estimated_potential_revenue is not None:
        interpretation += f" Estimated potential revenue impact is ~₹{opportunity.estimated_potential_revenue:,.2f} based on backend demand model."

    return RevenueAgentAnalysis(
        title=opportunity.title,
        summary=opportunity.summary,
        evidence_summary=evidence_items,
        interpretation=interpretation,
        suggested_action=opportunity.suggested_action,
        confidence="high" if opportunity.score >= 0.75 else ("medium" if opportunity.score >= 0.50 else "low"),
    )


async def analyze_single_opportunity(
    opportunity: RevenueOpportunityRecord,
) -> RevenueOpportunityAnalysisResponse:
    """
    Analyze a single Task 12 opportunity using Gemini gemini-2.5-flash.
    Returns RevenueOpportunityAnalysisResponse containing untouched Task 12 record
    and AI-generated analysis.
    """
    fallback_analysis = _build_deterministic_fallback_analysis(opportunity)

    if not settings.GEMINI_API_KEY:
        logger.info("GEMINI_API_KEY is unconfigured. Returning deterministic fallback analysis.")
        return RevenueOpportunityAnalysisResponse(
            opportunity=opportunity,
            analysis=fallback_analysis,
        )

    try:
        from google import genai
        client = genai.Client(api_key=settings.GEMINI_API_KEY)
    except Exception as e:
        logger.warning(f"Failed to initialize Gemini client: {type(e).__name__}. Returning fallback.")
        return RevenueOpportunityAnalysisResponse(
            opportunity=opportunity,
            analysis=fallback_analysis,
        )

    # Sanitize input to defend against prompt injection
    safe_target = _sanitize_string(opportunity.target)
    safe_title = _sanitize_string(opportunity.title)

    payload = {
        "type": opportunity.type.value,
        "target": safe_target,
        "title": safe_title,
        "score": opportunity.score,
        "priority": opportunity.priority.value,
        "evidence": opportunity.evidence.model_dump(exclude_none=True),
        "estimated_potential_revenue": opportunity.estimated_potential_revenue,
    }

    prompt = (
        f"{REVENUE_AGENT_SYSTEM_PROMPT}\n\n"
        f"INPUT OPPORTUNITY EVIDENCE:\n"
        f"{json.dumps(payload, indent=2)}\n\n"
        "Provide structured analysis conforming to JSON schema with keys:\n"
        '{\n'
        '  "title": "...",\n'
        '  "summary": "...",\n'
        '  "evidence_summary": ["fact 1", "fact 2"],\n'
        '  "interpretation": "...",\n'
        '  "suggested_action": "...",\n'
        '  "confidence": "high" | "medium" | "low"\n'
        '}'
    )

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config={"response_mime_type": "application/json"},
        )
        data = json.loads(response.text.strip())

        analysis = RevenueAgentAnalysis(
            title=data.get("title") or fallback_analysis.title,
            summary=data.get("summary") or fallback_analysis.summary,
            evidence_summary=data.get("evidence_summary") or fallback_analysis.evidence_summary,
            interpretation=data.get("interpretation") or fallback_analysis.interpretation,
            suggested_action=data.get("suggested_action") or fallback_analysis.suggested_action,
            confidence=data.get("confidence") if data.get("confidence") in ["high", "medium", "low"] else fallback_analysis.confidence,
        )

        return RevenueOpportunityAnalysisResponse(
            opportunity=opportunity,  # Task 12 evidence remains 100% untouched!
            analysis=analysis,
        )

    except Exception as e:
        logger.warning(f"Gemini analysis error: {type(e).__name__}. Returning fallback analysis.")
        return RevenueOpportunityAnalysisResponse(
            opportunity=opportunity,
            analysis=fallback_analysis,
        )


async def analyze_bulk_opportunities(
    opportunities: List[RevenueOpportunityRecord],
    max_limit: int = 10,
) -> BulkOpportunityAnalysisResponse:
    """
    Perform bulk AI analysis on a bounded set of opportunities (max 10).
    """
    bounded_opps = opportunities[:max_limit]
    results = []

    for opp in bounded_opps:
        analysis_res = await analyze_single_opportunity(opp)
        results.append(analysis_res)

    merchant_id = opportunities[0].merchant_id if opportunities else ""

    return BulkOpportunityAnalysisResponse(
        merchant_id=merchant_id,
        total_analyzed=len(results),
        results=results,
    )


async def generate_merchant_opportunities(
    db,
    merchant_id: str,
    period_days: int = 30,
) -> RevenueOpportunitiesResponse:
    """
    Backwards-compatible helper for Task 11 / Task 12 endpoints.
    """
    records = await opportunity_engine.generate_and_persist_opportunities(
        db=db,
        merchant_id=merchant_id,
        period_days=period_days,
    )

    candidates = [
        OpportunityCandidate(
            id=r.id,
            type=AnalyticsType(r.type.value),
            priority=r.priority.value,
            score=r.score,
            title=r.title,
            summary=r.summary,
            evidence=AnalyticsEvidence(
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
        )
        for r in records
    ]

    return RevenueOpportunitiesResponse(
        merchant_id=merchant_id,
        period_days=period_days,
        opportunities=candidates,
    )

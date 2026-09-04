"""
Revenue Opportunity Engine — authoritative, 100% deterministic business intelligence service.
Aggregates behavioral platform data, enforces sample thresholds, computes heuristic scores/priorities,
estimates potential revenue, and persists structured opportunities for Task 13 consumption.
Zero dependency on external AI/LLM models.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from pymongo.errors import PyMongoError

from app.schemas.analytics import AnalyticsSummaryResponse
from app.schemas.opportunity import (
    OpportunityEvidence,
    OpportunityPriority,
    OpportunityStatus,
    OpportunityType,
    RevenueOpportunityRecord,
)

logger = logging.getLogger("razorreach.opportunity_engine")


async def get_merchant_analytics_summary(
    db,
    merchant_id: str,
    period_days: int = 30,
) -> AnalyticsSummaryResponse:
    """Calculate summary metrics for a specific merchant over the last period_days."""
    if db is None:
        return AnalyticsSummaryResponse(
            merchant_id=merchant_id,
            period_days=period_days,
            total_searches=0,
            total_views=0,
            cart_adds=0,
            checkouts_started=0,
            successful_purchases=0,
            failed_payments=0,
            total_revenue=0.0,
            conversion_rate=0.0,
        )

    start_date = (datetime.now(timezone.utc) - timedelta(days=period_days)).isoformat()

    p_cursor = db.products.find({"merchant_id": merchant_id})
    products = await p_cursor.to_list(length=1000)
    product_ids = [str(p["_id"]) for p in products]

    match_query = {
        "created_at": {"$gte": start_date},
        "$or": [
            {"merchant_id": merchant_id},
            {"product_id": {"$in": product_ids}},
        ],
    }

    cursor = db.analytics_events.find(match_query)
    events = await cursor.to_list(length=10000)

    views = sum(1 for e in events if e.get("event_type") == "product_view")
    cart_adds = sum(1 for e in events if e.get("event_type") == "cart_add")
    checkouts = sum(1 for e in events if e.get("event_type") == "checkout_started")
    purchases = sum(1 for e in events if e.get("event_type") == "payment_success")
    failed_payments = sum(1 for e in events if e.get("event_type") == "payment_failed")

    order_cursor = db.orders.find({
        "merchant_id": merchant_id,
        "status": "paid",
        "created_at": {"$gte": start_date},
    })
    paid_orders = await order_cursor.to_list(length=1000)
    total_revenue = sum(float(o.get("total", 0.0)) for o in paid_orders)

    search_count = sum(1 for e in events if e.get("event_type") == "search")
    conversion_rate = round(purchases / views, 4) if views > 0 else 0.0

    return AnalyticsSummaryResponse(
        merchant_id=merchant_id,
        period_days=period_days,
        total_searches=search_count,
        total_views=views,
        cart_adds=cart_adds,
        checkouts_started=checkouts,
        successful_purchases=purchases,
        failed_payments=failed_payments,
        total_revenue=round(total_revenue, 2),
        conversion_rate=min(1.0, conversion_rate),
    )



def _calculate_score(
    demand_factor: float,
    unmet_demand_factor: float,
    conversion_gap_factor: float,
    stock_gap_factor: float,
) -> float:
    """
    Deterministic scoring framework:
    score = 0.35 * demand + 0.25 * unmet_demand + 0.20 * conversion_gap + 0.20 * stock_gap
    Clamped strictly between 0.0 and 1.0.
    """
    score = (
        0.35 * min(1.0, max(0.0, demand_factor)) +
        0.25 * min(1.0, max(0.0, unmet_demand_factor)) +
        0.20 * min(1.0, max(0.0, conversion_gap_factor)) +
        0.20 * min(1.0, max(0.0, stock_gap_factor))
    )
    return round(min(1.0, max(0.0, score)), 2)


def _determine_priority(score: float) -> OpportunityPriority:
    """Map normalized score to priority threshold."""
    if score >= 0.75:
        return OpportunityPriority.HIGH
    elif score >= 0.50:
        return OpportunityPriority.MEDIUM
    return OpportunityPriority.LOW


async def generate_and_persist_opportunities(
    db,
    merchant_id: str,
    period_days: int = 30,
) -> List[RevenueOpportunityRecord]:
    """
    Core engine function:
    1. Aggregates analytics_events, products, orders, and payments for merchant.
    2. Runs deterministic demand signal detectors with sample thresholds.
    3. Computes heuristic scores, priorities, and potential revenue estimates.
    4. Upserts structured records into revenue_opportunities collection.
    """
    if db is None:
        return []

    now_dt = datetime.now(timezone.utc)
    start_dt = now_dt - timedelta(days=period_days)
    period_start = start_dt.isoformat()
    period_end = now_dt.isoformat()

    # Fetch merchant products
    p_cursor = db.products.find({"merchant_id": merchant_id})
    merchant_products = await p_cursor.to_list(length=1000)
    p_map = {str(p["_id"]): p for p in merchant_products}
    product_ids = list(p_map.keys())

    opportunities: List[RevenueOpportunityRecord] = []

    # -------------------------------------------------------------
    # SIGNAL 1: UNSERVED DEMAND (Minimum 5 searches threshold)
    # -------------------------------------------------------------
    zero_searches = await db.analytics_events.find({
        "event_type": "search",
        "created_at": {"$gte": period_start},
        "metadata.results_count": 0,
    }).to_list(length=1000)

    if zero_searches:
        query_counts: Dict[str, int] = {}
        for s in zero_searches:
            q = (s.get("query") or "general").strip().lower()
            query_counts[q] = query_counts.get(q, 0) + 1

        for query_str, zero_cnt in query_counts.items():
            if zero_cnt >= 5:  # Sample threshold
                total_searches = len(zero_searches)
                zero_rate = round(zero_cnt / max(1, total_searches), 3)

                d_factor = min(1.0, zero_cnt / 20.0)
                unmet_factor = zero_rate
                score = _calculate_score(d_factor, unmet_factor, 0.0, 0.0)
                priority = _determine_priority(score)

                record_id = f"opp_unserved_{merchant_id[:6]}_{hash(query_str) % 100000}"
                opportunities.append(RevenueOpportunityRecord(
                    id=record_id,
                    merchant_id=merchant_id,
                    type=OpportunityType.UNSERVED_DEMAND,
                    target=query_str,
                    score=score,
                    priority=priority,
                    status=OpportunityStatus.NEW,
                    title=f"Unserved Customer Demand for '{query_str.title()}'",
                    summary=f"Analyzed {total_searches} search events in the last {period_days} days. Identified {zero_cnt} zero-result queries for '{query_str}'.",
                    evidence=OpportunityEvidence(
                        search_count=total_searches,
                        zero_result_count=zero_cnt,
                        zero_result_rate=zero_rate,
                        period_days=period_days,
                    ),
                    suggested_action=f"Expand product catalog to include items matching '{query_str}'.",
                    estimated_potential_revenue=None,  # No explicit price available for unserved search query
                    period_start=period_start,
                    period_end=period_end,
                    generated_at=period_end,
                ))

    # -------------------------------------------------------------
    # SIGNAL 2: LOW CONVERSION (Minimum 20 views threshold)
    # -------------------------------------------------------------
    if product_ids:
        view_events = await db.analytics_events.find({
            "event_type": "product_view",
            "product_id": {"$in": product_ids},
            "created_at": {"$gte": period_start},
        }).to_list(length=5000)

        view_counts: Dict[str, int] = {}
        for v in view_events:
            pid = v.get("product_id")
            if pid:
                view_counts[pid] = view_counts.get(pid, 0) + 1

        purchase_events = await db.analytics_events.find({
            "event_type": "payment_success",
            "merchant_id": merchant_id,
            "created_at": {"$gte": period_start},
        }).to_list(length=1000)

        purchase_counts: Dict[str, int] = {}
        for p in purchase_events:
            pid = p.get("product_id")
            if pid:
                purchase_counts[pid] = purchase_counts.get(pid, 0) + 1

        for pid, v_cnt in view_counts.items():
            if v_cnt >= 20:  # Sample threshold
                p_cnt = purchase_counts.get(pid, 0)
                conv_rate = round(p_cnt / v_cnt, 3)

                if conv_rate < 0.05:  # Low conversion gap
                    p_obj = p_map.get(pid, {})
                    p_name = p_obj.get("name", "Product")
                    price = float(p_obj.get("price", 0))

                    d_factor = min(1.0, v_cnt / 50.0)
                    conv_gap = round(1.0 - conv_rate, 3)
                    score = _calculate_score(d_factor, 0.0, conv_gap, 0.0)
                    priority = _determine_priority(score)

                    est_rev = round((v_cnt * 0.05 - p_cnt) * price, 2) if price > 0 else None

                    record_id = f"opp_lowconv_{merchant_id[:6]}_{pid[:8]}"
                    opportunities.append(RevenueOpportunityRecord(
                        id=record_id,
                        merchant_id=merchant_id,
                        type=OpportunityType.LOW_CONVERSION,
                        target=pid,
                        score=score,
                        priority=priority,
                        status=OpportunityStatus.NEW,
                        title=f"Low Purchase Conversion on '{p_name}'",
                        summary=f"Product '{p_name}' received {v_cnt} customer views but resulted in only {p_cnt} purchases (conversion rate: {conv_rate * 100:.1f}%).",
                        evidence=OpportunityEvidence(
                            view_count=v_cnt,
                            purchase_count=p_cnt,
                            conversion_rate=conv_rate,
                            period_days=period_days,
                        ),
                        suggested_action="Review product pricing, image quality, and feature specifications to improve conversion.",
                        estimated_potential_revenue=est_rev,
                        period_start=period_start,
                        period_end=period_end,
                        generated_at=period_end,
                    ))

    # -------------------------------------------------------------
    # SIGNAL 3: CART ABANDONMENT (Minimum 5 cart adds threshold)
    # -------------------------------------------------------------
    if product_ids:
        cart_events = await db.analytics_events.find({
            "event_type": "cart_add",
            "product_id": {"$in": product_ids},
            "created_at": {"$gte": period_start},
        }).to_list(length=5000)

        cart_counts: Dict[str, int] = {}
        for c in cart_events:
            pid = c.get("product_id")
            if pid:
                cart_counts[pid] = cart_counts.get(pid, 0) + 1

        for pid, c_cnt in cart_counts.items():
            if c_cnt >= 5:  # Sample threshold
                p_cnt = purchase_counts.get(pid, 0)
                abandon_rate = round(1.0 - (p_cnt / c_cnt), 3)

                if abandon_rate >= 0.50:
                    p_obj = p_map.get(pid, {})
                    p_name = p_obj.get("name", "Product")
                    price = float(p_obj.get("price", 0))

                    d_factor = min(1.0, c_cnt / 25.0)
                    conv_gap = abandon_rate
                    score = _calculate_score(d_factor, 0.0, conv_gap, 0.0)
                    priority = _determine_priority(score)

                    est_rev = round((c_cnt - p_cnt) * 0.5 * price, 2) if price > 0 else None

                    record_id = f"opp_cartaban_{merchant_id[:6]}_{pid[:8]}"
                    opportunities.append(RevenueOpportunityRecord(
                        id=record_id,
                        merchant_id=merchant_id,
                        type=OpportunityType.CART_ABANDONMENT,
                        target=pid,
                        score=score,
                        priority=priority,
                        status=OpportunityStatus.NEW,
                        title=f"High Cart Abandonment for '{p_name}'",
                        summary=f"Product '{p_name}' was added to cart {c_cnt} times but resulted in only {p_cnt} purchases (abandonment rate: {abandon_rate * 100:.1f}%).",
                        evidence=OpportunityEvidence(
                            cart_add_count=c_cnt,
                            purchase_count=p_cnt,
                            abandonment_rate=abandon_rate,
                            period_days=period_days,
                        ),
                        suggested_action="Consider offering a promotional discount or clarifying shipping costs during checkout.",
                        estimated_potential_revenue=est_rev,
                        period_start=period_start,
                        period_end=period_end,
                        generated_at=period_end,
                    ))

    # -------------------------------------------------------------
    # SIGNAL 4: STOCK GAP (Out-of-stock items with demand)
    # -------------------------------------------------------------
    for p in merchant_products:
        if int(p.get("stock", 0)) == 0:
            pid = str(p["_id"])
            p_views = sum(1 for e in view_events if e.get("product_id") == pid) if 'view_events' in locals() else 0
            p_carts = sum(1 for e in cart_events if e.get("product_id") == pid) if 'cart_events' in locals() else 0

            if p_views >= 5 or p_carts >= 2:
                price = float(p.get("price", 0))
                d_factor = min(1.0, (p_views + p_carts * 2) / 20.0)
                stock_gap = 1.0
                score = _calculate_score(d_factor, 0.0, 0.0, stock_gap)
                priority = _determine_priority(score)

                est_rev = round((p_views * 0.1 + p_carts * 0.5) * price, 2) if price > 0 else None

                record_id = f"opp_stockgap_{merchant_id[:6]}_{pid[:8]}"
                opportunities.append(RevenueOpportunityRecord(
                    id=record_id,
                    merchant_id=merchant_id,
                    type=OpportunityType.STOCK_GAP,
                    target=pid,
                    score=score,
                    priority=priority,
                    status=OpportunityStatus.NEW,
                    title=f"Out-of-Stock Demand Loss for '{p.get('name')}'",
                    summary=f"Product '{p.get('name')}' has 0 units in stock but received {p_views} views and {p_carts} cart additions.",
                    evidence=OpportunityEvidence(
                        view_count=p_views,
                        cart_add_count=p_carts,
                        current_stock=0,
                        period_days=period_days,
                    ),
                    suggested_action="Replenish product stock immediately to capture unfulfilled buyer demand.",
                    estimated_potential_revenue=est_rev,
                    period_start=period_start,
                    period_end=period_end,
                    generated_at=period_end,
                ))

    # Sort opportunities by score descending
    opportunities.sort(key=lambda o: o.score, reverse=True)

    # Persist records into revenue_opportunities collection (Upsert by ID)
    for opp in opportunities:
        try:
            doc = opp.model_dump()
            await db.revenue_opportunities.update_one(
                {"_id": opp.id},
                {"$set": doc},
                upsert=True,
            )
        except PyMongoError as e:
            logger.warning(f"Failed to persist opportunity record {opp.id}: {type(e).__name__}")

    return opportunities


async def get_merchant_opportunities(
    db,
    merchant_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    type_filter: Optional[str] = None,
    priority_filter: Optional[str] = None,
    limit: int = 50,
) -> List[RevenueOpportunityRecord]:
    """
    Retrieve stored revenue opportunity records for a merchant from revenue_opportunities collection.
    If no records exist, triggers deterministic engine generation.
    Supports filtering by date range, opportunity type, priority, and limit.
    """
    if db is None:
        return []

    query: Dict[str, Any] = {"merchant_id": merchant_id}
    if type_filter:
        query["type"] = type_filter
    if priority_filter:
        query["priority"] = priority_filter
    if start_date:
        query["period_start"] = {"$gte": start_date}

    cursor = db.revenue_opportunities.find(query).sort("score", -1).limit(limit)
    docs = await cursor.to_list(length=limit)

    if not docs:
        # Trigger dynamic generation if collection is empty for merchant
        return await generate_and_persist_opportunities(db, merchant_id)

    records = []
    for d in docs:
        if "_id" in d and "id" not in d:
            d["id"] = str(d["_id"])
        records.append(RevenueOpportunityRecord(**d))

    return records

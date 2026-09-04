"""
Audit Service — centralized, non-intrusive logging service for system activity and state changes.
Records immutable historical logs in audit_logs collection.
Includes automatic sensitive data redaction to guarantee secrets/passwords are never persisted.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from bson import ObjectId

from app.schemas.audit import (
    AuditAction,
    AuditLogRecord,
    AuditResourceType,
    AuditResult,
    AuditSummaryStats,
)

CATEGORY_ACTIONS = {
    "revenue_agent": [
        AuditAction.OPPORTUNITY_GENERATED.value,
        AuditAction.OPPORTUNITY_ANALYZED.value,
        AuditAction.REVENUE_AGENT_USED.value,
    ],
    "buyer_agent": [
        AuditAction.BUYER_AGENT_USED.value,
        AuditAction.BUYER_AGENT_DECISION.value,
        AuditAction.BUYER_AGENT_POLICY_DECISION.value,
        AuditAction.BUYER_AGENT_REFERENCE_RESOLVED.value,
        AuditAction.BUYER_AGENT_AI_FALLBACK.value,
    ],
    "commerce": [
        AuditAction.PRODUCT_CREATED.value,
        AuditAction.PRODUCT_UPDATED.value,
        AuditAction.PRODUCT_DELETED.value,
        AuditAction.PRODUCT_REINDEXED.value,
        AuditAction.CART_ITEM_ADDED.value,
        AuditAction.CART_ITEM_UPDATED.value,
        AuditAction.CART_ITEM_REMOVED.value,
        AuditAction.CART_CLEARED.value,
        AuditAction.CHECKOUT_STARTED.value,
        AuditAction.INVENTORY_DECREMENTED.value,
    ],
    "payments": [
        AuditAction.PAYMENT_ORDER_CREATED.value,
        AuditAction.PAYMENT_VERIFIED.value,
        AuditAction.PAYMENT_FAILED.value,
        AuditAction.PAYMENT_WEBHOOK_PROCESSED.value,
        AuditAction.ORDER_CREATED.value,
        AuditAction.ORDER_PAID.value,
        AuditAction.ORDER_FAILED.value,
    ],
    "auth": [
        AuditAction.USER_REGISTERED.value,
        AuditAction.USER_LOGIN.value,
        AuditAction.USER_LOGOUT.value,
    ],
    "system": [
        AuditAction.MERCHANT_CREATED.value,
        AuditAction.MERCHANT_APPROVED.value,
        AuditAction.MERCHANT_REJECTED.value,
        AuditAction.MERCHANT_UPDATED.value,
        AuditAction.AGENT_SESSION_CREATED.value,
        AuditAction.AGENT_SESSION_RESET.value,
        AuditAction.AGENT_SESSION_EXPIRED.value,
    ],
}


async def query_audit_logs(
    db,
    actor_id: Optional[str] = None,
    merchant_id: Optional[str] = None,
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    category: Optional[str] = None,
    result: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    include_summary: bool = False,
) -> Dict[str, Any]:
    """
    Query audit events with validated parameters, category filtering, merchant scoping,
    pagination, and newest-first sorting.
    """
    if db is None:
        return {"total_count": 0, "limit": limit, "offset": offset, "logs": [], "summary": None}

    query: Dict[str, Any] = {}
    if merchant_id and actor_id:
        query["$or"] = [
            {"actor_id": actor_id},
            {"resource_id": merchant_id},
            {"metadata.merchant_id": merchant_id},
        ]
    elif actor_id:
        query["actor_id"] = actor_id
    elif merchant_id:
        query["$or"] = [
            {"resource_id": merchant_id},
            {"metadata.merchant_id": merchant_id},
        ]

    if category and category.lower() in CATEGORY_ACTIONS:
        query["action"] = {"$in": CATEGORY_ACTIONS[category.lower()]}

    if action:
        query["action"] = action
    if resource_type:
        query["resource_type"] = resource_type
    if resource_id:
        query["resource_id"] = resource_id
    if result:
        query["result"] = result
    if start_date or end_date:
        date_q = {}
        if start_date:
            date_q["$gte"] = start_date
        if end_date:
            date_q["$lte"] = end_date
        query["created_at"] = date_q

    limit = min(100, max(1, limit))
    offset = max(0, offset)

    total_count = await db.audit_logs.count_documents(query)
    cursor = db.audit_logs.find(query).sort("created_at", -1).skip(offset).limit(limit)
    docs = await cursor.to_list(length=limit)

    logs = []
    for d in docs:
        if "_id" in d and "id" not in d:
            d["id"] = str(d["_id"])
        logs.append(AuditLogRecord(**d))

    summary = None
    if include_summary:
        base_scope: Dict[str, Any] = {}
        if merchant_id and actor_id:
            base_scope["$or"] = [
                {"actor_id": actor_id},
                {"resource_id": merchant_id},
                {"metadata.merchant_id": merchant_id},
            ]
        elif actor_id:
            base_scope["actor_id"] = actor_id

        all_scoped_docs = await db.audit_logs.find(base_scope).to_list(length=5000)
        total_ev = len(all_scoped_docs)
        rev_runs = sum(1 for d in all_scoped_docs if d.get("action") in (AuditAction.REVENUE_AGENT_USED.value, AuditAction.OPPORTUNITY_ANALYZED.value, AuditAction.OPPORTUNITY_GENERATED.value))
        buyer_runs = sum(1 for d in all_scoped_docs if d.get("action") in (AuditAction.BUYER_AGENT_USED.value, AuditAction.BUYER_AGENT_DECISION.value))
        policy_cnt = sum(1 for d in all_scoped_docs if d.get("action") == AuditAction.BUYER_AGENT_POLICY_DECISION.value)
        fallbacks = sum(1 for d in all_scoped_docs if d.get("action") == AuditAction.BUYER_AGENT_AI_FALLBACK.value or (isinstance(d.get("metadata"), dict) and d.get("metadata", {}).get("fallback_used")))
        payments = sum(1 for d in all_scoped_docs if d.get("action") in (AuditAction.PAYMENT_VERIFIED.value, AuditAction.ORDER_PAID.value))

        summary = AuditSummaryStats(
            total_events=total_ev,
            revenue_agent_runs=rev_runs,
            buyer_agent_runs=buyer_runs,
            policy_decisions=policy_cnt,
            ai_fallbacks=fallbacks,
            payments_verified=payments,
        )

    return {
        "total_count": total_count,
        "limit": limit,
        "offset": offset,
        "logs": logs,
        "summary": summary,
    }


logger = logging.getLogger("razorreach.audit_service")

# Sensitive keys to redact
SENSITIVE_KEYS = {
    "password", "password_hash", "hashed_password", "jwt", "token", "access_token",
    "refresh_token", "api_key", "secret", "gemini_api_key", "razorpay_key_secret",
    "razorpay_webhook_secret", "razorpay_signature", "webhook_secret", "mongodb_uri",
    "cloudinary_api_secret", "card_number", "cvv", "card", "authorization", "auth_token", "auth_header"
}



def sanitize_metadata(data: Any) -> Any:
    """
    Recursively sanitize metadata payload to remove or redact sensitive keys.
    Prevents passwords, tokens, API keys, and payment signatures from being logged.
    """
    if isinstance(data, dict):
        sanitized = {}
        for key, value in data.items():
            key_lower = str(key).lower()
            if any(s in key_lower for s in SENSITIVE_KEYS):
                sanitized[key] = "[REDACTED]"
            else:
                sanitized[key] = sanitize_metadata(value)
        return sanitized
    elif isinstance(data, list):
        return [sanitize_metadata(item) for item in data]
    return data


async def record_audit_event(
    db,
    action: AuditAction,
    resource_type: AuditResourceType,
    actor_id: Optional[str] = None,
    actor_role: str = "system",
    resource_id: Optional[str] = None,
    result: AuditResult = AuditResult.SUCCESS,
    metadata: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Optional[str]:
    """
    Record an immutable audit event into audit_logs collection.
    Operates non-blockingly: any DB error during logging is caught and logged,
    preventing primary application workflows from breaking.
    """
    if db is None:
        logger.warning("Database unavailable for audit logging.")
        return None

    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        clean_metadata = sanitize_metadata(metadata or {})
        doc_id = str(ObjectId())

        doc = {
            "_id": doc_id,
            "id": doc_id,
            "actor_id": actor_id,
            "actor_role": actor_role,
            "action": action.value,
            "resource_type": resource_type.value,
            "resource_id": resource_id,
            "result": result.value,
            "metadata": clean_metadata,
            "ip_address": ip_address,
            "user_agent": user_agent,
            "created_at": now_iso,
        }

        await db.audit_logs.insert_one(doc)
        return doc_id
    except Exception as e:
        logger.warning(f"Audit log write exception: {type(e).__name__}")
        return None




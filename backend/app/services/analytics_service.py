"""
Analytics service — non-blocking event recording interface.
Analytics recording failures MUST NEVER break primary business operations (search, product view, cart, payment).
Sanitizes sensitive information and persists structured events to MongoDB analytics_events collection.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.schemas.analytics import AnalyticsEventType

logger = logging.getLogger("razorreach.analytics")


async def record_event(
    db,
    event_type: str,
    user_id: Optional[str] = None,
    merchant_id: Optional[str] = None,
    product_id: Optional[str] = None,
    query: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Record an analytics event into analytics_events collection.
    Non-blocking — catches all exceptions and logs warning without re-raising.
    """
    if db is None:
        return

    try:
        # Validate event type against enum values
        valid_type = event_type if event_type in [e.value for e in AnalyticsEventType] else "custom"
        
        # Sanitize metadata (never store sensitive passwords, keys, or cards)
        safe_meta = {}
        if metadata and isinstance(metadata, dict):
            for k, v in metadata.items():
                if any(sec in k.lower() for sec in ("password", "token", "secret", "cvv", "card", "key", "signature")):
                    continue
                safe_meta[k] = v

        event_doc = {
            "event_type": valid_type,
            "user_id": str(user_id) if user_id else None,
            "merchant_id": str(merchant_id) if merchant_id else None,
            "product_id": str(product_id) if product_id else None,
            "query": query.strip() if query else None,
            "metadata": safe_meta,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        await db.analytics_events.insert_one(event_doc)
    except Exception as e:
        logger.warning(f"Non-blocking analytics recording warning: {type(e).__name__}")


async def record_search_event(
    db,
    user_id: Optional[str],
    query: Optional[str],
    results_count: int,
) -> None:
    """Legacy helper maintained for backward compatibility."""
    await record_event(
        db=db,
        event_type=AnalyticsEventType.SEARCH.value,
        user_id=user_id,
        query=query,
        metadata={"results_count": results_count},
    )

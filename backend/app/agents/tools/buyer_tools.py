"""
Buyer Agent tools.
All tools call existing backend services (product_service, search_service).
They NEVER directly access MongoDB or expose internal DB fields.
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status

from app.schemas.ai_search import SearchIntent
from app.services import product_service, search_service

logger = logging.getLogger("razorreach.buyer_tools")

# Hard cap on AI search recommendations limit
MAX_AI_SEARCH_LIMIT = 10
MAX_COMPARE_PRODUCTS_LIMIT = 5


async def tool_search_products(
    db,
    intent: SearchIntent,
    limit: int = 5,
) -> List[Dict[str, Any]]:
    """
    Search published products using backend search_service and apply intent constraints.
    Enforces limit <= 10.
    """
    safe_limit = min(max(1, limit), MAX_AI_SEARCH_LIMIT)

    # Call backend search_service hybrid search
    search_result = await search_service.hybrid_search_products(
        db=db,
        q=intent.search_text,
        category=intent.category,
        min_price=intent.min_price,
        max_price=intent.max_price,
        limit=safe_limit * 2,  # Fetch extra for secondary attribute filtering
    )

    products = search_result.get("products", [])
    filtered: List[Dict[str, Any]] = []

    for p in products:
        # Verify status is published
        if p.get("status") != "published":
            continue

        # Enforce explicit price constraints
        price = p.get("price", 0.0)
        if intent.max_price is not None and price > intent.max_price:
            continue
        if intent.min_price is not None and price < intent.min_price:
            continue

        # Concept/category match check (check category, name, description, search_text)
        if intent.category:
            cat_term = intent.category.lower()
            p_cat = str(p.get("category", "")).lower()
            p_name = str(p.get("name", "")).lower()
            p_desc = str(p.get("description", "")).lower()
            p_stext = str(p.get("search_text", "")).lower()

            if (
                cat_term not in p_cat
                and p_cat not in cat_term
                and cat_term not in p_name
                and cat_term not in p_desc
                and cat_term not in p_stext
            ):
                continue

        # Color attribute check if requested (null-safe)
        if intent.color:
            attrs = p.get("attributes") or {}
            p_color = str(attrs.get("color", "")).lower() if isinstance(attrs, dict) else ""
            p_text = (str(p.get("name", "")) + " " + str(p.get("description", ""))).lower()
            if intent.color.lower() not in p_color and intent.color.lower() not in p_text:
                continue

        filtered.append(p)
        if len(filtered) >= safe_limit:
            break

    # Fallback to candidates if filters were overly strict
    if not filtered and products:
        filtered = products[:safe_limit]

    logger.info(
        f"AI SEARCH DEBUG — search_text='{intent.search_text}', category='{intent.category}', "
        f"min_price={intent.min_price}, max_price={intent.max_price}, "
        f"retrieved_candidates={len(products)}, final_filtered={len(filtered)}"
    )

    return filtered


async def tool_get_product_details(db, product_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve public product details using product_service."""
    try:
        product = await product_service.get_product(db, product_id)
        # Strip internal fields
        return {
            "id": product["id"],
            "name": product["name"],
            "description": product["description"],
            "price": product["price"],
            "category": product["category"],
            "currency": product.get("currency", "INR"),
            "stock": product["stock"],
            "attributes": product.get("attributes", {}),
            "image_url": product.get("image_url"),
        }
    except HTTPException:
        return None


async def tool_check_inventory(db, product_id: str) -> Dict[str, Any]:
    """Check stock availability for a product."""
    details = await tool_get_product_details(db, product_id)
    if not details:
        return {"product_id": product_id, "available": False, "stock": 0}

    stock = details.get("stock", 0)
    return {
        "product_id": product_id,
        "available": stock > 0,
        "stock": stock,
    }


async def tool_compare_products(db, product_ids: List[str]) -> List[Dict[str, Any]]:
    """Compare up to 5 products by retrieving public product fields."""
    safe_ids = product_ids[:MAX_COMPARE_PRODUCTS_LIMIT]
    comparison: List[Dict[str, Any]] = []

    for pid in safe_ids:
        details = await tool_get_product_details(db, pid)
        if details:
            comparison.append(details)

    return comparison

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

import re

# Hard cap on AI search recommendations limit
MAX_AI_SEARCH_LIMIT = 10
MAX_COMPARE_PRODUCTS_LIMIT = 5


def _norm_str(val: Any) -> str:
    if val is None:
        return ""
    return str(val).strip().lower()


def _norm_cat(s: str) -> str:
    clean = _norm_str(s)
    if clean.endswith("ies") and len(clean) > 4:
        return clean[:-3] + "y"
    if clean.endswith("es") and len(clean) > 3 and not clean.endswith("shoes"):
        return clean[:-2]
    if clean.endswith("s") and len(clean) > 3 and not clean.endswith("shoes"):
        return clean[:-1]
    return clean


def verify_product_hard_constraints(product: Dict[str, Any], intent: SearchIntent) -> bool:
    """
    Deterministically verifies whether a product satisfies all explicit hard constraints in SearchIntent.
    Hard constraints evaluated when present:
    - status: must be 'published'
    - min_price / max_price: numeric range against authoritative product price
    - category: strict category match
    - color: strict word-boundary match against explicit color attribute or product text
    - brand: strict word-boundary match against explicit brand attribute or product text
    - required_features: every listed feature must be satisfied by product data
    - stock: stock > 0 if explicit availability requested
    """
    if product.get("status") != "published":
        return False

    price = float(product.get("price", 0.0))
    if intent.max_price is not None and price > intent.max_price:
        return False
    if intent.min_price is not None and price < intent.min_price:
        return False

    # 1. Category Constraint
    if intent.category:
        req_cat = _norm_str(intent.category)
        req_cat_norm = _norm_cat(req_cat)
        p_cat = _norm_str(product.get("category", ""))
        p_cat_norm = _norm_cat(p_cat)
        p_name = _norm_str(product.get("name", ""))
        p_desc = _norm_str(product.get("description", ""))
        p_stext = _norm_str(product.get("search_text", ""))

        accessory_keywords = {
            "stand", "stands", "bag", "bags", "sleeve", "sleeves", "case", "cases",
            "charger", "chargers", "mouse", "keyboard", "cable", "cables", "adapter",
            "adapters", "mount", "mounts", "cooler", "coolers", "pad", "pads",
            "table", "tables", "skin", "skins", "accessory", "accessories"
        }

        # Check if requested category is laptop (computer) but product is laptop accessory
        if req_cat_norm in ("laptop", "computer") and not any(kw in req_cat for kw in accessory_keywords):
            if any(re.search(rf"\b{kw}\b", p_name) or re.search(rf"\b{kw}\b", p_cat) for kw in accessory_keywords):
                return False

        cat_matched = False
        if p_cat:
            if req_cat_norm == p_cat_norm or req_cat_norm in p_cat_norm or p_cat_norm in req_cat_norm:
                cat_matched = True

        if not cat_matched:
            if re.search(rf"\b{re.escape(req_cat_norm)}\b", p_name) or re.search(rf"\b{re.escape(req_cat)}\b", p_name):
                cat_matched = True
            elif re.search(rf"\b{re.escape(req_cat_norm)}\b", p_stext):
                cat_matched = True

        if not cat_matched:
            return False

    # 2. Color Constraint
    if intent.color:
        req_color = _norm_str(intent.color)
        attrs = product.get("attributes") or {}
        explicit_color = _norm_str(product.get("color") or (attrs.get("color") if isinstance(attrs, dict) else None))

        if explicit_color:
            if req_color != explicit_color and req_color not in explicit_color and explicit_color not in req_color:
                return False
        else:
            p_text = f"{_norm_str(product.get('name', ''))} {_norm_str(product.get('description', ''))} {_norm_str(attrs)}"
            if not re.search(rf"\b{re.escape(req_color)}\b", p_text):
                return False

    # 3. Brand Constraint
    if intent.brand:
        req_brand = _norm_str(intent.brand)
        attrs = product.get("attributes") or {}
        explicit_brand = _norm_str(product.get("brand") or (attrs.get("brand") if isinstance(attrs, dict) else None))

        if explicit_brand:
            if req_brand != explicit_brand and req_brand not in explicit_brand and explicit_brand not in req_brand:
                return False
        else:
            p_text = f"{_norm_str(product.get('name', ''))} {_norm_str(product.get('description', ''))} {_norm_str(attrs)}"
            if not re.search(rf"\b{re.escape(req_brand)}\b", p_text):
                return False

    # 4. Required Features Constraint
    if intent.required_features:
        p_feats = product.get("features") or []
        if isinstance(p_feats, str):
            p_feats = [p_feats]
        p_feats_text = " ".join([_norm_str(f) for f in p_feats])
        attrs = product.get("attributes") or {}
        attrs_text = _norm_str(attrs)
        full_text = f"{_norm_str(product.get('name', ''))} {_norm_str(product.get('description', ''))} {p_feats_text} {attrs_text}"

        for feat in intent.required_features:
            feat_clean = _norm_str(feat)
            if not feat_clean:
                continue

            ram_match = re.search(r"(\d+)\s*(?:gb|ram)", feat_clean)
            if ram_match:
                req_ram_val = ram_match.group(1)
                has_req_ram = bool(re.search(rf"\b{req_ram_val}\s*gb\b", full_text) or re.search(rf"\b{req_ram_val}\s*gb\s*ram\b", full_text))
                if not has_req_ram:
                    return False
            else:
                if feat_clean not in full_text and not re.search(rf"\b{re.escape(feat_clean)}\b", full_text):
                    return False

    # 5. Availability Constraint
    if (intent.preferences and intent.preferences.get("in_stock")) or "in stock" in _norm_str(intent.search_text):
        if int(product.get("stock", 0)) <= 0:
            return False

    return True


async def tool_search_products(
    db,
    intent: SearchIntent,
    limit: int = 5,
) -> List[Dict[str, Any]]:
    """
    Search published products using backend search_service and apply intent constraints.
    Enforces limit <= 10. STRICT GROUNDING: Returns empty list if no exact match exists.
    """
    safe_limit = min(max(1, limit), MAX_AI_SEARCH_LIMIT)

    # Call backend search_service hybrid search
    search_result = await search_service.hybrid_search_products(
        db=db,
        q=intent.search_text,
        category=intent.category,
        min_price=intent.min_price,
        max_price=intent.max_price,
        limit=safe_limit * 5,  # Fetch ample candidates for verification
    )

    products = search_result.get("products", [])
    filtered: List[Dict[str, Any]] = []

    for p in products:
        if verify_product_hard_constraints(p, intent):
            filtered.append(p)
            if len(filtered) >= safe_limit:
                break

    # STRICT PRODUCT GROUNDING (Task 22A): NO SILENT CANDIDATE FALLBACK!
    # If no products satisfy ALL hard constraints, return empty list (NO_EXACT_MATCH).

    logger.info(
        f"AI SEARCH DEBUG — search_text='{intent.search_text}', category='{intent.category}', "
        f"brand='{intent.brand}', color='{intent.color}', min_price={intent.min_price}, max_price={intent.max_price}, "
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

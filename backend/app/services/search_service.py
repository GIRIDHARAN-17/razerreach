"""
Search service — search text generation, embedding indexing, keyword search,
semantic vector search, and hybrid ranking engine.
"""

import logging
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId
from fastapi import HTTPException, status
from pymongo.errors import PyMongoError

from app.integrations.embeddings import EMBEDDING_MODEL, generate_embedding

logger = logging.getLogger("razorreach.search_service")


def build_product_search_text(product: Dict[str, Any]) -> str:
    """
    Generate normalized search_text from product fields.
    Combines name, description, category, and attribute values into lowercase text.
    """
    parts: List[str] = []

    for field in ("name", "description", "category"):
        value = product.get(field)
        if value and isinstance(value, str):
            parts.append(value.strip())

    attributes = product.get("attributes")
    if attributes and isinstance(attributes, dict):
        for key, val in attributes.items():
            if val is None:
                continue
            if isinstance(val, bool):
                if val:
                    parts.append(str(key))
            elif isinstance(val, (str, int, float)):
                parts.append(str(val).strip())

    combined = "\n".join(parts)
    return combined.lower().strip()


def vector_cosine_similarity(v1: List[float], v2: List[float]) -> float:
    """
    Calculate normalized cosine similarity between two float vectors (0.0 to 1.0).
    Returns 0.0 if vectors are empty or orthogonal.
    """
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0

    dot_product = sum(a * b for a, b in zip(v1, v2))
    magnitude_v1 = math.sqrt(sum(a * a for a in v1))
    magnitude_v2 = math.sqrt(sum(b * b for b in v2))

    if magnitude_v1 == 0 or magnitude_v2 == 0:
        return 0.0

    raw_cos = dot_product / (magnitude_v1 * magnitude_v2)
    # Normalize from [-1.0, 1.0] to [0.0, 1.0]
    return max(0.0, min(1.0, (raw_cos + 1.0) / 2.0))


async def reindex_product(db, product_id: str) -> Dict[str, Any]:
    """
    Regenerate search_text and embedding vector for a single product.
    Returns dict with update status without exposing raw vector arrays.
    """
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    try:
        query = {"_id": ObjectId(product_id)}
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    try:
        product = await db.products.find_one(query)
    except PyMongoError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    search_text = build_product_search_text(product)
    embedding = await generate_embedding(search_text)

    now = datetime.now(timezone.utc).isoformat()
    update_doc: Dict[str, Any] = {
        "search_text": search_text,
        "updated_at": now,
    }

    embedding_updated = False
    if embedding:
        update_doc["embedding"] = embedding
        update_doc["embedding_model"] = EMBEDDING_MODEL
        update_doc["embedding_updated_at"] = now
        embedding_updated = True

    try:
        await db.products.update_one({"_id": product["_id"]}, {"$set": update_doc})
        return {
            "product_id": product_id,
            "search_text_updated": True,
            "embedding_updated": embedding_updated,
        }
    except PyMongoError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")


async def search_products(
    db,
    q: Optional[str] = None,
    category: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    limit: int = 20,
) -> Dict[str, Any]:
    """
    Keyword and multi-field search for published products.
    Tokenizes queries, handles exact product name matching, and ranks by relevance score.
    """
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    try:
        query: Dict[str, Any] = {"status": "published"}

        # Only apply strict category filter if no query string is provided (e.g. browsing category)
        if category and not (q and q.strip()):
            query["category"] = category.strip().lower()

        if min_price is not None or max_price is not None:
            price_filter: Dict[str, Any] = {}
            if min_price is not None:
                price_filter["$gte"] = min_price
            if max_price is not None:
                price_filter["$lte"] = max_price
            query["price"] = price_filter

        cursor = db.products.find(query).limit(100)
        candidates = await cursor.to_list(length=100)

        if not q or not q.strip():
            return {
                "query": q,
                "count": len(candidates[:limit]),
                "products": candidates[:limit],
            }

        clean_q = q.strip().lower()
        import re
        tokens = [w for w in re.findall(r"\w+", clean_q) if len(w) > 1]

        scored: List[Tuple[Dict[str, Any], float]] = []

        for p in candidates:
            p_name = str(p.get("name", "")).lower()
            p_desc = str(p.get("description", "")).lower()
            p_cat = str(p.get("category", "")).lower()
            p_stext = str(p.get("search_text", "")).lower()
            attrs = p.get("attributes") or {}
            p_attrs = str(attrs).lower()

            combined = f"{p_name} {p_desc} {p_cat} {p_stext} {p_attrs}"

            score = 0.0

            # Exact or substring name match
            if clean_q == p_name:
                score += 15.0
            elif clean_q in p_name or p_name in clean_q:
                score += 8.0

            # Token match scoring
            matched_tokens = 0
            for t in tokens:
                if t in p_name:
                    score += 3.0
                    matched_tokens += 1
                elif t in p_cat:
                    score += 2.0
                    matched_tokens += 1
                elif t in p_desc or t in p_stext or t in p_attrs:
                    score += 1.0
                    matched_tokens += 1

            # Bonus for matching all search tokens
            if tokens and matched_tokens == len(tokens):
                score += 4.0

            if score > 0:
                scored.append((p, score))

        scored.sort(key=lambda x: x[1], reverse=True)
        top_products = [item[0] for item in scored[:limit]]

        return {
            "query": q,
            "count": len(top_products),
            "products": top_products,
        }
    except HTTPException:
        raise
    except PyMongoError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")


async def semantic_search_products(
    db,
    query_embedding: List[float],
    category: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    limit: int = 20,
) -> List[Tuple[Dict[str, Any], float]]:
    """
    Semantic vector search for published products matching query_embedding.
    """
    if db is None or not query_embedding:
        return []

    try:
        query: Dict[str, Any] = {"status": "published", "embedding": {"$ne": None}}

        if category:
            query["category"] = category.strip().lower()

        if min_price is not None or max_price is not None:
            price_filter: Dict[str, Any] = {}
            if min_price is not None:
                price_filter["$gte"] = min_price
            if max_price is not None:
                price_filter["$lte"] = max_price
            query["price"] = price_filter

        cursor = db.products.find(query).limit(100)
        candidates = await cursor.to_list(length=100)

        scored: List[Tuple[Dict[str, Any], float]] = []
        for p in candidates:
            emb = p.get("embedding")
            if emb and isinstance(emb, list):
                score = vector_cosine_similarity(query_embedding, emb)
                scored.append((p, score))

        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:limit]

    except Exception as e:
        logger.warning(f"Semantic search failed: {type(e).__name__}")
        return []


async def hybrid_search_products(
    db,
    q: Optional[str] = None,
    category: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    limit: int = 20,
) -> Dict[str, Any]:
    """
    Hybrid Search combining:
    1. Keyword relevance (45% weight)
    2. Semantic vector similarity (45% weight)
    3. Business stock availability score (10% weight)
    """
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    # Step 1: Perform keyword search
    kw_result = await search_products(db, q, category, min_price, max_price, limit=limit * 2)
    kw_products = kw_result.get("products", [])

    # Step 2: Perform semantic search if query string is present
    query_embedding: Optional[List[float]] = None
    sem_scored: List[Tuple[Dict[str, Any], float]] = []

    if q and q.strip():
        query_embedding = await generate_embedding(q)
        if query_embedding:
            sem_scored = await semantic_search_products(
                db, query_embedding, category, min_price, max_price, limit=limit * 2
            )

    # Step 3: Merge candidates & deduplicate by product_id
    candidates_map: Dict[str, Dict[str, Any]] = {}
    kw_score_map: Dict[str, float] = {}
    sem_score_map: Dict[str, float] = {}

    for idx, p in enumerate(kw_products):
        pid = str(p["_id"])
        candidates_map[pid] = p
        kw_score_map[pid] = max(0.1, 1.0 - (idx * 0.1))

    for p, sim_score in sem_scored:
        pid = str(p["_id"])
        candidates_map[pid] = p
        sem_score_map[pid] = sim_score

    final_scored: List[Tuple[Dict[str, Any], float]] = []

    for pid, p in candidates_map.items():
        kw_s = kw_score_map.get(pid, 0.0)
        sem_s = sem_score_map.get(pid, 0.0)
        bus_s = 1.0 if p.get("stock", 0) > 0 else 0.0

        if not kw_score_map:
            final_score = (0.90 * sem_s) + (0.10 * bus_s)
        elif not sem_score_map:
            final_score = (0.90 * kw_s) + (0.10 * bus_s)
        else:
            final_score = (0.45 * kw_s) + (0.45 * sem_s) + (0.10 * bus_s)

        final_scored.append((p, final_score))

    final_scored.sort(key=lambda x: x[1], reverse=True)
    top_products = [item[0] for item in final_scored[:limit]]

    match_type = "hybrid" if sem_score_map and kw_score_map else ("semantic" if sem_score_map else "keyword")

    return {
        "query": q,
        "count": len(top_products),
        "match_type": match_type,
        "products": top_products,
    }

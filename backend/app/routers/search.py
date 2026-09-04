"""
Search router — public hybrid search and semantic vector search endpoints.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.database import db_manager
from app.integrations.embeddings import generate_embedding
from app.schemas.search import SearchProductResponse, SearchResponse
from app.services.analytics_service import record_search_event
from app.services.search_service import hybrid_search_products, semantic_search_products

logger = logging.getLogger("razorreach.search")

router = APIRouter(prefix="/search", tags=["Search"])


def _extract_images_list(p: dict) -> list:
    raw_images = p.get("images") or []
    image_urls = []
    for item in raw_images:
        if isinstance(item, dict):
            if item.get("url"):
                image_urls.append(item["url"])
        elif isinstance(item, str) and item:
            image_urls.append(item)
    single_image = p.get("image_url")
    if single_image and single_image not in image_urls:
        image_urls.insert(0, single_image)
    return image_urls


@router.get("", response_model=SearchResponse)
async def search(
    q: Optional[str] = Query(None, max_length=200, description="Search query"),
    category: Optional[str] = Query(None, max_length=100, description="Filter by category"),
    min_price: Optional[float] = Query(None, ge=0, description="Minimum price"),
    max_price: Optional[float] = Query(None, ge=0, description="Maximum price"),
    limit: int = Query(20, ge=1, le=50, description="Maximum results to return"),
):
    """
    Search published products using Hybrid Search (keyword + semantic similarity + business stock score).
    Public endpoint — no authentication required.
    """
    if min_price is not None and max_price is not None and min_price > max_price:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="min_price must be less than or equal to max_price",
        )

    db = db_manager.get_db()
    result = await hybrid_search_products(db, q, category, min_price, max_price, limit)

    safe_products = [
        SearchProductResponse(
            id=str(p["_id"]) if "_id" in p else str(p.get("id", "")),
            name=p.get("name", ""),
            description=p.get("description", ""),
            price=p.get("price", 0),
            category=p.get("category", ""),
            image_url=p.get("image_url"),
            images=_extract_images_list(p),
            stock=p.get("stock", 0),
        )
        for p in result.get("products", [])
    ]

    try:
        await record_search_event(db, None, q, len(safe_products))
    except Exception:
        pass

    return SearchResponse(
        query=q,
        count=len(safe_products),
        products=safe_products,
    )


@router.get("/semantic", response_model=SearchResponse)
async def semantic_search(
    q: str = Query(..., min_length=1, max_length=200, description="Semantic search query"),
    category: Optional[str] = Query(None, max_length=100, description="Filter by category"),
    min_price: Optional[float] = Query(None, ge=0, description="Minimum price"),
    max_price: Optional[float] = Query(None, ge=0, description="Maximum price"),
    limit: int = Query(20, ge=1, le=50, description="Maximum results to return"),
):
    """
    Perform pure semantic vector search for published products.
    Generates embedding for query string and calculates vector cosine similarity against product catalog.
    Public endpoint.
    """
    if min_price is not None and max_price is not None and min_price > max_price:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="min_price must be less than or equal to max_price",
        )

    db = db_manager.get_db()
    query_embedding = await generate_embedding(q)

    if not query_embedding:
        # Fallback to hybrid search if query embedding generation fails
        result = await hybrid_search_products(db, q, category, min_price, max_price, limit)
        scored_products = result.get("products", [])
    else:
        scored_tuples = await semantic_search_products(db, query_embedding, category, min_price, max_price, limit)
        scored_products = [item[0] for item in scored_tuples]

    safe_products = [
        SearchProductResponse(
            id=str(p["_id"]) if "_id" in p else str(p.get("id", "")),
            name=p.get("name", ""),
            description=p.get("description", ""),
            price=p.get("price", 0),
            category=p.get("category", ""),
            image_url=p.get("image_url"),
            images=_extract_images_list(p),
            stock=p.get("stock", 0),
        )
        for p in scored_products
    ]

    return SearchResponse(
        query=q,
        count=len(safe_products),
        products=safe_products,
    )

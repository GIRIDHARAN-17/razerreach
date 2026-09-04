"""
Product router — CRUD endpoints, image upload/delete, and reindex.
Authorization and request handling; delegates business logic to product_service.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.core.database import db_manager
from app.core.dependencies import get_current_user, require_merchant
from app.schemas.audit import AuditAction, AuditResourceType
from app.schemas.product import (
    ImageUploadResponse,
    ProductCreate,
    ProductListResponse,
    ProductResponse,
    ProductUpdate,
)
from app.services import product_service
from app.services.audit_service import record_audit_event
from app.services.search_service import reindex_product

logger = logging.getLogger("razorreach.products")

router = APIRouter(prefix="/products", tags=["Products"])


async def _get_approved_merchant_user(current_user: dict = Depends(require_merchant)) -> dict:
    """
    Dependency that ensures the user is a merchant with an approved merchant profile.
    Raises 403 if merchant is not approved.
    """
    db = db_manager.get_db()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")
    merchant = await db.merchants.find_one({"user_id": current_user["id"]})
    if not merchant:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Merchant profile not found")
    if merchant.get("status") != "approved":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Merchant must be approved to manage products. Current status: '{merchant.get('status')}'",
        )
    return current_user


@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    product_data: ProductCreate,
    current_user: dict = Depends(_get_approved_merchant_user),
):
    """Create a new product. Requires approved merchant."""
    db = db_manager.get_db()
    product = await product_service.create_product(db, current_user["id"], product_data)

    await record_audit_event(
        db=db,
        action=AuditAction.PRODUCT_CREATED,
        resource_type=AuditResourceType.PRODUCT,
        actor_id=current_user["id"],
        actor_role="merchant",
        resource_id=str(product.get("id") or product.get("_id")),
        metadata={"name": product.get("name"), "category": product.get("category"), "price": product.get("price")},
    )

    return product


@router.get("", response_model=ProductListResponse)
async def list_products(
    category: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    merchant_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    limit: int = 50,
    skip: int = 0,
):
    """List published products with optional filters. Public endpoint."""
    db = db_manager.get_db()
    return await product_service.list_products(
        db, category, min_price, max_price, merchant_id, status_filter, limit, skip
    )


@router.get("/mine", response_model=ProductListResponse)
async def list_my_products(
    status_filter: Optional[str] = None,
    limit: int = 50,
    skip: int = 0,
    current_user: dict = Depends(_get_approved_merchant_user),
):
    """List products owned strictly by the authenticated approved merchant."""
    db = db_manager.get_db()
    return await product_service.list_merchant_products(
        db, current_user["id"], status_filter, limit, skip
    )


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(product_id: str):
    """Get a single product by ID. Public users see only published products."""
    db = db_manager.get_db()
    product = await product_service.get_product(db, product_id)
    if product and db is not None:
        from app.services import analytics_service
        p_merchant_id = product.get("merchant_id") if isinstance(product, dict) else getattr(product, "merchant_id", None)
        await analytics_service.record_event(
            db=db,
            event_type="product_view",
            product_id=product_id,
            merchant_id=p_merchant_id,
        )
    return product



@router.put("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: str,
    update_data: ProductUpdate,
    current_user: dict = Depends(_get_approved_merchant_user),
):
    """Update a product. Owner merchant only."""
    db = db_manager.get_db()
    product = await product_service.update_product(db, product_id, current_user["id"], update_data)

    await record_audit_event(
        db=db,
        action=AuditAction.PRODUCT_UPDATED,
        resource_type=AuditResourceType.PRODUCT,
        actor_id=current_user["id"],
        actor_role="merchant",
        resource_id=product_id,
        metadata={"updated_fields": list(update_data.model_dump(exclude_unset=True).keys())},
    )

    return product


@router.delete("/{product_id}", response_model=ProductResponse)
async def archive_product(
    product_id: str,
    current_user: dict = Depends(_get_approved_merchant_user),
):
    """Soft-delete a product by archiving it. Owner merchant only."""
    db = db_manager.get_db()
    product = await product_service.archive_product(db, product_id, current_user["id"])

    await record_audit_event(
        db=db,
        action=AuditAction.PRODUCT_DELETED,
        resource_type=AuditResourceType.PRODUCT,
        actor_id=current_user["id"],
        actor_role="merchant",
        resource_id=product_id,
        metadata={"status": "archived"},
    )

    return product


from typing import List, Optional

@router.post("/{product_id}/image", response_model=ImageUploadResponse)
async def upload_product_image(
    product_id: str,
    file: Optional[UploadFile] = File(None),
    files: Optional[List[UploadFile]] = File(None),
    current_user: dict = Depends(_get_approved_merchant_user),
):
    """Upload one or multiple product images. Owner merchant only."""
    db = db_manager.get_db()
    return await product_service.upload_product_image(db, product_id, current_user["id"], file=file, files=files)


@router.delete("/{product_id}/image")
async def delete_product_image(
    product_id: str,
    image_url: Optional[str] = None,
    public_id: Optional[str] = None,
    index: Optional[int] = None,
    current_user: dict = Depends(_get_approved_merchant_user),
):
    """Delete a product's image (specific image or all images). Owner merchant only."""
    db = db_manager.get_db()
    return await product_service.delete_product_image(
        db, product_id, current_user["id"], target_url=image_url, target_public_id=public_id, target_index=index
    )


@router.post("/{product_id}/reindex")
async def reindex_product_endpoint(
    product_id: str,
    current_user: dict = Depends(_get_approved_merchant_user),
):
    """Manually regenerate search_text for a product. Owner merchant only."""
    db = db_manager.get_db()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    # Verify ownership
    merchant = await db.merchants.find_one({"user_id": current_user["id"]})
    if not merchant:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Merchant profile not found")

    from bson import ObjectId
    try:
        product = await db.products.find_one({"_id": ObjectId(product_id)})
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    if product.get("merchant_id") != str(merchant["_id"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to reindex this product")

    await reindex_product(db, product_id)

    await record_audit_event(
        db=db,
        action=AuditAction.PRODUCT_REINDEXED,
        resource_type=AuditResourceType.PRODUCT,
        actor_id=current_user["id"],
        actor_role="merchant",
        resource_id=product_id,
    )

    return {"message": "Product reindexed successfully", "product_id": product_id}

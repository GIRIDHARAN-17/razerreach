"""
Product service — business logic for product CRUD, image management, and ownership validation.
All database operations happen here; routers delegate to this layer.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import HTTPException, UploadFile, status
from pymongo.errors import PyMongoError

from app.integrations.cloudinary import (
    delete_image,
    upload_image,
    validate_image_file,
)
from app.models.product import product_helper
from app.schemas.product import ProductCreate, ProductStatus, ProductUpdate

logger = logging.getLogger("razorreach.product_service")


async def _get_approved_merchant(db, user_id: str) -> dict:
    """
    Retrieve the merchant profile for user_id and verify it is approved.
    Raises 403 if merchant not found or not approved.
    """
    merchant = await db.merchants.find_one({"user_id": user_id})
    if not merchant:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Merchant profile not found. Create a merchant profile first.",
        )
    if merchant.get("status") != "approved":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Merchant status must be 'approved' to manage products. Current status: '{merchant.get('status')}'",
        )
    return merchant


async def _get_product_with_ownership(db, product_id: str, merchant_id: str) -> dict:
    """
    Retrieve a product by ID and verify ownership by merchant_id.
    Raises 404 if not found, 403 if not owned.
    """
    try:
        query = {"_id": ObjectId(product_id)}
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )

    product = await db.products.find_one(query)
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )

    if product.get("merchant_id") != merchant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this product",
        )

    return product


async def create_product(db, user_id: str, product_data: ProductCreate) -> dict:
    """Create a new product for the authenticated approved merchant."""
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    try:
        merchant = await _get_approved_merchant(db, user_id)
        merchant_id = str(merchant["_id"])

        now = datetime.now(timezone.utc).isoformat()

        # Build search_text for indexing (Task 6)
        from app.services.search_service import build_product_search_text
        from app.integrations.embeddings import generate_embedding, EMBEDDING_MODEL
        search_text_data = {
            "name": product_data.name.strip(),
            "description": product_data.description.strip(),
            "category": product_data.category.strip().lower(),
            "attributes": product_data.attributes or {},
        }
        search_text = build_product_search_text(search_text_data)

        # Generate 768d embedding vector (Task 8)
        embedding = await generate_embedding(search_text)

        new_product = {
            "merchant_id": merchant_id,
            "name": product_data.name.strip(),
            "description": product_data.description.strip(),
            "category": product_data.category.strip().lower(),
            "price": product_data.price,
            "currency": "INR",
            "stock": product_data.stock,
            "attributes": product_data.attributes or {},
            "image_url": None,
            "image_public_id": None,
            "status": product_data.status.value if product_data.status else ProductStatus.PUBLISHED.value,
            "search_text": search_text,
            "embedding": embedding,
            "embedding_model": EMBEDDING_MODEL if embedding else None,
            "embedding_updated_at": now if embedding else None,
            "created_at": now,
            "updated_at": now,
        }

        result = await db.products.insert_one(new_product)
        new_product["_id"] = result.inserted_id
        return product_helper(new_product)


    except HTTPException:
        raise
    except PyMongoError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")


async def get_product(db, product_id: str, user_id: Optional[str] = None) -> dict:
    """
    Get a single product. Public users see only published products.
    Authenticated merchants can see their own drafts/archived products.
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

    # If product is not published, check if the requesting user is the owner merchant
    if product.get("status") != ProductStatus.PUBLISHED.value:
        if not user_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
        # Check if user is the owner merchant
        merchant = await db.merchants.find_one({"user_id": user_id})
        if not merchant or str(merchant["_id"]) != product.get("merchant_id"):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    return product_helper(product)


async def list_products(
    db,
    category: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    merchant_id: Optional[str] = None,
    product_status: Optional[str] = None,
    limit: int = 50,
    skip: int = 0,
) -> dict:
    """List products with optional filters. Defaults to published only for public access."""
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    try:
        query: Dict[str, Any] = {}

        # Default to published only
        query["status"] = product_status if product_status else ProductStatus.PUBLISHED.value

        if category:
            query["category"] = category.strip().lower()

        if min_price is not None or max_price is not None:
            price_filter: Dict[str, Any] = {}
            if min_price is not None:
                price_filter["$gte"] = min_price
            if max_price is not None:
                price_filter["$lte"] = max_price
            query["price"] = price_filter

        if merchant_id:
            query["merchant_id"] = merchant_id

        cursor = db.products.find(query).skip(skip).limit(limit)
        products = await cursor.to_list(length=limit)

        return {
            "count": len(products),
            "products": [product_helper(p) for p in products],
        }
    except HTTPException:
        raise
    except PyMongoError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")


async def list_merchant_products(
    db,
    user_id: str,
    product_status: Optional[str] = None,
    limit: int = 50,
    skip: int = 0,
) -> dict:
    """
    List products owned strictly by the authenticated approved merchant.
    Queries MongoDB using {"merchant_id": merchant_id}.
    """
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    try:
        merchant = await _get_approved_merchant(db, user_id)
        merchant_id = str(merchant["_id"])

        query: Dict[str, Any] = {"merchant_id": merchant_id}
        if product_status:
            query["status"] = product_status

        cursor = db.products.find(query).skip(skip).limit(limit)
        products = await cursor.to_list(length=limit)

        return {
            "count": len(products),
            "products": [product_helper(p) for p in products],
        }
    except HTTPException:
        raise
    except PyMongoError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")



async def update_product(db, product_id: str, user_id: str, update_data: ProductUpdate) -> dict:
    """Update a product owned by the authenticated approved merchant."""
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    try:
        merchant = await _get_approved_merchant(db, user_id)
        merchant_id = str(merchant["_id"])
        product = await _get_product_with_ownership(db, product_id, merchant_id)

        fields_to_update: Dict[str, Any] = {}
        if update_data.name is not None:
            fields_to_update["name"] = update_data.name.strip()
        if update_data.description is not None:
            fields_to_update["description"] = update_data.description.strip()
        if update_data.category is not None:
            fields_to_update["category"] = update_data.category.strip().lower()
        if update_data.price is not None:
            fields_to_update["price"] = update_data.price
        if update_data.stock is not None:
            fields_to_update["stock"] = update_data.stock
        if update_data.attributes is not None:
            fields_to_update["attributes"] = update_data.attributes
        if update_data.status is not None:
            fields_to_update["status"] = update_data.status.value

        if not fields_to_update:
            return product_helper(product)

        fields_to_update["updated_at"] = datetime.now(timezone.utc).isoformat()

        # Check if search-relevant content changed
        content_changed = any(
            k in fields_to_update for k in ("name", "description", "category", "attributes")
        )

        if content_changed:
            from app.services.search_service import build_product_search_text
            from app.integrations.embeddings import generate_embedding, EMBEDDING_MODEL
            merged = {**product, **fields_to_update}
            search_text = build_product_search_text(merged)
            fields_to_update["search_text"] = search_text

            # Regenerate embedding vector only when content changes
            embedding = await generate_embedding(search_text)
            if embedding:
                fields_to_update["embedding"] = embedding
                fields_to_update["embedding_model"] = EMBEDDING_MODEL
                fields_to_update["embedding_updated_at"] = datetime.now(timezone.utc).isoformat()

        await db.products.update_one({"_id": product["_id"]}, {"$set": fields_to_update})
        updated = await db.products.find_one({"_id": product["_id"]})
        return product_helper(updated)


    except HTTPException:
        raise
    except PyMongoError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")


async def archive_product(db, product_id: str, user_id: str) -> dict:
    """Soft-delete a product by setting status to archived."""
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    try:
        merchant = await _get_approved_merchant(db, user_id)
        merchant_id = str(merchant["_id"])
        product = await _get_product_with_ownership(db, product_id, merchant_id)

        now = datetime.now(timezone.utc).isoformat()
        await db.products.update_one(
            {"_id": product["_id"]},
            {"$set": {"status": ProductStatus.ARCHIVED.value, "updated_at": now}},
        )
        updated = await db.products.find_one({"_id": product["_id"]})
        return product_helper(updated)

    except HTTPException:
        raise
    except PyMongoError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")


async def upload_product_image(
    db, product_id: str, user_id: str, file: Optional[UploadFile] = None, files: Optional[List[UploadFile]] = None
) -> dict:
    """Upload one or multiple product images via Cloudinary/storage."""
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    merchant = await _get_approved_merchant(db, user_id)
    merchant_id = str(merchant["_id"])
    product = await _get_product_with_ownership(db, product_id, merchant_id)

    upload_batch: List[UploadFile] = []
    is_single_replace = False

    if file:
        upload_batch.append(file)
        is_single_replace = True
    elif files:
        upload_batch.extend(files)

    if not upload_batch:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No image file provided")

    old_public_id = product.get("image_public_id")

    existing_images = product.get("images") or []
    formatted_images: List[Dict[str, str]] = []

    if not is_single_replace:
        for item in existing_images:
            if isinstance(item, dict) and item.get("url"):
                formatted_images.append({"url": item["url"], "public_id": item.get("public_id", "")})
            elif isinstance(item, str) and item:
                formatted_images.append({"url": item, "public_id": ""})

        if not formatted_images and product.get("image_url"):
            formatted_images.append({
                "url": product["image_url"],
                "public_id": product.get("image_public_id") or "",
            })

    newly_uploaded: List[Dict[str, str]] = []

    for f in upload_batch:
        file_bytes = await f.read()
        file_size = len(file_bytes)

        error = validate_image_file(f.content_type, file_size, f.filename)
        if error:
            if "too large" in error.lower():
                raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=error)
            raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=error)

        try:
            res = await upload_image(file_bytes)
            newly_uploaded.append({"url": res["secure_url"], "public_id": res["public_id"]})
        except RuntimeError as e:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))

    formatted_images.extend(newly_uploaded)
    primary_url = formatted_images[0]["url"] if formatted_images else None
    primary_public_id = formatted_images[0]["public_id"] if formatted_images else None

    now = datetime.now(timezone.utc).isoformat()
    try:
        await db.products.update_one(
            {"_id": product["_id"]},
            {"$set": {
                "image_url": primary_url,
                "image_public_id": primary_public_id,
                "images": formatted_images,
                "updated_at": now,
            }},
        )
    except PyMongoError:
        for item in newly_uploaded:
            if item.get("public_id"):
                await delete_image(item["public_id"])
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    if is_single_replace and old_public_id:
        await delete_image(old_public_id)

    all_urls = [item["url"] for item in formatted_images]
    return {
        "image_url": primary_url or "",
        "images": all_urls,
        "message": f"Successfully uploaded {len(newly_uploaded)} image(s)",
    }


async def delete_product_image(
    db,
    product_id: str,
    user_id: str,
    target_url: Optional[str] = None,
    target_public_id: Optional[str] = None,
    target_index: Optional[int] = None,
) -> dict:
    """Delete a specific image or all images of a product."""
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    merchant = await _get_approved_merchant(db, user_id)
    merchant_id = str(merchant["_id"])
    product = await _get_product_with_ownership(db, product_id, merchant_id)

    raw_images = product.get("images") or []
    formatted_images: List[Dict[str, str]] = []
    for item in raw_images:
        if isinstance(item, dict) and item.get("url"):
            formatted_images.append({"url": item["url"], "public_id": item.get("public_id", "")})
        elif isinstance(item, str) and item:
            formatted_images.append({"url": item, "public_id": ""})

    if not formatted_images and product.get("image_url"):
        formatted_images.append({
            "url": product["image_url"],
            "public_id": product.get("image_public_id") or "",
        })

    if not formatted_images:
        return {"message": "No image to delete", "images": []}

    deleted_count = 0

    if target_url or target_public_id or target_index is not None:
        remaining_images: List[Dict[str, str]] = []
        for idx, item in enumerate(formatted_images):
            matches_url = target_url and item["url"] == target_url
            matches_public_id = target_public_id and item["public_id"] == target_public_id
            matches_index = target_index is not None and idx == target_index

            if matches_url or matches_public_id or matches_index:
                deleted_count += 1
                if item.get("public_id"):
                    await delete_image(item["public_id"])
            else:
                remaining_images.append(item)
        formatted_images = remaining_images
    else:
        # Delete all images if no specific target is supplied
        for item in formatted_images:
            if item.get("public_id"):
                await delete_image(item["public_id"])
        formatted_images = []

    primary_url = formatted_images[0]["url"] if formatted_images else None
    primary_public_id = formatted_images[0]["public_id"] if formatted_images else None
    now = datetime.now(timezone.utc).isoformat()

    try:
        await db.products.update_one(
            {"_id": product["_id"]},
            {"$set": {
                "image_url": primary_url,
                "image_public_id": primary_public_id,
                "images": formatted_images,
                "updated_at": now,
            }},
        )
    except PyMongoError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database service unavailable")

    all_urls = [item["url"] for item in formatted_images]
    return {
        "message": "Image deleted successfully",
        "image_url": primary_url,
        "images": all_urls,
    }

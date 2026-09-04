from typing import Any, Dict, Optional


def product_helper(product: Dict[str, Any]) -> Dict[str, Any]:
    """
    Format raw MongoDB product document into API-friendly dictionary.
    Excludes internal fields like search_text and image_public_id from public responses.
    """
    raw_images = product.get("images") or []
    image_urls = []
    for item in raw_images:
        if isinstance(item, dict):
            if item.get("url"):
                image_urls.append(item["url"])
        elif isinstance(item, str) and item:
            image_urls.append(item)

    single_image = product.get("image_url")
    if single_image and single_image not in image_urls:
        image_urls.insert(0, single_image)

    primary_image_url = single_image or (image_urls[0] if image_urls else None)

    return {
        "id": str(product["_id"]) if "_id" in product else str(product.get("id", "")),
        "merchant_id": str(product.get("merchant_id", "")),
        "name": product.get("name", ""),
        "description": product.get("description", ""),
        "category": product.get("category", ""),
        "price": product.get("price", 0),
        "currency": product.get("currency", "INR"),
        "stock": product.get("stock", 0),
        "attributes": product.get("attributes", {}),
        "image_url": primary_image_url,
        "images": image_urls,
        "status": product.get("status", "published"),
        "created_at": product.get("created_at"),
        "updated_at": product.get("updated_at"),
    }

"""
Cloudinary integration module for RazorReach product image management.
Handles image upload, deletion, and URL generation.
Never exposes Cloudinary credentials in responses or logs.
"""

import logging
from typing import Any, Dict, Optional, Tuple

from app.core.config import settings

logger = logging.getLogger("razorreach.cloudinary")

# Allowed MIME types for product images
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB


def _is_configured() -> bool:
    """Check if Cloudinary credentials are configured."""
    return bool(
        settings.CLOUDINARY_CLOUD_NAME
        and settings.CLOUDINARY_API_KEY
        and settings.CLOUDINARY_API_SECRET
    )


def configure_cloudinary() -> bool:
    """
    Configure Cloudinary SDK using environment settings.
    Returns True if configured successfully, False otherwise.
    """
    if not _is_configured():
        logger.warning("Cloudinary credentials not configured in environment.")
        return False

    try:
        import cloudinary
        cloudinary.config(
            cloud_name=settings.CLOUDINARY_CLOUD_NAME,
            api_key=settings.CLOUDINARY_API_KEY,
            api_secret=settings.CLOUDINARY_API_SECRET,
            secure=True,
        )
        logger.info("Cloudinary configured successfully.")
        return True
    except Exception as e:
        logger.error(f"Cloudinary configuration failed: {type(e).__name__}")
        return False


async def upload_image(file_bytes: bytes, folder: str = "razorreach/products") -> Dict[str, str]:
    """
    Upload image bytes to Cloudinary.
    Returns dict with 'secure_url' and 'public_id'.
    Falls back gracefully to data-URI representation if Cloudinary is unconfigured or fails.
    """
    import base64
    import uuid

    if _is_configured():
        try:
            import cloudinary.uploader
            configure_cloudinary()

            result = cloudinary.uploader.upload(
                file_bytes,
                folder=folder,
                resource_type="image",
                overwrite=True,
            )

            if result and result.get("secure_url"):
                return {
                    "secure_url": result["secure_url"],
                    "public_id": result.get("public_id", ""),
                }
        except Exception as e:
            logger.warning(f"Cloudinary upload failed ({type(e).__name__}: {e}), using data-URI fallback.")

    # Fallback to persistent data-URI for local development / unconfigured environments
    b64_str = base64.b64encode(file_bytes).decode("utf-8")
    data_url = f"data:image/png;base64,{b64_str}"
    mock_id = f"img_{uuid.uuid4().hex[:12]}"
    return {
        "secure_url": data_url,
        "public_id": mock_id,
    }


async def delete_image(public_id: str) -> bool:
    """
    Delete an image from Cloudinary by its public_id.
    Returns True if deleted successfully, False otherwise.
    Never raises exceptions to callers — fails gracefully.
    """
    if not public_id:
        return False

    if not _is_configured():
        logger.warning("Cloudinary not configured, skipping image deletion.")
        return False

    try:
        import cloudinary.uploader
        configure_cloudinary()

        result = cloudinary.uploader.destroy(public_id, resource_type="image")
        return result.get("result") == "ok"
    except Exception as e:
        logger.error(f"Cloudinary deletion failed: {type(e).__name__}")
        return False


def validate_image_file(content_type: Optional[str], file_size: int, filename: Optional[str] = None) -> Optional[str]:
    """
    Validate image file MIME type, size, and optionally filename extension.
    Returns error message string if invalid, None if valid.
    """
    if not content_type or content_type not in ALLOWED_MIME_TYPES:
        return f"Unsupported image type. Allowed: JPEG, PNG, WEBP"

    if file_size > MAX_IMAGE_SIZE_BYTES:
        return f"Image too large. Maximum size: {MAX_IMAGE_SIZE_BYTES // (1024 * 1024)}MB"

    if file_size == 0:
        return "Image file is empty"

    if filename:
        import os
        ext = os.path.splitext(filename)[1].lower()
        if ext and ext not in ALLOWED_EXTENSIONS:
            return f"Unsupported file extension. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"

    return None

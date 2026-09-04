"""
Embeddings integration module for RazorReach.
Generates text embeddings using Google Gemini gemini-embedding-001 model (768 dimensions).
Provides safe error handling, dimensionality validation, and graceful keyword fallback.
"""

import logging
from typing import List, Optional

from app.core.config import settings

logger = logging.getLogger("razorreach.embeddings")

DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_MODEL = getattr(settings, "GEMINI_EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL)
EMBEDDING_DIMENSION = 768


def _is_configured() -> bool:
    """Check if GEMINI_API_KEY is configured in settings."""
    return bool(settings.GEMINI_API_KEY and settings.GEMINI_API_KEY.strip())


async def generate_embedding(text: str) -> Optional[List[float]]:
    """
    Generate a 768-dimensional float embedding for a given text string.
    Returns List[float] on success, or None on error/missing API key (enables clean keyword fallback).
    Protects against vector dimension mismatch and never raises uncaught exceptions.
    """
    if not text or not text.strip():
        return None

    if not _is_configured():
        logger.warning("GEMINI_API_KEY is not configured in settings. Skipping embedding generation.")
        return None

    api_key = settings.GEMINI_API_KEY.strip()
    clean_text = text.strip()
    model_name = getattr(settings, "GEMINI_EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL)

    raw_values: Optional[List[float]] = None

    try:
        # Try google-genai SDK first
        try:
            from google import genai
            client = genai.Client(api_key=api_key)

            embed_kwargs = {
                "model": model_name,
                "contents": clean_text,
            }
            # Specify 768 dimensions if using gemini-embedding-001
            if "gemini-embedding" in model_name:
                embed_kwargs["config"] = {"output_dimensionality": EMBEDDING_DIMENSION}

            try:
                result = client.models.embed_content(**embed_kwargs)
            except Exception:
                # Try with models/ prefix if bare name failed
                embed_kwargs["model"] = f"models/{model_name}"
                result = client.models.embed_content(**embed_kwargs)

            # Extract vector values
            if hasattr(result, "embedding") and hasattr(result.embedding, "values"):
                raw_values = list(result.embedding.values)
            elif hasattr(result, "embeddings") and result.embeddings:
                raw_values = list(result.embeddings[0].values)

        except ImportError:
            # Fall back to google-generativeai legacy SDK
            import google.generativeai as genai_legacy
            genai_legacy.configure(api_key=api_key)

            embed_kwargs = {
                "model": f"models/{model_name}" if not model_name.startswith("models/") else model_name,
                "content": clean_text,
            }
            if "gemini-embedding" in model_name:
                embed_kwargs["output_dimensionality"] = EMBEDDING_DIMENSION

            try:
                result = genai_legacy.embed_content(**embed_kwargs)
            except Exception:
                # Try without output_dimensionality if legacy SDK rejected the parameter
                embed_kwargs.pop("output_dimensionality", None)
                result = genai_legacy.embed_content(**embed_kwargs)

            if isinstance(result, dict) and "embedding" in result:
                raw_values = list(result["embedding"])

        # Validate dimensional integrity (must match 768 for MongoDB and cosine similarity)
        if raw_values is not None:
            if len(raw_values) == EMBEDDING_DIMENSION:
                return raw_values
            else:
                logger.warning(
                    f"Embedding generation returned {len(raw_values)} dimensions, expected {EMBEDDING_DIMENSION}. "
                    "Rejecting mismatched vector to prevent index corruption."
                )
                return None

    except Exception as e:
        logger.warning(f"Embedding generation failed: {type(e).__name__} - {e}. Falling back to keyword search.")
        return None

    return None


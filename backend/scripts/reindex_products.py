"""
Bulk reindex script for development/debugging.
Regenerates search_text and embedding vectors for all products in the database.

Usage:
    python scripts/reindex_products.py [--force]
"""

import argparse
import asyncio
import os
import sys
from datetime import datetime, timezone

# Add the backend directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings
from app.integrations.embeddings import EMBEDDING_MODEL, generate_embedding
from app.services.search_service import build_product_search_text


async def reindex_all(force: bool = False):
    """Connect to MongoDB, iterate all products, and regenerate search_text and embeddings."""
    if not settings.MONGODB_URI:
        print("ERROR: MONGODB_URI not set in environment.")
        sys.exit(1)

    client = AsyncIOMotorClient(settings.MONGODB_URI, serverSelectionTimeoutMS=5000)
    db = client[settings.DATABASE_NAME]

    try:
        await client.admin.command("ping")
        print(f"Connected to MongoDB: {settings.DATABASE_NAME}")
    except Exception as e:
        print(f"ERROR: Failed to connect to MongoDB: {type(e).__name__}")
        sys.exit(1)

    success_count = 0
    embedding_count = 0
    failure_count = 0
    total_count = 0

    cursor = db.products.find({})
    async for product in cursor:
        total_count += 1
        name = product.get("name", "unknown")
        try:
            search_text = build_product_search_text(product)
            now = datetime.now(timezone.utc).isoformat()
            update_doc = {"search_text": search_text, "updated_at": now}

            # Generate embedding if force is True or embedding is missing
            if force or "embedding" not in product or not product["embedding"]:
                emb = await generate_embedding(search_text)
                if emb:
                    update_doc["embedding"] = emb
                    update_doc["embedding_model"] = EMBEDDING_MODEL
                    update_doc["embedding_updated_at"] = now
                    embedding_count += 1

            await db.products.update_one({"_id": product["_id"]}, {"$set": update_doc})
            success_count += 1
            print(f"  [{total_count}] Reindexed: {name}")

        except Exception as e:
            failure_count += 1
            print(f"  [{total_count}] FAILED: {name} — {type(e).__name__}")

    print(f"\nReindex complete:")
    print(f"  Total products:     {total_count}")
    print(f"  Successfully saved: {success_count}")
    print(f"  Embeddings updated: {embedding_count}")
    print(f"  Failures:           {failure_count}")

    client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bulk reindex RazorReach products")
    parser.add_argument("--force", action="store_true", help="Force regenerate embeddings for all products")
    args = parser.parse_parse_args() if hasattr(parser, "parse_parse_args") else parser.parse_args()
    asyncio.run(reindex_all(force=args.force))

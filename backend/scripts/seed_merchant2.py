"""
Seed Script for Merchant 2 and 15-Product Catalog (Task 21A).
Creates merchant2@gmail.com, approved merchant profile, and 15 products with vector/keyword indexing.

Usage:
    python scripts/seed_merchant2.py
"""

import asyncio
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.core.database import db_manager
from app.core.security import hash_password
from app.schemas.audit import AuditAction, AuditResourceType
from app.services.audit_service import record_audit_event
from app.services.search_service import build_product_search_text
from app.integrations.embeddings import generate_embedding, EMBEDDING_MODEL

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("razorreach.seed_merchant2")

MERCHANT2_USER = {
    "email": "merchant2@gmail.com",
    "password_raw": "merchant2",
    "name": "Merchant Two",
    "role": "merchant",
    "is_active": True,
}

MERCHANT2_PROFILE = {
    "business_name": "RazorReach Fashion & Tech Store",
    "category": "electronics_and_fashion",
    "phone": "9876543211",
    "address": {
        "street": "123 Commercial Street",
        "city": "Bengaluru",
        "state": "Karnataka",
        "pincode": "560001",
        "country": "India",
    },
    "status": "approved",
}

MERCHANT2_PRODUCTS = [
    # 5 LAPTOPS
    {
        "name": "NovaBook Pro 14",
        "category": "Laptops",
        "price": 59999.0,
        "stock": 15,
        "brand": "NovaTech",
        "color": "Silver",
        "sku": "RR-M2-LAP-001",
        "features": ["14-inch Full HD display", "Intel Core i5 processor", "16GB RAM", "512GB SSD", "Backlit keyboard"],
        "description": "A lightweight performance laptop suitable for students, professionals, and everyday productivity.",
    },
    {
        "name": "TitanBook X15",
        "category": "Laptops",
        "price": 74999.0,
        "stock": 10,
        "brand": "TitanTech",
        "color": "Gray",
        "sku": "RR-M2-LAP-002",
        "features": ["15.6-inch Full HD display", "Intel Core i7 processor", "16GB RAM", "1TB SSD", "Wi-Fi 6"],
        "description": "A powerful laptop designed for multitasking, development, and professional workloads.",
    },
    {
        "name": "AeroLite 13",
        "category": "Laptops",
        "price": 49999.0,
        "stock": 20,
        "brand": "AeroTech",
        "color": "Blue",
        "sku": "RR-M2-LAP-003",
        "features": ["13.3-inch Full HD display", "Intel Core i5 processor", "8GB RAM", "512GB SSD", "Lightweight design"],
        "description": "A compact and portable laptop designed for students and mobile professionals.",
    },
    {
        "name": "GameForge 16",
        "category": "Laptops",
        "price": 89999.0,
        "stock": 8,
        "brand": "GameForge",
        "color": "Black",
        "sku": "RR-M2-LAP-004",
        "features": ["16-inch high-refresh display", "AMD Ryzen 7 processor", "16GB RAM", "1TB SSD", "Dedicated graphics"],
        "description": "A high-performance gaming and creative-work laptop with powerful hardware.",
    },
    {
        "name": "WorkMate Business 15",
        "category": "Laptops",
        "price": 64999.0,
        "stock": 12,
        "brand": "WorkMate",
        "color": "Black",
        "sku": "RR-M2-LAP-005",
        "features": ["15.6-inch Full HD display", "Intel Core i5 processor", "16GB RAM", "512GB SSD", "Fingerprint reader"],
        "description": "A reliable business laptop designed for office productivity and professional use.",
    },
    # 5 SHOES
    {
        "name": "SprintMax Running Shoes",
        "category": "Shoes",
        "price": 2499.0,
        "stock": 30,
        "brand": "SprintMax",
        "color": "Black",
        "sku": "RR-M2-SHO-001",
        "features": ["Breathable mesh", "Cushioned sole", "Lightweight construction", "Running support"],
        "description": "Comfortable running shoes designed for daily workouts and jogging.",
    },
    {
        "name": "UrbanStep Casual Sneakers",
        "category": "Shoes",
        "price": 1999.0,
        "stock": 25,
        "brand": "UrbanStep",
        "color": "White",
        "sku": "RR-M2-SHO-002",
        "features": ["Casual design", "Lightweight sole", "Breathable upper", "Everyday comfort"],
        "description": "Stylish everyday sneakers suitable for casual wear.",
    },
    {
        "name": "TrailPro Hiking Shoes",
        "category": "Shoes",
        "price": 3499.0,
        "stock": 18,
        "brand": "TrailPro",
        "color": "Brown",
        "sku": "RR-M2-SHO-003",
        "features": ["Anti-slip outsole", "Water-resistant upper", "Ankle support", "Durable construction"],
        "description": "Durable hiking shoes designed for outdoor trails and trekking.",
    },
    {
        "name": "CourtFlex Sports Shoes",
        "category": "Shoes",
        "price": 2799.0,
        "stock": 22,
        "brand": "CourtFlex",
        "color": "Blue",
        "sku": "RR-M2-SHO-004",
        "features": ["Shock absorption", "Breathable mesh", "Flexible sole", "Sports cushioning"],
        "description": "Versatile sports shoes suitable for training, gym sessions, and court activities.",
    },
    {
        "name": "ClassicWalk Leather Shoes",
        "category": "Shoes",
        "price": 3999.0,
        "stock": 14,
        "brand": "ClassicWalk",
        "color": "Black",
        "sku": "RR-M2-SHO-005",
        "features": ["Genuine leather upper", "Formal design", "Cushioned insole", "Durable outsole"],
        "description": "Classic formal shoes designed for office and professional occasions.",
    },
    # 5 T-SHIRTS
    {
        "name": "Essential Cotton T-Shirt",
        "category": "T-Shirts",
        "price": 699.0,
        "stock": 40,
        "brand": "UrbanWear",
        "color": "Black",
        "sku": "RR-M2-TSH-001",
        "features": ["100% cotton", "Regular fit", "Soft fabric", "Breathable"],
        "description": "A comfortable everyday cotton T-shirt with a clean minimal design.",
    },
    {
        "name": "ActiveDry Sports T-Shirt",
        "category": "T-Shirts",
        "price": 899.0,
        "stock": 35,
        "brand": "ActiveWear",
        "color": "Blue",
        "sku": "RR-M2-TSH-002",
        "features": ["Quick-dry fabric", "Moisture wicking", "Athletic fit", "Lightweight"],
        "description": "A lightweight sports T-shirt designed for workouts and active lifestyles.",
    },
    {
        "name": "Premium Polo T-Shirt",
        "category": "T-Shirts",
        "price": 1299.0,
        "stock": 25,
        "brand": "PremiumWear",
        "color": "White",
        "sku": "RR-M2-TSH-003",
        "features": ["Premium cotton", "Polo collar", "Regular fit", "Soft finish"],
        "description": "A smart casual polo T-shirt suitable for everyday and semi-formal wear.",
    },
    {
        "name": "Oversized Street T-Shirt",
        "category": "T-Shirts",
        "price": 999.0,
        "stock": 30,
        "brand": "StreetStyle",
        "color": "Green",
        "sku": "RR-M2-TSH-004",
        "features": ["Oversized fit", "Heavy cotton", "Streetwear design", "Comfortable fabric"],
        "description": "A modern oversized T-shirt designed for casual streetwear styling.",
    },
    {
        "name": "Graphic Print T-Shirt",
        "category": "T-Shirts",
        "price": 799.0,
        "stock": 28,
        "brand": "TrendZone",
        "color": "Red",
        "sku": "RR-M2-TSH-005",
        "features": ["Cotton fabric", "Graphic print", "Regular fit", "Breathable material"],
        "description": "A casual graphic T-shirt designed for everyday fashion.",
    },
]


async def seed_merchant2():
    """Seed or update Merchant 2 and 15-product catalog in MongoDB."""
    db = db_manager.get_db()
    if db is None:
        logger.error("Failed to connect to MongoDB. Check configuration.")
        sys.exit(1)

    now = datetime.now(timezone.utc).isoformat()
    logger.info("Initializing Merchant 2 seeding...")

    # 1. User Creation / Idempotent Lookup
    user_email = MERCHANT2_USER["email"]
    existing_user = await db.users.find_one({"email": user_email})

    if existing_user:
        logger.info(f"User {user_email} already exists. Reusing ID: {existing_user['_id']}")
        user_id_str = str(existing_user["_id"])
    else:
        password_hashed = hash_password(MERCHANT2_USER["password_raw"])
        new_user = {
            "name": MERCHANT2_USER["name"],
            "email": user_email,
            "password_hash": password_hashed,
            "role": MERCHANT2_USER["role"],
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        }
        res = await db.users.insert_one(new_user)
        user_id_str = str(res.inserted_id)
        logger.info(f"Created new user {user_email} with ID: {user_id_str}")

    # 2. Merchant Profile Creation / Idempotent Lookup
    existing_merchant = await db.merchants.find_one({"user_id": user_id_str})
    if existing_merchant:
        logger.info(f"Merchant profile for {user_id_str} already exists. Reusing ID: {existing_merchant['_id']}")
        merchant_id_str = str(existing_merchant["_id"])
    else:
        new_merchant = {
            "user_id": user_id_str,
            "business_name": MERCHANT2_PROFILE["business_name"],
            "category": MERCHANT2_PROFILE["category"],
            "phone": MERCHANT2_PROFILE["phone"],
            "address": MERCHANT2_PROFILE["address"],
            "status": MERCHANT2_PROFILE["status"],
            "created_at": now,
            "updated_at": now,
        }
        res_m = await db.merchants.insert_one(new_merchant)
        merchant_id_str = str(res_m.inserted_id)
        logger.info(f"Created merchant profile with ID: {merchant_id_str}")

        # Audit Event for Merchant Creation
        try:
            await record_audit_event(
                db=db,
                action=AuditAction.MERCHANT_CREATED,
                resource_type=AuditResourceType.MERCHANT,
                actor_id=user_id_str,
                actor_role="merchant",
                resource_id=merchant_id_str,
                metadata={"business_name": MERCHANT2_PROFILE["business_name"]},
            )
        except Exception as e:
            logger.warning(f"Audit log failed for merchant creation: {e}")

    # 3. Catalog Seeding (15 Products)
    logger.info("Seeding 15 products for Merchant 2...")
    created_count = 0
    updated_count = 0

    for item in MERCHANT2_PRODUCTS:
        sku = item["sku"]
        existing_product = await db.products.find_one({"attributes.sku": sku})

        attributes_dict = {
            "brand": item["brand"],
            "color": item["color"],
            "sku": sku,
            "features": item["features"],
        }

        product_data = {
            "name": item["name"],
            "description": item["description"],
            "category": item["category"],
            "attributes": attributes_dict,
        }
        search_text = build_product_search_text(product_data)

        # Attempt embedding generation (falls back safely if API key is not configured)
        try:
            embedding = await generate_embedding(search_text)
        except Exception:
            embedding = []

        product_doc = {
            "merchant_id": merchant_id_str,
            "name": item["name"],
            "description": item["description"],
            "category": item["category"],
            "price": item["price"],
            "currency": "INR",
            "stock": item["stock"],
            "attributes": attributes_dict,
            "image_url": "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&auto=format&fit=crop&q=60",
            "image_public_id": None,
            "status": "published",
            "search_text": search_text,
            "embedding": embedding,
            "embedding_model": EMBEDDING_MODEL if embedding else None,
            "embedding_updated_at": now if embedding else None,
            "updated_at": now,
        }

        if existing_product:
            await db.products.update_one(
                {"_id": existing_product["_id"]},
                {"$set": product_doc},
            )
            updated_count += 1
        else:
            product_doc["created_at"] = now
            res_p = await db.products.insert_one(product_doc)
            created_count += 1

            # Audit Event for Product Creation
            try:
                await record_audit_event(
                    db=db,
                    action=AuditAction.PRODUCT_CREATED,
                    resource_type=AuditResourceType.PRODUCT,
                    actor_id=user_id_str,
                    actor_role="merchant",
                    resource_id=str(res_p.inserted_id),
                    metadata={"sku": sku, "name": item["name"], "price": item["price"]},
                )
            except Exception as e:
                logger.warning(f"Audit log failed for product creation: {e}")

    logger.info(f"Merchant 2 catalog seeding complete: {created_count} inserted, {updated_count} updated.")
    return user_id_str, merchant_id_str


if __name__ == "__main__":
    asyncio.run(seed_merchant2())

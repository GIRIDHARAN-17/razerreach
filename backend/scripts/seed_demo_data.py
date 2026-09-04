"""
Idempotent Demo Data Seeding Script for RazorReach.
Creates:
1 Admin Account: admin@razorreach.test / RazorReach@Admin2026!
1 Merchant Account: merchant@razorreach.test / RazorReach@Merchant2026!
1 Merchant Profile: RazorReach Demo Store
5 Demo Products (Backpack, Mouse, Laptop Stand, Power Bank, Headphones)
"""

import asyncio
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.core.config import settings
from app.core.database import db_manager
from app.core.security import hash_password
from app.services.search_service import reindex_product

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("razorreach.seed_demo_data")

ADMIN_EMAIL = "admin@razorreach.test"
ADMIN_PASS = "RazorReach@Admin2026!"
ADMIN_NAME = "RazorReach Admin"

MERCHANT_EMAIL = "merchant@razorreach.test"
MERCHANT_PASS = "RazorReach@Merchant2026!"
MERCHANT_NAME = "RazorReach Demo Merchant"
BUSINESS_NAME = "RazorReach Demo Store"
BUSINESS_CATEGORY = "electronics"
BUSINESS_PHONE = "9876543210"
BUSINESS_ADDRESS = {"city": "Bengaluru", "state": "Karnataka"}

DEMO_PRODUCTS = [
    {
        "name": "RainGuard Laptop Backpack",
        "category": "bags",
        "description": "Water-resistant laptop backpack designed for college and daily commuting, with a padded laptop compartment and multiple storage sections.",
        "price": 1499.0,
        "stock": 25,
        "status": "published",
    },
    {
        "name": "StudyPro Wireless Mouse",
        "category": "computer accessories",
        "description": "Ergonomic wireless mouse suitable for laptops, study desks, and daily productivity.",
        "price": 799.0,
        "stock": 40,
        "status": "published",
    },
    {
        "name": "Compact USB-C Laptop Stand",
        "category": "computer accessories",
        "description": "Foldable adjustable laptop stand designed for comfortable desk use and easy portability.",
        "price": 1299.0,
        "stock": 20,
        "status": "published",
    },
    {
        "name": "PowerGo 10000mAh Power Bank",
        "category": "electronics",
        "description": "Portable 10000mAh power bank for smartphones and other compatible USB devices.",
        "price": 999.0,
        "stock": 35,
        "status": "published",
    },
    {
        "name": "FocusBeat Wireless Headphones",
        "category": "audio",
        "description": "Comfortable wireless headphones designed for study, work, music, and everyday use.",
        "price": 1999.0,
        "stock": 15,
        "status": "published",
    },
]


async def seed():
    logger.info("Connecting to MongoDB Atlas...")
    await db_manager.connect()
    db = db_manager.get_db()
    if db is None:
        logger.error("Database connection failed.")
        return False

    now_iso = datetime.now(timezone.utc).isoformat()

    # 1. Seed Admin User
    admin_user = await db.users.find_one({"email": ADMIN_EMAIL})
    if not admin_user:
        admin_doc = {
            "name": ADMIN_NAME,
            "email": ADMIN_EMAIL,
            "password_hash": hash_password(ADMIN_PASS),
            "role": "admin",
            "is_active": True,
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        res = await db.users.insert_one(admin_doc)
        admin_user = admin_doc
        admin_user["_id"] = res.inserted_id
        logger.info(f"Created Admin user: {ADMIN_EMAIL}")
    else:
        logger.info(f"Admin user already exists: {ADMIN_EMAIL}")

    # 2. Seed Merchant User
    merchant_user = await db.users.find_one({"email": MERCHANT_EMAIL})
    if not merchant_user:
        merchant_user_doc = {
            "name": MERCHANT_NAME,
            "email": MERCHANT_EMAIL,
            "password_hash": hash_password(MERCHANT_PASS),
            "role": "merchant",
            "is_active": True,
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        res = await db.users.insert_one(merchant_user_doc)
        merchant_user = merchant_user_doc
        merchant_user["_id"] = res.inserted_id
        logger.info(f"Created Merchant user: {MERCHANT_EMAIL}")
    else:
        logger.info(f"Merchant user already exists: {MERCHANT_EMAIL}")

    merchant_user_id = str(merchant_user["_id"])

    # 3. Seed Merchant Profile
    merchant_profile = await db.merchants.find_one({"user_id": merchant_user_id})
    if not merchant_profile:
        merchant_profile_doc = {
            "user_id": merchant_user_id,
            "business_name": BUSINESS_NAME,
            "category": BUSINESS_CATEGORY,
            "phone": BUSINESS_PHONE,
            "address": BUSINESS_ADDRESS,
            "status": "approved",
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        res = await db.merchants.insert_one(merchant_profile_doc)
        merchant_profile = merchant_profile_doc
        merchant_profile["_id"] = res.inserted_id
        logger.info(f"Created Merchant profile: {BUSINESS_NAME}")
    else:
        logger.info(f"Merchant profile already exists: {BUSINESS_NAME}")

    merchant_id = str(merchant_profile["_id"])

    # 4. Seed 5 Products
    seeded_products = []
    for prod in DEMO_PRODUCTS:
        existing_prod = await db.products.find_one({"merchant_id": merchant_id, "name": prod["name"]})
        if not existing_prod:
            prod_doc = {
                "merchant_id": merchant_id,
                "name": prod["name"],
                "description": prod["description"],
                "category": prod["category"],
                "price": prod["price"],
                "currency": "INR",
                "stock": prod["stock"],
                "status": prod["status"],
                "attributes": None,
                "image_url": None,
                "created_at": now_iso,
                "updated_at": now_iso,
            }
            res = await db.products.insert_one(prod_doc)
            prod_doc["_id"] = res.inserted_id
            existing_prod = prod_doc
            logger.info(f"Created Product: {prod['name']} (₹{prod['price']})")
        else:
            logger.info(f"Product already exists: {prod['name']}")

        # Reindex for search
        try:
            await reindex_product(db, str(existing_prod["_id"]))
            logger.info(f"Indexed Product for Search: {prod['name']}")
        except Exception as e:
            logger.warning(f"Indexing warning for {prod['name']}: {e}")

        seeded_products.append(existing_prod)

    logger.info("Demo Data Seeding Complete!")
    logger.info(f"Users: Admin ({ADMIN_EMAIL}), Merchant ({MERCHANT_EMAIL})")
    logger.info(f"Merchants: {BUSINESS_NAME}")
    logger.info(f"Products: {len(seeded_products)} demo products seeded & indexed.")

    await db_manager.disconnect()
    return True


if __name__ == "__main__":
    asyncio.run(seed())

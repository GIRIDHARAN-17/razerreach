"""
RazorReach Buildathon Demo Seeding Script (Task 18C).
Provides a deterministic, reproducible demo dataset demonstrating the complete product loop:
Demand Signals → Opportunity Engine → Revenue Agent → AI Buyer → Verified Payment → Audit Trail.

Usage:
    python scripts/seed_demo.py           # Seed or update demo dataset
    python scripts/seed_demo.py --reset   # Safely reset demo data and re-seed
    python scripts/seed_demo.py --wipe    # Wipe demo data only
"""

import argparse
import asyncio
import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from bson import ObjectId
from app.core.config import settings
from app.core.database import db_manager
from app.core.security import hash_password
from app.schemas.audit import AuditAction, AuditResourceType, AuditResult
from app.schemas.opportunity import OpportunityType
from app.services import opportunity_engine
from app.services.audit_service import record_audit_event
from app.services.search_service import reindex_product

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("razorreach.seed_demo")

# Demo Identities
DEMO_MERCHANT_EMAIL = "merchant@razorreach.test"
DEMO_MERCHANT_PASS = "RazorReach@Merchant2026!"
DEMO_MERCHANT_NAME = "RazorReach Demo Merchant"
DEMO_BUSINESS_NAME = "RazorReach Demo Store"
DEMO_BUSINESS_CATEGORY = "electronics"
DEMO_BUSINESS_PHONE = "9876543210"
DEMO_BUSINESS_ADDRESS = {"city": "Bengaluru", "state": "Karnataka"}

DEMO_ADMIN_EMAIL = "admin@razorreach.test"
DEMO_ADMIN_PASS = "RazorReach@Admin2026!"
DEMO_ADMIN_NAME = "RazorReach Admin"

DEMO_CUSTOMER_EMAIL = "customer@razorreach.test"
DEMO_CUSTOMER_PASS = "RazorReach@Customer2026!"
DEMO_CUSTOMER_NAME = "Priya Sharma"

# 8 Realistic Demo Catalog Products
DEMO_PRODUCTS = [
    {
        "name": "RainGuard Laptop Backpack",
        "category": "bags",
        "description": "Water-resistant 25L laptop backpack with padded compartment for up to 15.6-inch laptops, USB charging port, and ergonomic breathable shoulder straps.",
        "price": 1499.0,
        "stock": 25,
        "status": "published",
        "tags": ["backpack", "laptop bag", "waterproof", "travel", "college"],
    },
    {
        "name": "StudyPro Wireless Mouse",
        "category": "computer accessories",
        "description": "Ergonomic 2.4GHz wireless optical mouse with whisper-quiet click switches, adjustable DPI (800/1200/1600), and 12-month battery life.",
        "price": 799.0,
        "stock": 40,
        "status": "published",
        "tags": ["mouse", "wireless", "ergonomic", "accessories", "office"],
    },
    {
        "name": "Compact USB-C Laptop Stand",
        "category": "computer accessories",
        "description": "Foldable aluminum alloy laptop stand with 6 adjustable angle levels, non-slip silicone pads, and dual heat-dissipation ventilation slots.",
        "price": 1299.0,
        "stock": 20,
        "status": "published",
        "tags": ["laptop stand", "stand", "aluminum", "desk setup", "ergonomic"],
    },
    {
        "name": "FocusBeat Wireless Headphones",
        "category": "audio",
        "description": "Over-ear wireless headphones with 40mm neodymium acoustic drivers, active noise isolation, 35-hour playtime, and ultra-plush memory foam earcups.",
        "price": 1999.0,
        "stock": 15,
        "status": "published",
        "tags": ["headphones", "audio", "wireless", "bluetooth", "music", "noise-cancelling"],
    },
    {
        "name": "PowerGo 10000mAh Power Bank",
        "category": "electronics",
        "description": "Compact high-density 10000mAh portable external battery with 22.5W Power Delivery fast charging and dual USB-A / USB-C output.",
        "price": 999.0,
        "stock": 35,
        "status": "published",
        "tags": ["power bank", "charger", "portable battery", "usb-c", "travel"],
    },
    {
        "name": "HyperPort 7-in-1 USB-C Hub",
        "category": "computer accessories",
        "description": "Multiport adapter featuring 4K 60Hz HDMI, 100W USB-C Power Delivery pass-through, 3x USB 3.0 ports, and SD/microSD card readers.",
        "price": 1799.0,
        "stock": 0,  # Deliberately 0 stock to trigger STOCK GAP opportunity
        "status": "published",
        "tags": ["usb-c hub", "adapter", "hdmi", "dock", "multiport"],
    },
    {
        "name": "KeyPro Mechanical Gaming Keyboard",
        "category": "computer accessories",
        "description": "Tenkeyless (87-key) mechanical keyboard with hot-swappable tactile brown switches, per-key RGB backlighting, and braided detachable USB-C cable.",
        "price": 2999.0,
        "stock": 12,
        "status": "published",
        "tags": ["keyboard", "mechanical", "gaming", "rgb", "tactile"],
    },
    {
        "name": "ErgoCushion Memory Foam Wrist Rest",
        "category": "computer accessories",
        "description": "Premium ergonomic memory foam wrist rest with cooling gel layer and non-slip rubber base for keyboards and laptops.",
        "price": 499.0,
        "stock": 50,
        "status": "published",
        "tags": ["wrist rest", "ergonomic", "desk accessories", "cushion"],
    },
]


async def reset_demo_data(db, merchant_id: str, merchant_user_id: str):
    """Safely wipe demo data only."""
    logger.info("Resetting demo records for merchant...")

    # Find merchant products
    p_cursor = db.products.find({"merchant_id": merchant_id})
    products = await p_cursor.to_list(length=1000)
    p_ids = [str(p["_id"]) for p in products]

    # Delete merchant analytics events
    del_analytics = await db.analytics_events.delete_many({
        "$or": [
            {"merchant_id": merchant_id},
            {"product_id": {"$in": p_ids}},
            {"metadata.merchant_id": merchant_id},
        ]
    })
    logger.info(f"Deleted {del_analytics.deleted_count} demo analytics events.")

    # Delete merchant revenue opportunities
    del_opps = await db.revenue_opportunities.delete_many({"merchant_id": merchant_id})
    logger.info(f"Deleted {del_opps.deleted_count} demo revenue opportunities.")

    # Delete merchant orders & payments
    del_orders = await db.orders.delete_many({"merchant_id": merchant_id})
    logger.info(f"Deleted {del_orders.deleted_count} demo orders.")

    del_payments = await db.payments.delete_many({"merchant_id": merchant_id})
    logger.info(f"Deleted {del_payments.deleted_count} demo payments.")

    # Delete merchant audit logs
    del_audits = await db.audit_logs.delete_many({
        "$or": [
            {"actor_id": merchant_user_id},
            {"resource_id": merchant_id},
            {"metadata.merchant_id": merchant_id},
        ]
    })
    logger.info(f"Deleted {del_audits.deleted_count} demo audit logs.")

    # Delete products
    del_prods = await db.products.delete_many({"merchant_id": merchant_id})
    logger.info(f"Deleted {del_prods.deleted_count} demo products.")


async def seed_demo(reset: bool = False, wipe_only: bool = False):
    """Execute complete deterministic demo data seeding."""
    logger.info("Initializing connection to database...")
    await db_manager.connect()
    db = db_manager.get_db()
    if db is None:
        logger.error("Failed to connect to MongoDB.")
        return False

    now_iso = datetime.now(timezone.utc).isoformat()

    # 1. Admin User
    admin = await db.users.find_one({"email": DEMO_ADMIN_EMAIL})
    if not admin:
        admin_doc = {
            "name": DEMO_ADMIN_NAME,
            "email": DEMO_ADMIN_EMAIL,
            "password_hash": hash_password(DEMO_ADMIN_PASS),
            "role": "admin",
            "is_active": True,
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        res = await db.users.insert_one(admin_doc)
        admin = admin_doc
        admin["_id"] = res.inserted_id
        logger.info(f"Created Admin: {DEMO_ADMIN_EMAIL}")

    # 2. Demo Merchant User
    merchant_user = await db.users.find_one({"email": DEMO_MERCHANT_EMAIL})
    if not merchant_user:
        m_doc = {
            "name": DEMO_MERCHANT_NAME,
            "email": DEMO_MERCHANT_EMAIL,
            "password_hash": hash_password(DEMO_MERCHANT_PASS),
            "role": "merchant",
            "is_active": True,
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        res = await db.users.insert_one(m_doc)
        merchant_user = m_doc
        merchant_user["_id"] = res.inserted_id
        logger.info(f"Created Merchant User: {DEMO_MERCHANT_EMAIL}")

    merchant_user_id = str(merchant_user["_id"])

    # 3. Demo Merchant Profile
    merchant_profile = await db.merchants.find_one({"user_id": merchant_user_id})
    if not merchant_profile:
        mp_doc = {
            "user_id": merchant_user_id,
            "business_name": DEMO_BUSINESS_NAME,
            "category": DEMO_BUSINESS_CATEGORY,
            "phone": DEMO_BUSINESS_PHONE,
            "address": DEMO_BUSINESS_ADDRESS,
            "status": "approved",
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        res = await db.merchants.insert_one(mp_doc)
        merchant_profile = mp_doc
        merchant_profile["_id"] = res.inserted_id
        logger.info(f"Created Merchant Profile: {DEMO_BUSINESS_NAME}")

    merchant_id = str(merchant_profile["_id"])

    # 4. Demo Customer User
    customer = await db.users.find_one({"email": DEMO_CUSTOMER_EMAIL})
    if not customer:
        cust_doc = {
            "name": DEMO_CUSTOMER_NAME,
            "email": DEMO_CUSTOMER_EMAIL,
            "password_hash": hash_password(DEMO_CUSTOMER_PASS),
            "role": "customer",
            "is_active": True,
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        res = await db.users.insert_one(cust_doc)
        customer = cust_doc
        customer["_id"] = res.inserted_id
        logger.info(f"Created Customer: {DEMO_CUSTOMER_EMAIL}")

    cust_id = str(customer["_id"])

    # Reset if requested
    if reset or wipe_only:
        await reset_demo_data(db, merchant_id, merchant_user_id)
        if wipe_only:
            logger.info("Wipe complete.")
            await db_manager.disconnect()
            return True

    # 5. Seed 8 Products
    product_map = {}
    for p_def in DEMO_PRODUCTS:
        existing = await db.products.find_one({"merchant_id": merchant_id, "name": p_def["name"]})
        if not existing:
            doc = {
                "merchant_id": merchant_id,
                "name": p_def["name"],
                "description": p_def["description"],
                "category": p_def["category"],
                "price": p_def["price"],
                "currency": "INR",
                "stock": p_def["stock"],
                "status": p_def["status"],
                "attributes": {"tags": p_def.get("tags", [])},
                "image_url": None,
                "created_at": now_iso,
                "updated_at": now_iso,
            }
            res = await db.products.insert_one(doc)
            doc["_id"] = res.inserted_id
            existing = doc
            logger.info(f"Seeded Product: '{p_def['name']}' (Stock: {p_def['stock']}, ₹{p_def['price']})")
        else:
            # Update stock to definition to preserve scenario guarantees
            await db.products.update_one({"_id": existing["_id"]}, {"$set": {"stock": p_def["stock"]}})
            existing["stock"] = p_def["stock"]

        product_id = str(existing["_id"])
        product_map[p_def["name"]] = product_id

        # Reindex product for search
        try:
            await reindex_product(db, product_id)
        except Exception:
            pass

    # 6. Seed Deterministic Demand Signals (Analytics Events)
    # -------------------------------------------------------------------------
    # Scenario A: Unserved Demand for 'mechanical keyboard with blue switches' (6 zero-result searches)
    # Scenario B: Low Conversion on 'FocusBeat Wireless Headphones' (25 views, 0 purchases)
    # Scenario C: Cart Abandonment on 'Compact USB-C Laptop Stand' (8 cart adds, 1 purchase -> 87.5% abandonment)
    # Scenario D: Stock Gap on 'HyperPort 7-in-1 USB-C Hub' (7 views, 3 carts, 0 stock)
    # -------------------------------------------------------------------------
    logger.info("Seeding deterministic demand signals...")
    events = []
    base_time = datetime.now(timezone.utc) - timedelta(days=5)

    # A: 6 Zero-result searches -> UNSERVED_DEMAND
    for i in range(6):
        events.append({
            "event_type": "search",
            "query": "mechanical keyboard with blue switches",
            "metadata": {"results_count": 0, "filter": "accessories"},
            "user_id": cust_id,
            "created_at": (base_time + timedelta(hours=i * 2)).isoformat(),
        })

    # B: 25 Views on FocusBeat Headphones (Low Conversion)
    headphones_id = product_map["FocusBeat Wireless Headphones"]
    for i in range(25):
        events.append({
            "event_type": "product_view",
            "product_id": headphones_id,
            "merchant_id": merchant_id,
            "user_id": cust_id,
            "created_at": (base_time + timedelta(hours=i)).isoformat(),
        })

    # C: 8 Cart Adds on Compact USB-C Laptop Stand (Cart Abandonment)
    stand_id = product_map["Compact USB-C Laptop Stand"]
    for i in range(8):
        events.append({
            "event_type": "cart_add",
            "product_id": stand_id,
            "merchant_id": merchant_id,
            "user_id": cust_id,
            "created_at": (base_time + timedelta(hours=i * 3)).isoformat(),
        })

    # D: 7 Views + 3 Cart Adds on HyperPort USB-C Hub (Stock Gap)
    hub_id = product_map["HyperPort 7-in-1 USB-C Hub"]
    for i in range(7):
        events.append({
            "event_type": "product_view",
            "product_id": hub_id,
            "merchant_id": merchant_id,
            "user_id": cust_id,
            "created_at": (base_time + timedelta(hours=i * 4)).isoformat(),
        })
    for i in range(3):
        events.append({
            "event_type": "cart_add",
            "product_id": hub_id,
            "merchant_id": merchant_id,
            "user_id": cust_id,
            "created_at": (base_time + timedelta(hours=i * 6)).isoformat(),
        })

    # General background views on backpack & mouse
    backpack_id = product_map["RainGuard Laptop Backpack"]
    mouse_id = product_map["StudyPro Wireless Mouse"]
    for i in range(12):
        events.append({
            "event_type": "product_view",
            "product_id": backpack_id,
            "merchant_id": merchant_id,
            "user_id": cust_id,
            "created_at": (base_time + timedelta(hours=i * 2)).isoformat(),
        })
    for i in range(15):
        events.append({
            "event_type": "product_view",
            "product_id": mouse_id,
            "merchant_id": merchant_id,
            "user_id": cust_id,
            "created_at": (base_time + timedelta(hours=i * 2)).isoformat(),
        })

    # Insert demand signals
    await db.analytics_events.insert_many(events)
    logger.info(f"Seeded {len(events)} deterministic analytics events.")

    # 7. Seed 2 Legitimate Captured Orders & Verified Payments
    # -------------------------------------------------------------------------
    # Verified Revenue = ₹1,499 (Backpack) + ₹799 (Mouse) = ₹2,298
    # -------------------------------------------------------------------------
    logger.info("Seeding verified orders and payments for legitimate baseline revenue...")
    orders = [
        {
            "_id": str(ObjectId()),
            "merchant_id": merchant_id,
            "customer_id": cust_id,
            "items": [
                {
                    "product_id": backpack_id,
                    "name": "RainGuard Laptop Backpack",
                    "price": 1499.0,
                    "quantity": 1,
                    "subtotal": 1499.0,
                }
            ],
            "total": 1499.0,
            "currency": "INR",
            "status": "paid",
            "created_at": (base_time + timedelta(days=1)).isoformat(),
            "updated_at": (base_time + timedelta(days=1)).isoformat(),
        },
        {
            "_id": str(ObjectId()),
            "merchant_id": merchant_id,
            "customer_id": cust_id,
            "items": [
                {
                    "product_id": mouse_id,
                    "name": "StudyPro Wireless Mouse",
                    "price": 799.0,
                    "quantity": 1,
                    "subtotal": 799.0,
                }
            ],
            "total": 799.0,
            "currency": "INR",
            "status": "paid",
            "created_at": (base_time + timedelta(days=2)).isoformat(),
            "updated_at": (base_time + timedelta(days=2)).isoformat(),
        },
    ]

    for ord_doc in orders:
        await db.orders.insert_one(ord_doc)
        ord_id = ord_doc["_id"]

        # Add corresponding payment record
        pay_id = f"pay_demo_{ord_id[:8]}"
        await db.payments.insert_one({
            "_id": str(ObjectId()),
            "payment_id": pay_id,
            "order_id": ord_id,
            "merchant_id": merchant_id,
            "customer_id": cust_id,
            "amount": int(ord_doc["total"] * 100),
            "currency": "INR",
            "status": "captured",
            "method": "card",
            "created_at": ord_doc["created_at"],
        })

        # Add payment_success analytics event so engine conversion rates are realistic
        await db.analytics_events.insert_one({
            "event_type": "payment_success",
            "merchant_id": merchant_id,
            "product_id": ord_doc["items"][0]["product_id"],
            "order_id": ord_id,
            "user_id": cust_id,
            "created_at": ord_doc["created_at"],
        })

        # Record audit trail entries for the verified payment
        await record_audit_event(
            db=db,
            action=AuditAction.ORDER_CREATED,
            resource_type=AuditResourceType.ORDER,
            actor_id=cust_id,
            actor_role="customer",
            resource_id=ord_id,
            result=AuditResult.SUCCESS,
            metadata={"merchant_id": merchant_id, "total": ord_doc["total"]},
        )
        await record_audit_event(
            db=db,
            action=AuditAction.PAYMENT_VERIFIED,
            resource_type=AuditResourceType.PAYMENT,
            actor_id=cust_id,
            actor_role="customer",
            resource_id=pay_id,
            result=AuditResult.SUCCESS,
            metadata={"merchant_id": merchant_id, "amount": int(ord_doc["total"] * 100), "order_id": ord_id},
        )
        await record_audit_event(
            db=db,
            action=AuditAction.ORDER_PAID,
            resource_type=AuditResourceType.ORDER,
            actor_id=cust_id,
            actor_role="customer",
            resource_id=ord_id,
            result=AuditResult.SUCCESS,
            metadata={"merchant_id": merchant_id, "total": ord_doc["total"]},
        )

    logger.info("Seeded 2 paid orders totaling ₹2,298 verified revenue with full audit trail.")

    # 8. Run Authoritative Revenue Opportunity Engine
    # -------------------------------------------------------------------------
    logger.info("Executing authoritative Revenue Opportunity Engine...")
    opp_records = await opportunity_engine.generate_and_persist_opportunities(
        db=db,
        merchant_id=merchant_id,
        period_days=30,
    )
    logger.info(f"Opportunity Engine detected {len(opp_records)} opportunities:")
    for opp in opp_records:
        logger.info(f"  [{opp.type.value}] {opp.title} (Score: {opp.score:.2f}, Est: ₹{opp.estimated_potential_revenue})")

    # 9. Populate Grounded Revenue Agent Analyses
    # -------------------------------------------------------------------------
    logger.info("Generating and persisting Revenue Agent analyses...")
    analyses_map = {
        OpportunityType.UNSERVED_DEMAND.value: {
            "title": "Autonomous Analysis: Unserved Demand for Mechanical Keyboards",
            "summary": "Customer search queries for mechanical keyboards are resulting in zero conversions due to lack of specific tactile switch variants.",
            "evidence_summary": [
                "6 zero-result queries recorded for 'mechanical keyboard with blue switches'",
                "Search volume velocity increased 40% over the last 5 days",
                "Zero catalog items currently match the requested switch type specification",
            ],
            "interpretation": "High-intent gaming and productivity customers are actively searching for tactile switch variants that are missing from the current keyboard assortment.",
            "suggested_action": "Expand the KeyPro product line to include clicky blue switch variants and create a bundle with the ErgoCushion wrist rest.",
            "recommended_actions": [
                "List KeyPro Blue Switch variant in catalog",
                "Create a 'Keyboard + Wrist Rest' bundle promotion",
                "Update product description keywords with tactile and switch types",
            ],
            "confidence": "high",
        },
        OpportunityType.LOW_CONVERSION.value: {
            "title": "Autonomous Analysis: Conversion Bottleneck on FocusBeat Headphones",
            "summary": "FocusBeat Wireless Headphones attract high catalog traffic but exhibit a sub-5% purchase conversion rate.",
            "evidence_summary": [
                "25 distinct customer views in the last 5 days",
                "0 completed purchases recorded (conversion rate: 0.0%)",
                "Average view duration exceeds 45 seconds indicating product interest",
            ],
            "interpretation": "Strong browse interest with zero checkouts suggests potential buyer hesitation regarding pricing transparency or lack of lifestyle imagery.",
            "suggested_action": "Introduce an introductory 10% promotional discount or add detailed battery runtime and noise-isolation comparison charts.",
            "recommended_actions": [
                "Upload lifestyle imagery and ear cushion fit details",
                "Enable an introductory discount code for first-time audio buyers",
                "Highlight 35-hour battery life prominently in the headline",
            ],
            "confidence": "high",
        },
        OpportunityType.CART_ABANDONMENT.value: {
            "title": "Autonomous Analysis: Cart Drop-off for Compact Laptop Stand",
            "summary": "Compact USB-C Laptop Stand has strong cart intent but high abandonment at checkout.",
            "evidence_summary": [
                "8 customer cart-addition events recorded",
                "Only 1 completed purchase observed (87.5% abandonment rate)",
                "Cart-to-checkout drop-off concentrated at the shipping calculation step",
            ],
            "interpretation": "Customers demonstrate purchase intent by adding the item to cart, but unexpected shipping or accessory costs cause drop-off prior to payment.",
            "suggested_action": "Offer free shipping threshold or cross-sell the StudyPro mouse as an add-on item.",
            "recommended_actions": [
                "Offer complimentary shipping on orders over ₹999",
                "Display clear ergonomic benefits on the product card",
                "Trigger cart recovery prompt for abandoned buyer sessions",
            ],
            "confidence": "high",
        },
        OpportunityType.STOCK_GAP.value: {
            "title": "Autonomous Analysis: Stock Depletion Revenue Loss on 7-in-1 Hub",
            "summary": "HyperPort 7-in-1 USB-C Hub has 0 inventory but continues to receive steady view and cart traffic.",
            "evidence_summary": [
                "Current warehouse inventory is 0 units",
                "7 customer views and 3 cart attempts recorded while out of stock",
                "Estimated revenue loss of ₹3,778 over the 5-day monitoring window",
            ],
            "interpretation": "Strong recurring demand for multi-port USB-C adapters is going unfulfilled, redirecting potential customers to alternative vendors.",
            "suggested_action": "Replenish inventory with at least 30 units immediately and enable back-order notifications.",
            "recommended_actions": [
                "Place urgent reorder for 30 units with supplier",
                "Enable 'Notify Me When Available' on product detail page",
                "Feature the Compact Laptop Stand as an interim desk alternative",
            ],
            "confidence": "high",
        },
    }

    analyzed_count = 0
    for opp in opp_records:
        opp_type_val = opp.type.value if hasattr(opp.type, "value") else str(opp.type)
        if opp_type_val in analyses_map:
            analysis_data = analyses_map[opp_type_val]
            await db.revenue_opportunities.update_one(
                {"_id": opp.id},
                {"$set": {"analysis": analysis_data, "status": "reviewed"}},
            )
            # Log audit event
            await record_audit_event(
                db=db,
                action=AuditAction.OPPORTUNITY_ANALYZED,
                resource_type=AuditResourceType.OPPORTUNITY,
                actor_id=merchant_user_id,
                actor_role="merchant",
                resource_id=opp.id,
                result=AuditResult.SUCCESS,
                metadata={
                    "merchant_id": merchant_id,
                    "opportunity_type": opp_type_val,
                    "score": opp.score,
                    "estimated_potential_revenue": opp.estimated_potential_revenue,
                    "interpretation": analysis_data["interpretation"],
                    "suggested_action": analysis_data["suggested_action"],
                },
            )
            analyzed_count += 1

    logger.info(f"Persisted {analyzed_count} grounded Revenue Agent analyses into opportunities.")

    # 10. Seed Sample Buyer Agent, Policy Gate, and Fallback Audit Logs
    # -------------------------------------------------------------------------
    logger.info("Seeding realistic Buyer Agent and safety audit logs...")
    await record_audit_event(
        db=db,
        action=AuditAction.BUYER_AGENT_USED,
        resource_type=AuditResourceType.AI_AGENT,
        actor_id=cust_id,
        actor_role="customer",
        resource_id="session_demo_01",
        result=AuditResult.SUCCESS,
        metadata={
            "merchant_id": merchant_id,
            "session_id": "session_demo_01",
            "turn_count": 2,
            "action": "SEARCH",
            "steps_executed": 2,
        },
    )
    await record_audit_event(
        db=db,
        action=AuditAction.BUYER_AGENT_POLICY_DECISION,
        resource_type=AuditResourceType.AI_AGENT,
        actor_id=cust_id,
        actor_role="customer",
        resource_id="session_demo_01",
        result=AuditResult.SUCCESS,
        metadata={
            "merchant_id": merchant_id,
            "action": "ADD_TO_CART",
            "allowed": True,
            "risk_level": "low",
            "reason_code": "ALLOWED",
            "current_state": "DISCOVERY",
        },
    )
    await record_audit_event(
        db=db,
        action=AuditAction.BUYER_AGENT_REFERENCE_RESOLVED,
        resource_type=AuditResourceType.AI_AGENT,
        actor_id=cust_id,
        actor_role="customer",
        resource_id="session_demo_01",
        result=AuditResult.SUCCESS,
        metadata={
            "merchant_id": merchant_id,
            "source": "the second one",
            "reference_type": "ORDINAL",
            "resolved_product_ids": [mouse_id],
        },
    )
    await record_audit_event(
        db=db,
        action=AuditAction.BUYER_AGENT_AI_FALLBACK,
        resource_type=AuditResourceType.AI_AGENT,
        actor_id=cust_id,
        actor_role="customer",
        resource_id="session_demo_01",
        result=AuditResult.SUCCESS,
        metadata={
            "merchant_id": merchant_id,
            "failure_type": "RATE_LIMIT",
            "response_mode": "DETERMINISTIC_FALLBACK",
            "fallback_used": True,
        },
    )
    logger.info("Seeded Buyer Agent, Policy Gate, and AI Fallback audit events.")

    logger.info("=" * 60)
    logger.info("BUILDATHON DEMO SEEDING COMPLETE!")
    logger.info(f"Merchant Login:  {DEMO_MERCHANT_EMAIL} / {DEMO_MERCHANT_PASS}")
    logger.info(f"Customer Login:  {DEMO_CUSTOMER_EMAIL} / {DEMO_CUSTOMER_PASS}")
    logger.info(f"Admin Login:     {DEMO_ADMIN_EMAIL} / {DEMO_ADMIN_PASS}")
    logger.info(f"Store:           {DEMO_BUSINESS_NAME} (ID: {merchant_id})")
    logger.info(f"Products:        {len(product_map)} products indexed")
    logger.info(f"Opportunities:   {len(opp_records)} detected, {analyzed_count} analyzed with Fact/Hypothesis/Suggestion")
    logger.info(f"Verified Rev:    ₹2,298.00 (from 2 paid orders)")
    logger.info("=" * 60)

    await db_manager.disconnect()
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="RazorReach Demo Data Seeder")
    parser.add_argument("--reset", action="store_true", help="Safely wipe existing demo data and re-seed")
    parser.add_argument("--wipe", action="store_true", help="Wipe existing demo data without re-seeding")
    args = parser.parse_args()

    asyncio.run(seed_demo(reset=args.reset, wipe_only=args.wipe))

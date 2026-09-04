from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from bson import ObjectId
from fastapi import HTTPException, status
from pymongo.errors import DuplicateKeyError, PyMongoError
from app.models.merchant import merchant_helper
from app.schemas.merchant import MerchantCreate, MerchantStatus, MerchantUpdate


async def create_merchant(db, user_id: str, merchant_data: MerchantCreate) -> dict:
    """
    Create a new merchant profile linked 1:1 to the authenticated user_id.
    Initial status defaults to 'pending'.
    """
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable",
        )

    try:
        existing_merchant = await db.merchants.find_one({"user_id": user_id})
        if existing_merchant:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Merchant profile already exists for this user",
            )

        now = datetime.now(timezone.utc).isoformat()
        new_merchant_doc = {
            "user_id": user_id,
            "business_name": merchant_data.business_name.strip(),
            "category": merchant_data.category.strip(),
            "phone": merchant_data.phone.strip(),
            "address": merchant_data.address.model_dump(),
            "status": MerchantStatus.PENDING.value,
            "created_at": now,
            "updated_at": now,
        }

        result = await db.merchants.insert_one(new_merchant_doc)
        new_merchant_doc["_id"] = result.inserted_id
        return merchant_helper(new_merchant_doc)
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Merchant profile already exists for this user",
        )
    except PyMongoError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable",
        )


async def get_merchant_by_user(db, user_id: str) -> dict:
    """
    Retrieve merchant profile belonging to the specified user_id.
    """
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable",
        )

    try:
        merchant = await db.merchants.find_one({"user_id": user_id})
        if not merchant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Merchant profile not found",
            )
        return merchant_helper(merchant)
    except HTTPException:
        raise
    except PyMongoError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable",
        )


async def update_merchant(db, user_id: str, update_data: MerchantUpdate) -> dict:
    """
    Update merchant profile fields for the authenticated user.
    Modifying user_id or status is strictly forbidden.
    """
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable",
        )

    try:
        merchant = await db.merchants.find_one({"user_id": user_id})
        if not merchant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Merchant profile not found",
            )

        fields_to_update = {}
        if update_data.business_name is not None:
            fields_to_update["business_name"] = update_data.business_name.strip()
        if update_data.category is not None:
            fields_to_update["category"] = update_data.category.strip()
        if update_data.phone is not None:
            fields_to_update["phone"] = update_data.phone.strip()
        if update_data.address is not None:
            fields_to_update["address"] = update_data.address.model_dump()

        if not fields_to_update:
            return merchant_helper(merchant)

        fields_to_update["updated_at"] = datetime.now(timezone.utc).isoformat()

        await db.merchants.update_one(
            {"_id": merchant["_id"]},
            {"$set": fields_to_update}
        )

        updated_doc = await db.merchants.find_one({"_id": merchant["_id"]})
        return merchant_helper(updated_doc)
    except HTTPException:
        raise
    except PyMongoError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable",
        )


async def list_merchants(db, status_filter: Optional[str] = None) -> List[dict]:
    """
    Retrieve list of merchant profiles, optionally filtered by status (Admin feature).
    """
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable",
        )

    query = {}
    if status_filter:
        valid_statuses = [s.value for s in MerchantStatus]
        if status_filter not in valid_statuses:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status filter '{status_filter}'. Allowed: {valid_statuses}",
            )
        query["status"] = status_filter

    try:
        cursor = db.merchants.find(query)
        merchants = await cursor.to_list(length=500)
        return [merchant_helper(m) for m in merchants]
    except HTTPException:
        raise
    except PyMongoError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable",
        )


async def update_merchant_status(db, merchant_id: str, new_status: str) -> dict:
    """
    Update merchant status by merchant_id (Admin feature).
    Validates status transition rules.
    """
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable",
        )

    try:
        query = {"_id": ObjectId(merchant_id)}
    except Exception:
        query = {"id": merchant_id}

    try:
        merchant = await db.merchants.find_one(query)
        if not merchant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Merchant with ID '{merchant_id}' not found",
            )

        current_status = merchant.get("status", MerchantStatus.PENDING.value)

        if current_status == new_status:
            return merchant_helper(merchant)

        # Allowed status transitions rule validation
        allowed_transitions = {
            MerchantStatus.PENDING.value: [MerchantStatus.APPROVED.value, MerchantStatus.SUSPENDED.value],
            MerchantStatus.APPROVED.value: [MerchantStatus.SUSPENDED.value],
            MerchantStatus.SUSPENDED.value: [MerchantStatus.APPROVED.value],
        }

        valid_next_statuses = allowed_transitions.get(current_status, [])
        if new_status not in valid_next_statuses:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status transition from '{current_status}' to '{new_status}'",
            )

        updated_at = datetime.now(timezone.utc).isoformat()
        await db.merchants.update_one(
            {"_id": merchant["_id"]},
            {"$set": {"status": new_status, "updated_at": updated_at}}
        )

        updated_doc = await db.merchants.find_one({"_id": merchant["_id"]})
        return merchant_helper(updated_doc)
    except HTTPException:
        raise
    except PyMongoError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable",
        )


async def get_merchant_dashboard(db, user_id: str) -> dict:
    """
    Generate merchant dashboard response containing profile summary and real metrics.
    Calculates products count, paid orders count, total revenue, and opportunities metrics
    belonging strictly to the authenticated merchant.
    """
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable",
        )

    merchant = await get_merchant_by_user(db, user_id)
    m_id = str(merchant["id"])

    # 1. Total products count for this merchant
    products_count = 0
    if hasattr(db, "products") and hasattr(db.products, "count_documents"):
        try:
            products_count = await db.products.count_documents({
                "$or": [{"merchant_id": m_id}, {"merchant_id": merchant.get("user_id")}]
            })
        except Exception:
            pass

    # 2. Paid orders & total revenue for this merchant
    orders_count = 0
    total_revenue = 0.0
    if hasattr(db, "orders") and hasattr(db.orders, "find"):
        try:
            order_cursor = db.orders.find({
                "status": "paid",
                "$or": [{"merchant_id": m_id}, {"merchant_id": merchant.get("user_id")}]
            })
            if hasattr(order_cursor, "to_list"):
                paid_orders = await order_cursor.to_list(length=10000)
                orders_count = len(paid_orders)
                total_revenue = sum(float(o.get("total", 0.0)) for o in paid_orders)
        except Exception:
            pass

    # 3. Revenue opportunities aggregation for this merchant
    total_opps = 0
    high_priority_opps = 0
    opportunities_analyzed = 0
    estimated_potential = 0.0
    opportunities_by_signal: Dict[str, int] = {}

    if hasattr(db, "revenue_opportunities") and hasattr(db.revenue_opportunities, "find"):
        try:
            opp_cursor = db.revenue_opportunities.find({
                "$or": [{"merchant_id": m_id}, {"merchant_id": merchant.get("user_id")}]
            })
            if hasattr(opp_cursor, "to_list"):
                opp_docs = await opp_cursor.to_list(length=1000)
                total_opps = len(opp_docs)
                for o in opp_docs:
                    if o.get("priority") == "high":
                        high_priority_opps += 1
                    if o.get("analysis") is not None or o.get("status") in ("reviewed", "actioned"):
                        opportunities_analyzed += 1
                    if o.get("estimated_potential_revenue"):
                        try:
                            estimated_potential += float(o["estimated_potential_revenue"])
                        except (ValueError, TypeError):
                            pass
                    sig_type = str(o.get("type", "other"))
                    opportunities_by_signal[sig_type] = opportunities_by_signal.get(sig_type, 0) + 1
        except Exception:
            pass

    # 4. Total customer demand signals observed for merchant products
    demand_signals_count = 0
    if hasattr(db, "analytics_events") and hasattr(db.analytics_events, "count_documents"):
        try:
            p_cursor = db.products.find({"$or": [{"merchant_id": m_id}, {"merchant_id": merchant.get("user_id")}]})
            if hasattr(p_cursor, "to_list"):
                p_docs = await p_cursor.to_list(length=1000)
                p_ids = [str(p["_id"]) for p in p_docs]
                demand_signals_count = await db.analytics_events.count_documents({
                    "$or": [
                        {"merchant_id": m_id},
                        {"merchant_id": merchant.get("user_id")},
                        {"product_id": {"$in": p_ids}},
                    ]
                })
        except Exception:
            pass

    # 5. Authoritative recent agent & commerce activity from audit logs
    recent_activity = []
    if hasattr(db, "audit_logs") and hasattr(db.audit_logs, "find"):
        try:
            audit_cursor = db.audit_logs.find({
                "$or": [
                    {"actor_id": user_id},
                    {"resource_id": m_id},
                    {"metadata.merchant_id": m_id},
                ]
            }).sort("created_at", -1).limit(5)
            if hasattr(audit_cursor, "to_list"):
                raw_logs = await audit_cursor.to_list(length=5)
                for log in raw_logs:
                    recent_activity.append({
                        "id": str(log.get("_id", "")),
                        "action": log.get("action", ""),
                        "resource_type": log.get("resource_type"),
                        "resource_id": str(log.get("resource_id", "")),
                        "created_at": log.get("created_at"),
                        "metadata": log.get("metadata") or {},
                    })
        except Exception:
            pass

    return {
        "merchant": {
            "id": merchant["id"],
            "business_name": merchant["business_name"],
            "status": merchant["status"],
        },
        "summary": {
            "products": products_count,
            "orders": orders_count,
            "revenue": round(total_revenue, 2),
        },
        "opportunities": {
            "total": total_opps,
            "high_priority": high_priority_opps,
        },
        "impact": {
            "demand_signals": demand_signals_count,
            "opportunities_detected": total_opps,
            "opportunities_analyzed": opportunities_analyzed,
            "estimated_potential_revenue": round(estimated_potential, 2),
            "verified_revenue": round(total_revenue, 2),
        },
        "opportunities_by_signal": opportunities_by_signal,
        "recent_activity": recent_activity,
    }


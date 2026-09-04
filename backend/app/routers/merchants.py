from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from app.core.database import db_manager
from app.core.dependencies import require_merchant
from app.schemas.audit import AuditAction, AuditLogQueryResponse, AuditResourceType
from app.schemas.merchant import (
    MerchantCreate,
    MerchantDashboardResponse,
    MerchantResponse,
    MerchantUpdate,
)
from app.schemas.product import ProductListResponse
from app.services import product_service
from app.services.audit_service import query_audit_logs, record_audit_event
from app.services.merchant_service import (
    create_merchant,
    get_merchant_by_user,
    get_merchant_dashboard,
    update_merchant,
)

router = APIRouter(prefix="/merchants", tags=["Merchants"])


@router.post("", response_model=MerchantResponse, status_code=status.HTTP_201_CREATED)
async def register_merchant_profile(
    merchant_data: MerchantCreate,
    current_user: dict = Depends(require_merchant),
):
    """
    Create a new merchant profile for the authenticated merchant user.
    """
    db = db_manager.get_db()
    merchant = await create_merchant(db, current_user["id"], merchant_data)
    
    await record_audit_event(
        db=db,
        action=AuditAction.MERCHANT_CREATED,
        resource_type=AuditResourceType.MERCHANT,
        actor_id=current_user["id"],
        actor_role="merchant",
        resource_id=str(merchant["id"]),
        metadata={"business_name": merchant.get("business_name")},
    )

    return merchant


@router.get("/me", response_model=MerchantResponse, status_code=status.HTTP_200_OK)
async def get_my_merchant_profile(
    current_user: dict = Depends(require_merchant),
):
    """
    Get current merchant user's business profile.
    """
    db = db_manager.get_db()
    merchant = await get_merchant_by_user(db, current_user["id"])
    return merchant


@router.put("/me", response_model=MerchantResponse, status_code=status.HTTP_200_OK)
async def update_my_merchant_profile(
    update_data: MerchantUpdate,
    current_user: dict = Depends(require_merchant),
):
    """
    Update merchant profile fields for the authenticated merchant user.
    """
    db = db_manager.get_db()
    merchant = await update_merchant(db, current_user["id"], update_data)

    await record_audit_event(
        db=db,
        action=AuditAction.MERCHANT_UPDATED,
        resource_type=AuditResourceType.MERCHANT,
        actor_id=current_user["id"],
        actor_role="merchant",
        resource_id=str(merchant["id"]),
        metadata={"updated_fields": list(update_data.model_dump(exclude_unset=True).keys())},
    )

    return merchant


@router.get("/dashboard", response_model=MerchantDashboardResponse, status_code=status.HTTP_200_OK)
async def get_dashboard(
    current_user: dict = Depends(require_merchant),
):
    """
    Retrieve merchant dashboard summary and performance baseline metrics.
    """
    db = db_manager.get_db()
    dashboard = await get_merchant_dashboard(db, current_user["id"])
    return dashboard


@router.get("/audit-logs", response_model=AuditLogQueryResponse, status_code=status.HTTP_200_OK)
async def get_merchant_own_audit_logs(
    action: Optional[str] = Query(None, description="Filter by action name"),
    resource_type: Optional[str] = Query(None, description="Filter by resource type"),
    category: Optional[str] = Query(None, description="Filter by category (revenue_agent, buyer_agent, commerce, payments, auth, system)"),
    limit: int = Query(50, ge=1, le=100, description="Max logs to return (default 50, max 100)"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    current_user: dict = Depends(require_merchant),
):
    """
    Get historical audit logs strictly scoped to the authenticated merchant actor,
    including related opportunity and commerce events, category filtering, and activity summary stats.
    """
    db = db_manager.get_db()
    merchant_id = None
    if db is not None:
        try:
            merchant = await db.merchants.find_one({"user_id": current_user["id"]})
            if merchant:
                merchant_id = str(merchant.get("_id") or merchant.get("id"))
        except Exception:
            pass

    return await query_audit_logs(
        db=db,
        actor_id=current_user["id"],
        merchant_id=merchant_id,
        action=action,
        resource_type=resource_type,
        category=category,
        limit=limit,
        offset=offset,
        include_summary=True,
    )


@router.get("/products", response_model=ProductListResponse, status_code=status.HTTP_200_OK)
async def get_merchant_owned_products(
    status_filter: Optional[str] = Query(None, description="Filter by status (draft/published/archived)"),
    limit: int = Query(50, ge=1, le=100, description="Max items to return"),
    skip: int = Query(0, ge=0, description="Pagination skip offset"),
    current_user: dict = Depends(require_merchant),
):
    """
    Get products owned strictly by the authenticated merchant.
    """
    db = db_manager.get_db()
    return await product_service.list_merchant_products(
        db, current_user["id"], status_filter, limit, skip
    )


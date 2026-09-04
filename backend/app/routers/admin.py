from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from app.core.database import db_manager
from app.core.dependencies import require_admin
from app.schemas.audit import AuditAction, AuditLogQueryResponse, AuditResourceType
from app.schemas.merchant import MerchantResponse, MerchantStatusUpdate
from app.services.audit_service import query_audit_logs, record_audit_event
from app.services.merchant_service import list_merchants, update_merchant_status

router = APIRouter(prefix="/admin", tags=["Admin Operations"])


@router.get("/merchants", response_model=List[MerchantResponse], status_code=status.HTTP_200_OK)
async def get_all_merchants(
    status: Optional[str] = Query(None, description="Optional status filter: pending, approved, suspended"),
    current_admin: dict = Depends(require_admin),
):
    """
    List all merchants with optional status filtering (Admin only).
    """
    db = db_manager.get_db()
    merchants = await list_merchants(db, status_filter=status)
    return merchants


@router.put("/merchants/{merchant_id}/status", response_model=MerchantResponse, status_code=status.HTTP_200_OK)
async def change_merchant_status(
    merchant_id: str,
    status_update: MerchantStatusUpdate,
    current_admin: dict = Depends(require_admin),
):
    """
    Approve, suspend, or update a merchant's status (Admin only).
    """
    db = db_manager.get_db()
    merchant = await update_merchant_status(db, merchant_id, status_update.status.value)

    action = AuditAction.MERCHANT_APPROVED if status_update.status.value == "approved" else AuditAction.MERCHANT_REJECTED
    await record_audit_event(
        db=db,
        action=action,
        resource_type=AuditResourceType.MERCHANT,
        actor_id=current_admin["id"],
        actor_role="admin",
        resource_id=merchant_id,
        metadata={"new_status": status_update.status.value, "business_name": merchant.get("business_name")},
    )

    return merchant


@router.get("/audit-logs", response_model=AuditLogQueryResponse, status_code=status.HTTP_200_OK)
async def get_admin_audit_logs(
    actor_id: Optional[str] = Query(None, description="Filter by actor ID"),
    action: Optional[str] = Query(None, description="Filter by action name"),
    resource_type: Optional[str] = Query(None, description="Filter by resource type"),
    resource_id: Optional[str] = Query(None, description="Filter by resource ID"),
    result: Optional[str] = Query(None, description="Filter by result (success, failure)"),
    start_date: Optional[str] = Query(None, description="ISO start date filter"),
    end_date: Optional[str] = Query(None, description="ISO end date filter"),
    limit: int = Query(50, ge=1, le=100, description="Max logs to return (default 50, max 100)"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    current_admin: dict = Depends(require_admin),
):
    """
    Query platform-wide historical audit logs with pagination and filters (Admin only).
    Logs are returned newest first.
    """
    db = db_manager.get_db()
    return await query_audit_logs(
        db=db,
        actor_id=actor_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        result=result,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        offset=offset,
    )

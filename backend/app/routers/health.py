from fastapi import APIRouter, HTTPException, status
from app.core.database import db_manager

router = APIRouter(prefix="/health", tags=["Health Checks"])


@router.get("", status_code=status.HTTP_200_OK)
async def get_health():
    """
    General service health check endpoint.
    Task 1 Requirement.
    """
    return {
        "status": "ok",
        "service": "razorreach-backend"
    }


@router.get("/db", status_code=status.HTTP_200_OK)
async def get_db_health():
    """
    Database connection health check endpoint.
    Task 2 Requirement.
    """
    is_healthy = await db_manager.ping()
    if is_healthy:
        return {
            "status": "ok",
            "database": "connected"
        }

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={
            "status": "error",
            "database": "disconnected"
        }
    )

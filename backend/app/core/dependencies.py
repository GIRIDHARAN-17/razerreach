from typing import List
from bson import ObjectId
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from app.core.database import db_manager
from app.core.security import decode_access_token
from app.models.user import user_helper
from app.schemas.user import UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """
    Extract and validate authenticated user from JWT Bearer token.
    """
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload["sub"]
    db = db_manager.get_db()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable",
        )

    try:
        query = {"_id": ObjectId(user_id)}
    except Exception:
        query = {"id": user_id}

    try:
        user = await db.users.find_one(query)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable",
        )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User associated with token not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Inactive user account",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user_helper(user)


def require_role(allowed_roles: List[UserRole]):
    """
    Dependency factory to restrict access to specified user roles.
    """
    async def role_checker(current_user: dict = Depends(get_current_user)) -> dict:
        user_role = current_user.get("role")
        if user_role not in [role.value if isinstance(role, UserRole) else role for role in allowed_roles]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation restricted to roles: {[r.value if isinstance(r, UserRole) else r for r in allowed_roles]}",
            )
        return current_user

    return role_checker


require_customer = require_role([UserRole.CUSTOMER])
require_merchant = require_role([UserRole.MERCHANT])
require_admin = require_role([UserRole.ADMIN])

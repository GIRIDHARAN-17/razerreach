from fastapi import APIRouter, Depends, Request, status
from app.core.database import db_manager
from app.core.dependencies import get_current_user
from app.core.security import create_access_token
from app.integrations import firebase as firebase_integration
from app.schemas.audit import AuditAction, AuditResourceType
from app.schemas.user import FirebaseAuthRequest, TokenResponse, UserLogin, UserRegister, UserResponse
from app.services.audit_service import record_audit_event
from app.services.user_service import (
    authenticate_or_create_firebase_user,
    authenticate_user,
    register_user,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserRegister, request: Request):
    """
    Register a new user account (Default role: customer).
    """
    db = db_manager.get_db()
    user = await register_user(db, user_data)
    
    await record_audit_event(
        db=db,
        action=AuditAction.USER_REGISTERED,
        resource_type=AuditResourceType.USER,
        actor_id=user["id"],
        actor_role=user["role"],
        resource_id=user["id"],
        metadata={"email": user["email"], "role": user["role"]},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    
    return user


@router.post("/login", response_model=TokenResponse, status_code=status.HTTP_200_OK)
async def login(credentials: UserLogin, request: Request):
    """
    Authenticate user credentials and issue JWT access token.
    """
    db = db_manager.get_db()
    user = await authenticate_user(db, credentials.email, credentials.password)

    access_token = create_access_token(data={"sub": user["id"], "role": user["role"]})

    await record_audit_event(
        db=db,
        action=AuditAction.USER_LOGIN,
        resource_type=AuditResourceType.USER,
        actor_id=user["id"],
        actor_role=user["role"],
        resource_id=user["id"],
        metadata={"email": user["email"]},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(**user),
    )


@router.post("/firebase", response_model=TokenResponse, status_code=status.HTTP_200_OK)
async def firebase_auth(payload: FirebaseAuthRequest, request: Request):
    """
    Social Authentication via Firebase (Google Sign-In & Apple Sign-In).
    Verifies Firebase ID Token, resolves/creates local RazorReach user, and issues RazorReach JWT.
    """
    db = db_manager.get_db()

    # Step 1: Server-side Firebase ID token verification
    claims = firebase_integration.verify_firebase_id_token(payload.id_token)

    # Step 2: Resolve or create local user
    user, is_new = await authenticate_or_create_firebase_user(db, claims, requested_role=payload.role)

    # Step 3: Issue RazorReach JWT
    access_token = create_access_token(data={"sub": user["id"], "role": user["role"]})

    # Step 4: Record Task 14 audit event
    action = AuditAction.USER_REGISTERED if is_new else AuditAction.USER_LOGIN
    await record_audit_event(
        db=db,
        action=action,
        resource_type=AuditResourceType.USER,
        actor_id=user["id"],
        actor_role=user["role"],
        resource_id=user["id"],
        metadata={
            "auth_method": "firebase",
            "provider": claims.get("provider", "google"),
            "email": user["email"],
        },
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(**user),
    )


@router.get("/me", response_model=UserResponse, status_code=status.HTTP_200_OK)
async def get_me(current_user: dict = Depends(get_current_user)):
    """
    Get profile information of the currently authenticated user.
    """
    return current_user

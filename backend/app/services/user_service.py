import logging
from typing import Optional, Union
from datetime import datetime, timezone
from fastapi import HTTPException, status
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.core.database import db_manager
from app.core.security import hash_password, verify_password
from app.models.user import user_helper
from app.schemas.user import UserRegister, UserRole

logger = logging.getLogger("razorreach.user_service")


async def register_user(db, user_data: UserRegister) -> dict:
    """
    Register a new user in the database after checking email uniqueness.
    """
    if db is None:
        db = db_manager.get_db()

    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable",
        )

    normalized_email = user_data.email.strip().lower()
    try:
        existing_user = await db.users.find_one({"email": normalized_email})
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email address already registered",
            )

        # Ensure role is safe (customer or merchant, defaulting to customer)
        role = user_data.role if user_data.role in [UserRole.CUSTOMER, UserRole.MERCHANT] else UserRole.CUSTOMER

        now = datetime.now(timezone.utc)
        new_user_doc = {
            "name": user_data.name.strip(),
            "email": normalized_email,
            "password_hash": hash_password(user_data.password),
            "role": role.value if isinstance(role, UserRole) else role,
            "is_active": True,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }

        result = await db.users.insert_one(new_user_doc)
        new_user_doc["_id"] = result.inserted_id
        return user_helper(new_user_doc)
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address already registered",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"User registration database error: {type(e).__name__} - {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable",
        )


async def authenticate_user(db, email: str, password: str) -> dict:
    """
    Authenticate user with email and password.
    Returns generic 401 error on failure without exposing email existence.
    """
    if db is None:
        db = db_manager.get_db()

    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable",
        )

    normalized_email = email.strip().lower()
    try:
        user = await db.users.find_one({"email": normalized_email})
    except Exception as e:
        logger.error(f"User lookup database error: {type(e).__name__} - {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable",
        )

    if not user or not verify_password(password, user.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Inactive user account",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user_helper(user)


async def authenticate_or_create_firebase_user(
    db, claims: dict, requested_role: Optional[Union[str, UserRole]] = None
) -> tuple[dict, bool]:
    """
    Authenticate or create a user based on verified Firebase claims.
    Returns tuple: (user_dict, is_new_user: bool)
    Handles safe account linking, role preservation, and active status check.
    For NEW accounts, requested_role is validated and assigned (customer or merchant).
    For EXISTING accounts, existing stored role is ALWAYS preserved intact.
    """
    if db is None:
        db = db_manager.get_db()

    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable",
        )

    firebase_uid = claims["uid"]
    email = claims.get("email")
    email_verified = claims.get("email_verified", False)
    provider = claims.get("provider", "google")
    name = claims.get("name") or (email.split("@")[0] if email else "Social User")
    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        # Step 1: Lookup by firebase_uid
        user = await db.users.find_one({"firebase_uid": firebase_uid})
        if user:
            if not user.get("is_active", True):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="User account is disabled",
                )
            return user_helper(user), False

        # Step 2: Lookup by normalized email for safe account linking
        if email:
            normalized_email = email.strip().lower()
            existing_user = await db.users.find_one({"email": normalized_email})
            if existing_user:
                if not existing_user.get("is_active", True):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="User account is disabled",
                    )

                if not email_verified:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="An account with this email exists, but the external social identity is unverified.",
                    )

                # Link Firebase UID and auth_provider to existing local account (existing role is preserved)
                await db.users.update_one(
                    {"_id": existing_user["_id"]},
                    {"$set": {
                        "firebase_uid": firebase_uid,
                        "auth_provider": provider,
                        "updated_at": now_iso,
                    }},
                )
                updated_user = await db.users.find_one({"_id": existing_user["_id"]})
                return user_helper(updated_user), False

        # Step 3: Validate requested role for new user
        role_str = "customer"
        if requested_role:
            if isinstance(requested_role, UserRole):
                role_val = requested_role.value
            else:
                role_val = str(requested_role).strip().lower()

            if role_val in ["admin", "administrator", "superuser"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Public registration as admin is prohibited",
                )
            elif role_val in ["customer", "merchant"]:
                role_str = role_val

        # Create new user doc
        new_email = email or f"{firebase_uid}@firebase.user"
        new_user_doc = {
            "name": name,
            "email": new_email.strip().lower(),
            "password_hash": None,
            "role": role_str,
            "is_active": True,
            "firebase_uid": firebase_uid,
            "auth_provider": provider,
            "created_at": now_iso,
            "updated_at": now_iso,
        }

        res = await db.users.insert_one(new_user_doc)
        new_user_doc["_id"] = res.inserted_id
        return user_helper(new_user_doc), True

    except HTTPException:
        raise
    except PyMongoError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable",
        )



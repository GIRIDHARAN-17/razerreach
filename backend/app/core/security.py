import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
import bcrypt
import jwt
from app.core.config import settings

logger = logging.getLogger("razorreach.security")


def hash_password(password: str) -> str:
    """
    Hash a plain text password using bcrypt.
    """
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain text password against a stored bcrypt hash.
    """
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception as e:
        logger.warning(f"Password verification error: {type(e).__name__}")
        return False


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT access token containing claims such as user_id, role, and expiration.
    """
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({
        "exp": expire,
        "iat": now
    })

    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )
    return encoded_jwt


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Decode and validate a JWT access token.
    Returns decoded payload dict if valid, None if expired or invalid.
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except jwt.ExpiredSignatureError:
        logger.debug("JWT token has expired.")
        return None
    except jwt.InvalidTokenError as e:
        logger.debug(f"Invalid JWT token: {type(e).__name__}")
        return None

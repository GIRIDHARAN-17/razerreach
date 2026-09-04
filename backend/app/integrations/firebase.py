"""
Firebase Admin SDK Integration — server-side ID Token verification for Google & Apple social sign-in.
Handles safe credential loading, Application Default Credentials, and Google Public Certificate verification.
"""

import json
import logging
import os
from typing import Any, Dict, Optional

from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger("razorreach.firebase_integration")

_firebase_app_initialized = False


def _get_private_key() -> str:
    """Safely format and unescape private key from settings."""
    key = settings.FIREBASE_PRIVATE_KEY or ""
    if "\\n" in key:
        key = key.replace("\\n", "\n")
    return key.strip()


def is_firebase_configured() -> bool:
    """Check if Firebase Admin SDK environment settings are configured."""
    return bool(
        settings.FIREBASE_PROJECT_ID
        or settings.FIREBASE_SERVICE_ACCOUNT_JSON
        or settings.GOOGLE_APPLICATION_CREDENTIALS
        or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    )


def initialize_firebase() -> bool:
    """
    Initialize Firebase Admin SDK singleton.
    Does not crash application startup if configuration is missing.
    Supports Certificate credentials (service account JSON, ADC path, or env vars)
    and Project ID verification fallback.
    """
    global _firebase_app_initialized
    import firebase_admin
    from firebase_admin import credentials

    if _firebase_app_initialized or bool(firebase_admin._apps):
        _firebase_app_initialized = True
        return True

    project_id = settings.FIREBASE_PROJECT_ID or ""
    client_email = settings.FIREBASE_CLIENT_EMAIL or ""
    private_key = _get_private_key()
    service_account_json = (settings.FIREBASE_SERVICE_ACCOUNT_JSON or "").strip()
    google_app_cred_path = (
        settings.GOOGLE_APPLICATION_CREDENTIALS
        or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        or ""
    ).strip()

    if not project_id and not service_account_json and not google_app_cred_path:
        logger.info("Firebase Admin credential configuration check: Missing project ID and credentials.")
        return False

    try:
        cred = None
        # Option 1: Service Account JSON string or file path
        if service_account_json:
            try:
                if service_account_json.startswith("{"):
                    cred_dict = json.loads(service_account_json)
                    cred = credentials.Certificate(cred_dict)
                elif os.path.exists(service_account_json):
                    cred = credentials.Certificate(service_account_json)
            except Exception as e:
                logger.warning(f"Failed to load FIREBASE_SERVICE_ACCOUNT_JSON credential: {e}")

        # Option 2: GOOGLE_APPLICATION_CREDENTIALS file path
        if not cred and google_app_cred_path and os.path.exists(google_app_cred_path):
            try:
                cred = credentials.Certificate(google_app_cred_path)
            except Exception as e:
                logger.warning(f"Failed to load GOOGLE_APPLICATION_CREDENTIALS credential: {e}")

        # Option 3: Private key + client email environment variables
        if not cred and private_key and "-----BEGIN PRIVATE KEY-----" in private_key and client_email:
            try:
                cred = credentials.Certificate({
                    "type": "service_account",
                    "project_id": project_id,
                    "client_email": client_email,
                    "private_key": private_key,
                })
            except Exception as cert_err:
                logger.warning(f"Firebase Certificate initialization from env vars failed: {cert_err}")

        if cred:
            firebase_admin.initialize_app(cred)
            logger.info("Firebase Admin credential configuration detected: Service Account Certificate active.")
            _firebase_app_initialized = True
            return True

        # Fallback for ID token verification using Google's public key metadata
        if project_id:
            try:
                firebase_admin.initialize_app(options={"projectId": project_id})
                logger.info(f"Firebase Admin SDK initialized with Project ID [{project_id}] for ID token verification.")
            except Exception as app_err:
                logger.info(f"Firebase Admin default app exists or notice: {app_err}")
            _firebase_app_initialized = True
            return True

        logger.info("Firebase Admin credentials missing: Unconfigured.")
        return False
    except Exception as e:
        logger.warning(f"Firebase Admin SDK initialization notice ({type(e).__name__}): {str(e)}")
        return False


def _normalize_claims(decoded: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize raw token claims into standard dictionary."""
    firebase_claim = decoded.get("firebase", {})
    sign_in_provider = firebase_claim.get("sign_in_provider", "")

    if sign_in_provider == "google.com":
        provider = "google"
    elif sign_in_provider == "apple.com":
        provider = "apple"
    elif sign_in_provider == "password":
        provider = "email_password"
    else:
        provider = "google"

    email = decoded.get("email")
    if email:
        email = email.strip().lower()

    return {
        "uid": str(decoded.get("uid") or decoded.get("user_id") or decoded.get("sub")),
        "email": email,
        "email_verified": bool(decoded.get("email_verified", False)),
        "name": decoded.get("name") or (email.split("@")[0] if email else "Social User"),
        "picture": decoded.get("picture"),
        "provider": provider,
    }


def verify_firebase_id_token(id_token: str) -> Dict[str, Any]:
    """
    Verify Firebase ID Token using server-side Firebase Admin SDK or Google Public Keys.
    Cryptographically verifies RS256 signature, audience (FIREBASE_PROJECT_ID), issuer, and expiration.
    Returns normalized dictionary of verified claims:
    {
        "uid": str,
        "email": Optional[str],
        "email_verified": bool,
        "name": Optional[str],
        "picture": Optional[str],
        "provider": str ("google", "apple", or "email_password")
    }
    Raises 503 if Firebase is unconfigured, or 401 if token is invalid/expired.
    """
    if not is_firebase_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Firebase authentication service is not configured on backend",
        )

    if not id_token or not isinstance(id_token, str) or not id_token.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Firebase ID Token is required and cannot be empty",
        )

    project_id = settings.FIREBASE_PROJECT_ID or ""
    clean_token = id_token.strip()

    # Step 1: Attempt verification via Firebase Admin SDK
    initialized = initialize_firebase()
    if initialized:
        try:
            from firebase_admin import auth, get_app

            has_service_account = False
            try:
                app_inst = get_app()
                if hasattr(app_inst, "_credential") and getattr(app_inst._credential, "signer", None) is not None:
                    has_service_account = True
            except Exception:
                pass

            decoded = auth.verify_id_token(clean_token, check_revoked=has_service_account, clock_skew_seconds=10)
            return _normalize_claims(decoded)
        except Exception as admin_err:
            admin_err_type = type(admin_err).__name__
            admin_err_msg = str(admin_err)
            logger.info(f"Firebase Admin SDK verification notice ({admin_err_type}): {admin_err_msg}")
            if "expired" in admin_err_msg.lower():
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Firebase ID Token has expired. Please re-authenticate.",
                )
            elif "revoked" in admin_err_msg.lower():
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Firebase ID Token has been revoked.",
                )

    # Step 2: Fallback to Google's official public x509 certificates for Firebase ID tokens
    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests

        req = google_requests.Request()
        decoded = google_id_token.verify_firebase_token(clean_token, req, audience=project_id)
        return _normalize_claims(decoded)
    except ValueError as ve:
        ve_msg = str(ve)
        logger.warning(f"Google public key token verification failed (ValueError): {ve_msg}")
        if "expired" in ve_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Firebase ID Token has expired. Please re-authenticate.",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Firebase ID Token.",
        )
    except Exception as e:
        logger.warning(f"Google public key token verification failed ({type(e).__name__}): {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Firebase ID Token.",
        )

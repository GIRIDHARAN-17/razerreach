from datetime import datetime, timezone
from typing import Any, Dict, Optional
from bson import ObjectId


def user_helper(user: Dict[str, Any]) -> Dict[str, Any]:
    """
    Format raw MongoDB user document into API-friendly dictionary.
    """
    return {
        "id": str(user["_id"]) if "_id" in user else str(user.get("id", "")),
        "name": user.get("name", ""),
        "email": user.get("email", ""),
        "role": user.get("role", "customer"),
        "is_active": user.get("is_active", True),
        "firebase_uid": user.get("firebase_uid"),
        "auth_provider": user.get("auth_provider"),
        "created_at": user.get("created_at"),
        "updated_at": user.get("updated_at"),
    }


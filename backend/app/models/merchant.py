from typing import Any, Dict


def merchant_helper(merchant: Dict[str, Any]) -> Dict[str, Any]:
    """
    Format raw MongoDB merchant document into API-friendly dictionary.
    """
    return {
        "id": str(merchant["_id"]) if "_id" in merchant else str(merchant.get("id", "")),
        "user_id": str(merchant.get("user_id", "")),
        "business_name": merchant.get("business_name", ""),
        "category": merchant.get("category", ""),
        "phone": merchant.get("phone", ""),
        "address": merchant.get("address", {"city": "", "state": ""}),
        "status": merchant.get("status", "pending"),
        "created_at": merchant.get("created_at"),
        "updated_at": merchant.get("updated_at"),
    }

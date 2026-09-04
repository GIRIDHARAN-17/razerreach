from typing import Any, Dict


def order_helper(order: Dict[str, Any]) -> Dict[str, Any]:
    """
    Format raw MongoDB order document into API-friendly dictionary.
    Excludes sensitive/internal database keys.
    """
    items = []
    for item in order.get("items", []):
        unit_price = float(item.get("price_at_purchase", 0))
        qty = int(item.get("quantity", 0))
        items.append({
            "product_id": str(item.get("product_id", "")),
            "name": item.get("name", ""),
            "quantity": qty,
            "price_at_purchase": unit_price,
            "line_total": round(unit_price * qty, 2),
            "image_url": item.get("image_url"),
        })

    return {
        "id": str(order["_id"]) if "_id" in order else str(order.get("id", "")),
        "user_id": str(order.get("user_id", "")),
        "merchant_id": str(order.get("merchant_id", "")),
        "merchant": order.get("merchant_name") or order.get("merchant") or "RazorReach Store",
        "items": items,
        "subtotal": float(order.get("subtotal", 0)),
        "delivery_fee": float(order.get("delivery_fee", 0)),
        "tax": float(order.get("tax", 0)),
        "discount": float(order.get("discount", 0)),
        "total": float(order.get("total", 0)),
        "amount_paise": int(order.get("amount_paise", 0)),
        "currency": order.get("currency", "INR"),
        "status": order.get("status", "payment_pending"),
        "razorpay_order_id": order.get("razorpay_order_id"),
        "created_at": order.get("created_at"),
        "updated_at": order.get("updated_at"),
    }

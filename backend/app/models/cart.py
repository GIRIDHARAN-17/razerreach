from typing import Any, Dict


def cart_helper(cart: Dict[str, Any]) -> Dict[str, Any]:
    """
    Format raw MongoDB cart document into API-friendly dictionary.
    Calculates line totals and excludes internal fields.
    """
    items = []
    for item in cart.get("items", []):
        unit_price = float(item.get("price_snapshot", 0))
        qty = int(item.get("quantity", 0))
        items.append({
            "product_id": str(item.get("product_id", "")),
            "name": item.get("name_snapshot", ""),
            "quantity": qty,
            "unit_price": unit_price,
            "line_total": round(unit_price * qty, 2),
            "image_url": item.get("image_url"),
            "stock_available": item.get("stock_available", True),
        })

    subtotal = float(cart.get("subtotal", 0))
    delivery_fee = float(cart.get("delivery_fee", 0))
    tax = float(cart.get("tax", 0))
    discount = float(cart.get("discount", 0))
    total = float(cart.get("total", 0))

    return {
        "id": str(cart["_id"]) if "_id" in cart else str(cart.get("id", "")),
        "items": items,
        "subtotal": subtotal,
        "delivery_fee": delivery_fee,
        "tax": tax,
        "discount": discount,
        "total": total,
        "currency": cart.get("currency", "INR"),
    }

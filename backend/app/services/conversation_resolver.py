"""
Conversation Resolver Service — Task 16F.
Deterministically resolves conversational references across multi-turn interactions
into verified backend product references, comparison sets, cart items, or refined search intents.
THE LLM NEVER INVENTS OR CONTROLS PRODUCT IDS.
"""

import re
import logging
from enum import Enum
from typing import Any, List, Optional, Tuple
from bson import ObjectId

from app.schemas.agent_state import AgentState, AgentStateEnum
from app.schemas.ai_search import SearchIntent, SearchSort
from app.schemas.agent_decision import AgentAction, AgentDecision

logger = logging.getLogger("razorreach.conversation_resolver")


class ReferenceType(str, Enum):
    ORDINAL = "ORDINAL"
    PRONOUN = "PRONOUN"
    COMPARISON = "COMPARISON"
    PRICE_REFINEMENT = "PRICE_REFINEMENT"
    ATTRIBUTE_REFINEMENT = "ATTRIBUTE_REFINEMENT"
    CART_REFERENCE = "CART_REFERENCE"
    NONE = "NONE"


class ResolvedReference:
    """
    Structured outcome of deterministic reference resolution.
    """
    def __init__(
        self,
        reference_type: ReferenceType = ReferenceType.NONE,
        product_ids: Optional[List[str]] = None,
        source: str = "none",
        confidence: float = 1.0,
        requires_clarification: bool = False,
        clarification_prompt: Optional[str] = None,
        refined_intent: Optional[SearchIntent] = None,
        target_price_filter: Optional[float] = None,
    ):
        self.reference_type = reference_type
        self.product_ids = product_ids or []
        self.source = source
        self.confidence = confidence
        self.requires_clarification = requires_clarification
        self.clarification_prompt = clarification_prompt
        self.refined_intent = refined_intent
        self.target_price_filter = target_price_filter


# Ordinal word mappings
ORDINAL_MAP = {
    "first": 0,
    "1st": 0,
    "second": 1,
    "2nd": 1,
    "third": 2,
    "3rd": 2,
    "fourth": 3,
    "4th": 3,
    "fifth": 4,
    "5th": 4,
}

COLORS = {
    "black", "white", "blue", "red", "green", "grey", "gray", "silver", "gold", "brown", "pink", "yellow"
}


async def resolve_reference(
    db: Any,
    agent_state: AgentState,
    message: str,
    user_id: str,
    decision: Optional[AgentDecision] = None,
) -> ResolvedReference:
    """
    Deterministically resolves conversational references in a user message.
    Operates strictly against session context, bounded candidate sets, and live DB.
    """
    msg = message.strip().lower()
    candidates = agent_state.candidate_product_ids or []
    comparison_ids = agent_state.comparison_product_ids or []

    # 1. Check for multi-item comparison references ("first two", "top 2", "compare first two")
    multi_ord = _parse_multi_ordinal(msg)
    if multi_ord is not None:
        count = multi_ord
        if len(candidates) < count:
            return ResolvedReference(
                reference_type=ReferenceType.ORDINAL,
                requires_clarification=True,
                clarification_prompt=f"There are only {len(candidates)} products available. Which ones would you like to compare?",
            )
        resolved_pids = candidates[:count]
        return ResolvedReference(
            reference_type=ReferenceType.ORDINAL,
            product_ids=resolved_pids,
            source="candidates",
        )

    # 2. Check for single ordinal references ("first", "second", "third", "last", "2nd")
    ord_idx = _parse_single_ordinal(msg)
    if ord_idx is not None:
        # Check if in comparison context
        pool = comparison_ids if (agent_state.current_state == AgentStateEnum.COMPARING and comparison_ids) else candidates
        pool_name = "comparison" if pool == comparison_ids else "candidates"

        if ord_idx == -1:  # "last"
            if not pool:
                return ResolvedReference(
                    reference_type=ReferenceType.ORDINAL,
                    requires_clarification=True,
                    clarification_prompt="There are no products currently listed. Which product are you looking for?",
                )
            target = pool[-1]
            return ResolvedReference(
                reference_type=ReferenceType.ORDINAL,
                product_ids=[target],
                source=pool_name,
            )

        if ord_idx >= len(pool):
            return ResolvedReference(
                reference_type=ReferenceType.ORDINAL,
                requires_clarification=True,
                clarification_prompt=f"There are only {len(pool)} products displayed. Which one would you prefer?",
            )

        target = pool[ord_idx]
        return ResolvedReference(
            reference_type=ReferenceType.ORDINAL,
            product_ids=[target],
            source=pool_name,
        )

    # 3. Check for "other one" (comparison exclusion)
    if "other one" in msg or "the other" in msg:
        if comparison_ids and len(comparison_ids) >= 2:
            sel = agent_state.selected_product_id
            remaining = [p for p in comparison_ids if p != sel]
            if remaining:
                return ResolvedReference(
                    reference_type=ReferenceType.COMPARISON,
                    product_ids=[remaining[0]],
                    source="comparison",
                )
        elif len(candidates) == 2:
            sel = agent_state.selected_product_id
            remaining = [p for p in candidates if p != sel]
            if remaining:
                return ResolvedReference(
                    reference_type=ReferenceType.COMPARISON,
                    product_ids=[remaining[0]],
                    source="candidates",
                )
        return ResolvedReference(
            reference_type=ReferenceType.COMPARISON,
            requires_clarification=True,
            clarification_prompt="Which other product are you referring to?",
        )

    # 4. Check for Cart references ("remove the previous item", "previous item", "that item in cart")
    if any(phrase in msg for phrase in ["previous item", "last item", "previous cart item", "remove that item"]):
        if agent_state.last_cart_product_id:
            return ResolvedReference(
                reference_type=ReferenceType.CART_REFERENCE,
                product_ids=[agent_state.last_cart_product_id],
                source="last_cart",
            )
        # Check active cart
        if db is not None:
            from app.services import cart_service
            try:
                active_cart = await cart_service.get_active_cart(db, user_id)
                items = active_cart.get("items", [])
                if len(items) == 1:
                    return ResolvedReference(
                        reference_type=ReferenceType.CART_REFERENCE,
                        product_ids=[str(items[0].get("product_id"))],
                        source="cart",
                    )
                elif len(items) > 1:
                    return ResolvedReference(
                        reference_type=ReferenceType.CART_REFERENCE,
                        requires_clarification=True,
                        clarification_prompt="Which item from your cart would you like to update or remove?",
                    )
                else:
                    return ResolvedReference(
                        reference_type=ReferenceType.CART_REFERENCE,
                        requires_clarification=True,
                        clarification_prompt="Your cart is currently empty.",
                    )
            except Exception:
                pass
        return ResolvedReference(
            reference_type=ReferenceType.CART_REFERENCE,
            requires_clarification=True,
            clarification_prompt="Which item would you like to update?",
        )

    # 5. Check for Price follow-up references ("cheaper than that", "cheaper ones", "anything cheaper", "more expensive")
    if "cheaper than" in msg:
        # Reference is a specific previous product
        ref_pid = (
            agent_state.selected_product_id
            or agent_state.last_referenced_product_id
            or (candidates[0] if candidates else None)
        )
        if not ref_pid:
            return ResolvedReference(
                reference_type=ReferenceType.PRICE_REFINEMENT,
                requires_clarification=True,
                clarification_prompt="Which product would you like something cheaper than?",
            )

        live_prod = await _get_product_safe(db, ref_pid)
        if not live_prod:
            return ResolvedReference(
                reference_type=ReferenceType.PRICE_REFINEMENT,
                requires_clarification=True,
                clarification_prompt="The referenced product is no longer available. What price range are you looking for?",
            )

        live_price = float(live_prod.get("price", 0))
        prev_intent = agent_state.intent or SearchIntent(search_text=live_prod.get("name", ""))
        refined = SearchIntent(
            search_text=prev_intent.search_text,
            category=prev_intent.category,
            color=prev_intent.color,
            brand=prev_intent.brand,
            min_price=prev_intent.min_price,
            max_price=live_price - 1 if live_price > 1 else live_price,
            required_features=prev_intent.required_features,
            sort=SearchSort.PRICE_LOW,
        )
        return ResolvedReference(
            reference_type=ReferenceType.PRICE_REFINEMENT,
            source="product_price",
            refined_intent=refined,
            target_price_filter=live_price,
        )

    elif any(term in msg for term in ["cheaper ones", "cheaper", "cheapest", "cheaper option", "anything cheaper"]):
        if not agent_state.intent and not candidates:
            return ResolvedReference(
                reference_type=ReferenceType.PRICE_REFINEMENT,
                requires_clarification=True,
                clarification_prompt="What kind of products would you like to find cheaper options for?",
            )

        # Retrieve live prices of current candidates if available
        min_seen = None
        if candidates and db is not None:
            for c_id in candidates[:5]:
                p = await _get_product_safe(db, c_id)
                if p:
                    pr = float(p.get("price", 0))
                    if min_seen is None or pr < min_seen:
                        min_seen = pr

        prev_intent = agent_state.intent or SearchIntent(search_text="products")
        refined = SearchIntent(
            search_text=prev_intent.search_text,
            category=prev_intent.category,
            color=prev_intent.color,
            brand=prev_intent.brand,
            min_price=prev_intent.min_price,
            max_price=min_seen if min_seen is not None else prev_intent.max_price,
            required_features=prev_intent.required_features,
            sort=SearchSort.PRICE_LOW,
        )
        return ResolvedReference(
            reference_type=ReferenceType.PRICE_REFINEMENT,
            source="candidate_prices",
            refined_intent=refined,
            target_price_filter=min_seen,
        )

    elif any(term in msg for term in ["more expensive", "premium ones", "higher end"]):
        prev_intent = agent_state.intent or SearchIntent(search_text="products")
        refined = SearchIntent(
            search_text=prev_intent.search_text,
            category=prev_intent.category,
            color=prev_intent.color,
            brand=prev_intent.brand,
            min_price=prev_intent.max_price or 1000,
            max_price=None,
            required_features=prev_intent.required_features,
            sort=SearchSort.PRICE_HIGH,
        )
        return ResolvedReference(
            reference_type=ReferenceType.PRICE_REFINEMENT,
            source="price_high",
            refined_intent=refined,
        )

    # 6. Check for Attribute Refinements ("make it black", "only wireless ones", "something with usb-c")
    refinement = _parse_attribute_refinement(msg, agent_state.intent)
    if refinement is not None:
        if not agent_state.intent and not candidates:
            if any(p in msg for p in ["make it", "change to", "switch to", "customize", "only "]):
                return ResolvedReference(
                    reference_type=ReferenceType.ATTRIBUTE_REFINEMENT,
                    requires_clarification=True,
                    clarification_prompt="What product would you like to customize?",
                )
        else:
            return ResolvedReference(
                reference_type=ReferenceType.ATTRIBUTE_REFINEMENT,
                source="intent_refinement",
                refined_intent=refinement,
            )

    # 7. Check for Pronouns ("that", "this", "it", "those", "these", "ones")
    has_pronoun = any(
        re.search(rf"\b{pr}\b", msg)
        for pr in ["that", "this", "it", "those", "these", "the item", "this product", "that product"]
    )
    if has_pronoun:
        # Precedence:
        # 1. selected_product_id
        # 2. last_referenced_product_id
        # 3. single candidate
        target_pid = (
            agent_state.selected_product_id
            or agent_state.last_referenced_product_id
            or (candidates[0] if len(candidates) == 1 else None)
        )
        if not target_pid and decision and decision.target_product_id:
            prod_check = await _get_product_safe(db, decision.target_product_id)
            if prod_check:
                target_pid = decision.target_product_id

        if target_pid:
            return ResolvedReference(
                reference_type=ReferenceType.PRONOUN,
                product_ids=[target_pid],
                source="selected_or_last_referenced",
            )
        elif len(candidates) > 1:
            return ResolvedReference(
                reference_type=ReferenceType.PRONOUN,
                requires_clarification=True,
                clarification_prompt="Which of the displayed products do you mean?",
            )
        else:
            return ResolvedReference(
                reference_type=ReferenceType.PRONOUN,
                requires_clarification=True,
                clarification_prompt="Which product are you referring to?",
            )

    # No specific conversational reference detected
    return ResolvedReference(
        reference_type=ReferenceType.NONE,
        product_ids=[],
        source="none",
    )


def _parse_multi_ordinal(msg: str) -> Optional[int]:
    """Detects requests for multiple items like 'first two', 'top 2', 'first 3'."""
    match = re.search(r"\b(?:first|top)\s+(\d+|two|three|four|five)\b", msg)
    if match:
        val = match.group(1)
        word_map = {"two": 2, "three": 3, "four": 4, "five": 5}
        if val in word_map:
            return word_map[val]
        try:
            return int(val)
        except ValueError:
            return None
    return None


def _parse_single_ordinal(msg: str) -> Optional[int]:
    """Detects requests for a single item ordinal like 'first', 'second', '2nd', 'last'."""
    if re.search(r"\blast(?:\s+one)?\b", msg):
        return -1

    for word, idx in ORDINAL_MAP.items():
        if re.search(rf"\b{word}(?:\s+one)?\b", msg):
            return idx
    return None


def _parse_attribute_refinement(msg: str, prev_intent: Optional[SearchIntent]) -> Optional[SearchIntent]:
    """Extracts color, feature, or brand adjustments from user message."""
    color_found = None
    for c in COLORS:
        if re.search(rf"\b{c}\b", msg):
            color_found = c
            break

    # Feature adjustments
    feature_found = None
    feature_patterns = ["wireless", "bluetooth", "usb-c", "leather", "cotton", "ergonomic", "waterproof"]
    for f in feature_patterns:
        if f in msg:
            feature_found = f
            break

    if not color_found and not feature_found:
        return None

    prev = prev_intent or SearchIntent(search_text=msg)
    new_features = list(prev.required_features)
    if feature_found and feature_found not in new_features:
        new_features.append(feature_found)

    return SearchIntent(
        search_text=prev.search_text,
        category=prev.category,
        color=color_found or prev.color,
        brand=prev.brand,
        min_price=prev.min_price,
        max_price=prev.max_price,
        required_features=new_features,
        sort=prev.sort,
    )


async def _get_product_safe(db: Any, product_id: str) -> Optional[dict]:
    """Authoritative lookup in live DB."""
    if db is None or not product_id:
        return None
    try:
        query = {"_id": ObjectId(product_id)} if ObjectId.is_valid(product_id) else {"_id": product_id}
        return await db.products.find_one(query)
    except Exception:
        return None

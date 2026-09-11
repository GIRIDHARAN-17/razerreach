"""
Focused Unit Tests for Task 22B — Buyer Agent: Intent Shift Handling,
Context-Safe Conversation, and Adaptive Preference Discovery.
Verifies intent classification (REFINEMENT, NEW_INTENT, AMBIGUOUS),
controlled SearchIntent merging, context reset, and reference safety.
"""

import pytest
from typing import Any, Dict, List
from unittest.mock import MagicMock

from app.schemas.ai_search import SearchIntent, SearchSort, IntentRelation
from app.schemas.agent_state import AgentState
from app.services.ai_resilience import (
    classify_intent_relation,
    merge_search_intent,
    deterministic_search_intent,
    evaluate_preference_sufficiency,
)
from app.services import conversation_resolver


# =========================================================================
# TEST SCENARIOS A through Z
# =========================================================================

def test_A_basic_refinement():
    prev = SearchIntent(category="laptops")
    current = SearchIntent(max_price=60000.0)
    merged = merge_search_intent(prev, current, IntentRelation.REFINEMENT)
    assert merged.category == "laptops"
    assert merged.max_price == 60000.0


def test_B_price_refinement():
    prev = SearchIntent(category="laptops", max_price=60000.0)
    current = SearchIntent(max_price=50000.0)
    merged = merge_search_intent(prev, current, IntentRelation.REFINEMENT)
    assert merged.category == "laptops"
    assert merged.max_price == 50000.0


def test_C_use_case_refinement():
    prev = SearchIntent(category="laptops", max_price=60000.0)
    current = SearchIntent(use_case="coding")
    merged = merge_search_intent(prev, current, IntentRelation.REFINEMENT)
    assert merged.category == "laptops"
    assert merged.max_price == 60000.0
    assert merged.use_case == "coding"


def test_D_color_refinement():
    prev = SearchIntent(category="laptops", max_price=60000.0)
    current = SearchIntent(color="black")
    merged = merge_search_intent(prev, current, IntentRelation.REFINEMENT)
    assert merged.category == "laptops"
    assert merged.max_price == 60000.0
    assert merged.color == "black"


def test_E_and_W_explicit_constraint_replacement():
    prev = SearchIntent(category="laptops", max_price=60000.0)
    current = SearchIntent(max_price=80000.0)
    merged = merge_search_intent(prev, current, IntentRelation.REFINEMENT)
    assert merged.max_price == 80000.0  # Replaced 60000!


def test_F_new_category_intent():
    prev = SearchIntent(category="laptops", max_price=100000.0, required_features=["16GB RAM"])
    rel = classify_intent_relation("I need shoes", prev)
    assert rel == IntentRelation.NEW_INTENT

    current = SearchIntent(category="shoes")
    merged = merge_search_intent(prev, current, rel)
    assert merged.category == "shoes"
    assert merged.max_price is None  # Stale 100k not carried over!
    assert merged.required_features == []  # Stale RAM requirement not carried over!


def test_G_laptop_to_laptop_stand_intent_shift():
    prev = SearchIntent(category="laptops", max_price=100000.0, required_features=["16GB RAM"])
    rel = classify_intent_relation("I need a laptop stand for my laptop", prev)
    assert rel == IntentRelation.NEW_INTENT

    intent = deterministic_search_intent("I need a laptop stand for my laptop", previous_intent=prev)
    assert intent.intent_relation == IntentRelation.NEW_INTENT
    assert intent.max_price is None  # 100k price dropped!
    assert intent.required_features == []  # 16GB RAM dropped!


def test_H_laptop_to_shoes_intent_shift():
    prev = SearchIntent(category="laptops", max_price=60000.0)
    rel = classify_intent_relation("actually, I need running shoes", prev)
    assert rel == IntentRelation.NEW_INTENT


def test_I_explicit_actually_intent_shift():
    prev = SearchIntent(category="laptops")
    rel = classify_intent_relation("actually, show me headphones", prev)
    assert rel == IntentRelation.NEW_INTENT


def test_J_explicit_forget_that_intent_shift():
    prev = SearchIntent(category="laptops", max_price=60000.0)
    rel = classify_intent_relation("forget that, show me backpacks", prev)
    assert rel == IntentRelation.NEW_INTENT


def test_K_ambiguous_something_for_college():
    prev = SearchIntent(category="laptops")
    rel = classify_intent_relation("something for college", prev)
    assert rel == IntentRelation.AMBIGUOUS

    intent = deterministic_search_intent("something for college", previous_intent=prev)
    assert intent.intent_relation == IntentRelation.AMBIGUOUS

    is_suff, field, quest = evaluate_preference_sufficiency(intent, "something for college")
    assert is_suff is False
    assert field == "ambiguous_intent"
    assert "college" in quest.lower()


def test_L_M_N_O_context_reset_on_new_intent():
    state = AgentState(user_id="u1", session_id="s1")
    state.candidate_product_ids = ["p1", "p2"]
    state.selected_product_id = "p1"
    state.comparison_product_ids = ["p1", "p2"]
    state.last_referenced_product_id = "p1"

    # Simulating NEW_INTENT reset
    state.candidate_product_ids = []
    state.selected_product_id = None
    state.comparison_product_ids = []
    state.last_referenced_product_id = None

    assert state.candidate_product_ids == []
    assert state.selected_product_id is None
    assert state.comparison_product_ids == []
    assert state.last_referenced_product_id is None


def test_P_cart_preserved_on_new_intent():
    """Cart ID and cart state are preserved when user starts a new intent search."""
    state = AgentState(user_id="u1", session_id="s1", cart_id="cart_123")
    # Reset candidate search state for NEW_INTENT
    state.candidate_product_ids = []
    state.selected_product_id = None

    assert state.cart_id == "cart_123"  # Cart ID intact!


@pytest.mark.anyio
async def test_Q_reference_resolver_works_after_refinement():
    state = AgentState(user_id="u1", session_id="s1")
    state.candidate_product_ids = ["p_laptop_1", "p_laptop_2"]

    resolved = await conversation_resolver.resolve_reference(
        db=None,
        agent_state=state,
        message="show me the second one",
        user_id="u1",
    )
    assert resolved.requires_clarification is False
    assert resolved.product_ids == ["p_laptop_2"]


@pytest.mark.anyio
async def test_R_old_references_invalid_after_new_intent():
    state = AgentState(user_id="u1", session_id="s1")
    # Cleared candidate IDs after NEW_INTENT
    state.candidate_product_ids = []

    resolved = await conversation_resolver.resolve_reference(
        db=None,
        agent_state=state,
        message="show me the second one",
        user_id="u1",
    )
    assert resolved.requires_clarification is True


def test_S_immediate_search_when_enough_information():
    intent = SearchIntent(
        category="laptops",
        max_price=70000.0,
        use_case="gaming",
        required_features=["16GB RAM"]
    )
    is_suff, field, quest = evaluate_preference_sufficiency(intent, "gaming laptop under 70,000 with 16GB RAM")
    assert is_suff is True
    assert quest is None


def test_T_clarification_when_genuinely_insufficient():
    intent = SearchIntent(category="laptops")
    is_suff, field, quest = evaluate_preference_sufficiency(intent, "I need a laptop")
    assert is_suff is False
    assert field == "budget"
    assert "budget" in quest.lower()


def test_U_ai_fallback_intent_shift_behavior():
    prev = SearchIntent(category="laptops", max_price=100000.0)
    intent = deterministic_search_intent("I need a laptop stand", previous_intent=prev)
    assert intent.intent_relation == IntentRelation.NEW_INTENT
    assert intent.max_price is None


def test_X_explicit_color_replacement():
    prev = SearchIntent(category="laptops", color="black")
    current = SearchIntent(color="white")
    merged = merge_search_intent(prev, current, IntentRelation.REFINEMENT)
    assert merged.color == "white"


def test_Z_no_regression_task_22A():
    from app.agents.tools.buyer_tools import verify_product_hard_constraints
    intent = SearchIntent(category="laptops", color="black", max_price=60000.0)
    matching = {
        "_id": "p1",
        "name": "GameForge 16",
        "category": "Laptops",
        "price": 59999.0,
        "color": "Black",
        "status": "published",
    }
    non_matching = {
        "_id": "p2",
        "name": "NovaBook Pro 14",
        "category": "Laptops",
        "price": 59999.0,
        "color": "Silver",
        "status": "published",
    }
    assert verify_product_hard_constraints(matching, intent) is True
    assert verify_product_hard_constraints(non_matching, intent) is False

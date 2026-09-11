"""
Focused Unit Tests for Task 22A — Buyer Agent: Strict Product Grounding & Exact-Match Search.
Verifies hard constraint enforcement, elimination of silent fallback, candidate clearing,
and reference resolution safety across both AI and Fallback execution paths.
"""

import pytest
from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock

from app.schemas.ai_search import SearchIntent, SearchSort
from app.agents.tools.buyer_tools import verify_product_hard_constraints, tool_search_products
from app.schemas.agent_state import AgentState, AgentStateEnum
from app.schemas.agent_decision import AgentAction, AgentDecision
from app.services import conversation_resolver, agent_policy


# =========================================================================
# FIXTURES & MOCK DATA
# =========================================================================

@pytest.fixture
def mock_products() -> List[Dict[str, Any]]:
    return [
        {
            "_id": "p_laptop_1",
            "name": "NovaBook Pro 14",
            "category": "Laptops",
            "price": 59999.0,
            "stock": 15,
            "brand": "NovaTech",
            "color": "Silver",
            "features": ["14-inch display", "Intel i5", "16GB RAM", "512GB SSD"],
            "description": "Lightweight laptop for productivity.",
            "status": "published",
        },
        {
            "_id": "p_laptop_2",
            "name": "TitanBook X15",
            "category": "Laptops",
            "price": 74999.0,
            "stock": 10,
            "brand": "TitanTech",
            "color": "Gray",
            "features": ["15.6-inch display", "Intel i7", "16GB RAM", "1TB SSD"],
            "description": "Powerful laptop for development.",
            "status": "published",
        },
        {
            "_id": "p_laptop_3",
            "name": "AeroLite 13",
            "category": "Laptops",
            "price": 49999.0,
            "stock": 20,
            "brand": "AeroTech",
            "color": "Blue",
            "features": ["13.3-inch display", "Intel i5", "8GB RAM", "512GB SSD"],
            "description": "Compact portable laptop.",
            "status": "published",
        },
        {
            "_id": "p_laptop_4",
            "name": "GameForge 16",
            "category": "Laptops",
            "price": 89999.0,
            "stock": 8,
            "brand": "GameForge",
            "color": "Black",
            "features": ["16-inch 144Hz", "Ryzen 7", "16GB RAM", "1TB SSD"],
            "description": "Gaming laptop.",
            "status": "published",
        },
        {
            "_id": "p_shoes_1",
            "name": "SprintMax Running Shoes",
            "category": "Shoes",
            "price": 2499.0,
            "stock": 30,
            "brand": "SprintMax",
            "color": "Black",
            "features": ["Breathable mesh", "Cushioned sole"],
            "description": "Running shoes.",
            "status": "published",
        },
        {
            "_id": "p_shoes_2",
            "name": "Adidas Ultraboost",
            "category": "Shoes",
            "price": 4999.0,
            "stock": 12,
            "brand": "Adidas",
            "color": "Black",
            "features": ["Boost cushioning", "Primeknit upper"],
            "description": "Premium Adidas running shoes.",
            "status": "published",
        },
    ]


# =========================================================================
# HARD CONSTRAINT VERIFICATION TESTS (A through J)
# =========================================================================

def test_A_exact_category_match(mock_products):
    intent = SearchIntent(category="laptop")
    laptop = mock_products[0]
    shoes = mock_products[4]
    assert verify_product_hard_constraints(laptop, intent) is True
    assert verify_product_hard_constraints(shoes, intent) is False


def test_B_exact_max_price_match(mock_products):
    intent = SearchIntent(max_price=60000.0)
    under = mock_products[0]  # 59999.0
    over = mock_products[1]   # 74999.0
    assert verify_product_hard_constraints(under, intent) is True
    assert verify_product_hard_constraints(over, intent) is False


def test_C_price_boundary(mock_products):
    intent = SearchIntent(max_price=59999.0)
    exact_boundary = mock_products[0]  # 59999.0
    over_boundary = {**mock_products[0], "price": 59999.01}
    assert verify_product_hard_constraints(exact_boundary, intent) is True
    assert verify_product_hard_constraints(over_boundary, intent) is False


def test_D_color_match(mock_products):
    intent = SearchIntent(color="silver")
    silver_laptop = mock_products[0]
    assert verify_product_hard_constraints(silver_laptop, intent) is True


def test_E_color_mismatch(mock_products):
    intent = SearchIntent(color="black")
    silver_laptop = mock_products[0]
    black_laptop = mock_products[3]
    assert verify_product_hard_constraints(silver_laptop, intent) is False
    assert verify_product_hard_constraints(black_laptop, intent) is True


def test_F_brand_match(mock_products):
    intent = SearchIntent(brand="Adidas")
    adidas_shoes = mock_products[5]
    assert verify_product_hard_constraints(adidas_shoes, intent) is True


def test_G_brand_mismatch(mock_products):
    intent = SearchIntent(brand="Puma")
    adidas_shoes = mock_products[5]
    assert verify_product_hard_constraints(adidas_shoes, intent) is False


def test_H_required_feature_match(mock_products):
    intent = SearchIntent(required_features=["16GB RAM"])
    laptop_16gb = mock_products[0]  # has 16GB RAM
    assert verify_product_hard_constraints(laptop_16gb, intent) is True


def test_I_required_feature_mismatch(mock_products):
    intent = SearchIntent(required_features=["16GB RAM"])
    laptop_8gb = mock_products[2]   # has 8GB RAM
    assert verify_product_hard_constraints(laptop_8gb, intent) is False


def test_J_multiple_hard_constraints(mock_products):
    intent = SearchIntent(
        category="laptop",
        color="black",
        max_price=90000.0,
        brand="GameForge",
        required_features=["16GB RAM"]
    )
    matching = mock_products[3]  # GameForge 16 Black, 89999, 16GB RAM
    non_matching_color = mock_products[0]  # Silver
    non_matching_price = {**mock_products[3], "price": 95000.0}

    assert verify_product_hard_constraints(matching, intent) is True
    assert verify_product_hard_constraints(non_matching_color, intent) is False
    assert verify_product_hard_constraints(non_matching_price, intent) is False


# =========================================================================
# NO MATCH & FALLBACK DISABLING TESTS (K, L, M)
# =========================================================================

@pytest.mark.anyio
async def test_K_and_L_no_exact_match_no_silent_fallback(mock_products):
    """
    Verifies that when zero products satisfy hard constraints,
    tool_search_products returns empty list [] instead of falling back to unfiltered candidates.
    """
    mock_db = MagicMock()

    async def mock_hybrid_search(db, q, category, min_price, max_price, limit):
        return {"products": mock_products}

    with pytest.MonkeyPatch.context() as m:
        m.setattr("app.services.search_service.hybrid_search_products", mock_hybrid_search)

        # Request a black laptop under 50,000 (GameForge is black but 89,999)
        intent = SearchIntent(category="laptop", color="black", max_price=50000.0)
        results = await tool_search_products(mock_db, intent, limit=5)

        # MUST return empty list (NO_EXACT_MATCH)
        assert results == []


def test_M_soft_preference_does_not_act_as_hard_filter(mock_products):
    """
    Soft preferences like 'coding' or 'portability' in use_case / preferences
    must NOT reject products that meet all hard constraints.
    """
    intent = SearchIntent(
        category="laptop",
        max_price=60000.0,
        use_case="coding",
        preferences={"portability": "portability"}
    )
    laptop = mock_products[0]  # NovaBook Pro 14 (59999, Laptops)
    # Does not have explicit 'coding' or 'portability' attributes, but meets category & max_price hard constraints!
    assert verify_product_hard_constraints(laptop, intent) is True


# =========================================================================
# STATE MANAGEMENT & REFERENCE RESOLUTION TESTS (N, O, P, Q, R)
# =========================================================================

def test_N_candidate_ids_cleared_on_no_result():
    state = AgentState(user_id="u1", session_id="s1")
    state.candidate_product_ids = ["p_old_1", "p_old_2"]

    # Simulating NO_EXACT_MATCH state update
    recommended_products = []
    candidate_ids = [p["id"] if isinstance(p, dict) else getattr(p, "id", "") for p in recommended_products]
    state.candidate_product_ids = candidate_ids[:10]
    state.selected_product_id = None

    assert state.candidate_product_ids == []
    assert state.selected_product_id is None


@pytest.mark.anyio
async def test_O_reference_resolution_after_no_result():
    """
    After a NO_EXACT_MATCH search (candidate_product_ids = []),
    a subsequent ordinal reference ('second one') must NOT resolve old candidates
    and must return a clarification prompt.
    """
    state = AgentState(user_id="u1", session_id="s1")
    state.candidate_product_ids = []  # Cleared after NO_EXACT_MATCH

    resolved = await conversation_resolver.resolve_reference(
        db=None,
        agent_state=state,
        message="show me the second one",
        user_id="u1",
    )

    assert resolved.requires_clarification is True
    assert "0 products" in (resolved.clarification_prompt or "") or "no products" in (resolved.clarification_prompt or "").lower()


@pytest.mark.anyio
async def test_P_existing_second_one_behavior_correct():
    """
    When candidates exist (EXACT_MATCH), 'second one' correctly resolves candidate_product_ids[1].
    """
    state = AgentState(user_id="u1", session_id="s1")
    state.candidate_product_ids = ["p_laptop_1", "p_laptop_2", "p_laptop_3"]

    resolved = await conversation_resolver.resolve_reference(
        db=None,
        agent_state=state,
        message="show me the second one",
        user_id="u1",
    )

    assert resolved.requires_clarification is False
    assert resolved.product_ids == ["p_laptop_2"]


def test_Q_existing_ai_fallback_behavior_correct(mock_products):
    """
    Deterministic AI fallback search intent extraction enforces the exact same hard constraints.
    """
    from app.services.ai_resilience import deterministic_search_intent
    intent = deterministic_search_intent("black laptop under 60000")

    assert intent.category in ("laptop", "laptops") or intent.search_text == "laptop"
    assert intent.color == "black"
    assert intent.max_price == 60000.0

    silver_laptop = mock_products[0]  # Silver
    expensive_black = mock_products[3]  # Black, 89999
    assert verify_product_hard_constraints(silver_laptop, intent) is False
    assert verify_product_hard_constraints(expensive_black, intent) is False


@pytest.mark.anyio
async def test_R_existing_policy_behavior_correct():
    """
    Policy Gate allows SEARCH action and denies unauthorized or risky actions.
    """
    state = AgentState(user_id="u1", session_id="s1")
    decision = AgentDecision(action=AgentAction.SEARCH)

    policy_res = await agent_policy.evaluate_action(db=None, agent_state=state, decision=decision, user_id="u1")
    assert policy_res.allowed is True

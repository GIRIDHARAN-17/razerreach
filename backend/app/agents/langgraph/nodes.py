"""
LangGraph Nodes for RazorReach Buyer Agent (Task 20).
Implements modular, testable graph nodes while delegating domain logic
exclusively to existing authoritative backend services.
"""

import logging
from typing import Any, Dict, List, Optional
from langchain_core.runnables import RunnableConfig

from app.core.config import settings
from app.agents.tools import buyer_tools
from app.agents.tools.buyer_tools import (
    tool_search_products,
    tool_get_product_details,
    tool_compare_products,
    tool_check_inventory,
)
from app.agents.buyer_agent import _build_recommended_products, build_no_exact_match_message, verify_selected_product
from app.integrations import gemini
from app.schemas.agent_decision import (
    AgentAction,
    AgentDecision,
    is_action_allowed,
)
from app.schemas.agent_state import (
    AgentState,
    AgentStateEnum,
    TransitionReason,
    build_agent_context,
)
from app.schemas.ai_search import (
    AIRecommendedProduct,
    SearchIntent,
)
from app.schemas.audit import AuditAction, AuditResourceType
from app.services import agent_policy, conversation_resolver
from app.services.agent_fsm import can_transition, transition_state
from app.services.agent_session_service import get_or_create_agent_session, save_agent_session_atomic
from app.services.analytics_service import record_search_event
from app.services.audit_service import record_audit_event
from app.services.ai_resilience import sanitize_user_response
from app.agents.langgraph.state import BuyerGraphState

logger = logging.getLogger("razorreach.langgraph.nodes")


def _get_db(state: Dict[str, Any], config: Optional[RunnableConfig] = None) -> Any:
    """Helper to safely retrieve non-serializable database client from state or runtime context."""
    if isinstance(state, dict) and state.get("db") is not None:
        return state["db"]
    if config and isinstance(config, dict) and "configurable" in config:
        return config["configurable"].get("db")
    return None


async def node_load_state(state: BuyerGraphState, config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
    """Load or initialize authoritative AgentState and reset turn context."""
    db = _get_db(state, config)
    user_id = state["user_id"]
    session_id = state.get("session_id")
    message = state["message"]

    agent_state, is_new = await get_or_create_agent_session(db, user_id, session_id)

    # Increment turn count ONCE per user turn
    agent_state.turn_count += 1
    agent_state.goal = message[:200]

    # Reset state to START if in terminal or failed state
    if agent_state.current_state in (AgentStateEnum.COMPLETED, AgentStateEnum.FAILED):
        if can_transition(agent_state.current_state, AgentStateEnum.START):
            transition_state(agent_state, AgentStateEnum.START, reason=TransitionReason.SESSION_RESET)

    from app.schemas.ai_search import IntentRelation
    from app.services.ai_resilience import is_fallback_used, deterministic_search_intent
    extracted_intent = deterministic_search_intent(message, previous_intent=agent_state.intent)
    effective_intent = state.get("previous_intent") or extracted_intent
    agent_state.intent = effective_intent

    # On NEW_INTENT relation: reset stale shopping context while preserving cart & session
    if getattr(effective_intent, "intent_relation", None) == IntentRelation.NEW_INTENT:
        agent_state.candidate_product_ids = []
        agent_state.selected_product_id = None
        agent_state.comparison_product_ids = []
        agent_state.last_referenced_product_id = None
        agent_state.preference_context = {}

    # Maintain preference_context in AgentState
    if agent_state.preference_context is None:
        agent_state.preference_context = {}
    if effective_intent.category:
        agent_state.preference_context["category"] = effective_intent.category
    if effective_intent.max_price is not None:
        agent_state.preference_context["max_price"] = effective_intent.max_price
    if effective_intent.use_case:
        agent_state.preference_context["use_case"] = effective_intent.use_case
    if effective_intent.preferences:
        pref_map = dict(agent_state.preference_context.get("preferences", {}))
        pref_map.update(effective_intent.preferences)
        agent_state.preference_context["preferences"] = pref_map

    max_steps = getattr(settings, "MAX_AGENT_STEPS_PER_TURN", 3)

    return {
        "agent_state": agent_state,
        "session_id": agent_state.session_id,
        "effective_intent": effective_intent,
        "step_count": 0,
        "max_steps": max_steps,
        "recommended_products": [],
        "final_message": None,
        "is_terminal": False,
        "fallback_active": is_fallback_used(),
        "requires_clarification": False,
    }



async def node_observe(state: BuyerGraphState) -> Dict[str, Any]:
    """Build context from current agent state and user message."""
    agent_state = state["agent_state"]
    message = state["message"]
    step_count = state.get("step_count", 0) + 1

    return {
        "step_count": step_count,
    }


async def node_decide(state: BuyerGraphState, config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
    """LLM proposes the next structured AgentDecision."""
    from app.services.ai_resilience import is_fallback_used
    if is_fallback_used():
        return {
            "decision": None,
            "fallback_active": True,
        }

    agent_state = state["agent_state"]
    message = state["message"]
    context = build_agent_context(agent_state, message)
    db = _get_db(state, config)
    user_id = state["user_id"]

    try:
        decision = await gemini.decide_buyer_action(context, message)
    except Exception as exc:
        logger.warning(f"Decision node encountered LLM failure: {exc}. Engaging fallback.")
        return {
            "decision": None,
            "fallback_active": True,
            "error": str(exc),
        }

    # Validate decision presence and allowlist
    if not isinstance(decision, AgentDecision) or not is_action_allowed(decision.action):
        logger.warning(f"Unsafe or unrecognized action proposed: '{getattr(decision, 'action', None)}'.")
        return {
            "decision": decision,
            "is_terminal": True,
            "final_message": "I cannot perform the requested action safely. Please try rephrasing your query.",
        }

    # Record operational audit for decision step
    try:
        await record_audit_event(
            db=db,
            action=AuditAction.BUYER_AGENT_DECISION,
            resource_type=AuditResourceType.AI_AGENT,
            actor_id=user_id,
            actor_role="customer",
            metadata={
                "session_id": agent_state.session_id,
                "step_number": state.get("step_count", 1),
                "action": decision.action.value,
                "current_state": agent_state.current_state.value,
                "turn_count": agent_state.turn_count,
            },
        )
    except Exception:
        pass

    return {
        "decision": decision,
        "fallback_active": False,
    }


async def node_resolve_references(state: BuyerGraphState, config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
    """Deterministically resolves customer conversational references before policy check."""
    db = _get_db(state, config)
    agent_state = state["agent_state"]
    message = state["message"]
    user_id = state["user_id"]
    decision = state.get("decision")

    if not decision:
        return {}

    resolved = await conversation_resolver.resolve_reference(
        db=db,
        agent_state=agent_state,
        message=message,
        user_id=user_id,
        decision=decision,
    )

    try:
        await record_audit_event(
            db=db,
            action=AuditAction.BUYER_AGENT_REFERENCE_RESOLVED,
            resource_type=AuditResourceType.AI_AGENT,
            actor_id=user_id,
            actor_role="customer",
            metadata={
                "session_id": agent_state.session_id,
                "reference_type": resolved.reference_type.value,
                "resolved_product_ids": resolved.product_ids[:5],
                "source": resolved.source,
                "requires_clarification": resolved.requires_clarification,
            },
        )
    except Exception:
        pass

    if resolved.requires_clarification:
        agent_state.last_tool = "conversation_resolver"
        agent_state.last_tool_result_summary = "Conversational reference requires clarification"
        agent_state.pending_action = "ASK_CLARIFICATION"
        return {
            "is_terminal": True,
            "requires_clarification": True,
            "final_message": resolved.clarification_prompt or "Which product would you like to select?",
        }

    effective_intent = state.get("effective_intent")
    if resolved.product_ids:
        if len(resolved.product_ids) >= 2:
            decision.action = AgentAction.COMPARE
            decision.target_product_ids = resolved.product_ids
        else:
            decision.target_product_id = resolved.product_ids[0]

    if resolved.refined_intent:
        effective_intent = resolved.refined_intent
        agent_state.intent = effective_intent
        if decision.action != AgentAction.COMPARE:
            decision.action = AgentAction.SEARCH

    return {
        "decision": decision,
        "effective_intent": effective_intent,
    }


async def node_check_information(state: BuyerGraphState, config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
    """
    Evaluates whether accumulated SearchIntent and preference_context have sufficient information to execute catalog search.
    If vague and clarification count < 3, triggers adaptive clarification.
    """
    decision = state.get("decision")
    if not decision or decision.action != AgentAction.SEARCH:
        return {"requires_clarification": False}

    agent_state = state["agent_state"]
    message = state["message"]
    effective_intent = state.get("effective_intent") or agent_state.intent or SearchIntent(search_text=message)

    if not effective_intent.category and message:
        msg_l = message.lower()
        for cat_kw in ["laptop", "phone", "backpack", "shoe", "electronics"]:
            if cat_kw in msg_l:
                effective_intent.category = cat_kw
                break

    from app.services.ai_resilience import evaluate_preference_sufficiency

    is_sufficient, missing_field, question = evaluate_preference_sufficiency(
        intent=effective_intent,
        message=message,
        preference_context=agent_state.preference_context,
        turn_count=agent_state.turn_count,
        clarification_count=agent_state.clarification_count,
    )

    if not is_sufficient and question:
        return {
            "requires_clarification": True,
            "clarification_question": question,
            "missing_preference": missing_field,
            "effective_intent": effective_intent,
        }

    return {"requires_clarification": False, "effective_intent": effective_intent}


async def node_ask_clarification(state: BuyerGraphState, config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
    """
    Executes clarification turn: asks highest-value missing preference question,
    updates AgentState clarification_count and FSM state (UNDERSTANDING), and logs audit event.
    """
    db = _get_db(state, config)
    agent_state = state["agent_state"]
    user_id = state["user_id"]
    effective_intent = state.get("effective_intent") or agent_state.intent or SearchIntent()
    question = state.get("clarification_question") or "Could you please clarify your shopping preferences?"
    missing_field = state.get("missing_preference") or "preferences"

    agent_state.clarification_count += 1
    if can_transition(agent_state.current_state, AgentStateEnum.UNDERSTANDING):
        transition_state(agent_state, AgentStateEnum.UNDERSTANDING, reason=TransitionReason.USER_INTENT_PARSED)

    agent_state.pending_action = "ASK_CLARIFICATION"
    agent_state.last_tool = "ask_clarification"
    agent_state.last_tool_result_summary = f"Asked clarification question for {missing_field}"

    try:
        await record_audit_event(
            db=db,
            action=AuditAction.BUYER_AGENT_CLARIFICATION,
            resource_type=AuditResourceType.AI_AGENT,
            actor_id=user_id,
            actor_role="customer",
            resource_id=agent_state.session_id,
            metadata={
                "session_id": agent_state.session_id,
                "category": effective_intent.category,
                "missing_preference": missing_field,
                "clarification_count": agent_state.clarification_count,
                "turn_count": agent_state.turn_count,
                "current_state": agent_state.current_state.value,
            },
        )
    except Exception:
        pass

    return {
        "final_message": sanitize_user_response(question, default_fallback="Could you please clarify your shopping preferences?"),
        "is_terminal": True,
        "requires_clarification": True,
    }


async def node_policy_gate(state: BuyerGraphState, config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
    """Evaluates proposed decision against deterministic safety policies."""
    db = _get_db(state, config)
    agent_state = state["agent_state"]
    decision = state["decision"]
    user_id = state["user_id"]

    from app.services import agent_policy
    policy = await agent_policy.evaluate_action(db, agent_state, decision, user_id)

    try:
        await record_audit_event(
            db=db,
            action=AuditAction.BUYER_AGENT_POLICY_DECISION,
            resource_type=AuditResourceType.AI_AGENT,
            actor_id=user_id,
            actor_role="customer",
            metadata={
                "session_id": agent_state.session_id,
                "step_number": state.get("step_count", 1),
                "action": decision.action.value,
                "allowed": policy.allowed,
                "reason_code": policy.reason_code.value,
                "risk_level": policy.risk_level.value,
                "current_state": agent_state.current_state.value,
            },
        )
    except Exception:
        pass

    return {
        "policy_decision": policy,
    }


async def node_safe_response(state: BuyerGraphState) -> Dict[str, Any]:
    """Produces safe explanatory message when action is blocked or denied."""
    policy = state.get("policy_decision")
    agent_state = state["agent_state"]

    agent_state.last_tool = "policy_gate"
    agent_state.last_tool_result_summary = f"Policy denied action: {getattr(policy, 'reason_code', 'DENIED')}"

    existing_msg = state.get("final_message")
    if existing_msg:
        safe_msg = existing_msg
    elif policy and getattr(policy, "safe_response", None):
        safe_msg = policy.safe_response
    else:
        safe_msg = "I cannot perform that action directly."

    safe_msg = sanitize_user_response(safe_msg, default_fallback="I cannot perform that action directly.")

    return {
        "final_message": safe_msg,
        "is_terminal": True,
    }


async def node_execute_tool(state: BuyerGraphState, config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
    """Executes the single approved tool deterministically."""
    db = _get_db(state, config)
    agent_state = state["agent_state"]
    decision = state["decision"]
    user_id = state["user_id"]
    message = state["message"]
    effective_intent = state.get("effective_intent")
    action = decision.action
    recommended_products = list(state.get("recommended_products", []))
    final_message = state.get("final_message")
    is_terminal = False

    agent_state.pending_action = None

    # 1. SEARCH
    if action == AgentAction.SEARCH:
        if can_transition(agent_state.current_state, AgentStateEnum.UNDERSTANDING):
            transition_state(agent_state, AgentStateEnum.UNDERSTANDING, reason=TransitionReason.USER_INTENT_PARSED)

        try:
            effective_intent = await gemini.extract_search_intent(message, effective_intent)
            agent_state.intent = effective_intent
        except RuntimeError:
            raise
        except Exception:
            effective_intent = SearchIntent(search_text=message.strip().lower())
            agent_state.intent = effective_intent

        if can_transition(agent_state.current_state, AgentStateEnum.SEARCHING):
            transition_state(agent_state, AgentStateEnum.SEARCHING, reason=TransitionReason.SEARCH_STARTED)

        try:
            db_products = await buyer_tools.tool_search_products(db, effective_intent, limit=5)
            agent_state.last_tool = "tool_search_products"

            if can_transition(agent_state.current_state, AgentStateEnum.SHOWING_RESULTS):
                transition_state(agent_state, AgentStateEnum.SHOWING_RESULTS, reason=TransitionReason.SEARCH_RESULTS_RETURNED)

            recommended_products = await _build_recommended_products(db, db_products, effective_intent)
            candidate_ids = [p.id for p in recommended_products]
            agent_state.candidate_product_ids = candidate_ids[:10]
            agent_state.last_referenced_product_id = candidate_ids[0] if candidate_ids else None
            agent_state.selected_product_id = None
            agent_state.last_tool_result_summary = f"Found {len(recommended_products)} products"

            try:
                await record_search_event(db, user_id, message, len(recommended_products))
            except Exception:
                pass

            if recommended_products:
                final_message = f"Found {len(recommended_products)} product{'s' if len(recommended_products) > 1 else ''} matching your request."
            else:
                final_message = build_no_exact_match_message(effective_intent)
        except Exception as e:
            logger.error(f"Search tool execution failed: {type(e).__name__}")
            if can_transition(agent_state.current_state, AgentStateEnum.FAILED):
                transition_state(agent_state, AgentStateEnum.FAILED, reason=TransitionReason.RECOVERABLE_ERROR)
            agent_state.last_tool_result_summary = "Search tool encountered an error"
            final_message = "Search service is temporarily unavailable."
        is_terminal = True

    # 2. GET_PRODUCT
    elif action == AgentAction.GET_PRODUCT:
        pid = decision.target_product_id or agent_state.selected_product_id or agent_state.last_referenced_product_id
        if pid:
            details = await buyer_tools.tool_get_product_details(db, pid)
            agent_state.last_tool = "tool_get_product_details"
            if details:
                agent_state.selected_product_id = pid
                agent_state.last_referenced_product_id = pid
                if can_transition(agent_state.current_state, AgentStateEnum.PRODUCT_SELECTED):
                    transition_state(agent_state, AgentStateEnum.PRODUCT_SELECTED, reason=TransitionReason.PRODUCT_SELECTED)
                agent_state.last_tool_result_summary = f"Loaded details for {details.get('name')}"
                p_items = await _build_recommended_products(db, [details], effective_intent or SearchIntent())
                recommended_products = p_items
                final_message = f"{details.get('name')}: {details.get('description', '')} (₹{details.get('price', 0):,})"
            else:
                agent_state.last_tool_result_summary = f"Product {pid} not found"
                final_message = f"I could not find details for product {pid}."
        is_terminal = True

    # 3. COMPARE
    elif action == AgentAction.COMPARE:
        pids = decision.target_product_ids or agent_state.candidate_product_ids[:2]
        if len(pids) >= 2:
            comp_data = await buyer_tools.tool_compare_products(db, pids[:5])
            agent_state.last_tool = "tool_compare_products"
            agent_state.comparison_product_ids = pids[:5]
            if can_transition(agent_state.current_state, AgentStateEnum.COMPARING):
                transition_state(agent_state, AgentStateEnum.COMPARING, reason=TransitionReason.COMPARISON_REQUESTED)
            items = comp_data if isinstance(comp_data, list) else comp_data.get("items", [])
            p_items = await _build_recommended_products(db, items, effective_intent or SearchIntent())
            recommended_products = p_items
            agent_state.last_tool_result_summary = f"Compared {len(items)} products"
            final_message = f"Compared {len(items)} products based on specifications and pricing."
        is_terminal = True

    # 4. CHECK_INVENTORY
    elif action == AgentAction.CHECK_INVENTORY:
        pid = decision.target_product_id or agent_state.selected_product_id or agent_state.last_referenced_product_id
        if pid:
            inv = await buyer_tools.tool_check_inventory(db, pid)
            agent_state.last_tool = "tool_check_inventory"
            stock = inv.get("stock", 0)
            avail = inv.get("available", False)
            agent_state.last_tool_result_summary = f"Stock check: {stock} units available"
            final_message = f"Product has {stock} unit{'s' if stock != 1 else ''} available in stock." if avail else "Product is currently out of stock."
        is_terminal = True

    # 5. ADD_TO_CART
    elif action == AgentAction.ADD_TO_CART:
        pid = decision.target_product_id or agent_state.selected_product_id or agent_state.last_referenced_product_id
        qty = decision.quantity or 1
        if pid and user_id != "anonymous":
            prod_details = await tool_get_product_details(db, pid)
            p_name = prod_details.get("name") if prod_details else "item"
            cart = await add_item(db, user_id, pid, qty)
            agent_state.last_cart_product_id = pid
            agent_state.last_referenced_product_id = pid
            agent_state.selected_product_id = pid
            agent_state.last_tool = "add_item"
            agent_state.last_tool_result_summary = f"Added {p_name} to cart"
            if can_transition(agent_state.current_state, AgentStateEnum.CART_REVIEW):
                transition_state(agent_state, AgentStateEnum.CART_REVIEW, reason=TransitionReason.CART_REVIEW_REQUESTED)
            final_message = f"Added {p_name} to your cart. Total: ₹{cart.get('total', 0):,.2f}."
        elif user_id == "anonymous":
            final_message = "Please sign in to add items to your cart."
        is_terminal = True

    # 6. VIEW_CART
    elif action == AgentAction.VIEW_CART:
        if user_id != "anonymous":
            cart = await get_active_cart(db, user_id)
            items = cart.get("items", [])
            agent_state.last_tool = "get_active_cart"
            items_count = len(items)
            total = cart.get("total", 0.0)
            agent_state.last_tool_result_summary = f"Cart items: {items_count}"
            if can_transition(agent_state.current_state, AgentStateEnum.CART_REVIEW):
                transition_state(agent_state, AgentStateEnum.CART_REVIEW, reason=TransitionReason.CART_REVIEW_REQUESTED)
            final_message = f"Your cart contains {items_count} item{'s' if items_count != 1 else ''} totaling ₹{total:,.2f}."
        else:
            final_message = "Please sign in to view your cart."
        is_terminal = True

    # 7. UPDATE_CART
    elif action == AgentAction.UPDATE_CART:
        pid = decision.target_product_id or agent_state.last_cart_product_id
        qty = decision.quantity if decision.quantity is not None else 1
        if pid and user_id != "anonymous":
            cart = await update_item(db, user_id, pid, qty)
            agent_state.last_cart_product_id = pid
            agent_state.last_tool = "update_item"
            agent_state.last_tool_result_summary = f"Updated {pid} to qty {qty}"
            final_message = f"Updated item quantity to {qty}. New total: ₹{cart.get('total', 0):,.2f}."
        is_terminal = True

    # 8. REMOVE_FROM_CART
    elif action == AgentAction.REMOVE_FROM_CART:
        pid = decision.target_product_id or agent_state.last_cart_product_id
        if pid and user_id != "anonymous":
            cart = await remove_item(db, user_id, pid)
            if agent_state.last_cart_product_id == pid:
                agent_state.last_cart_product_id = None
            agent_state.last_tool = "remove_item"
            agent_state.last_tool_result_summary = f"Removed {pid} from cart"
            final_message = f"Removed item from cart. New total: ₹{cart.get('total', 0):,.2f}."
        is_terminal = True

    # 9. SELECT_PRODUCT
    elif action == AgentAction.SELECT_PRODUCT:
        pid = decision.target_product_id or (agent_state.candidate_product_ids[0] if agent_state.candidate_product_ids else None)
        if pid:
            verified = await verify_selected_product(db, pid, agent_state.candidate_product_ids, user_id)
            agent_state.last_tool = "verify_selected_product"
            if verified:
                if can_transition(agent_state.current_state, AgentStateEnum.PRODUCT_SELECTED):
                    transition_state(agent_state, AgentStateEnum.PRODUCT_SELECTED, reason=TransitionReason.PRODUCT_SELECTED)
                agent_state.selected_product_id = pid
                agent_state.last_referenced_product_id = pid
                agent_state.last_tool_result_summary = f"Verified and selected product {pid}"
                final_message = f"Selected product {pid}. You can compare it, check inventory, or add it to your cart."
            else:
                agent_state.last_tool_result_summary = f"Product {pid} failed verification"
                final_message = f"The selected product {pid} is not available or valid in the catalog."
        is_terminal = True

    # 10. PREPARE_CHECKOUT
    elif action == AgentAction.PREPARE_CHECKOUT:
        if can_transition(agent_state.current_state, AgentStateEnum.CHECKOUT_READY):
            transition_state(agent_state, AgentStateEnum.CHECKOUT_READY, reason=TransitionReason.CHECKOUT_PREPARED)
        if can_transition(agent_state.current_state, AgentStateEnum.AWAITING_CONFIRMATION):
            transition_state(agent_state, AgentStateEnum.AWAITING_CONFIRMATION, reason=TransitionReason.CONFIRMATION_REQUIRED)
        agent_state.last_tool = "prepare_checkout"
        agent_state.last_tool_result_summary = "Checkout prepared. Awaiting user payment confirmation."
        agent_state.confirmation_required = True
        final_message = "Your cart is ready for checkout! Please click Checkout to confirm and proceed to payment."
        is_terminal = True

    # 10. RESPOND / ASK_CLARIFICATION
    else:
        agent_state.last_tool = "respond"
        agent_state.last_tool_result_summary = "Responded to user"
        final_message = getattr(decision, "reasoning_summary", None) or "How else can I assist with your shopping today?"
        is_terminal = True

    return {
        "recommended_products": recommended_products,
        "final_message": final_message,
        "effective_intent": effective_intent,
        "is_terminal": is_terminal,
    }


async def node_update_state(state: BuyerGraphState) -> Dict[str, Any]:
    """Updates authoritative AgentState domain fields after tool execution."""
    agent_state = state["agent_state"]
    recommended_products = state.get("recommended_products", [])

    if recommended_products:
        candidate_ids = [p.id for p in recommended_products]
        agent_state.candidate_product_ids = candidate_ids[:10]
        if not agent_state.last_referenced_product_id and candidate_ids:
            agent_state.last_referenced_product_id = candidate_ids[0]

    return {
        "agent_state": agent_state,
    }


async def node_audit(state: BuyerGraphState, config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
    """Records concise operational audit event for the executed action."""
    db = _get_db(state, config)
    user_id = state["user_id"]
    agent_state = state["agent_state"]
    decision = state.get("decision")

    if decision:
        try:
            await record_audit_event(
                db=db,
                action=AuditAction.BUYER_AGENT_USED,
                resource_type=AuditResourceType.AI_AGENT,
                actor_id=user_id,
                actor_role="customer",
                resource_id=agent_state.session_id,
                metadata={
                    "session_id": agent_state.session_id,
                    "action": decision.action.value,
                    "turn_count": agent_state.turn_count,
                    "step_number": state.get("step_count", 1),
                    "current_state": agent_state.current_state.value,
                    "last_tool": agent_state.last_tool,
                },
            )
        except Exception:
            pass

    return {}


async def node_deterministic_fallback(state: BuyerGraphState, config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
    """Active resilience node: handles AI provider degradation via deterministic keyword search."""
    db = _get_db(state, config)
    user_id = state["user_id"]
    agent_state = state["agent_state"]
    message = state["message"]

    logger.info("Executing LangGraph deterministic resilience fallback node...")

    intent = SearchIntent(search_text=message.strip().lower())
    agent_state.intent = intent

    if can_transition(agent_state.current_state, AgentStateEnum.SEARCHING):
        transition_state(agent_state, AgentStateEnum.SEARCHING, reason=TransitionReason.SEARCH_STARTED)

    db_products = await buyer_tools.tool_search_products(db, intent, limit=5)
    agent_state.last_tool = "tool_search_products_deterministic"

    if can_transition(agent_state.current_state, AgentStateEnum.SHOWING_RESULTS):
        transition_state(agent_state, AgentStateEnum.SHOWING_RESULTS, reason=TransitionReason.SEARCH_RESULTS_RETURNED)

    recommended_products = await _build_recommended_products(db, db_products, intent)
    candidate_ids = [p.id for p in recommended_products]
    agent_state.candidate_product_ids = candidate_ids[:10]
    agent_state.last_referenced_product_id = candidate_ids[0] if candidate_ids else None
    agent_state.selected_product_id = None
    agent_state.last_tool_result_summary = f"Fallback found {len(recommended_products)} products"

    try:
        await record_audit_event(
            db=db,
            action=AuditAction.BUYER_AGENT_AI_FALLBACK,
            resource_type=AuditResourceType.AI_AGENT,
            actor_id=user_id,
            actor_role="customer",
            resource_id=agent_state.session_id,
            metadata={
                "session_id": agent_state.session_id,
                "failure_type": "AI_ERROR_OR_RATE_LIMIT",
                "response_mode": "DETERMINISTIC_FALLBACK",
                "fallback_used": True,
            },
        )
    except Exception:
        pass

    final_msg = f"Found {len(recommended_products)} products matching your search criteria." if recommended_products else build_no_exact_match_message(intent)

    return {
        "recommended_products": recommended_products,
        "final_message": final_msg,
        "is_terminal": True,
        "fallback_active": True,
    }


async def node_save_state(state: BuyerGraphState, config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
    """Atomically persists updated AgentState to MongoDB."""
    db = _get_db(state, config)
    agent_state = state["agent_state"]

    await save_agent_session_atomic(db, agent_state)
    return {}

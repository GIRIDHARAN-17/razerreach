"""
Buyer Agent orchestration service with Task 16D controlled decision loop, deterministic FSM enforcement,
and Task 16C robust session management.
Implements the OBSERVE -> DECIDE -> ACT -> OBSERVE bounded loop.
LLM proposes actions, but FSM, backend validation, and action allowlists remain authoritative.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.agents.tools import buyer_tools
from app.agents.tools.buyer_tools import (
    tool_search_products,
    tool_get_product_details,
    tool_compare_products,
    tool_check_inventory,
)
from app.integrations import gemini
from app.schemas.agent_decision import (
    AgentAction,
    AgentDecision,
    is_action_allowed,
    ACTION_TOOL_MAP,
)
from app.schemas.agent_state import (
    AgentState,
    AgentStateEnum,
    TransitionReason,
    build_agent_context,
)
from app.schemas.ai_search import (
    AIRecommendedProduct,
    AISearchResponse,
    SearchIntent,
)
from app.schemas.audit import AuditAction, AuditResourceType
from app.services.agent_fsm import can_transition, transition_state, verify_selected_product
from app.services.agent_session_service import get_or_create_agent_session, save_agent_session_atomic
from app.services.analytics_service import record_search_event
from app.services.audit_service import record_audit_event

logger = logging.getLogger("razorreach.buyer_agent")


def build_grounded_reasons(product: Dict[str, Any], intent: SearchIntent) -> List[str]:
    """
    Deterministic anti-hallucination recommendation reason generator.
    ONLY generates bullet points from verified database fields present in product document.
    Never claims attributes or features not stored in the database.
    """
    reasons: List[str] = []

    price = product.get("price", 0)
    name = product.get("name", "")
    desc = product.get("description", "")
    category = product.get("category", "")
    attributes = product.get("attributes", {}) or {}

    # Budget reason
    if intent.max_price is not None and price <= intent.max_price:
        reasons.append(f"Within your ₹{int(intent.max_price):,} budget (priced at ₹{int(price):,})")
    elif price > 0:
        reasons.append(f"Priced at ₹{int(price):,}")

    # Color reason (only if present in product data)
    if intent.color:
        p_color = str(attributes.get("color", "")).lower()
        full_text = (name + " " + desc).lower()
        if intent.color.lower() in p_color or intent.color.lower() in full_text:
            reasons.append(f"Matches requested color '{intent.color.title()}'")

    # Category / Concept reason
    if intent.category and (intent.category.lower() in category.lower() or intent.category.lower() in (name + " " + desc).lower()):
        reasons.append(f"Matches requested category '{intent.category.title()}'")

    # Required features reason (only if present in product data)
    if intent.required_features:
        full_text = (name + " " + desc + " " + str(attributes)).lower()
        for feature in intent.required_features:
            f_clean = feature.strip().lower()
            if f_clean in full_text or any(f_clean in str(v).lower() for v in attributes.values()):
                reasons.append(f"Includes feature: {feature.title()}")

    # Stock availability
    stock = product.get("stock", 0)
    if stock > 0:
        reasons.append("In stock and available for order")

    # Fallback reason if none matched
    if not reasons:
        reasons.append("Matches catalog search criteria")

    return reasons


async def _build_recommended_products(
    db,
    raw_products: List[Dict[str, Any]],
    intent: SearchIntent,
) -> List[AIRecommendedProduct]:
    """Convert raw product documents into validated, grounded AIRecommendedProduct models."""
    recommended: List[AIRecommendedProduct] = []

    for p in raw_products:
        pid = str(p["_id"]) if "_id" in p else str(p.get("id", ""))
        why = build_grounded_reasons(p, intent)

        m_name = "RazorReach Store"
        m_id = p.get("merchant_id")
        if m_id and db is not None:
            try:
                from bson import ObjectId
                m_doc = await db.merchants.find_one({"_id": ObjectId(m_id)})
                if m_doc and m_doc.get("business_name"):
                    m_name = m_doc["business_name"]
            except Exception:
                pass

        raw_imgs = p.get("images") or []
        imgs_list = []
        for img in raw_imgs:
            if isinstance(img, dict) and img.get("url"):
                imgs_list.append(img["url"])
            elif isinstance(img, str) and img:
                imgs_list.append(img)
        if not imgs_list and p.get("image_url"):
            imgs_list.append(p["image_url"])

        recommended.append(
            AIRecommendedProduct(
                id=pid,
                name=p.get("name", ""),
                price=float(p.get("price", 0.0)),
                category=p.get("category", ""),
                merchant_name=m_name,
                image_url=p.get("image_url") or (imgs_list[0] if imgs_list else None),
                images=imgs_list,
                stock=int(p.get("stock", 0)),
                why_recommended=why,
            )
        )
    return recommended


async def get_or_create_state_wrapper(db, user_id: str, session_id: Optional[str] = None) -> AgentState:
    """Backward compatibility wrapper delegating to agent_session_service."""
    state, _ = await get_or_create_agent_session(db, user_id, session_id)
    return state


async def save_state_wrapper(db, state: AgentState) -> None:
    """Backward compatibility wrapper delegating to agent_session_service."""
    await save_agent_session_atomic(db, state)


# Maintain exports for compatibility with previous imports
get_or_create_agent_state = get_or_create_state_wrapper
save_agent_state = save_state_wrapper


async def process_buyer_query(
    db,
    user_id: Optional[str],
    message: str,
    previous_intent: Optional[SearchIntent] = None,
    session_id: Optional[str] = None,
) -> AISearchResponse:
    """
    Task 16D: Execute controlled Buyer Agent decision loop:
    1. Load AgentState scoped to (session_id, user_id).
    2. Increment turn_count ONCE per user turn.
    3. Loop bounded by MAX_AGENT_STEPS_PER_TURN (default 3):
       - Observe current context & request.
       - LLM proposes next action (AgentDecision).
       - Validate proposed action against deterministic allowlist.
       - Validate state transition with authoritative FSM.
       - Execute ONE allowed tool.
       - Observe tool result & update AgentState.
       - Audit step.
    4. Persist updated session atomically.
    5. Return grounded AISearchResponse.
    """
    eff_user_id = user_id or "anonymous"
    from app.services.ai_resilience import reset_turn_resilience_context
    reset_turn_resilience_context()

    if getattr(settings, "LANGGRAPH_AGENT_ENABLED", True):
        from app.agents.langgraph.runner import run_langgraph_buyer_turn
        return await run_langgraph_buyer_turn(
            db=db,
            user_id=user_id,
            message=message,
            previous_intent=previous_intent,
            session_id=session_id,
        )


    state, is_new = await get_or_create_agent_session(db, eff_user_id, session_id)

    # Increment turn count ONCE per user turn
    state.turn_count += 1
    state.goal = message[:200]

    # Reset state to START if in terminal or failed state
    if state.current_state in (AgentStateEnum.COMPLETED, AgentStateEnum.FAILED):
        if can_transition(state.current_state, AgentStateEnum.START):
            transition_state(state, AgentStateEnum.START, reason=TransitionReason.SESSION_RESET)

    step_count = 0
    max_steps = getattr(settings, "MAX_AGENT_STEPS_PER_TURN", 3)
    recommended_products: List[AIRecommendedProduct] = []
    effective_intent: SearchIntent = previous_intent or (state.intent if state.intent else SearchIntent(search_text=message.strip().lower()))
    final_message: Optional[str] = None

    while step_count < max_steps:
        step_count += 1

        # 1. OBSERVE
        context = build_agent_context(state, message)

        # 2. DECIDE: LLM proposes next action
        decision = await gemini.decide_buyer_action(context, message)

        # 3. VALIDATE DECISION against deterministic allowlist
        if not isinstance(decision, AgentDecision) or not is_action_allowed(decision.action):
            logger.warning(f"Unsafe or unrecognized action proposed: '{getattr(decision, 'action', None)}'. Terminating.")
            if can_transition(state.current_state, AgentStateEnum.FAILED):
                transition_state(state, AgentStateEnum.FAILED, reason=TransitionReason.UNRECOVERABLE_ERROR)
            state.last_tool = "none"
            state.last_tool_result_summary = f"Rejected unauthorized action: {getattr(decision, 'action', None)}"
            final_message = "I cannot perform the requested action safely. Please try rephrasing your query."
            break

        # Record operational audit for decision step
        try:
            await record_audit_event(
                db=db,
                action=AuditAction.BUYER_AGENT_DECISION,
                resource_type=AuditResourceType.AI_AGENT,
                actor_id=eff_user_id,
                actor_role="customer",
                metadata={
                    "session_id": state.session_id,
                    "step_number": step_count,
                    "action": decision.action.value,
                    "current_state": state.current_state.value,
                    "turn_count": state.turn_count,
                },
            )
        except Exception:
            pass

        # 3.5 CONVERSATIONAL REFERENCE RESOLUTION (Task 16F)
        from app.services import conversation_resolver
        resolved = await conversation_resolver.resolve_reference(
            db=db,
            agent_state=state,
            message=message,
            user_id=eff_user_id,
            decision=decision,
        )

        try:
            await record_audit_event(
                db=db,
                action=AuditAction.BUYER_AGENT_REFERENCE_RESOLVED,
                resource_type=AuditResourceType.AI_AGENT,
                actor_id=eff_user_id,
                actor_role="customer",
                metadata={
                    "session_id": state.session_id,
                    "reference_type": resolved.reference_type.value,
                    "resolved_product_ids": resolved.product_ids[:5],
                    "source": resolved.source,
                    "requires_clarification": resolved.requires_clarification,
                },
            )
        except Exception:
            pass

        if resolved.requires_clarification:
            state.last_tool = "conversation_resolver"
            state.last_tool_result_summary = "Conversational reference requires clarification"
            state.pending_action = "ASK_CLARIFICATION"
            final_message = resolved.clarification_prompt or "Could you please clarify which product you mean?"
            break

        if resolved.product_ids:
            if len(resolved.product_ids) >= 2:
                decision.action = AgentAction.COMPARE
                decision.target_product_ids = resolved.product_ids
            else:
                decision.target_product_id = resolved.product_ids[0]

        if resolved.refined_intent:
            effective_intent = resolved.refined_intent
            state.intent = effective_intent
            if decision.action != AgentAction.COMPARE:
                decision.action = AgentAction.SEARCH

        # 4. DETERMINISTIC POLICY / ACTION SAFETY GATE (Task 16E)
        from app.services import agent_policy
        policy = await agent_policy.evaluate_action(db, state, decision, eff_user_id)

        try:
            await record_audit_event(
                db=db,
                action=AuditAction.BUYER_AGENT_POLICY_DECISION,
                resource_type=AuditResourceType.AI_AGENT,
                actor_id=eff_user_id,
                actor_role="customer",
                metadata={
                    "session_id": state.session_id,
                    "step_number": step_count,
                    "action": decision.action.value,
                    "allowed": policy.allowed,
                    "reason_code": policy.reason_code.value,
                    "risk_level": policy.risk_level.value,
                    "current_state": state.current_state.value,
                },
            )
        except Exception:
            pass

        if not policy.allowed:
            logger.warning(
                f"Action {decision.action} denied by Policy Gate: {policy.reason_code} - {policy.reason}"
            )
            state.last_tool = "policy_gate"
            state.last_tool_result_summary = f"Policy denied action: {policy.reason_code.value}"
            final_message = policy.safe_response or "I cannot perform that action directly."
            break

        # 5. FSM VALIDATION & 6. EXECUTE ONE ALLOWED TOOL
        action = decision.action

        if action == AgentAction.SEARCH:
            # Transition START/COMPLETED/FAILED -> UNDERSTANDING -> SEARCHING
            if can_transition(state.current_state, AgentStateEnum.UNDERSTANDING):
                transition_state(state, AgentStateEnum.UNDERSTANDING, reason=TransitionReason.USER_INTENT_PARSED)

            # Extract structured intent
            try:
                effective_intent = await gemini.extract_search_intent(message, effective_intent)
                state.intent = effective_intent
            except RuntimeError:
                raise
            except Exception:
                effective_intent = SearchIntent(search_text=message.strip().lower())
                state.intent = effective_intent

            if can_transition(state.current_state, AgentStateEnum.SEARCHING):
                transition_state(state, AgentStateEnum.SEARCHING, reason=TransitionReason.SEARCH_STARTED)

            # Execute tool_search_products
            try:
                db_products = await buyer_tools.tool_search_products(db, effective_intent, limit=5)
                state.last_tool = "tool_search_products"

                if can_transition(state.current_state, AgentStateEnum.SHOWING_RESULTS):
                    transition_state(state, AgentStateEnum.SHOWING_RESULTS, reason=TransitionReason.SEARCH_RESULTS_RETURNED)

                # Format recommendations
                recommended_products = await _build_recommended_products(db, db_products, effective_intent)
                candidate_ids = [p.id for p in recommended_products]
                state.candidate_product_ids = candidate_ids[:10]
                state.last_referenced_product_id = candidate_ids[0] if candidate_ids else None
                state.last_tool_result_summary = f"Found {len(recommended_products)} products"

                if recommended_products:
                    final_message = f"Found {len(recommended_products)} product{'s' if len(recommended_products) > 1 else ''} matching your request."
                else:
                    final_message = "I couldn't find a matching product in the current catalog."
            except Exception as e:
                logger.error(f"Search tool execution failed: {type(e).__name__}")
                if can_transition(state.current_state, AgentStateEnum.FAILED):
                    transition_state(state, AgentStateEnum.FAILED, reason=TransitionReason.RECOVERABLE_ERROR)
                state.last_tool_result_summary = "Search tool encountered an error"
                final_message = "Search service is temporarily unavailable."
            break

        elif action == AgentAction.GET_PRODUCT:
            pid = decision.target_product_id or (state.candidate_product_ids[0] if state.candidate_product_ids else None)
            if not pid:
                final_message = "Please specify a product to view details."
                break

            details = await buyer_tools.tool_get_product_details(db, pid)
            state.last_tool = "tool_get_product_details"
            if details:
                if can_transition(state.current_state, AgentStateEnum.PRODUCT_SELECTED):
                    transition_state(state, AgentStateEnum.PRODUCT_SELECTED, reason=TransitionReason.PRODUCT_SELECTED)
                state.selected_product_id = pid
                state.last_referenced_product_id = pid
                state.last_tool_result_summary = f"Retrieved details for {details.get('name', 'product')}"
                single_prod = await _build_recommended_products(db, [details], effective_intent)
                recommended_products = single_prod
                final_message = f"{details.get('name')}: {details.get('description', '')} (₹{details.get('price', 0):,})"
            else:
                state.last_tool_result_summary = f"Product {pid} not found"
                final_message = f"I could not find details for product {pid}."
            break

        elif action == AgentAction.COMPARE:
            pids = decision.target_product_ids or (state.candidate_product_ids[:2] if state.candidate_product_ids else [])
            if not pids or len(pids) < 2:
                final_message = "At least two products are required for comparison."
                break

            if can_transition(state.current_state, AgentStateEnum.COMPARING):
                transition_state(state, AgentStateEnum.COMPARING, reason=TransitionReason.COMPARISON_REQUESTED)

            comparison = await buyer_tools.tool_compare_products(db, pids)
            state.last_tool = "tool_compare_products"
            state.comparison_product_ids = pids[:5]
            state.last_referenced_product_id = pids[0] if pids else None
            state.last_tool_result_summary = f"Compared {len(comparison)} products"
            recommended_products = await _build_recommended_products(db, comparison, effective_intent)
            final_message = f"Compared {len(comparison)} products based on specifications and pricing."
            break

        elif action == AgentAction.CHECK_INVENTORY:
            pid = decision.target_product_id or state.selected_product_id or (state.candidate_product_ids[0] if state.candidate_product_ids else None)
            if not pid:
                final_message = "Please specify which product you would like to check inventory for."
                break

            inv = await buyer_tools.tool_check_inventory(db, pid)
            state.last_tool = "tool_check_inventory"
            state.last_referenced_product_id = pid
            stock = inv.get("stock", 0)
            avail = inv.get("available", False)
            state.last_tool_result_summary = f"Stock check: {stock} units available"
            final_message = f"Product has {stock} unit{'s' if stock != 1 else ''} available in stock." if avail else "Product is currently out of stock."
            break

        elif action == AgentAction.SELECT_PRODUCT:
            pid = decision.target_product_id or (state.candidate_product_ids[0] if state.candidate_product_ids else None)
            if not pid:
                final_message = "Please specify a product to select."
                break

            # Backend verify product against database & candidates
            verified = await verify_selected_product(db, pid, state.candidate_product_ids, eff_user_id)
            state.last_tool = "verify_selected_product"

            if verified:
                if can_transition(state.current_state, AgentStateEnum.PRODUCT_SELECTED):
                    transition_state(state, AgentStateEnum.PRODUCT_SELECTED, reason=TransitionReason.PRODUCT_SELECTED)
                state.selected_product_id = pid
                state.last_referenced_product_id = pid
                state.last_tool_result_summary = f"Verified and selected product {pid}"
                final_message = f"Selected product {pid}. You can compare it, check inventory, or add it to your cart."
            else:
                state.last_tool_result_summary = f"Product {pid} failed verification"
                final_message = f"The selected product {pid} is not available or valid in the catalog."
            break

        elif action == AgentAction.VIEW_CART:
            if can_transition(state.current_state, AgentStateEnum.CART_REVIEW):
                transition_state(state, AgentStateEnum.CART_REVIEW, reason=TransitionReason.CART_REVIEW_REQUESTED)

            from app.services import cart_service
            cart = await cart_service.get_active_cart(db, eff_user_id)
            state.cart_id = str(cart.get("_id", ""))
            state.last_tool = "cart_service.get_active_cart"
            items_count = len(cart.get("items", []))
            total = cart.get("total", 0.0)
            state.last_tool_result_summary = f"Cart has {items_count} items, total ₹{total}"
            final_message = f"Your cart contains {items_count} item{'s' if items_count != 1 else ''} totaling ₹{total:,.2f}."
            break

        elif action == AgentAction.ADD_TO_CART:
            pid = decision.target_product_id or state.selected_product_id or (state.candidate_product_ids[0] if state.candidate_product_ids else None)
            if not pid:
                final_message = "Please specify which product you would like to add to your cart."
                break

            # Product must exist in backend database
            prod_details = await tool_get_product_details(db, pid)
            if not prod_details or prod_details.get("stock", 0) <= 0:
                final_message = f"Product {pid} is unavailable or out of stock."
                state.last_tool_result_summary = f"Add to cart rejected: product {pid} unavailable"
                break

            if can_transition(state.current_state, AgentStateEnum.CART_REVIEW):
                transition_state(state, AgentStateEnum.CART_REVIEW, reason=TransitionReason.CART_REVIEW_REQUESTED)

            from app.services import cart_service
            try:
                cart_res = await cart_service.add_item(db, eff_user_id, pid, decision.quantity or 1)
                state.cart_id = str(cart_res.get("id") or cart_res.get("_id", ""))
                state.last_cart_product_id = pid
                state.last_referenced_product_id = pid
                state.selected_product_id = pid
                state.last_tool = "cart_service.add_item"
                state.last_tool_result_summary = f"Added {prod_details.get('name')} to cart"
                final_message = f"Added {prod_details.get('name')} to your cart. Total: ₹{cart_res.get('total', 0):,.2f}."
            except Exception as e:
                logger.warning(f"Cart add_item failed: {str(e)}")
                state.last_tool_result_summary = f"Failed to add to cart: {str(e)}"
                final_message = "Could not add item to cart. Please check available stock."
            break

        elif action == AgentAction.UPDATE_CART:
            pid = decision.target_product_id or state.selected_product_id
            if not pid:
                final_message = "Please specify which product quantity to update."
                break

            from app.services import cart_service
            try:
                cart_res = await cart_service.update_item(db, eff_user_id, pid, decision.quantity or 1)
                state.last_tool = "cart_service.update_item"
                state.last_cart_product_id = pid
                state.last_tool_result_summary = f"Updated product {pid} quantity to {decision.quantity}"
                final_message = f"Updated item quantity to {decision.quantity}. New total: ₹{cart_res.get('total', 0):,.2f}."
            except Exception as e:
                state.last_tool_result_summary = f"Failed to update cart: {str(e)}"
                final_message = "Could not update cart quantity."
            break

        elif action == AgentAction.REMOVE_FROM_CART:
            pid = decision.target_product_id or state.selected_product_id
            if not pid:
                final_message = "Please specify which product to remove from your cart."
                break

            from app.services import cart_service
            try:
                cart_res = await cart_service.remove_item(db, eff_user_id, pid)
                state.last_tool = "cart_service.remove_item"
                if state.last_cart_product_id == pid:
                    state.last_cart_product_id = None
                state.last_tool_result_summary = f"Removed product {pid} from cart"
                final_message = f"Removed item from cart. New total: ₹{cart_res.get('total', 0):,.2f}."
            except Exception as e:
                state.last_tool_result_summary = f"Failed to remove item: {str(e)}"
                final_message = "Could not remove item from cart."
            break

        elif action == AgentAction.PREPARE_CHECKOUT:
            # Checkout boundary enforcement: requires confirmation!
            if can_transition(state.current_state, AgentStateEnum.CHECKOUT_READY):
                transition_state(state, AgentStateEnum.CHECKOUT_READY, reason=TransitionReason.CHECKOUT_PREPARED)

            if can_transition(state.current_state, AgentStateEnum.AWAITING_CONFIRMATION):
                transition_state(state, AgentStateEnum.AWAITING_CONFIRMATION, reason=TransitionReason.CONFIRMATION_REQUIRED)

            state.confirmation_required = True
            state.last_tool = "cart_service.checkout_preview"

            from app.services import cart_service
            try:
                preview = await cart_service.checkout_preview(db, eff_user_id)
                tot = preview.total if hasattr(preview, "total") else preview.get("total", 0.0)
                state.last_tool_result_summary = f"Checkout prepared for ₹{tot}. Awaiting confirmation."
                final_message = f"Your order total is ₹{tot:,.2f}. Please confirm your purchase to proceed to payment."
            except Exception as e:
                state.last_tool_result_summary = f"Checkout preview failed: {str(e)}"
                final_message = "Unable to prepare checkout. Please verify your cart contents."
            break

        elif action == AgentAction.ASK_CLARIFICATION:
            state.pending_action = "ASK_CLARIFICATION"
            state.last_tool = "none"
            state.last_tool_result_summary = decision.reasoning_summary or "Clarification requested"
            final_message = decision.reasoning_summary or "Could you please clarify your shopping preferences or constraints?"
            break

        elif action == AgentAction.RESPOND:
            state.last_tool = "none"
            state.last_tool_result_summary = decision.reasoning_summary or "Responded to buyer"
            final_message = decision.reasoning_summary or "How else can I assist with your shopping today?"
            break

        elif action == AgentAction.FAIL:
            if can_transition(state.current_state, AgentStateEnum.FAILED):
                transition_state(state, AgentStateEnum.FAILED, reason=TransitionReason.UNRECOVERABLE_ERROR)
            state.last_tool = "none"
            state.last_tool_result_summary = decision.reasoning_summary or "Agent workflow failed"
            final_message = "I was unable to complete your request. Please try a different query."
            break

        else:
            logger.warning(f"Unhandled action {action}. Stopping loop.")
            break

    # Persist session state atomically
    await save_agent_session_atomic(db, state)

    # Record analytics event
    try:
        await record_search_event(db, eff_user_id, message, len(recommended_products))
    except Exception:
        pass

    # Audit turn event
    try:
        await record_audit_event(
            db=db,
            action=AuditAction.BUYER_AGENT_USED,
            resource_type=AuditResourceType.AI_AGENT,
            actor_id=eff_user_id,
            actor_role="customer",
            metadata={
                "session_id": state.session_id,
                "current_state": state.current_state.value,
                "last_transition": state.last_transition,
                "turn_count": state.turn_count,
                "version": state.version,
                "steps_executed": step_count,
            },
        )
    except Exception:
        pass

    from app.services.ai_resilience import is_fallback_used, get_turn_failure_type
    fallback_used = is_fallback_used()
    failure_type = get_turn_failure_type()

    if fallback_used:
        response_mode = "DETERMINISTIC_FALLBACK"
        try:
            await record_audit_event(
                db=db,
                action=AuditAction.BUYER_AGENT_AI_FALLBACK,
                resource_type=AuditResourceType.AI_AGENT,
                actor_id=eff_user_id,
                actor_role="customer",
                metadata={
                    "session_id": state.session_id,
                    "response_mode": response_mode,
                    "failure_type": failure_type.value if failure_type else "UNKNOWN",
                    "fallback_used": True,
                },
            )
        except Exception:
            pass
    elif state.pending_action == "ASK_CLARIFICATION" or "clarification" in (state.last_tool or ""):
        response_mode = "CLARIFICATION"
    else:
        response_mode = "AI"

    if not final_message:
        if recommended_products:
            final_message = f"Found {len(recommended_products)} product{'s' if len(recommended_products) > 1 else ''} matching your request."
        elif state.last_tool_result_summary:
            final_message = state.last_tool_result_summary
        else:
            final_message = "I couldn't find matching products in the catalog."

    return AISearchResponse(
        session_id=state.session_id,
        message=final_message,
        intent=effective_intent,
        products=recommended_products,
        response_mode=response_mode,
    )

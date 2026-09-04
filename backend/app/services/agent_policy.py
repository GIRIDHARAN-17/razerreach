"""
Agent Policy Service — Deterministic Policy and Action Safety Gate for Task 16E.
Enforces authorization, FSM legality, resource validation, quantity constraints,
and confirmation boundaries before tool execution.
THE LLM IS NEVER THE AUTHORITY.
"""

import logging
from typing import Any, Optional
from bson import ObjectId

from app.schemas.agent_state import AgentState
from app.schemas.agent_decision import (
    AgentAction,
    AgentDecision,
    RiskLevel,
    PolicyReasonCode,
    PolicyDecision,
    ACTION_RISK_MAP,
    BLOCKED_ACTIONS,
    is_action_allowed,
)
from app.services.agent_fsm import can_transition, AgentStateEnum
from app.services.agent_session_service import is_session_stale

logger = logging.getLogger("razorreach.agent_policy")


async def evaluate_action(
    db: Any,
    agent_state: AgentState,
    decision: Any,
    user_id: str,
) -> PolicyDecision:
    """
    Deterministically evaluates whether a proposed AgentDecision is permitted
    to execute for the given user, session, and FSM state.

    Evaluation Pipeline:
    1. Schema & structure validation
    2. Blocked action check (Payment, code execution, arbitrary tools)
    3. Action allowlist validation
    4. Session and user ownership validation
    5. Context staleness evaluation
    6. FSM state transition legality
    7. Resource validation (live MongoDB product existence, stock, status)
    8. Business rules & quantity bounds
    9. Cart ownership and state check
    10. Confirmation gate check (PREPARE_CHECKOUT requires explicit confirmation)
    """

    # 1. Validate decision presence and type
    if decision is None:
        return PolicyDecision(
            allowed=False,
            reason_code=PolicyReasonCode.ACTION_NOT_ALLOWED,
            reason="Decision is missing or null",
            risk_level=RiskLevel.BLOCKED,
            safe_response="I cannot perform an undefined action.",
        )

    raw_action = getattr(decision, "action", None)
    if raw_action is None:
        return PolicyDecision(
            allowed=False,
            reason_code=PolicyReasonCode.ACTION_NOT_ALLOWED,
            reason="Decision does not specify an action",
            risk_level=RiskLevel.BLOCKED,
            safe_response="I cannot perform an undefined action.",
        )

    action_str = getattr(raw_action, "value", str(raw_action)).strip().upper()

    # 2. Blocked actions check
    if action_str in BLOCKED_ACTIONS:
        logger.warning(f"Blocked action proposal intercepted by policy gate: {action_str}")
        return PolicyDecision(
            allowed=False,
            reason_code=PolicyReasonCode.ACTION_NOT_ALLOWED,
            reason=f"Action '{action_str}' is strictly prohibited from autonomous execution",
            risk_level=RiskLevel.BLOCKED,
            safe_response="I cannot perform payment, order confirmation, or code execution directly.",
        )

    # 3. Allowlist validation
    if not is_action_allowed(raw_action):
        logger.warning(f"Unrecognized action rejected by policy gate: {raw_action}")
        return PolicyDecision(
            allowed=False,
            reason_code=PolicyReasonCode.ACTION_NOT_ALLOWED,
            reason=f"Action '{raw_action}' is not in the allowed action set",
            risk_level=RiskLevel.BLOCKED,
            safe_response="I cannot perform that action directly.",
        )

    try:
        action = AgentAction(action_str)
    except ValueError:
        return PolicyDecision(
            allowed=False,
            reason_code=PolicyReasonCode.ACTION_NOT_ALLOWED,
            reason=f"Action '{action_str}' is not a valid AgentAction enum",
            risk_level=RiskLevel.BLOCKED,
            safe_response="I cannot perform that action.",
        )

    # 4. Session and user ownership validation
    if not user_id:
        return PolicyDecision(
            allowed=False,
            reason_code=PolicyReasonCode.UNAUTHORIZED,
            reason="Authenticated user_id is missing",
            risk_level=RiskLevel.HIGH,
            safe_response="User must be authenticated.",
        )

    if agent_state.user_id != user_id:
        logger.warning(
            f"Cross-user session violation in policy gate: state.user_id={agent_state.user_id} != caller={user_id}"
        )
        return PolicyDecision(
            allowed=False,
            reason_code=PolicyReasonCode.UNAUTHORIZED,
            reason=f"Session does not belong to authenticated user {user_id}",
            risk_level=RiskLevel.HIGH,
            safe_response="You do not have access to this session.",
        )

    # 5. Context staleness evaluation
    ts = agent_state.updated_at or agent_state.created_at
    if is_session_stale(ts):
        return PolicyDecision(
            allowed=False,
            reason_code=PolicyReasonCode.STALE_CONTEXT,
            reason="Session context is stale and requires reinitialization",
            risk_level=RiskLevel.LOW,
            safe_response="Your session has expired. Starting fresh conversation.",
        )

    # 6. FSM legality validation
    fsm_ok = _validate_fsm_transition(agent_state.current_state, action)
    if not fsm_ok:
        logger.info(
            f"FSM transition blocked by policy gate: state={agent_state.current_state} -> action={action}"
        )
        return PolicyDecision(
            allowed=False,
            reason_code=PolicyReasonCode.FSM_BLOCKED,
            reason=f"Action {action} is not permitted from current FSM state {agent_state.current_state}",
            risk_level=RiskLevel.MEDIUM,
            safe_response="This action cannot be performed from the current conversation state.",
        )

    # 7. Resource & Business rules validation
    target_pid = getattr(decision, "target_product_id", None)
    target_pids = getattr(decision, "target_product_ids", [])
    quantity = getattr(decision, "quantity", 1)

    # Product Read / Select Actions
    if action in {AgentAction.GET_PRODUCT, AgentAction.SELECT_PRODUCT, AgentAction.CHECK_INVENTORY}:
        pid = target_pid or (
            agent_state.selected_product_id
            if action == AgentAction.CHECK_INVENTORY
            else (agent_state.candidate_product_ids[0] if agent_state.candidate_product_ids else None)
        )
        if not pid:
            return PolicyDecision(
                allowed=False,
                reason_code=PolicyReasonCode.RESOURCE_NOT_FOUND,
                reason="Target product ID missing for product action",
                risk_level=RiskLevel.LOW,
                safe_response="Please specify a product.",
            )

        prod = await _find_product(db, pid)
        if not prod:
            return PolicyDecision(
                allowed=False,
                reason_code=PolicyReasonCode.RESOURCE_NOT_FOUND,
                reason=f"Product {pid} not found in catalog",
                risk_level=RiskLevel.LOW,
                safe_response=f"Product {pid} is not available or valid. I could not find details in the catalog.",
            )
        if prod.get("status") != "published":
            return PolicyDecision(
                allowed=False,
                reason_code=PolicyReasonCode.RESOURCE_UNAVAILABLE,
                reason=f"Product {pid} is not published",
                risk_level=RiskLevel.LOW,
                safe_response="This product is currently unavailable.",
            )

    elif action == AgentAction.COMPARE:
        pids = target_pids or (agent_state.candidate_product_ids[:2] if agent_state.candidate_product_ids else [])
        if not pids or len(pids) < 2:
            return PolicyDecision(
                allowed=False,
                reason_code=PolicyReasonCode.INVALID_CONTEXT,
                reason="At least two products are required for comparison",
                risk_level=RiskLevel.LOW,
                safe_response="Please specify at least two products to compare.",
            )
        for pid in pids:
            prod = await _find_product(db, pid)
            if not prod:
                return PolicyDecision(
                    allowed=False,
                    reason_code=PolicyReasonCode.RESOURCE_NOT_FOUND,
                    reason=f"Comparison product {pid} not found",
                    risk_level=RiskLevel.LOW,
                    safe_response=f"Product {pid} was not found for comparison.",
                )
            if prod.get("status") != "published":
                return PolicyDecision(
                    allowed=False,
                    reason_code=PolicyReasonCode.RESOURCE_UNAVAILABLE,
                    reason=f"Comparison product {pid} is not published",
                    risk_level=RiskLevel.LOW,
                    safe_response=f"Product {pid} is currently unavailable for comparison.",
                )

    # Cart Actions
    elif action in {AgentAction.ADD_TO_CART, AgentAction.UPDATE_CART}:
        # Validate quantity
        if quantity is None or not isinstance(quantity, int) or quantity < 1 or quantity > 10:
            return PolicyDecision(
                allowed=False,
                reason_code=PolicyReasonCode.QUANTITY_INVALID,
                reason=f"Quantity {quantity} is invalid. Must be an integer between 1 and 10.",
                risk_level=RiskLevel.MEDIUM,
                safe_response="Please specify a valid quantity between 1 and 10.",
            )

        pid = target_pid or agent_state.selected_product_id or (
            agent_state.candidate_product_ids[0] if agent_state.candidate_product_ids else None
        )
        if not pid:
            return PolicyDecision(
                allowed=False,
                reason_code=PolicyReasonCode.RESOURCE_NOT_FOUND,
                reason="Target product ID missing for cart operation",
                risk_level=RiskLevel.MEDIUM,
                safe_response="Please select a product before adding it to your cart.",
            )

        prod = await _find_product(db, pid)
        if not prod:
            return PolicyDecision(
                allowed=False,
                reason_code=PolicyReasonCode.RESOURCE_NOT_FOUND,
                reason=f"Product {pid} not found for cart operation",
                risk_level=RiskLevel.MEDIUM,
                safe_response="The selected product could not be found.",
            )
        if prod.get("status") != "published":
            return PolicyDecision(
                allowed=False,
                reason_code=PolicyReasonCode.RESOURCE_UNAVAILABLE,
                reason=f"Product {pid} is not published",
                risk_level=RiskLevel.MEDIUM,
                safe_response="This product is currently unavailable for purchase.",
            )

        live_stock = int(prod.get("stock", 0))
        if live_stock < quantity:
            return PolicyDecision(
                allowed=False,
                reason_code=PolicyReasonCode.RESOURCE_UNAVAILABLE,
                reason=f"Insufficient stock: requested {quantity}, available {live_stock}",
                risk_level=RiskLevel.MEDIUM,
                safe_response=f"Only {live_stock} unit{'s' if live_stock != 1 else ''} available in stock.",
            )

    # Cart ownership verification if cart_id referenced
    if agent_state.cart_id and db is not None:
        try:
            cid = ObjectId(agent_state.cart_id) if ObjectId.is_valid(agent_state.cart_id) else agent_state.cart_id
            cart = await db.carts.find_one({"_id": cid})
            if cart and cart.get("user_id") != user_id:
                return PolicyDecision(
                    allowed=False,
                    reason_code=PolicyReasonCode.UNAUTHORIZED,
                    reason="Cart referenced by AgentState belongs to another user",
                    risk_level=RiskLevel.HIGH,
                    safe_response="Unauthorized cart access.",
                )
        except Exception as e:
            logger.warning(f"Error checking cart ownership in policy: {e}")

    # 8. Confirmation Gate for PREPARE_CHECKOUT
    if action == AgentAction.PREPARE_CHECKOUT:
        # Check active cart has items
        from app.services import cart_service
        try:
            active_cart = await cart_service.get_active_cart(db, user_id)
            if not active_cart or not active_cart.get("items"):
                return PolicyDecision(
                    allowed=False,
                    reason_code=PolicyReasonCode.INVALID_CONTEXT,
                    reason="Active cart is empty. Cannot prepare checkout.",
                    risk_level=RiskLevel.HIGH,
                    safe_response="Your cart is empty. Add items before checkout.",
                )
        except Exception as e:
            logger.error(f"Error verifying cart before checkout in policy: {e}")
            return PolicyDecision(
                allowed=False,
                reason_code=PolicyReasonCode.INVALID_CONTEXT,
                reason="Unable to verify cart before checkout",
                risk_level=RiskLevel.HIGH,
                safe_response="Unable to access your cart to prepare checkout.",
            )

        return PolicyDecision(
            allowed=True,
            reason_code=PolicyReasonCode.REQUIRES_CONFIRMATION,
            reason="Checkout preparation permitted. Human confirmation required.",
            requires_confirmation=True,
            risk_level=RiskLevel.HIGH,
            safe_response="Please confirm your purchase to proceed to payment.",
        )

    # 9. All checks passed: Allow action
    risk = ACTION_RISK_MAP.get(action, RiskLevel.LOW)
    return PolicyDecision(
        allowed=True,
        reason_code=PolicyReasonCode.ALLOWED,
        reason=f"Action {action} approved by deterministic policy gate",
        requires_confirmation=False,
        risk_level=risk,
    )


def _validate_fsm_transition(current_state: AgentStateEnum, action: AgentAction) -> bool:
    """Helper verifying whether the proposed action is permitted in the current FSM state."""
    if action == AgentAction.SEARCH:
        return (
            current_state in {AgentStateEnum.START, AgentStateEnum.UNDERSTANDING, AgentStateEnum.SEARCHING, AgentStateEnum.SHOWING_RESULTS, AgentStateEnum.PRODUCT_SELECTED, AgentStateEnum.COMPARING, AgentStateEnum.CART_REVIEW, AgentStateEnum.FAILED, AgentStateEnum.COMPLETED}
            or can_transition(current_state, AgentStateEnum.UNDERSTANDING)
            or can_transition(current_state, AgentStateEnum.SEARCHING)
            or can_transition(current_state, AgentStateEnum.SHOWING_RESULTS)
        )
    elif action in {AgentAction.GET_PRODUCT, AgentAction.CHECK_INVENTORY}:
        # Safe read operations allowed in any exploration state
        return current_state in {
            AgentStateEnum.START,
            AgentStateEnum.UNDERSTANDING,
            AgentStateEnum.SEARCHING,
            AgentStateEnum.SHOWING_RESULTS,
            AgentStateEnum.PRODUCT_SELECTED,
            AgentStateEnum.COMPARING,
            AgentStateEnum.CART_REVIEW,
        }
    elif action == AgentAction.SELECT_PRODUCT:
        return (
            current_state in {AgentStateEnum.START, AgentStateEnum.SHOWING_RESULTS, AgentStateEnum.COMPARING, AgentStateEnum.PRODUCT_SELECTED}
            or can_transition(current_state, AgentStateEnum.PRODUCT_SELECTED)
        )
    elif action == AgentAction.COMPARE:
        return (
            current_state in {AgentStateEnum.START, AgentStateEnum.SHOWING_RESULTS, AgentStateEnum.PRODUCT_SELECTED, AgentStateEnum.COMPARING}
            or can_transition(current_state, AgentStateEnum.COMPARING)
        )
    elif action in {AgentAction.VIEW_CART, AgentAction.ADD_TO_CART, AgentAction.UPDATE_CART, AgentAction.REMOVE_FROM_CART}:
        return (
            current_state in {AgentStateEnum.START, AgentStateEnum.SHOWING_RESULTS, AgentStateEnum.PRODUCT_SELECTED, AgentStateEnum.COMPARING, AgentStateEnum.CART_REVIEW}
            or can_transition(current_state, AgentStateEnum.CART_REVIEW)
        )
    elif action == AgentAction.PREPARE_CHECKOUT:
        return (
            current_state in {AgentStateEnum.PRODUCT_SELECTED, AgentStateEnum.CART_REVIEW, AgentStateEnum.CHECKOUT_READY, AgentStateEnum.AWAITING_CONFIRMATION}
            or can_transition(current_state, AgentStateEnum.CHECKOUT_READY)
            or can_transition(current_state, AgentStateEnum.AWAITING_CONFIRMATION)
        )
    elif action == AgentAction.ASK_CLARIFICATION:
        return True
    elif action == AgentAction.RESPOND:
        return True
    elif action == AgentAction.FAIL:
        return True
    return False


async def _find_product(db: Any, product_id: str) -> Optional[dict]:
    """Authoritative DB lookup for a product."""
    if db is None or not product_id:
        return None
    try:
        query = {"_id": ObjectId(product_id)} if ObjectId.is_valid(product_id) else {"_id": product_id}
        return await db.products.find_one(query)
    except Exception:
        try:
            return await db.products.find_one({"_id": product_id})
        except Exception:
            return None

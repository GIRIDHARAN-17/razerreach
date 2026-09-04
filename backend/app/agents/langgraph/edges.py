"""
Conditional routing edges for LangGraph Buyer Agent (Task 20).
Defines deterministic branching logic between nodes based on policy,
FSM validity, reference resolution, and loop boundedness.
"""

import logging
from app.agents.langgraph.state import BuyerGraphState

logger = logging.getLogger("razorreach.langgraph.edges")


def route_after_decide(state: BuyerGraphState) -> str:
    """Routes after decision node based on LLM availability and allowlist check."""
    if state.get("fallback_active"):
        return "deterministic_fallback"

    if state.get("is_terminal"):
        return "safe_response"

    return "resolve_references"


def route_after_resolve(state: BuyerGraphState) -> str:
    """Routes after reference resolution: check_information if search decision, safe_response if terminal/clarifying, else policy_gate."""
    if state.get("is_terminal") or state.get("requires_clarification"):
        return "safe_response"

    decision = state.get("decision")
    from app.schemas.agent_decision import AgentAction
    if decision and getattr(decision, "action", None) == AgentAction.SEARCH:
        return "check_information"

    return "policy_gate"


def route_after_check(state: BuyerGraphState) -> str:
    """Routes after information check: ask_clarification if insufficient, else policy_gate."""
    if state.get("requires_clarification"):
        return "ask_clarification"

    return "policy_gate"



def route_after_policy(state: BuyerGraphState) -> str:
    """Routes after policy gate: execute_tool if allowed, safe_response if denied/blocked."""
    policy = state.get("policy_decision")
    if policy and policy.allowed:
        return "execute_tool"

    return "safe_response"


def route_after_audit(state: BuyerGraphState) -> str:
    """Evaluates turn termination vs. continuing the bounded multi-step observation loop."""
    if state.get("is_terminal"):
        return "save_state"

    step_count = state.get("step_count", 0)
    max_steps = state.get("max_steps", 3)

    if step_count >= max_steps:
        logger.info(f"Reached maximum agent steps per turn ({max_steps}). Terminating turn.")
        return "save_state"

    return "observe"

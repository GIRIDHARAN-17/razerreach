"""
LangGraph StateGraph builder for RazorReach Buyer Agent (Task 20).
Assembles nodes, deterministic conditional edges, and bounded loop cycles.
"""

import logging
from typing import Any, Optional
from langgraph.graph import END, START, StateGraph

from app.agents.langgraph.edges import (
    route_after_audit,
    route_after_check,
    route_after_decide,
    route_after_policy,
    route_after_resolve,
)
from app.agents.langgraph.nodes import (
    node_ask_clarification,
    node_audit,
    node_check_information,
    node_decide,
    node_deterministic_fallback,
    node_execute_tool,
    node_load_state,
    node_observe,
    node_policy_gate,
    node_resolve_references,
    node_safe_response,
    node_save_state,
    node_update_state,
)
from app.agents.langgraph.state import BuyerGraphState

logger = logging.getLogger("razorreach.langgraph.graph")


def build_buyer_graph(checkpointer=None):
    """
    Constructs and compiles the bounded Buyer Agent StateGraph.
    Enforces maximum 3 execution cycles, deterministic policy checks,
    conversational reference resolution, progressive preference discovery,
    error resilience, and optional checkpointer.
    """
    builder = StateGraph(BuyerGraphState)

    # 1. Register Nodes
    builder.add_node("load_state", node_load_state)
    builder.add_node("observe", node_observe)
    builder.add_node("decide", node_decide)
    builder.add_node("resolve_references", node_resolve_references)
    builder.add_node("check_information", node_check_information)
    builder.add_node("ask_clarification", node_ask_clarification)
    builder.add_node("policy_gate", node_policy_gate)
    builder.add_node("execute_tool", node_execute_tool)
    builder.add_node("update_state", node_update_state)
    builder.add_node("audit", node_audit)
    builder.add_node("safe_response", node_safe_response)
    builder.add_node("deterministic_fallback", node_deterministic_fallback)
    builder.add_node("save_state", node_save_state)

    # 2. Fixed Entry Edges
    builder.add_edge(START, "load_state")
    builder.add_edge("load_state", "observe")
    builder.add_edge("observe", "decide")

    # 3. Decision Branching
    builder.add_conditional_edges(
        "decide",
        route_after_decide,
        {
            "deterministic_fallback": "deterministic_fallback",
            "safe_response": "safe_response",
            "resolve_references": "resolve_references",
        },
    )

    # 4. Reference Resolution Branching
    builder.add_conditional_edges(
        "resolve_references",
        route_after_resolve,
        {
            "safe_response": "safe_response",
            "check_information": "check_information",
            "policy_gate": "policy_gate",
        },
    )

    # 4.5 Preference Information Sufficiency Branching
    builder.add_conditional_edges(
        "check_information",
        route_after_check,
        {
            "ask_clarification": "ask_clarification",
            "policy_gate": "policy_gate",
        },
    )

    # 5. Policy Gate Branching
    builder.add_conditional_edges(
        "policy_gate",
        route_after_policy,
        {
            "execute_tool": "execute_tool",
            "safe_response": "safe_response",
        },
    )

    # 6. Tool Execution Sequence
    builder.add_edge("execute_tool", "update_state")
    builder.add_edge("update_state", "audit")

    # 7. Bounded Observation Loop
    builder.add_conditional_edges(
        "audit",
        route_after_audit,
        {
            "save_state": "save_state",
            "observe": "observe",
        },
    )

    # 8. Terminal Paths to Persistence
    builder.add_edge("ask_clarification", "save_state")
    builder.add_edge("safe_response", "save_state")
    builder.add_edge("deterministic_fallback", "save_state")
    builder.add_edge("save_state", END)


    if checkpointer is not None:
        return builder.compile(checkpointer=checkpointer)
    return builder.compile()


# Default compiled graph instance
buyer_graph = build_buyer_graph()


def get_compiled_buyer_graph(db: Any = None, checkpointer_enabled: Optional[bool] = None):
    """
    Returns a compiled buyer graph configured with appropriate checkpointer.
    """
    from app.core.config import settings
    from app.agents.langgraph.checkpointer import get_buyer_checkpointer

    enabled = checkpointer_enabled if checkpointer_enabled is not None else getattr(settings, "LANGGRAPH_CHECKPOINT_ENABLED", True)
    checkpointer = get_buyer_checkpointer(db=db, enabled=enabled)
    return build_buyer_graph(checkpointer=checkpointer)


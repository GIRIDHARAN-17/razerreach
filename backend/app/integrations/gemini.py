"""
Gemini integration module for RazorReach.
Handles Gemini client initialization, model configuration, structured intent extraction, and safe error handling.
Never leaks API keys or raw error tracebacks.
"""

import json
import logging
from typing import Any, Dict, Optional

from app.core.config import settings
from app.agents.prompts import BUYER_AGENT_SYSTEM_PROMPT
from app.schemas.ai_search import SearchIntent, SearchSort

logger = logging.getLogger("razorreach.gemini")


def _is_configured() -> bool:
    """Check if GEMINI_API_KEY is configured in settings."""
    return bool(settings.GEMINI_API_KEY and settings.GEMINI_API_KEY.strip())


async def extract_search_intent(
    message: str,
    previous_intent: Optional[SearchIntent] = None,
) -> SearchIntent:
    """
    Extract structured SearchIntent from a user message using Google Gemini with AI resilience.
    On 429, timeout, or service unavailability, gracefully falls back to deterministic SearchIntent.
    Raises RuntimeError if GEMINI_API_KEY is not configured or unauthenticated.
    """
    if not _is_configured():
        logger.warning("GEMINI_API_KEY is not configured in environment.")
        raise RuntimeError("AI service unavailable: GEMINI_API_KEY is not configured")

    api_key = settings.GEMINI_API_KEY.strip()

    # Build prompt context
    prompt = f"User query: \"{message}\"\n"
    if previous_intent:
        prompt += f"Previous intent context: {previous_intent.model_dump_json(exclude_none=True)}\n"
        prompt += "Refine the previous intent with the new query constraints.\n"

    prompt += "\nRespond with a JSON object containing keys: search_text, category, color, brand, min_price, max_price, required_features (array of strings), sort (one of 'relevance', 'price_low', 'price_high')."

    def _call_gemini_intent_sync():
        try:
            from google import genai
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config={"system_instruction": BUYER_AGENT_SYSTEM_PROMPT, "response_mime_type": "application/json"},
            )
            return response.text
        except ImportError:
            import google.generativeai as genai_legacy
            genai_legacy.configure(api_key=api_key)
            model = genai_legacy.GenerativeModel(
                model_name="gemini-1.5-flash",
                system_instruction=BUYER_AGENT_SYSTEM_PROMPT,
            )
            response = model.generate_content(
                prompt,
                generation_config={"response_mime_type": "application/json"},
            )
            return response.text

    from app.services.ai_resilience import (
        execute_with_resilience,
        deterministic_search_intent,
        circuit_breaker,
        CircuitState,
        AIFailureType,
    )

    # Fast-path check: if circuit breaker is OPEN and not probing, immediately use deterministic fallback
    if circuit_breaker.state == CircuitState.OPEN and not circuit_breaker.can_execute():
        return deterministic_search_intent(message, previous_intent)

    resilience_result = await execute_with_resilience(
        op_fn=_call_gemini_intent_sync,
        fallback_fn=lambda reason: deterministic_search_intent(message, previous_intent),
        op_name="extract_search_intent",
    )

    if resilience_result.fallback_used:
        if resilience_result.failure_type == AIFailureType.AI_AUTH_ERROR:
            raise RuntimeError(f"AI service call failed: AuthError")
        return resilience_result.response

    raw_json = resilience_result.response
    if not raw_json:
        return deterministic_search_intent(message, previous_intent)

    # Clean and parse JSON response
    try:
        cleaned_json = raw_json.strip()
        if cleaned_json.startswith("```json"):
            cleaned_json = cleaned_json[7:]
        if cleaned_json.endswith("```"):
            cleaned_json = cleaned_json[:-3]
        cleaned_json = cleaned_json.strip()

        data = json.loads(cleaned_json)
        return SearchIntent(**data)
    except Exception as e:
        logger.warning(f"Failed to parse Gemini structured JSON: {type(e).__name__}, using deterministic fallback.")
        return deterministic_search_intent(message, previous_intent)


async def decide_buyer_action(
    context: Any,
    message: str,
) -> Any:
    """
    Call Gemini to propose the next structured action in the controlled Buyer Agent loop.
    Returns validated AgentDecision conforming to AgentAction allowlist.
    On 429, timeout, or circuit open, safely falls back to high-fidelity deterministic AgentDecision.
    """
    from app.agents.prompts import BUYER_AGENT_DECISION_PROMPT
    from app.schemas.agent_decision import AgentAction, AgentDecision
    from app.services.ai_resilience import (
        execute_with_resilience,
        deterministic_agent_decision,
    )

    if not _is_configured():
        logger.info("GEMINI_API_KEY not configured, using deterministic action fallback.")
        return deterministic_agent_decision(context, message, "No Gemini key configured")

    api_key = settings.GEMINI_API_KEY.strip()

    # Bounded prompt assembly
    c_state = getattr(context, "current_state", "START")
    state_val = c_state.value if hasattr(c_state, "value") else str(c_state)
    prompt = (
        f"Current FSM State: {state_val}\n"
        f"Shopping Goal: {getattr(context, 'goal', 'None')}\n"
        f"Active Candidate Product IDs: {getattr(context, 'candidate_product_ids', [])}\n"
        f"Selected Product ID: {getattr(context, 'selected_product_id', 'None')}\n"
        f"Active Cart ID: {getattr(context, 'cart_id', 'None')}\n"
        f"Last Executed Tool: {getattr(context, 'last_tool', 'None')}\n"
        f"Last Tool Result Summary: {getattr(context, 'last_tool_result_summary', 'None')}\n"
        f"User Message: \"{message}\"\n\n"
        "Propose the next single action conforming to schema:\n"
        "{\n"
        "  \"action\": \"SEARCH\" | \"GET_PRODUCT\" | \"COMPARE\" | \"CHECK_INVENTORY\" | \"SELECT_PRODUCT\" | \"VIEW_CART\" | \"ADD_TO_CART\" | \"UPDATE_CART\" | \"REMOVE_FROM_CART\" | \"PREPARE_CHECKOUT\" | \"ASK_CLARIFICATION\" | \"RESPOND\" | \"FAIL\",\n"
        "  \"target_product_id\": string or null,\n"
        "  \"target_product_ids\": [string],\n"
        "  \"quantity\": integer (default 1),\n"
        "  \"reasoning_summary\": string (short safe operational reason, max 200 chars),\n"
        "  \"response_intent\": string\n"
        "}"
    )

    def _call_gemini_decision_sync():
        try:
            from google import genai
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config={"system_instruction": BUYER_AGENT_DECISION_PROMPT, "response_mime_type": "application/json"},
            )
            return response.text
        except ImportError:
            import google.generativeai as genai_legacy
            genai_legacy.configure(api_key=api_key)
            model = genai_legacy.GenerativeModel(
                model_name="gemini-1.5-flash",
                system_instruction=BUYER_AGENT_DECISION_PROMPT,
            )
            response = model.generate_content(
                prompt,
                generation_config={"response_mime_type": "application/json"},
            )
            return response.text

    resilience_result = await execute_with_resilience(
        op_fn=_call_gemini_decision_sync,
        fallback_fn=lambda reason: deterministic_agent_decision(context, message, f"Gemini fallback ({reason})"),
        op_name="decide_buyer_action",
    )

    if resilience_result.fallback_used:
        return resilience_result.response

    raw_json = resilience_result.response
    if not raw_json:
        return deterministic_agent_decision(context, message, "Gemini returned empty text")

    try:
        cleaned_json = raw_json.strip()
        if cleaned_json.startswith("```json"):
            cleaned_json = cleaned_json[7:]
        if cleaned_json.endswith("```"):
            cleaned_json = cleaned_json[:-3]
        cleaned_json = cleaned_json.strip()

        data = json.loads(cleaned_json)
        return AgentDecision(**data)
    except Exception as e:
        logger.warning(f"Failed to parse Gemini AgentDecision ({type(e).__name__}): falling back.")
        return deterministic_agent_decision(context, message, f"Parse error {type(e).__name__}")

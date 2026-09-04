"""
AI Provider Resilience Service for RazorReach.
Provides failure classification, circuit breaker, exponential backoff retries,
and deterministic fallback when Google Gemini or other AI providers are unavailable,
rate-limited (HTTP 429), or timing out.

CRITICAL INVARIANTS:
1. The LLM is an enhancement, NOT a single point of failure.
2. Provider failures never expose raw exceptions, API keys, or stack traces.
3. Temporary rate limits (HTTP 429) gracefully degrade to deterministic fallback
   and return HTTP 200 with catalog products or helpful clarifications instead of HTTP 503.
4. Process-local circuit breaker prevents retry storms without distributed dependencies.
5. Payment, checkout, and webhook security boundaries remain strictly authoritative.
"""

import asyncio
import logging
import random
import re
import time
from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Tuple

from app.core.config import settings
from app.schemas.agent_decision import AgentAction, AgentDecision
from app.schemas.ai_search import SearchIntent, SearchSort

logger = logging.getLogger("razorreach.ai_resilience")


class AIFailureType(str, Enum):
    AI_RATE_LIMITED = "AI_RATE_LIMITED"       # 429, ResourceExhausted, RateLimitError
    AI_TIMEOUT = "AI_TIMEOUT"                 # 408, TimeoutError, DeadlineExceeded
    AI_UNAVAILABLE = "AI_UNAVAILABLE"         # 503, 502, network error, connection refused
    AI_SERVER_ERROR = "AI_SERVER_ERROR"       # 500
    AI_AUTH_ERROR = "AI_AUTH_ERROR"           # 401, 403, InvalidArgument (key)
    AI_BAD_REQUEST = "AI_BAD_REQUEST"         # 400
    AI_INVALID_RESPONSE = "AI_INVALID_RESPONSE" # Malformed JSON / missing fields
    AI_UNKNOWN_ERROR = "AI_UNKNOWN_ERROR"     # Unrecognized exceptions


class CircuitState(str, Enum):
    CLOSED = "CLOSED"       # Normal remote calls allowed
    OPEN = "OPEN"           # Remote calls blocked, immediate fallback
    HALF_OPEN = "HALF_OPEN" # Single probe call allowed to test recovery


import contextvars

_turn_fallback_used: contextvars.ContextVar[bool] = contextvars.ContextVar("turn_fallback_used", default=False)
_turn_failure_type: contextvars.ContextVar[Optional[AIFailureType]] = contextvars.ContextVar("turn_failure_type", default=None)


def mark_fallback_used(failure_type: Optional[AIFailureType] = None) -> None:
    """Record that deterministic fallback was utilized in the current turn."""
    _turn_fallback_used.set(True)
    if failure_type is not None:
        _turn_failure_type.set(failure_type)


def is_fallback_used() -> bool:
    """Check if fallback was utilized in the current turn."""
    return _turn_fallback_used.get()


def get_turn_failure_type() -> Optional[AIFailureType]:
    """Retrieve the AI provider failure type for the current turn if any."""
    return _turn_failure_type.get()


def reset_turn_resilience_context() -> None:
    """Reset turn-level resilience tracking at the start of a request turn."""
    _turn_fallback_used.set(False)
    _turn_failure_type.set(None)


@dataclass
class AIResilienceResult:
    success: bool
    response: Optional[Any] = None
    failure_type: Optional[AIFailureType] = None
    retry_count: int = 0
    fallback_used: bool = False
    provider_available: bool = True
    error_message: Optional[str] = None


class AICircuitBreaker:
    """
    Process-local, in-memory circuit breaker protecting against provider exhaustion.
    Does not require Redis or external background workers.
    Enforces strict CLOSED -> OPEN -> HALF_OPEN state transitions:
    - CLOSED: Normal operation. Bounded failure count trips to OPEN when >= threshold.
    - OPEN: Provider calls are skipped. Failures are NOT incremented on skipped calls.
            Cooldown expires -> transitions to HALF_OPEN with single probe guard.
    - HALF_OPEN: Exactly ONE probe is allowed. Concurrent calls during HALF_OPEN use fallback.
                 Probe success -> CLOSED and failure_count = 0.
                 Probe failure -> trips back to OPEN.
    """

    def __init__(
        self,
        failure_threshold: Optional[int] = None,
        cooldown_seconds: Optional[float] = None,
    ):
        self.failure_threshold = (
            failure_threshold
            if failure_threshold is not None
            else getattr(settings, "AI_CIRCUIT_FAILURE_THRESHOLD", 3)
        )
        self.cooldown_seconds = (
            cooldown_seconds
            if cooldown_seconds is not None
            else getattr(settings, "AI_CIRCUIT_COOLDOWN_SECONDS", 30.0)
        )
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time = 0.0
        self._probing: bool = False

    def can_execute(self) -> bool:
        """Check whether the circuit breaker permits an outgoing API call."""
        now = time.time()
        if self.state == CircuitState.OPEN:
            if now - self.last_failure_time >= self.cooldown_seconds:
                # Cooldown expired: allow exactly one probe
                if not self._probing:
                    logger.info("AI circuit cooldown expired. Entering HALF_OPEN state to probe provider.")
                    self.state = CircuitState.HALF_OPEN
                    self._probing = True
                    return True
                # Another request is already probing in HALF_OPEN
                return False
            return False

        if self.state == CircuitState.HALF_OPEN:
            # Only allow the single probe
            if not self._probing:
                self._probing = True
                return True
            return False

        return True

    def record_success(self) -> None:
        """Record a successful provider call, restoring CLOSED state."""
        if self.state != CircuitState.CLOSED:
            logger.info("AI probe call succeeded. Circuit breaker state restored to CLOSED.")
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self._probing = False

    def record_failure(self, failure_type: AIFailureType) -> None:
        """Record a provider failure and trip circuit to OPEN if threshold reached."""
        # Non-retryable client errors (auth, bad request) do not trip the server circuit
        if failure_type in (AIFailureType.AI_AUTH_ERROR, AIFailureType.AI_BAD_REQUEST):
            return

        now = time.time()

        if self.state == CircuitState.HALF_OPEN:
            logger.warning("AI probe failed in HALF_OPEN state. Tripping circuit back to OPEN.")
            self.state = CircuitState.OPEN
            self.last_failure_time = now
            self._probing = False
            self.failure_count = self.failure_threshold
        elif self.state == CircuitState.CLOSED:
            self.failure_count += 1
            self.last_failure_time = now
            if self.failure_count >= self.failure_threshold:
                logger.warning(
                    f"AI consecutive failures ({self.failure_count}) reached threshold ({self.failure_threshold}). "
                    f"Tripping circuit breaker to OPEN for {self.cooldown_seconds}s cooldown."
                )
                self.state = CircuitState.OPEN
        elif self.state == CircuitState.OPEN:
            # Circuit is already OPEN; do not increment failure_count
            self._probing = False

    def reset(self) -> None:
        """Reset circuit breaker to initial CLOSED state (for tests and recovery)."""
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time = 0.0
        self._probing = False


# Global process-level circuit breaker singleton
circuit_breaker = AICircuitBreaker()


def classify_gemini_error(exc: Exception) -> AIFailureType:
    """
    Deterministically map provider exceptions and status codes to AIFailureType.
    Never exposes API keys or raw connection strings.
    """
    if isinstance(exc, (asyncio.TimeoutError, TimeoutError)):
        return AIFailureType.AI_TIMEOUT

    exc_name = type(exc).__name__
    exc_str = str(exc).lower()

    # Rate limiting (HTTP 429)
    if "429" in exc_str or "resourceexhausted" in exc_str or "rate_limit" in exc_str or "quota" in exc_str or "too many requests" in exc_str:
        return AIFailureType.AI_RATE_LIMITED

    # Timeouts
    if "408" in exc_str or "deadline" in exc_str or "timed out" in exc_str or "timeout" in exc_str:
        return AIFailureType.AI_TIMEOUT

    # Authentication errors (401, 403)
    if "401" in exc_str or "403" in exc_str or "permission_denied" in exc_str or "unauthenticated" in exc_str:
        return AIFailureType.AI_AUTH_ERROR

    # Bad request (400)
    if "400" in exc_str or "invalid_argument" in exc_str:
        return AIFailureType.AI_BAD_REQUEST

    # Unavailable (503, 502, connection drop)
    if (
        "503" in exc_str
        or "502" in exc_str
        or "unavailable" in exc_str
        or "connection refused" in exc_str
        or "connecterror" in exc_str
        or "disconnect" in exc_str
        or "network" in exc_str
    ):
        return AIFailureType.AI_UNAVAILABLE

    # Server errors (500)
    if "500" in exc_str or "internal" in exc_str:
        return AIFailureType.AI_SERVER_ERROR

    # Invalid JSON or schema parsing errors
    if "json" in exc_str or "decode" in exc_str or "schema" in exc_str:
        return AIFailureType.AI_INVALID_RESPONSE

    return AIFailureType.AI_UNKNOWN_ERROR


def is_retryable(failure_type: AIFailureType) -> bool:
    """Return True only for plausibly transient failures."""
    return failure_type in (
        AIFailureType.AI_RATE_LIMITED,
        AIFailureType.AI_TIMEOUT,
        AIFailureType.AI_UNAVAILABLE,
        AIFailureType.AI_SERVER_ERROR,
    )


def parse_retry_after(exc: Exception) -> Optional[float]:
    """Inspect exception for Retry-After header or seconds if provided by provider."""
    retry_after = getattr(exc, "retry_after", None)
    if retry_after is not None:
        try:
            return float(retry_after)
        except (ValueError, TypeError):
            pass

    match = re.search(r"retry[-_]after[:\s]+(\d+(?:\.\d+)?)", str(exc), re.IGNORECASE)
    if match:
        try:
            return float(match.group(1))
        except (ValueError, TypeError):
            pass
    return None


async def execute_with_resilience(
    op_fn: Callable[[], Any],
    fallback_fn: Optional[Callable[[str], Any]] = None,
    op_name: str = "ai_operation",
    max_retries: Optional[int] = None,
    initial_backoff_ms: Optional[int] = None,
    max_backoff_ms: Optional[int] = None,
    timeout_seconds: Optional[float] = None,
) -> AIResilienceResult:
    """
    Execute a remote AI provider operation with circuit breaker, timeout,
    bounded exponential backoff retries, and graceful deterministic fallback.
    """
    _max_retries = max_retries if max_retries is not None else getattr(settings, "AI_MAX_RETRIES", 2)
    _initial_backoff = (
        initial_backoff_ms if initial_backoff_ms is not None else getattr(settings, "AI_INITIAL_BACKOFF_MS", 500)
    )
    _max_backoff = (
        max_backoff_ms if max_backoff_ms is not None else getattr(settings, "AI_MAX_BACKOFF_MS", 2000)
    )
    _timeout = (
        timeout_seconds
        if timeout_seconds is not None
        else getattr(settings, "AI_REQUEST_TIMEOUT_SECONDS", 10.0)
    )

    # 1. Check Circuit Breaker
    if not circuit_breaker.can_execute():
        logger.warning(
            f"AI Circuit Breaker is OPEN. Skipping {op_name} call to prevent provider storm; using fallback."
        )
        fallback_val = fallback_fn("circuit_open") if fallback_fn else None
        mark_fallback_used(AIFailureType.AI_RATE_LIMITED)
        return AIResilienceResult(
            success=False,
            response=fallback_val,
            failure_type=AIFailureType.AI_RATE_LIMITED,
            fallback_used=True,
            provider_available=False,
            error_message="Provider temporarily unavailable (circuit open)",
        )

    attempt = 0
    last_failure_type: Optional[AIFailureType] = None
    last_err_msg: Optional[str] = None

    while attempt <= _max_retries:
        try:
            # Execute with strict timeout
            if asyncio.iscoroutinefunction(op_fn):
                result = await asyncio.wait_for(op_fn(), timeout=_timeout)
            else:
                res_sync = op_fn()
                if asyncio.iscoroutine(res_sync):
                    result = await asyncio.wait_for(res_sync, timeout=_timeout)
                else:
                    result = res_sync

            # Success
            circuit_breaker.record_success()
            return AIResilienceResult(
                success=True,
                response=result,
                retry_count=attempt,
                fallback_used=False,
                provider_available=True,
            )

        except Exception as exc:
            last_failure_type = classify_gemini_error(exc)
            last_err_msg = type(exc).__name__
            circuit_breaker.record_failure(last_failure_type)

            if is_retryable(last_failure_type) and attempt < _max_retries:
                # Calculate backoff with jitter
                custom_wait = parse_retry_after(exc)
                if custom_wait is not None:
                    backoff_sec = min(custom_wait, _max_backoff / 1000.0)
                else:
                    exp_backoff = (_initial_backoff * (2 ** attempt)) / 1000.0
                    jitter = random.uniform(0.0, 0.25)
                    backoff_sec = min(exp_backoff + jitter, _max_backoff / 1000.0)

                logger.warning(
                    f"AI provider {op_name} failed with {last_failure_type.value} ({last_err_msg}). "
                    f"Retrying attempt {attempt + 1}/{_max_retries} in {backoff_sec:.2f}s."
                )
                await asyncio.sleep(backoff_sec)
                attempt += 1
            else:
                logger.warning(
                    f"AI provider {op_name} failed ({last_failure_type.value}: {last_err_msg}) "
                    f"after {attempt} retries; falling back to deterministic behavior."
                )
                break

    # If execution failed, invoke deterministic fallback
    fallback_val = fallback_fn(last_err_msg or "provider_error") if fallback_fn else None
    mark_fallback_used(last_failure_type or AIFailureType.AI_UNKNOWN_ERROR)
    return AIResilienceResult(
        success=False,
        response=fallback_val,
        failure_type=last_failure_type or AIFailureType.AI_UNKNOWN_ERROR,
        retry_count=attempt,
        fallback_used=True,
        provider_available=circuit_breaker.state != CircuitState.OPEN,
        error_message=last_err_msg,
    )


# =========================================================================
# HIGH-FIDELITY DETERMINISTIC FALLBACK IMPLEMENTATIONS
# =========================================================================

KNOWN_COLORS = {
    "black", "white", "blue", "red", "green", "silver", "grey", "gray",
    "brown", "pink", "yellow", "gold", "navy", "beige", "orange", "purple",
}

KNOWN_CATEGORIES = {
    "backpacks": ["backpack", "backpacks", "bag", "bags", "rucksack"],
    "laptop stands": ["stand", "stands", "laptop stand", "desk stand", "riser"],
    "electronics": ["mouse", "keyboard", "cable", "charger", "adapter", "usb", "headphone", "earphone"],
    "apparel": ["shirt", "t-shirt", "tshirt", "hoodie", "pants", "shoes", "jacket"],
}

STOP_WORDS = {
    "i", "need", "a", "an", "the", "looking", "for", "show", "me", "find",
    "want", "get", "give", "display", "some", "please", "can", "you", "under",
    "below", "above", "over", "around", "rs", "inr", "rupees", "rupee", "₹",
    "bucks", "price", "priced", "costs", "costing",
}


def deterministic_search_intent(
    message: str,
    previous_intent: Optional[SearchIntent] = None,
) -> SearchIntent:
    """
    High-fidelity deterministic SearchIntent extractor.
    Extracts constraints from natural language without external LLM dependencies.
    Separates navigation requests (cart, orders, history) so they do not pollute catalog search.
    """
    msg_raw = message.strip()
    msg_lower = msg_raw.lower()

    # 0. Navigation commands should not become catalog searches
    nav_exact = {
        "cart", "my cart", "go to cart", "open cart", "show my cart", "view cart",
        "orders", "my orders", "order history", "history", "my history", "view history", "view orders",
    }
    nav_phrases = [
        "go to cart", "open cart", "show my cart", "view cart", "what is in my cart",
        "my orders", "order history", "my history", "view history", "show my orders",
    ]
    if msg_lower in nav_exact or any(p in msg_lower for p in nav_phrases):
        return SearchIntent(
            search_text="navigation",
            category=None,
            color=None,
            min_price=None,
            max_price=None,
            required_features=[],
            sort=SearchSort.RELEVANCE,
        )

    # 1. Price extraction
    min_price: Optional[float] = None
    max_price: Optional[float] = None

    # Range: between 500 and 1500, 500 to 1500
    range_match = re.search(r"(?:between\s+|from\s+)?(?:rs\.?|inr|₹)?\s*(\d+)\s*(?:to|-|and)\s*(?:rs\.?|inr|₹)?\s*(\d+)", msg_lower)
    if range_match:
        try:
            p1, p2 = float(range_match.group(1)), float(range_match.group(2))
            min_price, max_price = min(p1, p2), max(p1, p2)
        except (ValueError, TypeError):
            pass
    else:
        # Max price: under 2000, below 1500, less than 1000, max 2500, budget is 80000
        max_match = re.search(r"(?:under|below|less\s+than|max|upto|up\s+to|<|at\s+most|budget\s+is|budget\s+of|budget\s+around|budget)\s*(?:rs\.?|inr|₹)?\s*(\d+(?:\.\d+)?)", msg_lower)
        if max_match:
            try:
                max_price = float(max_match.group(1))
            except (ValueError, TypeError):
                pass

        # Min price: above 500, greater than 1000, min 800, at least 500
        min_match = re.search(r"(?:above|over|more\s+than|min|at\s+least|>)\s*(?:rs\.?|inr|₹)?\s*(\d+(?:\.\d+)?)", msg_lower)
        if min_match:
            try:
                min_price = float(min_match.group(1))
            except (ValueError, TypeError):
                pass

    # 2. Color extraction
    color: Optional[str] = None
    for c in KNOWN_COLORS:
        if re.search(rf"\b{c}\b", msg_lower):
            color = c
            break

    # 3. Category extraction
    category: Optional[str] = None
    for cat_name, keywords in KNOWN_CATEGORIES.items():
        if any(re.search(rf"\b{kw}\b", msg_lower) for kw in keywords):
            category = cat_name
            break

    # 4. Sorting extraction
    sort = SearchSort.RELEVANCE
    if any(k in msg_lower for k in ["cheapest", "cheaper", "price low", "low to high", "lowest price"]):
        sort = SearchSort.PRICE_LOW
    elif any(k in msg_lower for k in ["expensive", "premium", "price high", "high to low", "highest price"]):
        sort = SearchSort.PRICE_HIGH

    # 5. Features and Use Case extraction
    required_features: List[str] = []
    if "wireless" in msg_lower:
        required_features.append("wireless")
    if "usb-c" in msg_lower or "usbc" in msg_lower:
        required_features.append("usb-c")
    if "bluetooth" in msg_lower:
        required_features.append("bluetooth")
    if "waterproof" in msg_lower:
        required_features.append("waterproof")
    if "laptop compartment" in msg_lower:
        required_features.append("laptop compartment")

    use_case: Optional[str] = None
    use_case_terms = ["coding", "gaming", "college", "work", "office", "study", "travel", "programming", "running", "fitness"]
    found_cases = [term for term in use_case_terms if re.search(rf"\b{term}\b", msg_lower)]
    if found_cases:
        use_case = " ".join(found_cases)

    preferences: Dict[str, Any] = {}
    if any(k in msg_lower for k in ["portability", "portable", "lightweight", "light"]):
        preferences["portability"] = "portability"
        if "lightweight" not in required_features:
            required_features.append("lightweight")
    elif any(k in msg_lower for k in ["performance", "power", "speed", "fast"]):
        preferences["portability"] = "performance"

    # 6. Clean search text
    clean_text = re.sub(r"(?:rs\.?|inr|₹)?\s*\d+(?:\.\d+)?", " ", msg_lower)
    clean_text = re.sub(r"[^\w\s-]", " ", clean_text)
    NAV_FILTER_WORDS = {"go", "to", "cart", "open", "show", "view", "orders", "history", "my"}
    words = [w for w in clean_text.split() if w not in STOP_WORDS and w not in NAV_FILTER_WORDS and len(w) > 1]
    search_text = " ".join(words).strip() if words else msg_lower.strip()

    # 7. Merge with previous intent ONLY if query is an active refinement
    if previous_intent:
        is_refinement = any(k in msg_lower for k in [
            "cheaper", "cheapest", "under", "below", "above", "more", "color",
            "black", "white", "blue", "sort", "filter", "another", "options",
            "different", "first", "second", "one", "also", "instead", "refine",
            "coding", "gaming", "college", "work", "office", "study", "portability", "performance"
        ]) or (previous_intent.category is not None)

        if is_refinement:
            if not search_text or search_text in ("products", "items"):
                search_text = previous_intent.search_text or search_text
            category = category or previous_intent.category
            color = color or previous_intent.color
            use_case = use_case or getattr(previous_intent, "use_case", None)
            if previous_intent.preferences:
                merged_prefs = dict(previous_intent.preferences)
                merged_prefs.update(preferences)
                preferences = merged_prefs
            if min_price is None and previous_intent.min_price is not None:
                min_price = previous_intent.min_price
            if max_price is None and previous_intent.max_price is not None:
                max_price = previous_intent.max_price
            if previous_intent.required_features:
                for f in previous_intent.required_features:
                    if f not in required_features:
                        required_features.append(f)

    return SearchIntent(
        search_text=search_text or "products",
        category=category,
        color=color,
        min_price=min_price,
        max_price=max_price,
        use_case=use_case,
        preferences=preferences,
        required_features=required_features,
        sort=sort,
    )


def evaluate_preference_sufficiency(
    intent: SearchIntent,
    message: str,
    preference_context: Optional[Dict[str, Any]] = None,
    turn_count: int = 0,
    clarification_count: int = 0,
) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Evaluates whether the accumulated SearchIntent and preference_context have sufficient information to execute catalog search.
    Returns tuple: (is_sufficient: bool, missing_field: Optional[str], clarification_question: Optional[str])
    """
    msg_lower = message.strip().lower()

    # Rule 0: If clarification limit reached (>= 3), proceed with search using whatever info we have!
    if clarification_count >= 3:
        return True, None, None

    # Rule 1: User explicitly refuses to answer or wants to search immediately
    refusal_patterns = ["not sure", "don't know", "dont know", "no idea", "any", "skip", "whatever", "just show", "show all", "no budget", "doesn't matter", "doesnt matter"]
    if any(p in msg_lower for p in refusal_patterns):
        return True, None, None

    # Rule 2: Complete or specific query upfront (brand, color, min_price, features, or 2+ meaningful words)
    stop_words = {
        "i", "need", "a", "an", "the", "show", "me", "some", "looking", "for", "want", "buy",
        "can", "you", "please", "get", "search", "find", "my", "budget", "is", "under", "around",
        "approx", "rs", "rupees", "inr", "not", "sure"
    }
    words = msg_lower.split()
    meaningful_words = [w for w in words if w not in stop_words]

    eff_max_price = intent.max_price if intent.max_price is not None else (preference_context or {}).get("max_price")
    eff_min_price = intent.min_price if intent.min_price is not None else (preference_context or {}).get("min_price")
    eff_use_case = intent.use_case or (preference_context or {}).get("use_case")
    eff_key_pref = (preference_context or {}).get("key_preference") or (intent.preferences or {}).get("key_preference")

    cat = (intent.category or "").strip()
    cat_lower = cat.lower()

    # Laptop accessories vs Laptop computer
    is_laptop_computer = ("laptop" in cat_lower or "laptops" in cat_lower or "laptop" in msg_lower) and not any(
        acc in cat_lower or acc in msg_lower for acc in ["stand", "bag", "sleeve", "cover", "charger", "case", "table", "desk", "mount", "cooler", "pad", "skin", "accessory", "accessories"]
    )

    has_specific_specs = bool(
        intent.brand or intent.color or intent.min_price or intent.required_features
        or (len(meaningful_words) >= 1 and not is_laptop_computer)
        or (len(meaningful_words) >= 3)
        or (eff_use_case and eff_max_price is not None and eff_key_pref)
    )

    if has_specific_specs:
        return True, None, None

    display_cat = cat or "product"

    # Rule 3: Check missing high-value preferences step-by-step for laptops/shoes/backpacks
    # Step A: Budget / max_price
    if eff_max_price is None and eff_min_price is None:
        return (
            False,
            "budget",
            f"Sure! What is your budget or maximum price for the {display_cat}?",
        )

    # Step B: Primary Use Case (for laptop computers, shoes, backpacks)
    if not eff_use_case:
        if is_laptop_computer:
            return (
                False,
                "use_case",
                "What will you mainly use it for — study, work, coding, or gaming?",
            )
        elif any(k in cat_lower for k in ["shoe", "backpack"]):
            use_case_options = "daily use, sports, or travel"
            return (
                False,
                "use_case",
                f"What will you mainly use it for — {use_case_options}?",
            )

    # Step C: Key Preference e.g. Portability vs Performance (for laptop computers)
    if is_laptop_computer and eff_use_case and not eff_key_pref:
        return (
            False,
            "preference",
            f"Do you prioritize portability or performance for your {display_cat}?",
        )

    # Sufficient!
    return True, None, None



def deterministic_agent_decision(
    context: Any,
    message: str,
    reason: str = "deterministic_fallback",
) -> AgentDecision:
    """
    High-fidelity deterministic AgentDecision proposer conforming to the AgentAction allowlist.
    Maps natural language patterns safely to appropriate tools without probabilistic risk.
    Explicitly separates navigation commands (cart, history, orders) from product search.
    """
    msg_lower = message.strip().lower()
    cands = getattr(context, "candidate_product_ids", []) or []
    selected = getattr(context, "selected_product_id", None)
    last_ref = getattr(context, "last_referenced_product_id", None)
    last_cart = getattr(context, "last_cart_product_id", None)

    # 1. Navigation: Cart (Checked BEFORE add/buy to avoid false triggers)
    cart_nav_exact = {
        "cart", "my cart", "view cart", "show cart", "open cart", "go to cart",
        "see cart", "check cart", "cart status", "cart items",
    }
    cart_nav_phrases = [
        "go to cart", "open cart", "show my cart", "view cart", "what is in my cart",
        "take me to cart", "navigate to cart", "check my cart", "see my cart", "show the cart",
    ]
    if (msg_lower in cart_nav_exact or any(p in msg_lower for p in cart_nav_phrases)) and not any(
        w in msg_lower for w in ["add", "put in", "remove", "delete from"]
    ):
        return AgentDecision(
            action=AgentAction.VIEW_CART,
            reasoning_summary=f"{reason}: user requested cart view",
        )

    # 2. Navigation: Orders & History (Separated from product search)
    order_nav_exact = {
        "orders", "my orders", "order history", "history", "my history", "view history",
        "view orders", "show orders", "show my orders", "past orders", "previous orders",
    }
    order_nav_phrases = [
        "my orders", "show my orders", "order history", "previous orders", "past orders",
        "view orders", "my history", "view history", "purchase history", "show my history",
    ]
    if msg_lower in order_nav_exact or any(p in msg_lower for p in order_nav_phrases):
        return AgentDecision(
            action=AgentAction.ASK_CLARIFICATION,
            reasoning_summary=f"{reason}: navigation to orders/history requested",
            response_intent="You can view your past orders and history in the Orders and History sections in the sidebar.",
        )

    # 3. Add to Cart
    if any(w in msg_lower for w in ["add", "buy", "put in cart", "purchase"]):
        target = selected or (cands[0] if len(cands) == 1 else last_ref)
        if target:
            return AgentDecision(
                action=AgentAction.ADD_TO_CART,
                target_product_id=target,
                quantity=1,
                reasoning_summary=f"{reason}: deterministic add to cart",
            )
        elif len(cands) > 1:
            return AgentDecision(
                action=AgentAction.ASK_CLARIFICATION,
                reasoning_summary=f"{reason}: ambiguous add target with multiple candidates",
            )

    # 4. Remove from Cart
    if any(w in msg_lower for w in ["remove", "delete from cart", "clear item", "take out"]):
        if last_cart:
            return AgentDecision(
                action=AgentAction.REMOVE_FROM_CART,
                target_product_id=last_cart,
                reasoning_summary=f"{reason}: deterministic cart removal",
            )
        return AgentDecision(
            action=AgentAction.REMOVE_FROM_CART,
            reasoning_summary=f"{reason}: cart item removal requested",
        )

    # 5. Compare
    if any(w in msg_lower for w in ["compare", "versus", "vs", "difference"]):
        targets = cands[:2] if len(cands) >= 2 else []
        if targets:
            return AgentDecision(
                action=AgentAction.COMPARE,
                target_product_ids=targets,
                reasoning_summary=f"{reason}: deterministic compare top candidates",
            )
        return AgentDecision(
            action=AgentAction.ASK_CLARIFICATION,
            reasoning_summary=f"{reason}: compare requested without sufficient candidates",
        )

    # 6. Inventory check
    if any(w in msg_lower for w in ["in stock", "available", "units left", "how many"]):
        target = selected or (cands[0] if cands else last_ref)
        if target:
            return AgentDecision(
                action=AgentAction.CHECK_INVENTORY,
                target_product_id=target,
                reasoning_summary=f"{reason}: deterministic stock check",
            )

    # 7. Checkout preparation
    if any(w in msg_lower for w in ["checkout", "ready to checkout", "proceed to checkout", "prepare checkout"]):
        return AgentDecision(
            action=AgentAction.PREPARE_CHECKOUT,
            reasoning_summary=f"{reason}: user requested checkout preparation",
        )

    # 8. Select Product
    if any(w in msg_lower for w in ["first", "second", "prefer", "choose", "select", "details"]):
        target = None
        if "second" in msg_lower and len(cands) > 1:
            target = cands[1]
        elif cands:
            target = cands[0]
        if target:
            return AgentDecision(
                action=AgentAction.SELECT_PRODUCT,
                target_product_id=target,
                reasoning_summary=f"{reason}: deterministic candidate selection",
            )

    # 9. Ambiguous/clarification check
    if len(msg_lower.split()) < 2 and msg_lower in ("what", "help", "hello", "hi", "hey"):
        return AgentDecision(
            action=AgentAction.ASK_CLARIFICATION,
            reasoning_summary=f"{reason}: greeting or generic inquiry requires clarification",
        )

    # 10. Default to SEARCH
    return AgentDecision(
        action=AgentAction.SEARCH,
        reasoning_summary=f"{reason}: standard search intent",
        response_intent="search_products",
    )


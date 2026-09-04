You are a senior AI-agent/backend engineer working on the RazorReach project.

TASK 16B — IMPLEMENT THE DETERMINISTIC FINITE-STATE MACHINE (FSM) FOR THE STATEFUL BUYER AGENT.

==================================================
1. OBJECTIVE
==================================================

Upgrade the existing stateful Buyer Agent from Task 16A into a deterministic, state-controlled commerce workflow.

The objective is:

User Message
    ↓
Load AgentState
    ↓
Buyer Agent / Gemini Intent Reasoning
    ↓
Deterministic FSM
    ↓
Validate Transition
    ↓
Execute Allowed Tool
    ↓
Backend Source of Truth
    ↓
Update AgentState
    ↓
Grounded Response

IMPORTANT:

The LLM may reason and propose intent/actions.

The LLM must NOT control authoritative application state.

The FSM and backend must control:

- workflow state
- authorization
- inventory
- price
- payment
- order status
- merchant ownership
- confirmation requirements

==================================================
2. CRITICAL FREEZE BOUNDARIES
==================================================

DO NOT MODIFY:

- Razorpay webhook implementation
- Razorpay webhook verification
- Razorpay payment verification
- checkout payment calculations
- existing payment architecture
- existing order architecture
- frontend
- Revenue Opportunity Engine
- Revenue Agent
- authentication architecture
- existing Buyer Agent framework/architecture

The payment/webhook pipeline is FROZEN.

Do not refactor or “improve” the webhook/payment implementation as part of this task.

Do not implement autonomous purchasing.

Do not implement payment automation.

Do not implement WebSockets, Redis, workers, streaming, vector memory, or a new agent framework.

==================================================
3. INSPECT TASK 16A FIRST
==================================================

Before modifying code:

1. Inspect the existing AgentState implementation.
2. Inspect the existing AgentState service.
3. Inspect the current Buyer Agent.
4. Inspect POST /api/ai/search.
5. Inspect SearchIntent.
6. Inspect existing Buyer Tools.
7. Inspect cart/checkout boundaries.
8. Inspect existing audit implementation.
9. Inspect existing tests.

Do not assume filenames or implementation details.

Reuse existing abstractions wherever possible.

Do not duplicate SearchIntent or AgentState functionality.

==================================================
4. EXISTING AGENT STATES
==================================================

Task 16A introduced these controlled states:

START
UNDERSTANDING
SEARCHING
SHOWING_RESULTS
PRODUCT_SELECTED
COMPARING
CART_REVIEW
CHECKOUT_READY
AWAITING_CONFIRMATION
PAYMENT_PENDING
ORDER_CONFIRMED
COMPLETED
FAILED

Reuse the existing enum/schema from Task 16A.

Do not create a second competing state enum.

==================================================
5. CREATE FSM SERVICE
==================================================

Create:

backend/app/services/agent_fsm.py

Implement a centralized deterministic FSM.

The FSM must contain an explicit transition table.

A reasonable starting structure is:

VALID_TRANSITIONS = {
    START: {
        UNDERSTANDING,
    },

    UNDERSTANDING: {
        SEARCHING,
        SHOWING_RESULTS,
        FAILED,
    },

    SEARCHING: {
        SHOWING_RESULTS,
        FAILED,
    },

    SHOWING_RESULTS: {
        SEARCHING,
        PRODUCT_SELECTED,
        COMPARING,
        CART_REVIEW,
        FAILED,
    },

    PRODUCT_SELECTED: {
        COMPARING,
        CART_REVIEW,
        CHECKOUT_READY,
        SHOWING_RESULTS,
        FAILED,
    },

    COMPARING: {
        PRODUCT_SELECTED,
        SHOWING_RESULTS,
        CART_REVIEW,
        FAILED,
    },

    CART_REVIEW: {
        CHECKOUT_READY,
        SHOWING_RESULTS,
        FAILED,
    },

    CHECKOUT_READY: {
        AWAITING_CONFIRMATION,
        FAILED,
    },

    AWAITING_CONFIRMATION: {
        PAYMENT_PENDING,
        CART_REVIEW,
        FAILED,
    },

    PAYMENT_PENDING: {
        ORDER_CONFIRMED,
        FAILED,
    },

    ORDER_CONFIRMED: {
        COMPLETED,
        FAILED,
    },

    COMPLETED: {
        START,
        SHOWING_RESULTS,
    },

    FAILED: {
        START,
        UNDERSTANDING,
        SHOWING_RESULTS,
    },
}

IMPORTANT:

Adapt this table if the existing architecture requires it.

Do not blindly copy it.

The final FSM must represent the actual RazorReach workflow.

==================================================
6. FSM FUNCTIONS
==================================================

Implement clear deterministic functions, for example:

can_transition(
    current_state,
    next_state
)

and:

transition_state(
    agent_state,
    next_state,
    reason=None
)

Use appropriate typing and existing project conventions.

Requirements:

- valid transitions succeed
- invalid transitions fail safely
- invalid transitions must not modify persisted state
- current state must be validated
- target state must be validated
- updated_at must change after successful transition
- state must remain server-controlled

Do not allow arbitrary state mutation.

==================================================
7. SERVER MUST OWN THE FSM
==================================================

Never accept current_state directly from:

- frontend
- user request
- Gemini
- tool output
- arbitrary JSON

Example malicious request:

{
    "current_state": "PAYMENT_PENDING"
}

must NOT be able to force the agent into PAYMENT_PENDING.

Likewise, Gemini must never be allowed to directly write:

{
    "current_state": "ORDER_CONFIRMED"
}

The FSM service must validate every transition.

==================================================
8. TRANSITION REASONS
==================================================

If compatible with Task 16A, add compact transition metadata.

Possible fields:

last_transition
last_transition_reason

Examples:

SEARCH_STARTED
SEARCH_RESULTS_RETURNED
PRODUCT_SELECTED
COMPARISON_REQUESTED
CART_REVIEW_REQUESTED
CHECKOUT_PREPARED
CONFIRMATION_REQUIRED
PAYMENT_STARTED
PAYMENT_CONFIRMED
ORDER_COMPLETED
RECOVERABLE_ERROR

Do not store:

- full prompts
- full Gemini responses
- full product documents
- payment secrets
- JWTs
- API keys
- raw payment payloads

Keep transition metadata compact.

==================================================
9. BUYER AGENT INTEGRATION
==================================================

Integrate the FSM into the existing Buyer Agent.

Do NOT replace the existing Buyer Agent.

Existing conceptual flow:

Buyer Agent
    ↓
Gemini intent extraction
    ↓
SearchIntent
    ↓
Buyer tools
    ↓
Hybrid search
    ↓
Grounded response

New flow:

Buyer Agent
    ↓
Load AgentState
    ↓
Interpret current user turn
    ↓
Determine required workflow action
    ↓
Request FSM transition
    ↓
FSM validates transition
    ↓
Execute allowed tool
    ↓
Backend result
    ↓
Update AgentState
    ↓
Generate grounded response

The LLM should NOT be responsible for selecting arbitrary FSM states.

Instead, map recognized intents/actions to deterministic application transitions.

==================================================
10. EXAMPLE — SEARCH
==================================================

User:

"I need a laptop backpack under ₹2000."

Expected conceptual flow:

START
 ↓
UNDERSTANDING
 ↓
SEARCHING
 ↓
SHOWING_RESULTS

AgentState should contain compact information such as:

goal:
"find laptop backpack under ₹2000"

intent:
existing SearchIntent representation

candidate_product_ids:
[...]

current_state:
SHOWING_RESULTS

Do not store complete product documents in AgentState.

==================================================
11. MULTI-TURN SEARCH
==================================================

The FSM must support multi-turn context.

Example:

TURN 1:

User:
"Find me a laptop backpack under ₹2000."

State:

START
→ UNDERSTANDING
→ SEARCHING
→ SHOWING_RESULTS

TURN 2:

User:
"Compare the first two."

State:

SHOWING_RESULTS
→ COMPARING

TURN 3:

User:
"I prefer the second one."

State:

COMPARING
→ PRODUCT_SELECTED

TURN 4:

User:
"Add it to my cart."

State should move through the appropriate existing cart state.

Do not invent a new cart architecture.

==================================================
12. PRODUCT SELECTION SECURITY
==================================================

When a product is selected:

candidate_product_ids
        ↓
selected_product_id

But never trust the LLM's product ID alone.

The backend must verify:

- product exists
- product is accessible
- product belongs to the current result/context where appropriate
- current user is authorized to perform the operation

Do not allow:

SHOWING_RESULTS
→ PAYMENT_PENDING

just because Gemini selected a product.

==================================================
13. COMPARISON
==================================================

Comparison must use authoritative backend product data.

Valid conceptual transition:

SHOWING_RESULTS
→ COMPARING

Possible continuation:

COMPARING
→ PRODUCT_SELECTED

or:

COMPARING
→ SHOWING_RESULTS

or appropriate cart transition.

The LLM must not fabricate product attributes.

Use the existing grounded product service/tooling.

==================================================
14. CART / CHECKOUT BOUNDARY
==================================================

Do NOT implement autonomous checkout or payment.

Prepare the FSM boundary:

PRODUCT_SELECTED
    ↓
CART_REVIEW
    ↓
CHECKOUT_READY
    ↓
AWAITING_CONFIRMATION

Actual cart and checkout operations remain controlled by the existing backend.

Do not modify payment implementation.

==================================================
15. CONFIRMATION GATE
==================================================

AWAITING_CONFIRMATION represents an explicit safety boundary.

The system must not automatically transition:

AWAITING_CONFIRMATION
→ PAYMENT_PENDING

because:

- Gemini suggested it
- user previously expressed interest
- product was selected
- cart exists

A valid explicit confirmation must be required through a controlled application path.

If the complete confirmation mechanism belongs to a later task, establish the FSM boundary now without implementing autonomous payment.

==================================================
16. PAYMENT STATES
==================================================

Do not modify Razorpay payment/webhook code.

The FSM may represent:

AWAITING_CONFIRMATION
        ↓
PAYMENT_PENDING
        ↓
ORDER_CONFIRMED
        ↓
COMPLETED

But actual payment/order truth MUST come from the backend/payment system.

The FSM must never manufacture:

ORDER_CONFIRMED

based solely on Gemini output.

Example:

Gemini says:

"Payment succeeded."

This is NOT authoritative.

Only verified backend/payment state can justify ORDER_CONFIRMED.

==================================================
17. FAILURE / RECOVERY
==================================================

Implement deterministic failure handling.

Examples:

SEARCHING
→ FAILED

PRODUCT_SELECTED
→ FAILED

CHECKOUT_READY
→ FAILED

PAYMENT_PENDING
→ FAILED

Recovery should use valid transitions such as:

FAILED
→ START

FAILED
→ UNDERSTANDING

FAILED
→ SHOWING_RESULTS

depending on the actual situation.

Store only a compact error summary.

Never persist sensitive provider payloads.

==================================================
18. TURN COUNTER
==================================================

Use the Task 16A turn_count.

Increment it once per user-agent interaction.

Do NOT increment once per tool call.

Example:

One user message
→ Gemini
→ search tool
→ inventory tool
→ response

must count as ONE turn.

Inspect Task 16A implementation before modifying this behavior.

==================================================
19. CONCURRENCY
==================================================

Because the agent will eventually operate in real time, inspect possible concurrent requests for the same session.

Ensure that state updates do not silently corrupt newer state.

Use atomic MongoDB operations where practical.

At minimum:

- preserve updated_at
- avoid unnecessary read-modify-write races
- prevent invalid state overwrite

Do NOT introduce Redis or distributed locks in this task.

==================================================
20. AUDIT / OBSERVABILITY
==================================================

If appropriate, record compact state transition information using the existing audit infrastructure.

Do not create a second audit system.

Useful structured logging fields:

session_id
user_id
previous_state
next_state
transition_reason

Never log:

- passwords
- JWTs
- API keys
- payment signatures
- sensitive payment information
- full prompts
- complete Gemini responses

==================================================
21. TESTS
==================================================

Create:

backend/tests/test_agent_fsm.py

Test at minimum:

FSM VALIDITY:

1. START → UNDERSTANDING succeeds.
2. UNDERSTANDING → SEARCHING succeeds.
3. SEARCHING → SHOWING_RESULTS succeeds.
4. SHOWING_RESULTS → PRODUCT_SELECTED succeeds.
5. SHOWING_RESULTS → COMPARING succeeds.
6. SHOWING_RESULTS → PAYMENT_PENDING fails.
7. START → PAYMENT_PENDING fails.
8. PRODUCT_SELECTED → ORDER_CONFIRMED fails.

STATE PERSISTENCE:

9. Valid transition persists.
10. Invalid transition does not modify state.
11. updated_at changes after successful transition.
12. turn_count remains correct.

SECURITY:

13. Client cannot force current_state.
14. Gemini cannot directly force current_state.
15. Cross-user sessions remain isolated.

COMMERCE SAFETY:

16. PAYMENT_PENDING cannot be reached through an invalid shortcut.
17. ORDER_CONFIRMED cannot be reached arbitrarily.
18. FSM cannot itself mark payment successful.
19. FSM cannot modify inventory.
20. FSM cannot change merchant ownership.

FAILURE:

21. SEARCHING → FAILED works.
22. FAILED → UNDERSTANDING works.
23. Invalid recovery transition is rejected.

INTEGRATION:

24. Existing Buyer Agent tests continue passing.
25. Existing /api/ai/search behavior remains compatible.

Add additional tests if the existing architecture requires them.

==================================================
22. REGRESSION TESTING
==================================================

Run:

- new FSM tests
- AgentState tests from Task 16A
- Buyer Agent tests
- full backend test suite

Do not accept the task merely because the new tests pass.

Existing tests must remain green.

==================================================
23. PERFORMANCE
==================================================

FSM operations must be extremely lightweight.

Do not add another LLM call just to determine the FSM state.

Preferred flow:

state read
→ existing LLM/tool processing
→ deterministic transition
→ state update

Do not add:

- recursive planning loops
- autonomous agent loops
- additional model calls solely for state management
- Redis
- workers
- WebSockets
- streaming
- vector memory
- external orchestration framework

==================================================
24. DOCUMENTATION
==================================================

Update relevant documentation.

Document the architecture:

User Message
     ↓
AgentState
     ↓
Buyer Agent
     ↓
Deterministic FSM
     ↓
Policy-controlled Tools
     ↓
Backend Source of Truth
     ↓
AgentState Update
     ↓
Grounded Response

Clearly state:

"The LLM proposes intent/actions, while the deterministic FSM and backend enforce workflow and commerce safety."

==================================================
25. ACCEPTANCE CRITERIA
==================================================

Task 16B is COMPLETE only when:

[ ] Centralized deterministic FSM exists.
[ ] Existing AgentState enum is reused.
[ ] Valid transitions are explicitly defined.
[ ] Invalid transitions are rejected.
[ ] Invalid transitions do not mutate state.
[ ] Server owns FSM state.
[ ] Gemini cannot directly control FSM state.
[ ] Frontend cannot directly control FSM state.
[ ] Multi-turn state works.
[ ] Search → results works.
[ ] Results → product selection works.
[ ] Comparison state works.
[ ] Cart boundary is represented.
[ ] Checkout boundary is represented.
[ ] Confirmation boundary is represented.
[ ] Payment state remains backend-controlled.
[ ] Order confirmation remains backend-controlled.
[ ] Failure/recovery transitions work.
[ ] Cross-user isolation remains intact.
[ ] Concurrency risks are considered.
[ ] No webhook/payment code was changed.
[ ] No autonomous purchasing was implemented.
[ ] Tests were added.
[ ] Full regression suite passes.
[ ] Documentation updated.

==================================================
26. IMPORTANT — DO NOT OVERBUILD
==================================================

This task is ONLY:

STATEFUL AGENT
+
DETERMINISTIC FSM
+
SAFE STATE TRANSITIONS

Do NOT implement:

- Task 16C persistent session improvements beyond what already exists
- Task 16D autonomous decision loop
- Task 16E advanced policy gate
- Task 16F full conversational memory
- Task 16G advanced cart/checkout orchestration
- Task 16H payment-event state integration
- Task 16I advanced latency optimization
- Task 16J agent evaluation framework

Those will be handled separately.

==================================================
27. FINAL WALKTHROUGH FORMAT
==================================================

When implementation is complete, provide a concise walkthrough containing:

1. Files created.
2. Files modified.
3. Existing AgentState implementation reused.
4. FSM state diagram.
5. Complete transition table.
6. Buyer Agent integration flow.
7. Example multi-turn conversation and state changes.
8. Security enforcement.
9. Failure/recovery behavior.
10. Concurrency handling.
11. Tests added.
12. Full test-suite result.
13. Any limitations.
14. Explicit confirmation that Razorpay webhook/payment code was NOT modified.
15. Explicit confirmation that autonomous purchasing was NOT implemented.

IMPORTANT:

Do NOT claim Task 16C, 16D, 16E, or later tasks are complete.

Stop after Task 16B.
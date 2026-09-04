TASK: Conversational Buyer Agent — Progressive Preference Discovery

PROJECT:
RazorReach — Razorpay AI Growth & Agentic Commerce Buildathon

OBJECTIVE:
Upgrade the existing Buyer Agent so that it performs adaptive, stateful preference discovery before searching when the user's product request is too vague.

IMPORTANT:
Do NOT redesign the architecture.
Do NOT create another AI agent.
Do NOT modify Razorpay payment/webhook logic.
Do NOT replace the existing FSM, Policy Gate, AgentState, reference resolver, hybrid search, or resilience system.

The goal is to make the current Buyer Agent genuinely conversational.

==================================================
1. CURRENT ARCHITECTURE — PRESERVE
==================================================

The existing pipeline must remain authoritative:

User Message
    ↓
AgentState
    ↓
LangGraph
    ↓
OBSERVE
    ↓
DECIDE
    ↓
REFERENCE RESOLVER
    ↓
POLICY GATE
    ↓
FSM
    ↓
Tool
    ↓
UPDATE STATE
    ↓
AUDIT
    ↓
OBSERVE / END

The LLM is NOT authoritative.

Backend remains the source of truth.

The existing deterministic:
- AgentState
- FSM
- Policy Gate
- Conversation Resolver
- commerce tools
- hybrid search
- AI resilience/fallback
- audit trail

must remain intact.

==================================================
2. PROBLEM TO SOLVE
==================================================

Current behavior is approximately:

User:
"I need a laptop"

Agent:
[immediately returns products]

This demonstrates search, but not true conversational product discovery.

Change the behavior to:

User:
"I need a laptop"

Agent:
"Sure. What's your budget?"

User:
"Under ₹60,000"

Agent:
"What will you mainly use it for — study, work, coding, or gaming?"

User:
"Coding and college"

Agent:
"Do you prioritize portability or performance?"

User:
"Portability"

Agent:
"Got it. I'm looking for lightweight laptops under ₹60,000
suited for coding and college."

→ Search
→ Return matched products

The agent must NOT ask unnecessary questions when enough information is already available.

==================================================
3. CORE DESIGN PRINCIPLE
==================================================

Implement:

PROGRESSIVE PREFERENCE DISCOVERY

NOT:

FIXED QUESTIONNAIRE

The agent should dynamically determine whether enough information exists to perform a useful search.

Examples:

"I need a laptop"
→ ask budget

"I need a laptop under ₹60,000"
→ budget known
→ ask important use case

"I need a laptop under ₹60,000 for coding"
→ budget + use case known
→ search immediately OR ask only one highly valuable missing preference if it materially improves results

"Find me a black Dell laptop under ₹60,000 for coding"
→ enough information
→ search immediately

"I want running shoes"
→ ask budget/use case depending on available catalog information

"Show me Nike running shoes under ₹5,000"
→ enough information
→ search immediately

Do not force every user through the same sequence.

==================================================
4. INSPECT EXISTING CODE FIRST
==================================================

Before modifying anything, inspect:

backend/app/schemas/agent_state.py
backend/app/schemas/ai_search.py
backend/app/agents/buyer_agent.py
backend/app/agents/prompts.py
backend/app/agents/langgraph/state.py
backend/app/agents/langgraph/nodes.py
backend/app/agents/langgraph/edges.py
backend/app/agents/langgraph/graph.py
backend/app/agents/langgraph/runner.py
backend/app/services/conversation_resolver.py
backend/app/services/agent_fsm.py
backend/app/services/agent_policy.py
backend/app/services/ai_resilience.py
backend/app/integrations/gemini.py

Also inspect the existing Buyer Agent tests.

Do not duplicate functionality that already exists.

==================================================
5. PREFERENCE MODEL
==================================================

Extend the existing state/context only where necessary.

Prefer reusing the existing SearchIntent and bounded AgentState instead of creating a large new state model.

The system should be able to preserve structured preferences such as:

- category
- product type
- budget / max price
- minimum price
- brand
- color
- use_case
- required_features
- portability
- performance preference
- other relevant structured constraints

Do NOT create dozens of category-specific fields.

Use a bounded generic preference representation where possible.

Example conceptual structure:

preference_context:
    category
    budget
    use_case
    preferences
    constraints
    missing_information

Keep it:
- serializable
- bounded
- compact
- safe to persist
- free of raw LLM outputs
- free of sensitive data

==================================================
6. CONVERSATION STAGE
==================================================

Introduce a small deterministic representation of discovery progress if the current architecture does not already provide one.

Possible conceptual stages:

START
UNDERSTANDING
CLARIFYING
READY_TO_SEARCH
SEARCHING
SHOWING_RESULTS
PRODUCT_SELECTED
CART_REVIEW
CHECKOUT_READY
...

Do NOT create a second FSM.

If the existing FSM can represent this cleanly, extend it minimally.

The existing FSM remains authoritative.

==================================================
7. LANGGRAPH CHANGE
==================================================

Extend the Buyer LangGraph with an adaptive clarification decision.

Desired conceptual flow:

START
  ↓
LOAD_STATE
  ↓
OBSERVE
  ↓
DECIDE
  ↓
RESOLVE_REFERENCES
  ↓
CHECK_INFORMATION
  ↓
┌──────────────────────────────┐
│ Enough information?          │
└──────────────────────────────┘
       ↓ YES             ↓ NO
      SEARCH        ASK_CLARIFICATION
       ↓                  ↓
   RESULTS          UPDATE STATE
       ↓                  ↓
      END               OBSERVE

Important:

ASK_CLARIFICATION must NOT execute a commerce tool.

It should:
1. identify the highest-value missing preference
2. generate a concise question
3. update bounded conversational state
4. return the question to the customer

Then the next user message continues the same session.

==================================================
8. INFORMATION SUFFICIENCY
==================================================

Create a deterministic or strongly constrained decision mechanism for:

"Do we have enough information to search?"

The LLM may propose missing information, but the application must validate it.

Do NOT allow the LLM to invent arbitrary required fields.

The system should prioritize information roughly as:

1. Product category/type
2. Hard constraints explicitly requested by user
3. Budget when relevant
4. Primary use case when relevant
5. One important preference that materially changes ranking

Avoid asking for low-value details.

Example:

User:
"I need a laptop"

Missing:
- budget
- use case

Ask:
"What is your budget?"

NOT:
"What color?"
"What brand?"
"How much RAM?"
"What storage?"
"What screen size?"

all at once.

==================================================
9. MAXIMUM QUESTIONS
==================================================

Never turn the experience into a long questionnaire.

Default maximum clarification questions before searching:

3

If enough information becomes available earlier:
SEARCH immediately.

If the user refuses to answer:
Proceed using available information where possible.

Example:

Agent:
"What's your budget?"

User:
"Not sure."

Agent:
"No problem. What will you mainly use it for — study, work, coding, or gaming?"

Continue with useful discovery.

==================================================
10. NATURAL LANGUAGE PREFERENCE EXTRACTION
==================================================

The system must understand answers such as:

"under 60k"
"around 50 thousand"
"between 40 and 60k"
"mostly coding"
"coding and college"
"I want something lightweight"
"performance matters more"
"black would be better"
"I don't care about the brand"

Normalize these into structured state.

Do not blindly trust LLM-generated values.

Validate:
- price ranges
- enum-like values
- product/category existence
- allowed fields
- reasonable bounds

Existing backend/search validation remains authoritative.

==================================================
11. MULTI-TURN BEHAVIOR
==================================================

Example required flow:

TURN 1

User:
"I need a laptop."

Expected:
- preserve session
- category = laptop
- determine budget missing
- FSM remains in appropriate understanding/clarification state
- no product search yet
- ask budget

TURN 2

User:
"Under ₹60,000."

Expected:
- preserve category
- extract max_price = 60000
- identify remaining high-value information
- ask use case

TURN 3

User:
"Coding and college."

Expected:
- preserve budget
- extract use_case = coding + college
- determine whether another preference is materially useful
- optionally ask portability/performance
- otherwise search

TURN 4

User:
"Portability."

Expected:
- preserve all previous preferences
- translate preference into search constraints/ranking signals where supported
- search products
- return grounded results

==================================================
12. SEARCH INTEGRATION
==================================================

Do NOT create a new search engine.

Reuse the existing Buyer Agent search tool and hybrid search.

The final search request should contain only validated preferences.

Example conceptual SearchIntent:

search_text:
"laptop for coding and college"

category:
"laptop"

max_price:
60000

required_features:
[...]

Do not pass raw conversational history directly into database queries.

Do not search using unvalidated LLM text as a hidden filter.

==================================================
13. EXISTING REFERENCE RESOLUTION
==================================================

Preserve all existing conversational references.

Examples:

"show me the second one"
"compare the first two"
"add that to cart"
"make it black"
"show me the cheaper one"
"what about the other one?"

Preference discovery must NOT break these capabilities.

Example:

User:
"I need a laptop"

Agent:
"What's your budget?"

User:
"Under 60k"

Agent:
"What will you use it for?"

User:
"Coding"

Agent:
[results]

User:
"Show me the second one"

→ existing deterministic reference resolver handles this.

==================================================
14. CLARIFICATION RESPONSE QUALITY
==================================================

Clarification responses should be short and natural.

Good:

"Sure. What's your budget?"

"Got it. What will you mainly use it for — study, work, coding, or gaming?"

"Do you care more about portability or performance?"

Bad:

"Based on my analysis, there are several factors..."

Bad:

"Please provide the following information:
1...
2...
3...
4..."

The agent should feel like a shopping assistant, not a form.

==================================================
15. LLM RESPONSIBILITY
==================================================

Gemini may be used for:

- interpreting the user's natural-language preference
- determining candidate missing preference
- generating natural clarification wording
- producing structured decisions

Gemini must NOT:

- directly query MongoDB
- mutate inventory
- mutate cart
- create payment orders
- verify payment
- bypass Policy Gate
- bypass FSM
- change AgentState arbitrarily
- decide authorization
- invent products
- invent product attributes

The backend remains authoritative.

==================================================
16. DETERMINISTIC FALLBACK
==================================================

Integrate with the existing AI resilience system.

If Gemini fails:

Do not return an empty or broken experience.

Use deterministic fallback behavior where possible.

Examples:

"I need a laptop"
→ deterministic recognition:
category = laptop
missing = budget
→ ask:
"What's your budget?"

"I need a black laptop under 60000"
→ deterministic extraction where supported
→ search

Preserve the existing:
AI / DETERMINISTIC_FALLBACK / CLARIFICATION / ERROR
response modes.

Do not introduce another resilience mechanism.

==================================================
17. AUDIT
==================================================

Add audit coverage for clarification decisions if the existing audit design does not already support them.

Possible action:

BUYER_AGENT_CLARIFICATION

Metadata should contain safe structured information such as:

- session_id
- category
- missing_preference
- conversation_stage
- response_mode

Do NOT store:
- raw sensitive information
- credentials
- payment data
- secrets
- hidden chain-of-thought
- full raw LLM response

The audit trail should make the following visible:

Customer intent
→ clarification requested
→ preference captured
→ search performed
→ product selected
→ cart action
→ checkout/payment

==================================================
18. FRONTEND COMPATIBILITY
==================================================

Do not redesign the customer UI.

The existing chat interface should automatically support:

Agent:
"What's your budget?"

User:
"Under ₹60,000"

Agent:
"What will you mainly use it for?"

The API response should remain backward compatible.

If necessary, extend the response schema with fields such as:

response_mode
conversation_stage
clarification_required
clarification_question
session_id

All new fields should be optional/backward compatible where possible.

==================================================
19. IMPORTANT SAFETY BOUNDARY
==================================================

The clarification node is READ/UNDERSTAND behavior.

It must never:

- add products to cart
- change quantities
- remove products
- prepare payment
- create Razorpay orders
- trigger payment
- modify inventory

Those actions must continue through:

Decision
→ Policy Gate
→ FSM
→ authoritative tool

==================================================
20. TESTS
==================================================

Add comprehensive tests.

Minimum required scenarios:

A. Vague request

"I need a laptop"

Expected:
clarification
no search

B. Budget provided

"I need a laptop"
→ "under 60000"

Expected:
budget persisted
next useful clarification

C. Complete request

"Find me a black Dell laptop under 60000 for coding"

Expected:
search immediately

D. Three-turn preference discovery

"I need a laptop"
→ budget
→ use case
→ portability
→ search

E. User changes preference

"Actually make it under 50000"

Expected:
max_price updated
previous state preserved

F. User adds preference

"Also make it black"

Expected:
color added
search/refinement remains coherent

G. User refuses

"I don't know my budget"

Expected:
graceful continuation
no dead-end

H. Session persistence

Close request / new request using same session_id.

Expected:
preferences remain available.

I. Session isolation

User A cannot access User B's preference state.

J. Reference resolution after clarification

"Show me the second one"

Expected:
existing resolver still works.

K. Add to cart after clarification

Expected:
existing Policy Gate + FSM path works.

L. Gemini failure

Expected:
deterministic fallback/clarification.

M. Invalid LLM preference

Expected:
backend rejects or ignores invalid value safely.

N. Maximum clarification limit

Expected:
agent does not endlessly ask questions.

O. Payment boundary

Clarification flow cannot trigger payment.

==================================================
21. REGRESSION TESTS
==================================================

Run the complete existing backend test suite.

Do not accept:

- broken existing Buyer Agent tests
- broken LangGraph tests
- broken FSM tests
- broken Policy Gate tests
- broken reference resolver tests
- broken resilience tests
- broken audit tests
- broken cart/checkout tests
- broken payment tests

Payment/webhook implementation is FROZEN.

Do not modify:
- Razorpay order creation
- payment verification
- webhook signature verification
- webhook idempotency
- payment analytics
- payment audit implementation

==================================================
22. DOCUMENTATION
==================================================

Update documentation explaining:

"Conversation memory ≠ conversational discovery."

Document the new Buyer Agent flow:

Customer Intent
    ↓
Understand
    ↓
Check Missing Preferences
    ↓
Clarify if Necessary
    ↓
Search
    ↓
Show Results
    ↓
Reference Resolution
    ↓
Product Decision
    ↓
Cart
    ↓
Checkout
    ↓
Razorpay Payment

Also explain why clarification is adaptive instead of a fixed questionnaire.

==================================================
23. ACCEPTANCE CRITERIA
==================================================

The task is complete only if:

1. "I need a laptop" does NOT immediately dump products when important information is missing.

2. The agent asks a useful clarification question.

3. The user's answer is persisted in AgentState.

4. The next turn uses previous preferences.

5. The agent stops asking questions once enough information exists.

6. Search uses the accumulated validated preferences.

7. Existing "second one", "that", "other one", etc. behavior continues working.

8. FSM remains authoritative.

9. Policy Gate remains authoritative.

10. Payment remains outside autonomous agent execution.

11. Gemini failure has deterministic fallback.

12. Clarification actions are auditable.

13. User/session isolation remains intact.

14. Existing tests remain passing.

15. New conversational tests pass.

16. Frontend requires no major redesign.

17. No second Buyer Agent or question-generation agent is introduced.

==================================================
24. REQUIRED DEMO SCENARIO
==================================================

After implementation, verify this exact conversation:

User:
"I need a laptop."

Agent:
"Sure. What's your budget?"

User:
"Under ₹60,000."

Agent:
"What will you mainly use it for — study, work, coding, or gaming?"

User:
"Coding and college."

Agent:
"Do you prioritize portability or performance?"

User:
"Portability."

Agent:
"Got it. I'm looking for lightweight laptops under ₹60,000 suited for coding and college."

→ Product results

User:
"Show me the second one."

→ Existing reference resolver

User:
"Add that to cart."

→ Policy Gate
→ FSM
→ Cart

Then continue through the existing checkout/Razorpay flow.

==================================================
FINAL REPORT
==================================================

When finished, report:

1. Files created
2. Files modified
3. Exact conversational flow implemented
4. AgentState changes
5. LangGraph changes
6. FSM changes, if any
7. API/schema changes
8. Audit changes
9. Tests added
10. Full test result
11. Frontend compatibility result
12. Confirmation that payment/webhook code was NOT modified
13. One example of the final conversation
14. Any limitations that remain

Do not provide vague claims such as "AI improved."

Show exactly what changed and how it is verified.
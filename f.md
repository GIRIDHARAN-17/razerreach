RAZORREACH — RESUME PROJECT, AUDIT CURRENT STATE, AND COMPLETE ALL REMAINING WORK

PROJECT:
RazorReach — Razorpay AI Buildathon
Track 1 — AI Growth & Agentic Commerce

IMPORTANT:
Antigravity previously shut down unexpectedly while implementing the next Buyer Agent enhancement.

DO NOT assume the previous task was completed.

Your first responsibility is to inspect the CURRENT repository and determine exactly what is already implemented and what remains incomplete.

DO NOT restart the project.
DO NOT rewrite working architecture.
DO NOT duplicate existing functionality.
DO NOT create a second implementation of something that already exists.

The repository on disk is the source of truth.

========================================================
PHASE 0 — CURRENT STATE AUDIT
========================================================

Before modifying ANY code, inspect the repository.

Inspect at minimum:

backend/
backend/app/
backend/app/agents/
backend/app/agents/langgraph/
backend/app/services/
backend/app/schemas/
backend/app/integrations/
backend/app/routers/
backend/tests/

frontend/
or the actual frontend directory used by this project.

Also inspect:

README.md
.env.example
requirements.txt
package.json
configuration files
deployment configuration
Docker configuration if present
architecture documentation
recent walkthrough/task documentation if present

Search specifically for:

- AgentState
- LangGraph
- Buyer Agent
- Revenue Agent
- Revenue Opportunity Engine
- FSM
- Policy Gate
- Conversation Resolver
- AI resilience
- clarification
- preference discovery
- session_id
- audit
- Firebase
- /api/history
- Razorpay
- webhook
- merchant dashboard
- customer chat
- checkout

Determine:

1. Which tasks are actually implemented.
2. Which files were modified by the interrupted task.
3. Whether any partially written code exists.
4. Whether there are syntax errors.
5. Whether there are failing tests.
6. Whether frontend and backend currently build.
7. Whether the latest conversational Buyer Agent work is complete, partial, or absent.

DO NOT make changes until this audit is complete.

========================================================
PHASE 1 — PROTECT WORKING SYSTEM
========================================================

The following architecture is already established and must remain authoritative:

Customer
  ↓
Buyer Agent
  ↓
AgentState
  ↓
LangGraph
  ↓
OBSERVE
  ↓
DECIDE
  ↓
Reference Resolver
  ↓
Policy Gate
  ↓
FSM
  ↓
Commerce Tool
  ↓
Update State
  ↓
Audit
  ↓
Observe / End

The following components must NOT be replaced:

- AgentState
- LangGraph orchestration
- deterministic FSM
- deterministic Policy Gate
- Conversation Reference Resolver
- Buyer commerce tools
- hybrid search
- AI resilience/fallback
- audit trail
- existing cart flow
- existing checkout flow
- Razorpay payment flow

The LLM remains non-authoritative.

Backend remains the source of truth.

========================================================
PHASE 2 — PAYMENT/WEBHOOK FREEZE
========================================================

PAYMENT AND WEBHOOK LOGIC IS FROZEN.

Do NOT modify:

- Razorpay order creation
- Razorpay payment verification
- webhook signature verification
- webhook idempotency
- payment capture handling
- payment analytics
- payment audit implementation
- Razorpay credentials
- payment state transitions

Only perform verification/testing against these systems.

If the repository contains working payment/webhook implementation, preserve it exactly.

========================================================
PHASE 3 — COMPLETE THE INTERRUPTED BUYER AGENT WORK
========================================================

The intended latest enhancement is:

PROGRESSIVE CONVERSATIONAL PREFERENCE DISCOVERY

The purpose is to make the Buyer Agent genuinely conversational.

Current weak behavior:

User:
"I need a laptop"

Agent:
immediately returns products.

Desired behavior:

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

→ search
→ matched products

Then:

User:
"Show me the second one."

→ existing reference resolver

User:
"Add that to cart."

→ existing Policy Gate
→ existing FSM
→ existing cart tool

Do NOT create another AI agent.

Do NOT create a separate question-generation agent.

Extend the existing Buyer Agent/LangGraph architecture.

========================================================
PHASE 4 — ADAPTIVE CLARIFICATION
========================================================

The agent must NOT use a fixed questionnaire.

Use:

PROGRESSIVE PREFERENCE DISCOVERY

Examples:

"I need a laptop"
→ ask budget

"I need a laptop under ₹60,000"
→ ask use case

"I need a laptop under ₹60,000 for coding"
→ search immediately OR ask only one highly valuable preference

"Find a black Dell laptop under ₹60,000 for coding"
→ search immediately

Do not ask unnecessary questions.

Never ask for:

- color
- brand
- RAM
- storage
- screen size
- etc.

unless that information is actually useful for the current request.

Maximum normal clarification questions:

3

If enough information becomes available earlier:

SEARCH IMMEDIATELY.

========================================================
PHASE 5 — LANGGRAPH
========================================================

If not already implemented, extend the existing Buyer LangGraph conceptually:

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
 ┌──────────────────────┐
 │ Enough information?  │
 └──────────────────────┘
      ↓ YES       ↓ NO
    SEARCH     CLARIFY
      ↓           ↓
   RESULTS    UPDATE STATE
      ↓           ↓
     END        OBSERVE

Important:

CLARIFY must NOT execute commerce tools.

The clarification path should:

1. determine missing high-value preference
2. produce a concise question
3. persist bounded structured state
4. return the question
5. continue on the next turn

Do not create a second FSM.

If the existing FSM can represent clarification using its existing states, use that.

========================================================
PHASE 6 — AGENT STATE
========================================================

Inspect the existing AgentState before adding anything.

Reuse existing fields wherever possible.

Only add the minimum required state.

Possible bounded information:

- category
- budget
- use_case
- preferences
- constraints
- missing_information
- conversation/discovery stage

Do NOT create dozens of category-specific fields.

Do NOT store:

- raw Gemini responses
- chain-of-thought
- complete conversation history
- sensitive information
- raw tool outputs

State must remain:

- serializable
- bounded
- persistent
- session-scoped
- user-owned

========================================================
PHASE 7 — NATURAL LANGUAGE PREFERENCE EXTRACTION
========================================================

The agent should understand:

"under 60k"
"under ₹60,000"
"around 50 thousand"
"between 40 and 60k"
"mostly coding"
"coding and college"
"something lightweight"
"performance matters more"
"black would be better"
"I don't care about the brand"

Normalize these into structured state.

Validate all extracted values.

Never allow LLM output to directly mutate authoritative state without validation.

========================================================
PHASE 8 — SEARCH
========================================================

Reuse the existing hybrid search.

Do NOT create another search engine.

Only validated preferences should influence search.

Example:

category:
laptop

max_price:
60000

use_case:
coding

preferences:
portability

The final search must remain grounded in the actual product database.

Do not invent:

- products
- prices
- stock
- specifications
- brands
- attributes

========================================================
PHASE 9 — EXISTING CONVERSATION RESOLVER
========================================================

Do NOT break the existing reference-resolution functionality.

These must continue working:

"show me the second one"
"show me the first two"
"compare the first two"
"add that to cart"
"make it black"
"show me the cheaper one"
"what about the other one?"

Clarification must work together with reference resolution.

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

→ resolver selects candidate #2

========================================================
PHASE 10 — AI RESILIENCE
========================================================

Reuse the existing AI resilience implementation.

Do not create another retry/circuit-breaker mechanism.

If Gemini fails:

- deterministic interpretation where possible
- deterministic clarification where possible
- graceful fallback
- correct response_mode
- audit fallback behavior

The system must not become unusable because Gemini is temporarily unavailable.

========================================================
PHASE 11 — AUDIT
========================================================

If clarification auditing does not already exist, add a safe audit event.

Possible action:

BUYER_AGENT_CLARIFICATION

Safe metadata:

- session_id
- category
- missing_preference
- conversation_stage
- response_mode

Never store:

- secrets
- passwords
- payment data
- tokens
- raw hidden reasoning
- complete raw LLM responses

The audit story should demonstrate:

Customer intent
→ clarification
→ preference captured
→ search
→ product selection
→ cart
→ checkout
→ payment

========================================================
PHASE 12 — API COMPATIBILITY
========================================================

Do not break:

POST /api/ai/search

Existing clients must continue working.

If required, add optional response fields such as:

- response_mode
- conversation_stage
- clarification_required
- clarification_question
- session_id

Do not remove existing response fields.

========================================================
PHASE 13 — FRONTEND
========================================================

Inspect the current customer chat UI.

Do NOT redesign the frontend unnecessarily.

The existing UI must support conversational responses naturally.

Example:

Agent:
"What's your budget?"

User:
"Under ₹60,000"

Agent:
"What will you mainly use it for?"

The frontend should display this as normal chat interaction.

If API changes are required, update the frontend minimally.

Do not break:

- customer login
- merchant login
- product discovery
- product details
- cart
- checkout
- payment
- merchant dashboard

========================================================
PHASE 14 — FIREBASE AND HISTORY
========================================================

Verify the previously fixed systems:

Firebase authentication

/api/history

Do not rewrite them if already working.

Test:

Customer signup
Customer login
Merchant signup/login
authenticated Buyer Agent request
history retrieval
session persistence

For existing users, backend role must remain authoritative.

Frontend role selection must never override an existing backend role.

========================================================
PHASE 15 — MERCHANT INTELLIGENCE
========================================================

Verify existing merchant-side functionality remains intact:

Revenue Opportunity Engine
Revenue Agent
merchant-scoped data
demand signals
conversion signals
stock signals
merchant dashboard
analytics
audit trail
explainability

Do NOT rewrite these systems.

Confirm Buyer Agent improvements do not break merchant functionality.

========================================================
PHASE 16 — REQUIRED TESTS
========================================================

Add tests if missing.

A. Vague request

"I need a laptop"

Expected:
CLARIFICATION
No product search.

B. Budget

"I need a laptop"
→ "under 60000"

Expected:
budget persists.

C. Use case

→ "coding"

Expected:
use case persists.

D. Complete request

"Find me a black Dell laptop under 60000 for coding"

Expected:
search immediately.

E. Progressive discovery

laptop
→ budget
→ use case
→ portability
→ search

F. Preference update

"Actually make it under 50000"

Expected:
budget updated.

G. Additional preference

"Also make it black"

Expected:
color added/refined.

H. Refusal

"I don't know my budget"

Expected:
graceful continuation.

I. Session persistence

Same session across multiple requests.

Expected:
previous preferences retained.

J. Session isolation

User A cannot access User B's state.

K. Reference resolution

"show me the second one"

Expected:
correct candidate.

L. Cart

"add that to cart"

Expected:
Policy Gate + FSM + cart tool.

M. Gemini failure

Expected:
deterministic fallback/clarification.

N. Invalid preference

Expected:
safe rejection/ignore.

O. Clarification limit

Expected:
no endless questioning.

P. Payment boundary

Clarification cannot initiate payment.

Q. Existing regression tests

All existing tests must continue passing.

========================================================
PHASE 17 — FULL REGRESSION
========================================================

Run the complete backend test suite.

Run frontend tests if present.

Run frontend production build.

Run backend startup/import verification.

Verify:

- auth
- Firebase
- history
- products
- search
- Buyer Agent
- LangGraph
- AgentState
- FSM
- Policy Gate
- reference resolver
- AI resilience
- Revenue Opportunity Engine
- Revenue Agent
- audit
- cart
- checkout
- payment
- webhook
- merchant dashboard

Do not claim success without actual verification.

========================================================
PHASE 18 — END-TO-END DEMO TEST
========================================================

Perform this exact logical flow:

1.
"I need a laptop."

Expected:
budget clarification.

2.
"Under ₹60,000."

Expected:
budget retained.
use-case clarification.

3.
"Coding and college."

Expected:
use-case retained.
ask portability/performance only if genuinely useful.

4.
"Portability."

Expected:
search.

5.
"Show me the second one."

Expected:
existing resolver.

6.
"Add that to cart."

Expected:
Policy Gate.
FSM.
cart.

7.
Proceed through existing checkout.

8.
Use existing Razorpay flow.

9.
Verify merchant-side revenue/analytics.

10.
Verify audit trail.

Do NOT alter payment/webhook code merely to make the demo pass.

========================================================
PHASE 19 — BUILDATHON QUALITY CHECK
========================================================

Evaluate the finished product as a technical judge.

The product story should be:

AI helps the BUYER make a better product decision

AND

AI helps the MERCHANT make a better revenue decision.

Core positioning:

"RazorReach connects AI buyer intent to merchant revenue."

The customer journey:

Intent
→ Understand
→ Clarify
→ Search
→ Compare
→ Decide
→ Purchase

The merchant journey:

Customer behavior
→ Demand signal
→ Revenue Opportunity
→ Revenue Agent
→ Merchant action
→ Verified revenue
→ Analytics
→ Audit

Do not add unnecessary agents, voice features, autonomous payments, or unrelated features.

========================================================
PHASE 20 — DOCUMENTATION
========================================================

Update README/documentation only where necessary.

Document the final architecture.

Include:

Buyer:

Intent
→ Preference Discovery
→ Search
→ Reference Resolution
→ Product Decision
→ Cart
→ Checkout
→ Razorpay

Merchant:

Customer behavior
→ Opportunity Engine
→ Revenue Agent
→ Merchant Action
→ Verified Revenue

Explain:

"Conversation memory ≠ conversational product discovery."

Explain why clarification is adaptive instead of a fixed questionnaire.

========================================================
PHASE 21 — FINAL VERIFICATION REPORT
========================================================

At the end, provide a concise but precise report containing:

1. CURRENT STATE FOUND
2. INTERRUPTED WORK FOUND
3. WORK ALREADY COMPLETE
4. WORK COMPLETED NOW
5. FILES CREATED
6. FILES MODIFIED
7. AgentState changes
8. LangGraph changes
9. FSM changes
10. Policy Gate changes
11. Reference Resolver changes
12. API/schema changes
13. Audit changes
14. Frontend changes
15. Tests added
16. Full test result
17. Frontend build result
18. Firebase verification
19. History verification
20. Payment/webhook verification
21. Exact conversational demo result
22. Remaining limitations

IMPORTANT:

Do not say "everything is complete" unless it has actually been verified.

If something is already implemented, leave it unchanged.

If something is partially implemented, finish it rather than creating a duplicate.

If a previous interrupted modification is broken, repair it cleanly.

If all requested work is already complete, do NOT make unnecessary changes. Instead run verification and report the results.

STOP only after the repository is in a stable, tested state.
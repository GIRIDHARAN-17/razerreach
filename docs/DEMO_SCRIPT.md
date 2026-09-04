# RazorReach — 5-Minute Buildathon Judge Demonstration Script

> **Track**: Razorpay AI Growth & Agentic Commerce  
> **Target Duration**: Exactly 5:00 minutes  
> **Core Value Proposition**: *"RazorReach connects AI buyer intent to merchant revenue—and proves every transaction along the way."*

---

### [0:00 – 0:30] Phase 1: The Merchant Revenue Problem
- **Screen**: Merchant Hub (`http://localhost:3000/merchant` or deployed URL)
- **Action**: Log in as `merchant@razorreach.test` (password: `RazorReach@Merchant2026!`).
- **Narration**:
  > *"Every day, online merchants lose revenue to silent demand friction—searches that return zero results, stockouts on trending items, and cart abandonments at checkout. Merchants are blind to these signals until weeks later in financial summaries.  
  > RazorReach solves this with an agentic, closed-loop commerce engine: we actively capture buyer demand signals, synthesize actionable revenue opportunities, and drive conversational buyer journeys that convert into verified Razorpay transactions."*

---

### [0:30 – 1:15] Phase 2: Autonomous Revenue Opportunity Detection
- **Screen**: Merchant Dashboard → **Revenue Agent Impact** & **Detected Opportunities**
- **Action**: Highlight the 4 detected opportunities (Stock Gap, Low Conversion, Cart Abandonment, Unserved Demand).
- **Narration**:
  > *"Notice our Revenue Opportunity Engine: it has deterministically aggregated 76 live behavioral signals.  
  > It didn't make up numbers: for example, on the **HyperPort 7-in-1 Hub**, it detected 0 warehouse stock alongside 7 views and 3 cart attempts, calculating an estimated loss of ₹3,957.  
  > On the **Compact Laptop Stand**, it flagged an 87.5% drop-off between cart addition and checkout. These are backed by real database metrics, not hallucinations."*

---

### [1:15 – 2:00] Phase 3: Revenue Agent (Fact / Hypothesis / Suggestion)
- **Screen**: Click on **"High Cart Abandonment for Compact USB-C Laptop Stand"** → Review Analysis Card.
- **Action**: Highlight the 3-layer explainability structure:
  - 🟦 **FACT**: 8 cart additions, 1 completed purchase.
  - 🟪 **HYPOTHESIS**: AI identifies price/shipping friction at final checkout step. (Zero chain-of-thought).
  - 🟩 **SUGGESTION**: Introduce free shipping threshold above ₹999 or accessory cross-sell.
- **Narration**:
  > *"When the merchant opens the Revenue Agent's analysis, we strictly separate **FACT**—the empirical database metrics—from **AI HYPOTHESIS**, which reasons over buyer behavior without exposing private model deliberation.  
  > The agent delivers a concrete merchant **SUGGESTION**: bundle accessories or offer complimentary shipping above ₹999. Now let's see how our customer experiences this on the storefront."*

---

### [2:00 – 3:00] Phase 4: Conversational AI Buyer & Reference Resolution
- **Screen**: Customer Storefront (`/app`)
- **Action 1**: In the AI Buyer chat, type:
  `"I need a durable backpack for college with a padded laptop compartment."`
- **Observation**: Assistant returns `RainGuard Laptop Backpack` with semantic grounding.
- **Action 2**: Type multi-turn contextual refinement:
  `"Show me the second one"` or `"Make it black"`.
- **Narration**:
  > *"Here on the customer storefront, our AI Buyer isn't just keyword search. It combines 768-dimensional vector embeddings with conversational state memory.  
  > Notice when I say 'show me the second one', our Context Resolver correctly identifies candidate ordinal #2 without losing the original search intent.  
  > And notice the speed: even if the external LLM is rate-limited, our AI Resilience fallback ensures deterministic product discovery continues seamlessly."*

---

### [3:00 – 4:00] Phase 5: Bounded Commerce, Policy Gate & Razorpay Checkout
- **Screen**: Cart Drawer → Checkout
- **Action**: Click **"Add to Cart"** → Open Cart → Click **"Proceed to Checkout"**.
- **Narration**:
  > *"Here is our core safety architecture: **THE LLM IS NEVER THE AUTHORITY FOR MONEY.**  
  > When the buyer adds an item, our Policy Gate validates the action deterministically. The agent can recommend, but it is strictly BLOCKED from executing payments autonomously.  
  > Cart totals and checkout totals are computed server-side in integer paise (₹1,499.00 = 149900 paise).  
  > When we proceed to checkout, RazorReach initializes a trusted Razorpay Checkout JS modal."*
- **Action**: Complete test payment in Razorpay modal using test card credentials.

---

### [4:00 – 4:30] Phase 6: Verified Revenue Realization
- **Screen**: Switch back to Merchant Hub (`/merchant`).
- **Action**: Point to **Verified Revenue** metric card and recent activity list.
- **Narration**:
  > *"Immediately upon payment confirmation, the backend cryptographically verifies the HMAC SHA256 signature, marks the order PAID, decrements stock from 25 to 24, and updates the merchant's Verified Revenue in real-time.  
  > Notice the crucial buildathon distinction: **Estimated Potential Revenue** is a forecast from unserved signals, while **Verified Revenue** reflects only cryptographically confirmed Razorpay payments."*

---

### [4:30 – 5:00] Phase 7: Audit Trail & Buildathon Differentiation
- **Screen**: Merchant Hub → **Audit Trail** tab.
- **Action**: Click on the latest `PAYMENT_VERIFIED` event to open the Structured Explainability Drawer.
- **Narration**:
  > *"Finally, look at our visible Agent Audit Trail. Every single action—from the customer's conversational search, to the Policy Gate safety decision, to the Razorpay payment verification, to inventory decrement—is recorded in an immutable ledger.  
  > A judge or merchant can click any event to see:  
  > **WHAT happened → WHY the system acted → WHAT evidence was involved → and WHAT the result was.**  
  > RazorReach doesn't just help AI buyers find products. It connects buyer intent to merchant revenue—and proves every transaction along the way."*

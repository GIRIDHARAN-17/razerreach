# RazorReach — AI Growth & Agentic Commerce Platform

> **Razorpay Buildathon — Track 1: AI Growth & Agentic Commerce**

RazorReach is a full-stack, AI-powered e-commerce platform that pairs a **Conversational AI Buyer Assistant** for customers with an **Agentic Revenue Intelligence Hub** for merchants, powered by FastAPI, React 19, MongoDB Atlas, Google Gemini 2.5 Flash, LangGraph, and Razorpay.

---

## 🏛 System Architecture Overview

```
                        RAZORREACH ARCHITECTURE
                                   │
     ┌─────────────────────────────┼─────────────────────────────┐
     │                             │                             │
     ▼                             ▼                             ▼
  CUSTOMER                      MERCHANT                       ADMIN
 SHOPPING UI                   HUB PORTAL                  PORTAL PANEL
(React + Vite)                (React + Vite)               (React + Vite)
     │                             │                             │
     └─────────────────────────────┼─────────────────────────────┘
                                   │
                                   ▼
                         TanStack Router & Client
                                   │
                                   ▼
                         FastAPI Async Backend
                                   │
     ┌───────────────┬─────────────┼─────────────┬───────────────┐
     ▼               ▼             ▼             ▼               ▼
MongoDB Atlas  Google Gemini  Firebase SDK   Razorpay SDK   Cloudinary SDK
(Async Motor)  (2.5 Flash)    (Social Auth)  (Payments)     (Image Storage)
```

---

## 🛠 Tech Stack

| Category | Technology | Purpose |
|---|---|---|
| **Orchestration** | LangGraph (`langgraph>=1.2.0`) | Stateful agent orchestration, bounded execution, and checkpoint persistence |
| **Frontend** | React 19, TanStack Router, TanStack Query, Vite 7 | Type-safe single page web app & routing |
| **Styling & UI** | TailwindCSS v4, Framer Motion, Lucide React, Radix UI | Modern UI, responsive layouts & micro-animations |
| **Backend API** | Python 3.10+, FastAPI, Uvicorn, Pydantic v2 | High-performance Async REST API engine |
| **Database** | MongoDB Atlas, Motor (Async PyMongo driver) | Multi-collection document database |
| **AI / LLM** | Google GenAI SDK (`google-genai`), Gemini 2.5 Flash | Conversational AI Buyer & Revenue Agent |
| **Embeddings** | Google Text Embedding (768-dim) | Hybrid vector semantic search |
| **Authentication** | Native Bcrypt + PyJWT, Firebase Admin SDK | Passwords, JWT tokens, Google/Apple social sign-in |
| **Payments** | Razorpay SDK, Razorpay Checkout JS | Server-side paise pricing & HMAC SHA256 verification |
| **Image Storage** | Cloudinary SDK | Product image upload, deletion, & Data-URI fallback |
| **Testing** | Pytest, Pytest-AsyncIO | 524 backend unit & async integration tests (100% pass) |

---

## 🚀 Core Features

### 1. Conversational AI Buyer Agent
- **Progressive Preference Discovery**: Conversational discovery of customer budget, brand preference, use case, and product specifications.
- **Reference Resolution**: Resolves ordinals ("first one", "second item") and pronouns ("that backpack") deterministically against active candidate sets.
- **Persistent State**: Multi-turn conversation history and FSM state stored in `agent_states` collection.
- **Cart & Checkout Preparation**: Prepares cart items and checkout previews safely through Policy Gate.

### 2. Merchant Revenue Agent & Revenue Opportunity Engine
- **5 Demand Signals**: Detects Out-of-Stock Demand Loss, Low Purchase Conversion, Cart Abandonment, Unserved Search Queries, and Catalog Gaps.
- **100% Deterministic Opportunity Scoring**: Calculates normalized scores ($0.0 \le S \le 1.0$) and priority (`high`, `medium`, `low`) independently of AI.
- **Explainable AI Interpretation Layer (Gemini 2.5 Flash)**: Generates structured `FACT` (authoritative metrics), `HYPOTHESIS` (AI reasoning), and `SUGGESTION` (actionable advice) without altering underlying evidence.
- **Merchant-Controlled Actioning**: Merchants maintain full authority over catalog and pricing recommendations.

### 3. Search Engine
- **Keyword Search**: MongoDB text indexing over product title, description, category, and tags.
- **Semantic Vector Search**: Google Gemini 768-dimensional embeddings with cosine similarity.
- **Hybrid Ranking**: Combined score ($0.45 \times \text{Keyword} + 0.45 \times \text{Semantic} + 0.10 \times \text{Business Stock}$).
- **Resilient Fallback**: Automatic graceful fallback to keyword search on API limits or missing embeddings.

### 4. Razorpay Payments & Webhooks
- **Server-Calculated Pricing**: Integer paise calculations prevent client-side price tampering.
- **HMAC Signature Verification**: SHA256 HMAC verification for both client checkout (`/api/payments/verify`) and webhook events (`/api/webhooks/razorpay`).
- **Idempotency Protection**: `processed_webhooks` collection guards against duplicate delivery.
- **Atomic Stock Decrements**: Inventory is safely decremented upon verified payment.

### 5. Security, Auth & Control Model
- **Firebase Social Auth**: Server-side verification of Google & Apple ID Tokens via Firebase Admin SDK.
- **RBAC**: Enforces strict `customer`, `merchant`, and `admin` role boundaries.
- **Admin Approval Workflow**: Merchants require admin approval (`pending` ➔ `approved`/`suspended`).
- **Immutable Audit Trail**: Non-blocking activity logging (`audit_logs`) recording actor, action, resource, timestamp, and sanitized metadata (passwords, tokens, keys auto-redacted).

---

## 🤖 Production LangGraph Integration for Buyer Agent

### WHY LANGGRAPH?
> "LangGraph provides the stateful orchestration layer for RazorReach's Buyer Agent. The LLM proposes actions, while deterministic Policy Gate and FSM controls ensure that AI-generated decisions cannot directly mutate commerce state or execute payments."

### Architectural Design & Invariants
```
User Query ──► FastAPI /api/ai/search
                     │
                     ▼
             LangGraph Buyer Agent
                     │
            LOAD_STATE (MongoDB)
                     │
                   OBSERVE
                     │
                   DECIDE ◄── LLM Proposes Action
                     │
            REFERENCE_RESOLUTION (Deterministic)
                     │
               POLICY_GATE (Allowed / Blocked)
                     │
              FSM_VALIDATION (State Transition)
                     │
               TOOL_EXECUTION (Single Commerce Action)
                     │
                STATE_UPDATE
                     │
                   AUDIT ──► OBSERVE (Bounded Max 3 Steps) / SAVE_STATE
```

- **Graph Topology**: 11 modular nodes (`load_state`, `observe`, `decide`, `resolve_references`, `policy_gate`, `execute_tool`, `update_state`, `audit`, `safe_response`, `deterministic_fallback`, `save_state`) with deterministic conditional routing edges.
- **State Model**: `BuyerGraphState` TypedDict orchestrates execution state for a single turn while keeping `AgentState` in MongoDB authoritative.
- **Checkpointing**: Motor/MongoDB-backed `MongoDBSaver` checkpointer persists graph checkpoints in `db.langgraph_checkpoints` when `LANGGRAPH_CHECKPOINT_ENABLED=true` and falls back to `InMemorySaver` when `false`.
- **Session & Thread Mapping**: `thread_id` maps 1:1 to `session_id`, enforced with strict session ownership verification.
- **FSM & Policy Gate Integration**: The LLM proposes structured `AgentDecision` objects. The deterministic Policy Gate authorizes or denies actions, and FSM validates state transitions before tool execution.
- **Conversational Reference Resolution**: Resolves ordinals ("first one", "second one"), pronouns ("that product"), and comparisons deterministically before Policy Gate checks.
- **Bounded Multi-Step Execution**: Enforces a strict maximum limit of 3 agent steps per customer turn to prevent infinite loops.
- **AI Resilience & Fallback**: Handles Gemini HTTP 429 rate limits, timeouts, or service unavailability by cleanly falling back to keyword search (returning HTTP 200).
- **Payment Safety Boundary**: LangGraph nodes **NEVER** autonomously charge payments, capture funds, verify webhooks, or mark payments as successful. The agent can only `PREPARE_CHECKOUT`, leaving payment execution strictly to existing Razorpay checkout endpoints.

### Conversational Buyer Agent Flow Example
```
User: "I need a durable backpack for college with a laptop compartment"
 ├─ FSM State: START ➔ PRODUCT_SEARCH
 ├─ Intent Parsed: category="Bags", search_text="durable backpack college laptop", budget=None
 ├─ Execution: Hybrid Search returning [RainGuard Backpack (₹1,899), Urban Trekker (₹2,499)]
 └─ Agent Response: "I found 2 great options. 1) RainGuard Laptop Backpack (₹1,899) ... 2) Urban Trekker (₹2,499) ..."

User: "Show me the second one"
 ├─ FSM State: PRODUCT_SEARCH
 ├─ Reference Resolution: Ordinal "second one" resolved to product_id for "Urban Trekker"
 ├─ Execution: Fetch Product Details
 └─ Agent Response: "Here are details for Urban Trekker Backpack: 25L capacity, water-resistant..."

User: "Add that to cart"
 ├─ FSM State: PRODUCT_SEARCH ➔ CART_SELECTION
 ├─ Reference Resolution: Pronoun "that" resolved to active product "Urban Trekker"
 ├─ Policy Gate Check: ADD_TO_CART ➔ ALLOWED (Low Risk)
 ├─ Execution: Cart Service adds item to customer's MongoDB cart
 └─ Agent Response: "Added Urban Trekker Backpack to your cart! Total: ₹2,499."
```

---

## 📡 API Endpoints Reference Summary

| Category | HTTP Method & Path | Description | Access / Role |
|---|---|---|---|
| **Health** | `GET /health`, `GET /api/health` | Service health ping | Public |
| **Health** | `GET /api/health/db` | MongoDB connection status | Public |
| **Auth** | `POST /api/auth/register` | User registration (customer/merchant) | Public |
| **Auth** | `POST /api/auth/login` | Email/password login | Public |
| **Auth** | `POST /api/auth/firebase-sync` | Firebase ID Token exchange (Google/Apple) | Public |
| **Auth** | `GET /api/auth/me` | Current user profile | Authenticated |
| **Products** | `GET /api/products` | List published products | Public |
| **Products** | `GET /api/products/{id}` | Product details | Public |
| **Products** | `POST /api/products` | Create product | Approved Merchant |
| **Products** | `PUT /api/products/{id}` | Update product | Merchant (Owner) |
| **Products** | `DELETE /api/products/{id}` | Archive product | Merchant (Owner) |
| **Search** | `GET /api/search` | Hybrid search (keyword + semantic + stock) | Public |
| **Search** | `GET /api/search/semantic` | Pure 768d vector search | Public |
| **AI Buyer** | `POST /api/ai/search` | Natural language conversational search | Authenticated Customer |
| **AI Buyer** | `POST /api/ai/session/reset` | Reset agent session state | Authenticated Customer |
| **History** | `GET /api/history` | User AI session history | Authenticated Customer |
| **Cart** | `GET /api/cart` | View active shopping cart | Authenticated Customer |
| **Cart** | `POST /api/cart/items` | Add item to cart | Authenticated Customer |
| **Cart** | `PUT /api/cart/items/{id}` | Update item quantity | Authenticated Customer |
| **Cart** | `DELETE /api/cart/items/{id}` | Remove item from cart | Authenticated Customer |
| **Cart** | `DELETE /api/cart` | Clear cart | Authenticated Customer |
| **Payments** | `POST /api/payments/create-order` | Create Razorpay order (paise) | Authenticated Customer |
| **Payments** | `POST /api/payments/verify` | Verify payment HMAC SHA256 signature | Authenticated Customer |
| **Webhooks** | `POST /api/webhooks/razorpay` | Razorpay webhook listener (HMAC verified) | Public (Razorpay) |
| **Merchants** | `GET /api/merchants/profile` | Merchant profile | Merchant |
| **Merchants** | `PUT /api/merchants/profile` | Update merchant profile | Merchant |
| **Merchants** | `GET /api/merchants/opportunities` | List revenue opportunities | Merchant |
| **Merchants** | `POST /api/merchants/opportunities/generate` | Run Revenue Opportunity Engine | Merchant |
| **Merchants** | `POST /api/merchants/opportunities/{id}/analyze` | AI Opportunity Analysis (Gemini) | Merchant |
| **Merchants** | `GET /api/merchants/audit-logs` | View merchant audit logs | Merchant |
| **Admin** | `GET /api/admin/pending-merchants` | List pending merchants | Admin |
| **Admin** | `POST /api/admin/approve-merchant/{id}`| Approve merchant | Admin |
| **Admin** | `POST /api/admin/reject-merchant/{id}` | Reject merchant | Admin |
| **Admin** | `GET /api/admin/audit-logs` | Platform audit log search | Admin |

---

## 🎮 Buildathon Demo Dataset & Quickstart

RazorReach includes a deterministic development and demo dataset designed specifically for the 5-minute buildathon judge presentation.

### 1. Seeding the Demo Dataset
To seed the complete product catalog, demand signals, authoritative opportunities, Revenue Agent analyses, and verified orders:

```bash
cd backend
# Safe reset (wipes existing demo records and re-seeds deterministically)
python scripts/seed_demo.py --reset
```

### 2. Demo User Personas & Credentials
| Role | Email | Password | Purpose |
|---|---|---|---|
| **Merchant** | `merchant@razorreach.test` | `RazorReach@Merchant2026!` | Merchant Hub: Revenue Impact, Opportunities, Audit Console |
| **Customer** | `customer@razorreach.test` | `RazorReach@Customer2026!` | Customer Store: AI Buyer, Search, Cart, Razorpay Checkout |
| **Admin** | `admin@razorreach.test` | `RazorReach@Admin2026!` | Admin Portal: Global merchant approvals & system audits |

### 3. Demo Catalog & Demand Scenarios
The demo dataset populates 8 realistic items across Bags, Audio, and Computer Accessories, creating 4 distinct, grounded revenue opportunities:
1. **Out-of-Stock Demand Loss (`HyperPort 7-in-1 USB-C Hub`)**:
   - Stock: `0 units` | 7 customer views, 3 cart attempts | Estimated loss: `₹3,957.80`.
2. **Low Purchase Conversion (`FocusBeat Wireless Headphones`)**:
   - Price: `₹1,999` | 25 product views, 0 purchases (0% conversion rate) | Estimated impact: `₹2,498.75`.
3. **High Cart Abandonment (`Compact USB-C Laptop Stand`)**:
   - Price: `₹1,299` | 8 cart additions, 1 purchase (87.5% drop-off) | Estimated potential: `₹5,196.00`.
4. **Unserved Customer Demand (`Mechanical Keyboards with Blue Switches`)**:
   - 6 zero-result search queries | Demand velocity spike | Recommends catalog expansion and bundling.

---

## 🎬 5-Minute Buildathon Judge Demonstration Walkthrough

```
1. MERCHANT HUB
   └─ Log in as merchant@razorreach.test
   └─ Overview: Customer Demand Signals & Conversion Bottlenecks detected
   └─ Revenue Agent Opportunities: View Fact (authoritative metrics) vs. Hypothesis (AI) vs. Suggestion

2. CONVERSATIONAL AI BUYER
   └─ Open Customer Store (or log in as customer@razorreach.test)
   └─ Query: "I need a durable backpack for college with laptop compartment"
   └─ Result: Returns RainGuard Laptop Backpack with semantic grounding
   └─ Multi-turn refinement: "Show me the second one" or "Make it black"
   └─ Demonstrates conversational reference resolution and FSM context

3. BOUNDED COMMERCE & CART
   └─ Add product to cart (Authoritative backend total calculation)
   └─ Policy Gate validates action: ALLOWED (Low Risk)
   └─ Initiate checkout: Policy Gate binds transaction to Razorpay Checkout JS modal

4. VERIFIED RAZORPAY PAYMENT
   └─ Complete payment using Razorpay Test Mode Card/UPI
   └─ HMAC SHA256 signature verified server-side (POST /api/payments/verify)
   └─ Inventory decremented, order marked PAID, active cart cleared

5. AUDIT TRAIL & EXPLAINABILITY
   └─ Return to Merchant Hub → Audit Trail
   └─ Filter by 'Revenue Agent', 'Buyer Agent', or 'Payments'
   └─ Click any event to open Fact/Hypothesis/Suggestion explainability drawer
   └─ Demonstrates full traceability: SIGNAL → OPPORTUNITY → EVIDENCE → AI ANALYSIS → POLICY → ACTION → RESULT
```

---

## 🌐 Public HTTPS Deployment & Webhook Readiness

RazorReach is configured for cloud deployment across Render, Railway, AWS ALB, or Docker containers with zero hardcoded URLs.

### 1. Environment Configuration Setup

#### Backend Environment Configuration (`backend/.env`):
```env
APP_NAME=RazorReach
ENVIRONMENT=production
CORS_ORIGINS=["https://your-frontend-domain.com","http://localhost:3000"]

# MongoDB Connection
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/razorreach?retryWrites=true&w=majority
DATABASE_NAME=razorreach

# Security & JWT
JWT_SECRET_KEY=generate_a_secure_64_character_random_secret_key_here
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# AI / Gemini Model Config
GEMINI_API_KEY=your_google_gemini_api_key
GEMINI_EMBEDDING_MODEL=gemini-embedding-001

# Razorpay Test Mode Config
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret

# Firebase Admin SDK Credentials
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

#### Frontend Environment Configuration (`frontend/.env`):
```env
VITE_API_BASE_URL=https://your-backend-domain.com/api

# Firebase Authentication (Public Browser SDK Config)
VITE_FIREBASE_API_KEY=your_firebase_client_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_firebase_app_id
```

---

## 🧪 Local Setup & Development Instructions

### Prerequisites
- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **Python**: v3.10 or higher
- **MongoDB**: MongoDB Atlas cluster or local MongoDB instance

### Backend Startup
```bash
cd backend
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env  # Edit .env with valid credentials
python scripts/seed_demo.py --reset
uvicorn app.main:app --reload --port 8000
```

### Frontend Startup
```bash
cd frontend
npm install
cp .env.example .env  # Edit .env with API URL
npm run dev
```

### Running Automated Tests
```bash
cd backend
pytest -v
```
All 524 backend unit & async integration tests pass 100%.

---

## 📁 Repository Structure

```
razopay_buildathon_track1/
├── README.md                      # Master Project Specification & Architecture
├── ARCHITECTURE.md                # In-depth Architecture & DB Schema Specification
├── .gitignore                     # Root Security Git Ignore Rules
├── package.json                   # Root workspace manifest & Playwright config
├── backend/                       # FastAPI REST API Backend
│   ├── app/
│   │   ├── main.py                # App entrypoint & middleware configuration
│   │   ├── agents/                # LangGraph & Gemini AI Agents (Buyer & Revenue)
│   │   ├── core/                  # Security, DB connection & config settings
│   │   ├── models/                # MongoDB document helpers
│   │   ├── routers/               # 13 FastAPI API routers
│   │   ├── schemas/               # Pydantic validation schemas
│   │   └── services/              # Business logic, engines & audit logger
│   ├── scripts/                   # Seeding & admin CLI tools
│   ├── tests/                     # 524 Pytest unit & async integration tests
│   ├── requirements.txt           # Backend Python dependencies
│   ├── .env.example               # Backend environment variable template
│   └── .gitignore                 # Backend security gitignore rules
├── frontend/                      # React 19 + TanStack Single Page App
│   ├── src/                       # Components, routes, services & styles
│   ├── package.json               # Frontend dependencies & scripts
│   ├── .env.example               # Frontend environment template
│   └── .gitignore                 # Frontend gitignore rules
└── docs/                          # Runbooks, demo scripts & checklists
```

---

## 🔒 Security & Verification Summary
- **524 Backend Tests Passing**: 100% test coverage across Policy Gate, FSM state machine, AI fallback resilience, webhook HMAC verification, idempotency replay protection, and social auth.
- **Frontend Production Bundle**: Compiles with zero errors via Vite 7.
- **Zero Secrets Committed**: All API keys, database credentials, and webhook secrets are configured strictly through environment variables.

##Deployed
Frontend: https://razorreach.vercel.app
Backend: https://razerreach.onrender.com
API Docs: https://razerreach.onrender.com/docs

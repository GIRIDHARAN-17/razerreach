# RazorReach Backend — AI Growth & Agentic Commerce Platform

RazorReach is an AI-powered commerce platform built for **Razorpay Buildathon, Track 1: AI Growth & Agentic Commerce**.

This repository houses the Python/FastAPI REST API backend service, integrated asynchronously with MongoDB Atlas, user authentication with role-based access control, Firebase Social Authentication (Google & Apple Sign-In), merchant management, product catalog with Cloudinary image uploads, hybrid vector search, Google Gemini AI Buyer Agent, shopping cart & checkout preparation, secure Razorpay payment processing with HMAC signature verification and webhook idempotency, behavioral analytics, the authoritative deterministic **Revenue Opportunity Engine**, the explainable **Revenue Opportunity Agent**, and the immutable **Audit Trail & Activity Log**.

---

## 📋 Current Implementation Scope

### ✅ CURRENTLY IMPLEMENTED (Tasks 1 – 14 & Task 3.1)
- **FastAPI Core Foundation**: Application lifecycle, health check endpoints, CORS middleware, OpenAPI/Swagger docs.
- **MongoDB Atlas Integration**: Async Motor driver connection management, database health check, automatic index initialization.
- **Database Failure Handling**: Safe HTTP 503 `Database service unavailable` responses without leaking URI credentials or stack traces.
- **Authentication & JWT Security**: Bcrypt password hashing, JWT Bearer token issuance & validation, strict JWT secret enforcement via environment variables.
- **Firebase Social Authentication (Task 3.1)**: Google Sign-In and Apple Sign-In via Firebase Admin SDK (`POST /api/auth/firebase`). Verifies Firebase ID Tokens server-side, matches or creates local RazorReach users, performs safe account linking for verified emails (rejecting unverified takeovers with 409 Conflict), preserves existing user roles/merchant status, enforces active status checks, and exchanges verified claims for existing RazorReach JWT access tokens.
- **Role-Based Access Control (RBAC)**: Support for `customer`, `merchant`, and `admin` roles.
- **Admin Bootstrap Mechanism**: Secure CLI tool (`scripts/create_admin.py`) for creating admin accounts directly in database.
- **Merchant Onboarding & Management**: 1:1 user-to-merchant profile binding, profile CRUD, baseline dashboard metrics summary.
- **Admin Merchant Approval Workflow**: Status transitions (`pending` ➔ `approved`/`suspended`, `approved` ➔ `suspended`, `suspended` ➔ `approved`).
- **Product Catalog**: Full CRUD for products with validation, merchant approval enforcement, ownership verification, and soft-delete (archive).
- **Product Image Upload**: Cloudinary integration for product image upload, replacement, and deletion with MIME type/size validation.
- **Product Search**: MongoDB text search with keyword matching, category/price filters, and safe public search API.
- **Search Text Indexing**: Automatic `search_text` generation from product fields on create/update, manual reindex endpoint.
- **AI Buyer Agent**: Natural-language shopping assistant powered by Google Gemini SDK (`POST /api/ai/search`), extracting structured search intent (`SearchIntent`), invoking safe backend product tools, and generating deterministic grounded recommendation reasons.
- **Semantic Vector Search**: Google Gemini `text-embedding-004` (768d) integration with pure Python cosine similarity fallback.
- **Hybrid Search Engine**: Combined scoring ($0.45 \times \text{Keyword} + 0.45 \times \text{Semantic} + 0.10 \times \text{Business Stock}$) with hard filter enforcement and clean keyword fallback.
- **Shopping Cart & Checkout Foundation (Task 9)**: Server-side price snapshotting, live price revalidation, stale price change detection, and `/api/checkout/preview`.
- **Razorpay Payments & Webhooks (Task 10)**: Server-calculated payable amounts in integer paise (`POST /api/payments/create`), HMAC SHA256 payment signature verification (`POST /api/payments/verify`), webhook signature verification (`POST /api/webhooks/razorpay`), idempotency check via `processed_webhooks`, atomic stock decrements, and order status transitions (`payment_pending` ➔ `paid` / `payment_failed`).
- **Behavioral Analytics (Task 11)**: Non-blocking event recording (`search`, `product_view`, `cart_add`, `checkout_started`, `payment_success`, `payment_failed`) and merchant summary metrics (`GET /api/merchants/analytics/summary`).
- **Authoritative Revenue Opportunity Engine (Task 12)**: 100% deterministic, evidence-based opportunity generation service (`app/services/opportunity_engine.py`). Analyzes 5 demand signals, enforces minimum sample thresholds, computes normalized opportunity scores ($0.0 \le \text{Score} \le 1.0$) & priorities (`high`, `medium`, `low`), estimates potential revenue, deduplicates and persists candidates in `revenue_opportunities` collection (`POST /api/merchants/opportunities/generate`). 100% AI independent.
- **Revenue Opportunity Agent (Task 13)**: Explainable AI interpretation layer (`app/agents/revenue_agent.py`) powered by Google Gemini (`gemini-2.5-flash`). Consumes Task 12 structured opportunity records and generates natural-language business interpretations, evidence summaries, hypotheses, and suggested merchant actions (`POST /api/merchants/opportunities/{id}/analyze`, `POST /api/merchants/opportunities/analyze`). Enforces strict anti-hallucination guardrails (Task 12 evidence remains 100% untouched), prompt injection defenses, structured JSON validation, and deterministic fallbacks.
- **Audit Trail & Activity Log (Task 14)**: Secure, non-intrusive, immutable activity logging service (`app/services/audit_service.py`) recording WHO did WHAT to WHICH RESOURCE, WHEN, and WHAT WAS THE RESULT into `audit_logs` collection. Uses controlled action/resource enums (`AuditAction`, `AuditResourceType`), centralized sensitive data sanitization (redacts passwords, JWTs, API keys, payment signatures, CVV), newest-first sorting, pagination, and admin/merchant query endpoints (`GET /api/admin/audit-logs`, `GET /api/merchants/audit-logs`).
- **Automated Test Suite**: 162 unit tests covering health, auth, JWT, Firebase social authentication (Google/Apple), account linking, unverified takeover rejection, role isolation, disabled user rejection, merchants, products, images, search, AI Buyer Agent, hybrid search, cart, checkout preview, Razorpay payments, HMAC signature verification, webhook idempotency, analytics, opportunity engine signals, scoring, priority clamping, persistence, data isolation, AI explanation, evidence preservation, prompt injection defense, audit trail immutability, sensitive data redaction, non-intrusive logging, and database failure scenarios.

### ❌ NOT YET IMPLEMENTED (Future Tasks)
- Frontend web applications

---

## 🛠 Tech Stack

- **Python 3.11+**
- **FastAPI**: Modern, high-performance web framework for building REST APIs.
- **Uvicorn**: ASGI web server implementation.
- **Pydantic & Pydantic Settings**: Data validation, schemas, and setting management via environment variables.
- **Motor**: Official async MongoDB driver for Python.
- **MongoDB Atlas**: Cloud-hosted MongoDB database service.
- **Bcrypt & PyJWT**: Secure password hashing and JSON Web Tokens (HS256).
- **Firebase Admin SDK (`firebase-admin`)**: Server-side verification of Google & Apple Firebase ID Tokens.
- **Cloudinary**: Cloud-based image management for product images.
- **Google Gemini SDK (`google-genai`)**: AI model integration for natural language intent extraction, 768d embeddings, and merchant opportunity interpretation.
- **Razorpay SDK (`razorpay`)**: Official Python SDK for payment order creation and signature verification.
- **Pytest & HTTPX**: Automated testing framework and async HTTP test client.

---

## 📁 Backend Directory Structure

```
backend/
├── app/
│   ├── __init__.py               # Package marker
│   ├── main.py                   # FastAPI application & lifespan management
│   ├── core/                     # Application configuration, security & database
│   │   ├── config.py             # Environment settings & JWT secret validator
│   │   ├── security.py           # Bcrypt hashing & JWT token creation/decoding
│   │   ├── database.py           # Async MongoDB connection lifecycle & index setup
│   │   └── dependencies.py       # OAuth2 scheme, get_current_user & role-based deps
│   ├── models/                   # Database models & document converters
│   │   ├── user.py               # User document helper (includes firebase_uid & auth_provider)
│   │   ├── merchant.py           # Merchant document helper
│   │   ├── product.py            # Product document helper
│   │   ├── cart.py               # Cart document helper
│   │   ├── order.py              # Order document helper
│   │   └── payment.py            # Payment document helper
│   ├── schemas/                  # Pydantic data schemas
│   │   ├── user.py               # User register, login, FirebaseAuthRequest, response & token schemas
│   │   ├── merchant.py           # Merchant profile, update, status & dashboard schemas
│   │   ├── product.py            # Product create, update, response & image schemas
│   │   ├── search.py             # Search response schemas
│   │   ├── ai_search.py          # AI search request, intent & response schemas
│   │   ├── cart.py               # Cart item add/update, response & checkout preview schemas
│   │   ├── order.py              # Order response & status schemas
│   │   ├── payment.py            # Payment create, verify & response schemas
│   │   ├── analytics.py          # Event schemas, summary metrics & response schemas
│   │   ├── opportunity.py        # Task 12/13 Revenue Opportunity schemas & AI analysis models
│   │   └── audit.py              # Task 14 Audit Trail schemas & controlled enums
│   ├── routers/                  # API endpoint routers
│   │   ├── health.py             # Health check endpoints
│   │   ├── auth.py               # Auth endpoints (includes POST /api/auth/firebase)
│   │   ├── merchants.py          # Merchant endpoints & audit log endpoint
│   │   ├── admin.py              # Admin endpoints & platform audit log endpoint
│   │   ├── products.py           # Product CRUD & image endpoints
│   │   ├── search.py             # Search endpoint
│   │   ├── ai.py                 # AI Buyer Agent search endpoint
│   │   ├── cart.py               # Cart & checkout preview endpoints
│   │   ├── payments.py           # Payment creation, verification & order endpoints
│   │   ├── webhooks.py           # Razorpay webhook listener endpoint
│   │   └── analytics.py          # Merchant analytics & Revenue Opportunity Agent endpoints
│   ├── services/                 # Business logic services
│   │   ├── user_service.py       # User registration, authentication & Firebase social user logic
│   │   ├── merchant_service.py   # Merchant CRUD & status transitions
│   │   ├── product_service.py    # Product CRUD, image management & ownership
│   │   ├── search_service.py     # Search text generation, reindex, hybrid & vector search
│   │   ├── analytics_service.py  # Non-blocking event recording service
│   │   ├── opportunity_engine.py # Authoritative 100% deterministic Revenue Opportunity Engine
│   │   ├── opportunity_service.py# Task 11 opportunity facade delegating to opportunity_engine
│   │   ├── cart_service.py       # Cart CRUD, live price snapshotting & checkout preview
│   │   ├── order_service.py      # Order state machine, atomic stock decrement & access control
│   │   ├── payment_service.py    # Razorpay payment orders, HMAC signature verification & webhook idempotency
│   │   └── audit_service.py      # Centralized non-blocking audit logging & query service
│   ├── integrations/             # External service integrations
│   │   ├── firebase.py           # Firebase Admin SDK initialization & ID Token verification
│   │   ├── cloudinary.py         # Cloudinary upload, delete & validation
│   │   ├── gemini.py             # Gemini SDK initialization & intent extraction
│   │   ├── embeddings.py         # Gemini text-embedding-004 vector generation
│   │   └── razorpay.py           # Razorpay SDK initialization & signature verification
│   └── agents/                   # AI agents package
│       ├── buyer_agent.py        # Buyer Agent orchestration service
│       ├── revenue_agent.py      # Revenue Opportunity Agent (Task 13 interpretation layer)
│       ├── prompts.py            # System prompts & anti-hallucination rules
│       └── tools/
│           └── buyer_tools.py    # Safe product search & inventory tools
├── scripts/                      # CLI administration scripts
│   ├── create_admin.py           # Admin bootstrap CLI script
│   └── reindex_products.py       # Bulk product search_text reindex script
├── tests/                        # Automated unit test suite
│   ├── test_health.py            # Health check tests
│   ├── test_database.py          # Database connection & error handling tests
│   ├── test_auth.py              # Auth, JWT & role tests
│   ├── test_firebase_auth.py    # Firebase social auth tests (Google & Apple Sign-In)
│   ├── test_merchants.py         # Merchant profile & admin status tests
│   ├── test_products.py          # Product CRUD, ownership & image tests
│   ├── test_search.py            # Search, indexing & analytics tests
│   ├── test_buyer_agent.py       # AI Buyer Agent, intent, tool & anti-hallucination tests
│   ├── test_hybrid_search.py     # Hybrid search, 768d vector similarity & ranking tests
│   ├── test_cart.py              # Shopping cart CRUD, stale price detection & checkout preview tests
│   ├── test_payments.py          # Razorpay payment creation, HMAC verification & webhook idempotency tests
│   ├── test_analytics.py         # Behavioral events, merchant summary & isolation tests
│   ├── test_opportunity_engine.py# Deterministic opportunity engine, thresholds, scoring & AI-independence tests
│   ├── test_revenue_agent.py     # Task 13 AI analysis, evidence preservation & prompt injection tests
│   └── test_audit.py             # Task 14 Audit Trail immutability, redaction & query tests
├── requirements.txt              # Python dependencies
├── .env.example                  # Environment template file
└── README.md                     # Backend documentation
```

---

## 🔑 Firebase Social Authentication Architecture (Task 3.1)

### Authentication Data Flow
```
Google / Apple Sign-In (Client SDK)
       ↓
Firebase Authentication (Issues Firebase ID Token)
       ↓
POST /api/auth/firebase {"id_token": "..."}
       ↓
RazorReach Backend (verify_id_token via app/integrations/firebase.py)
       ↓
Verified Claims Extraction (uid, email, email_verified, provider: google/apple)
       ↓
Local User Resolution (app/services/user_service.py):
  1. Find user by firebase_uid -> return existing account (preserves role & status)
  2. Else find user by normalized verified email -> Link firebase_uid & auth_provider
  3. Else create new customer user (default role: customer)
       ↓
Task 14 Audit Trail Event (USER_LOGIN or USER_REGISTERED)
       ↓
Issue Existing RazorReach JWT {"sub": user_id, "role": role}
       ↓
Protected RazorReach APIs (/api/cart, /api/orders, /api/merchants, etc.)
```

### Setup Instructions for Firebase Console & Apple Developer

#### 1. Firebase Console Setup:
1. Go to [Firebase Console](https://console.firebase.google.com/) and create/select a project.
2. Navigate to **Authentication** ➔ **Sign-in method**.
3. Enable **Google** sign-in provider.
4. Enable **Apple** sign-in provider.
5. Under **Authorized Domains**, add your frontend domain (e.g., `localhost`, `127.0.0.1`, or production domain).
6. Go to **Project Settings** ➔ **Service Accounts**.
7. Click **Generate new private key** to download the JSON service account key.
8. Copy credentials to your backend `.env` file:
   - `FIREBASE_PROJECT_ID=your-project-id`
   - `FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project-id.iam.gserviceaccount.com`
   - `FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"`

#### 2. Apple Developer Setup Requirements:
To enable Apple Sign-In in Firebase Console:
1. Register an App ID in Apple Developer Portal with **Sign In with Apple** capability.
2. Register a Services ID for Web authentication.
3. Configure Return URLs: `https://<YOUR_FIREBASE_PROJECT_ID>.firebaseapp.com/__/auth/handler`.
4. Generate a Private Key (`.p8`) for Apple Sign-In.
5. In Firebase Console ➔ Apple Provider settings, upload:
   - Services ID (Apple Client ID)
   - Apple Team ID
   - Key ID
   - Private Key (`.p8` file content)

---

## 📡 API Endpoints Summary

### 1. Health Checks
- `GET /api/health` — Public service health status.
- `GET /api/health/db` — Public database connection ping status (503 if disconnected).

### 2. Authentication (`/api/auth`)
- `POST /api/auth/register` — Self-register user account (`customer` or `merchant`).
- `POST /api/auth/login` — Authenticate credentials and receive Bearer access token.
- `POST /api/auth/firebase` — Social login via Firebase ID Token (Google & Apple Sign-In). Exchanges Firebase ID Token for RazorReach JWT.
- `GET /api/auth/me` — Get profile of authenticated user.

### 3. Merchant Profile & Dashboard (`/api/merchants`) — *(Merchant Role)*
- `POST /api/merchants` — Create merchant profile.
- `GET /api/merchants/me` — Get own merchant profile.
- `PUT /api/merchants/me` — Update business profile details.
- `GET /api/merchants/dashboard` — View merchant dashboard metrics.
- `GET /api/merchants/audit-logs` — Query merchant's own historical activity logs.

### 4. Admin Management (`/api/admin`) — *(Admin Role)*
- `GET /api/admin/merchants` — List all merchants.
- `PUT /api/admin/merchants/{merchant_id}/status` — Update merchant status.
- `GET /api/admin/audit-logs` — Query platform-wide historical audit logs with filters & pagination.

### 5. Product Catalog (`/api/products`) — *(Approved Merchant)*
- `POST /api/products` — Create product (201).
- `GET /api/products` — List published products with filters (200, public).
- `GET /api/products/{product_id}` — Get single product.
- `PUT /api/products/{product_id}` — Update product.
- `DELETE /api/products/{product_id}` — Archive product.
- `POST /api/products/{product_id}/image` — Upload/replace product image.
- `DELETE /api/products/{product_id}/image` — Delete product image.
- `POST /api/products/{product_id}/reindex` — Regenerate search_text & embedding.

### 6. Search (`/api/search`) — *(Public)*
- `GET /api/search` — Search published products using Hybrid Search.
- `GET /api/search/semantic` — Semantic vector search.

### 7. AI Buyer Agent (`/api/ai`) — *(Authenticated Customer)*
- `POST /api/ai/search` — Natural language AI product search powered by Gemini.

### 8. Shopping Cart & Checkout (`/api/cart`, `/api/checkout`) — *(Authenticated Customer)*
- `GET /api/cart` — Get customer active cart.
- `POST /api/cart/items` — Add product item to cart.
- `PUT /api/cart/items/{product_id}` — Update item quantity.
- `DELETE /api/cart/items/{product_id}` — Remove item.
- `DELETE /api/cart` — Clear active cart.
- `POST /api/checkout/preview` — Preview checkout summary & detect price/stock changes.

### 9. Razorpay Payments & Orders (`/api/payments`, `/api/orders`, `/api/webhooks`)
- `POST /api/payments/create` — Create payment order on Razorpay (Customer).
- `POST /api/payments/verify` — Verify payment HMAC signature (Customer).
- `GET /api/orders` — List customer historical orders (Customer).
- `GET /api/orders/{order_id}` — Get single order details (Customer).
- `POST /api/webhooks/razorpay` — Razorpay webhook listener (Public, HMAC SHA256 verified).

### 10. Behavioral Analytics & Revenue Opportunity Agent (`/api/merchants/analytics`, `/api/merchants/opportunities`) — *(Merchant Role)*
- `GET /api/merchants/analytics/summary` — Merchant dashboard analytics summary over specified period (default 30 days).
- `GET /api/merchants/opportunities` — Retrieve stored/generated evidence-backed growth opportunities.
- `POST /api/merchants/opportunities/generate` — Run 100% deterministic Revenue Opportunity Engine (Task 12, AI independent).
- `POST /api/merchants/opportunities/{opportunity_id}/analyze` — Task 13 AI single opportunity analysis powered by Revenue Agent.
- `POST /api/merchants/opportunities/analyze` — Task 13 AI bulk opportunity analysis (max 10 opportunities).

---

## 🧪 Running Automated Tests

Run the complete test suite (162 unit tests):

```powershell
.\.venv\Scripts\pytest -v
```

---

## 🛡 Security & Evidence Boundaries

- **Token Verification**: Firebase ID Tokens are verified server-side using Firebase Admin SDK. Raw manual JWT decoding without signature verification is strictly prohibited.
- **Token Leak Prevention**: Firebase ID Tokens are never written to MongoDB, logged, or saved in Task 14 audit metadata.
- **Strict Role Isolation**: Client requests can NEVER specify or escalate roles. New social accounts receive `customer` role by default. Existing roles (`merchant`, `admin`) are preserved from the local database.
- **Account Linking Safety**: Accounts are only linked if `email_verified` is True in verified Firebase claims. Unverified social identities attempting to claim an existing email are rejected with HTTP 409 Conflict.
- **Audit Immutability**: No `PUT` or `DELETE` endpoints exist for audit logs. Historical entries cannot be modified or deleted via API.
- **Non-Intrusive Observation**: Audit logging is non-blocking. A failure in audit database write will never interrupt or break a primary user operation or payment process.
- **Centralized Sensitive Data Redaction**: Automatically redacts passwords, JWTs, API keys, payment signatures, and card details to `"[REDACTED]"`.
- **Merchant Data Isolation**: All analytics, opportunity, and merchant audit endpoints strictly scope queries by the authenticated user's `merchant_id`. Merchant A can never view Merchant B's data or audit logs. Customers are rejected with HTTP 403.

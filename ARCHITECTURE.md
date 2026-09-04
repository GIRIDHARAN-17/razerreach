# RazorReach — Complete System Architecture & Technical Documentation

---

## 1. Overview

**RazorReach** is an AI-powered agentic e-commerce platform designed for the Razorpay Buildathon (Track 1: AI Growth & Agentic Commerce). The platform bridges two critical sides of modern commerce:
1. **Customer Experience**: Conversational AI Buyer Assistant (`buyer_agent.py`) that interprets natural language shopping queries, extracts structured intent, performs hybrid search (768-dimensional vector embeddings + exact keyword boosting), grounds product recommendations with verifiable reasons, and executes frictionless checkout using Razorpay.
2. **Merchant & Admin Intelligence**: An Agentic Revenue Intelligence Hub (`revenue_agent.py` & `opportunity_engine.py`) that analyzes demand signals, price elasticity, abandoned searches, and stock velocity to generate actionable revenue growth opportunities with AI-driven interpretations.

The architecture emphasizes **security, explainability, auditability, and role-based isolation** across Customers, Merchants, and Platform Administrators.

---

## 2. Problem & Solution

### Problem
- **Traditional Search**: Keyword search fails when users describe complex intent (e.g., *"lightweight laptop backpack under ₹2000 for college and rainy weather"*).
- **Merchant Blind Spots**: Small merchants lack enterprise data science teams to discover lost revenue, stockouts, pricing misalignments, or search drop-offs.
- **Unbounded AI Risk**: Autonomous AI agents making unvetted financial decisions create security and accounting risks.

### Solution
- **Intent-Driven AI Search**: Multi-turn LLM intent parsing paired with grounded hybrid vector search returning real, stocked products from MongoDB Atlas.
- **Deterministic + Agentic Revenue Intelligence**: A two-stage engine where deterministic business rules identify verifiable revenue opportunities, and an LLM agent interprets the root causes and recommends strategic growth actions.
- **Bounded Agentic Commerce**: Server-authoritative price calculation in paise, Razorpay HMAC-SHA256 signature verification, and mandatory audit logging for all critical operations.

---

## 3. High-Level System Architecture

```
                                  RAZORREACH SYSTEM
                                          │
       ┌──────────────────────────────────┼──────────────────────────────────┐
       │                                  │                                  │
       ▼                                  ▼                                  ▼
┌───────────────┐                  ┌───────────────┐                  ┌───────────────┐
│ Customer Web  │                  │ Merchant Hub  │                  │  Admin Portal │
│ (React + Vite)│                  │ (React + Vite)│                  │ (React + Vite)│
└───────┬───────┘                  └───────┬───────┘                  └───────┬───────┘
        │                                  │                                  │
        └──────────────────────────────────┼──────────────────────────────────┘
                                           │
                                           ▼
                                 ┌──────────────────┐
                                 │  TanStack Router │
                                 │   & API Client   │
                                 └────────┬─────────┘
                                          │  HTTP/REST (Bearer JWT)
                                          ▼
                                 ┌──────────────────┐
                                 │ FastAPI Backend  │
                                 │  (Async Engine)  │
                                 └────────┬─────────┘
                                          │
    ┌────────────────────┬────────────────┼────────────────────┬────────────────────┐
    ▼                    ▼                ▼                    ▼                    ▼
┌──────────────┐  ┌──────────────┐ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ MongoDB      │  │ Google Gemini│ │ Firebase     │  │ Razorpay     │  │ Cloudinary   │
│ Atlas (Motor)│  │ 2.5 Flash API│ │ Admin SDK    │  │ Payment API  │  │ Image SDK    │
└──────────────┘  └──────────────┘ └──────────────┘  └──────────────┘  └──────────────┘
```

---

## 4. Complete Technology Stack Table

| Layer | Technology | Purpose | Verified Source / Location |
|---|---|---|---|
| **Frontend Core** | React 19 (`^19.2.0`) | UI Framework | `frontend/package.json` |
| **Frontend Build** | Vite 7 (`^7.3.1`), Nitro | Fast HMR & Production Bundler | `frontend/package.json`, `vite.config.ts` |
| **Routing** | TanStack Router (`^1.168.25`), TanStack Start | File-based type-safe client-side routing | `frontend/src/routes` |
| **State & Cache** | TanStack Query (`^5.83.0`) | Server state caching & mutation | `frontend/package.json` |
| **Styling** | TailwindCSS v4 (`^4.2.1`), Framer Motion (`^12.38.0`) | Utility-first CSS & smooth micro-animations | `frontend/package.json`, `src/index.css` |
| **Icons & UI** | Lucide React (`^0.575.0`), Radix UI Primitives, Sonner | Modern iconography, dialogs & toasts | `frontend/package.json` |
| **Backend Core** | Python 3.10+, FastAPI (`>=0.109.0`) | High-performance Async REST API Framework | `backend/requirements.txt`, `backend/app/main.py` |
| **ASGI Server** | Uvicorn (`>=0.27.0`) | Asynchronous Server Gateway Interface | `backend/requirements.txt` |
| **Database** | MongoDB Atlas, Motor (`>=3.3.2`), PyMongo (`>=4.6.1`) | Async MongoDB driver & connection pool | `backend/app/core/database.py` |
| **AI / LLM** | Google GenAI SDK (`google-genai>=0.1.0`), Gemini 2.5 Flash | Natural language search, embeddings, revenue agent | `backend/app/integrations/gemini.py` |
| **Embeddings** | Google Text Embedding Gecko / 004 (768-dim) | Vector embeddings for hybrid semantic search | `backend/app/integrations/embeddings.py` |
| **Authentication** | PyJWT (`>=2.8.0`), Bcrypt (`>=4.1.2`), Firebase Admin (`>=6.2.0`) | Password hashing, JWT issuing, Firebase verification | `backend/app/core/security.py`, `firebase.py` |
| **Payments** | Razorpay Python SDK (`>=2.0.1`), Razorpay Checkout JS | Test mode order creation, HMAC signature verification | `backend/app/integrations/razorpay.py` |
| **Image Storage** | Cloudinary SDK (`>=1.36.0`) | Product image upload, transformations, data-URI fallback | `backend/app/integrations/cloudinary.py` |
| **Testing** | Pytest (`>=8.0.0`), Pytest-AsyncIO, HTTPX | Backend unit & async integration testing | `backend/tests/` |

---

## 5. Directory & File Structure

```
razorreach/
├── backend/
│   ├── app/
│   │   ├── agents/
│   │   │   ├── buyer_agent.py          # Conversational AI shopping assistant
│   │   │   ├── revenue_agent.py        # AI Revenue intelligence agent
│   │   │   ├── prompts.py              # LLM system prompts
│   │   │   └── tools/                  # Agent tool definitions
│   │   ├── core/
│   │   │   ├── config.py               # Environment configuration settings
│   │   │   ├── database.py             # Motor MongoDB Atlas connection pool
│   │   │   ├── dependencies.py         # FastAPI security & RBAC dependencies
│   │   │   └── security.py             # Bcrypt hashing & JWT token services
│   │   ├── integrations/
│   │   │   ├── cloudinary.py           # Cloudinary SDK image storage integration
│   │   │   ├── embeddings.py           # 768-dim vector embedding generator
│   │   │   ├── firebase.py             # Firebase Admin SDK ID token verifier
│   │   │   ├── gemini.py               # Google GenAI LLM client wrapper
│   │   │   └── razorpay.py             # Razorpay SDK & HMAC SHA256 verification
│   │   ├── models/                     # Raw MongoDB document helper mappers
│   │   │   ├── merchant.py
│   │   │   ├── order.py
│   │   │   ├── product.py
│   │   │   └── user.py
│   │   ├── routers/                    # FastAPI REST API endpoints
│   │   │   ├── admin.py
│   │   │   ├── ai.py
│   │   │   ├── analytics.py
│   │   │   ├── auth.py
│   │   │   ├── cart.py
│   │   │   ├── health.py
│   │   │   ├── merchants.py
│   │   │   ├── payments.py
│   │   │   ├── products.py
│   │   │   ├── search.py
│   │   │   └── webhooks.py
│   │   ├── schemas/                    # Pydantic v2 validation models
│   │   │   ├── ai_search.py
│   │   │   ├── audit.py
│   │   │   ├── cart.py
│   │   │   ├── merchant.py
│   │   │   ├── order.py
│   │   │   ├── payment.py
│   │   │   ├── product.py
│   │   │   └── user.py
│   │   ├── services/                   # Core business logic layer
│   │   │   ├── analytics_service.py
│   │   │   ├── audit_service.py
│   │   │   ├── cart_service.py
│   │   │   ├── merchant_service.py
│   │   │   ├── opportunity_engine.py   # Deterministic revenue rules engine
│   │   │   ├── opportunity_service.py
│   │   │   ├── order_service.py
│   │   │   ├── payment_service.py
│   │   │   ├── product_service.py
│   │   │   ├── search_service.py       # Hybrid vector + keyword search
│   │   │   └── user_service.py
│   │   └── main.py                     # FastAPI application entrypoint & lifespan
│   ├── scripts/                        # Utility & seeding scripts
│   ├── tests/                          # 165 backend unit & integration tests
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/                 # UI components
│   │   ├── lib/
│   │   │   ├── aibuyer/                # Auth, search, selection services
│   │   │   ├── api/client.ts           # Centralized API HTTP client
│   │   │   └── utils.ts
│   │   └── routes/                     # TanStack file-based routes
│   │       ├── __root.tsx              # Root HTML layout & toast container
│   │       ├── index.tsx               # Public landing page
│   │       ├── auth.tsx                # Auth modal & social login
│   │       ├── login.tsx / ask.tsx
│   │       └── _authenticated/
│   │           ├── route.tsx           # Authentication guard
│   │           ├── app.tsx             # Customer AI Buyer Experience
│   │           ├── merchant.tsx        # Merchant Hub & Revenue Intelligence
│   │           ├── admin.tsx           # Platform Admin Portal
│   │           ├── orders.tsx          # Customer order history
│   │           ├── history.tsx         # Customer AI search history
│   │           └── settings.tsx        # User settings
│   ├── package.json
│   └── vite.config.ts
├── ARCHITECTURE.md                     # Master architecture document
└── README.md                           # Repository documentation
```

---

## 6. Frontend Architecture & Routing

The frontend is built on **React 19** and **Vite 7**, utilizing **TanStack Router** for file-based type-safe routing and layout nesting.

### Route Architecture

```
Public Routes (No Authentication Required)
├── /                          (Landing page with CTA and feature overview)
├── /auth                      (Login & Registration Modal view)
└── /login                     (Redirect helper to /auth)

Authenticated Base Guard (`_authenticated/route.tsx`)
├── /app                       (Customer AI Buyer Shopping Assistant)
├── /orders                    (Customer Order History & Razorpay Status)
├── /history                   (Customer AI Search Query History)
├── /settings                  (Customer Account Profile Settings)
├── /merchant                  (Merchant Portal — Role Required: merchant)
└── /admin                     (Admin Portal — Role Required: admin)
```

### Route Access Control (`_authenticated/route.tsx`)

```typescript
// Guard checks JWT authentication token from localStorage
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    if (!authService.isAuthenticated()) {
      throw redirect({ to: '/auth', search: { redirect: location.href } });
    }
  },
});
```
- **Merchant Route Protection (`merchant.tsx`)**: Inspects `user.role`. If `user.role !== "merchant"`, displays access restriction banner.
- **Admin Route Protection (`admin.tsx`)**: Inspects `user.role`. If `user.role !== "admin"`, displays security warning.

---

## 7. Backend API Architecture & Endpoints

The backend is built with **FastAPI**, exposing REST endpoints under the `/api` prefix.

### Verified Endpoints Inventory

| Domain | Method | Path | Required Role | Purpose |
|---|---|---|---|---|
| **Health** | `GET` | `/api/health` | Public | General application status |
| **Health** | `GET` | `/api/health/db` | Public | MongoDB Atlas ping health check |
| **Auth** | `POST` | `/api/auth/register` | Public | Register customer/merchant account |
| **Auth** | `POST` | `/api/auth/login` | Public | Authenticate user & issue JWT |
| **Auth** | `POST` | `/api/auth/firebase` | Public | Verify Firebase ID Token & issue JWT |
| **Auth** | `GET` | `/api/auth/me` | Customer / Merchant / Admin | Retrieve current authenticated user profile |
| **Products** | `GET` | `/api/products` | Public | List published catalog products |
| **Products** | `GET` | `/api/products/{id}` | Public / Owner | Retrieve single product details |
| **Products** | `POST` | `/api/products` | Approved Merchant | Create new product |
| **Products** | `PUT` | `/api/products/{id}` | Approved Merchant | Update product details |
| **Products** | `DELETE` | `/api/products/{id}` | Approved Merchant | Soft-delete product (Archive) |
| **Products** | `POST` | `/api/products/{id}/image` | Approved Merchant | Upload single or multi-file product images |
| **Products** | `DELETE` | `/api/products/{id}/image` | Approved Merchant | Targeted image deletion |
| **Products** | `POST` | `/api/products/{id}/reindex` | Approved Merchant | Regenerate vector embedding & search_text |
| **Search** | `GET` | `/api/search` | Public | Keyword + Vector hybrid product search |
| **AI** | `POST` | `/api/ai/search` | Customer | Conversational AI Buyer Assistant query |
| **Cart** | `GET` | `/api/cart` | Customer | Retrieve active cart |
| **Cart** | `POST` | `/api/cart/items` | Customer | Add item to cart |
| **Cart** | `PUT` | `/api/cart/items/{item_id}` | Customer | Update item quantity |
| **Cart** | `DELETE` | `/api/cart/items/{item_id}` | Customer | Remove item from cart |
| **Cart** | `DELETE` | `/api/cart` | Customer | Clear all cart items |
| **Cart** | `GET` | `/api/cart/preview` | Customer | Get authoritative checkout preview |
| **Payments** | `POST` | `/api/payments/create` | Customer | Create internal pending order & Razorpay order |
| **Payments** | `POST` | `/api/payments/verify` | Customer | Verify Razorpay HMAC signature & complete order |
| **Payments** | `GET` | `/api/payments/orders/{id}` | Customer | Get payment details by order ID |
| **Orders** | `GET` | `/api/orders/my-orders` | Customer | List customer order history |
| **Orders** | `GET` | `/api/orders/{id}` | Customer / Merchant | Get detailed order summary |
| **Webhooks** | `POST` | `/api/webhooks/razorpay` | Razorpay Webhook | Handle Razorpay asynchronous payment events |
| **Merchants** | `POST` | `/api/merchants/onboard` | Merchant | Submit merchant business profile |
| **Merchants** | `GET` | `/api/merchants/me` | Merchant | Get merchant business profile |
| **Merchants** | `GET` | `/api/merchants/opportunities` | Approved Merchant | List generated revenue growth opportunities |
| **Merchants** | `POST` | `/api/merchants/opportunities/generate` | Approved Merchant | Trigger Revenue Opportunity Engine execution |
| **Merchants** | `POST` | `/api/merchants/opportunities/{id}/analyze` | Approved Merchant | Execute Revenue Agent AI interpretation |
| **Merchants** | `GET` | `/api/merchants/me/audit-logs` | Approved Merchant | View merchant audit activity log |
| **Analytics** | `GET` | `/api/analytics/dashboard` | Approved Merchant | Get merchant sales & search analytics summary |
| **Admin** | `GET` | `/api/admin/merchants` | Admin | List all registered merchant profiles |
| **Admin** | `PUT` | `/api/admin/merchants/{id}/status` | Admin | Approve or reject merchant business profile |
| **Admin** | `GET` | `/api/admin/audit-logs` | Admin | View platform-wide security audit trail |

---

## 8. Database Architecture & Schema Design

RazorReach utilizes **MongoDB Atlas** with **Motor** (an asynchronous Python MongoDB driver).

### Verified Collections & Indexing Strategy

```
                              MONGODB ATLAS (razorreach)
                                          │
       ┌──────────────────┬───────────────┼───────────────┬──────────────────┐
       ▼                  ▼               ▼               ▼                  ▼
┌──────────────┐   ┌──────────────┐┌──────────────┐┌──────────────┐   ┌──────────────┐
│    users     │   │  merchants   ││   products   ││    carts     │   │    orders    │
└──────────────┘   └──────────────┘└──────────────┘└──────────────┘   └──────────────┘
       │                  │               │               │                  │
       ▼                  ▼               ▼               ▼                  ▼
┌──────────────┐   ┌──────────────┐┌──────────────┐┌──────────────┐   ┌──────────────┐
│   payments   │   │  analytics   ││  revenue_    ││  audit_logs  │   │  processed_  │
│              │   │  _events     ││  opportuni...││              │   │  webhooks    │
└──────────────┘   └──────────────┘└──────────────┘└──────────────┘   └──────────────┘
```

1. **`users`**:
   - Fields: `_id`, `name`, `email` (unique), `password_hash`, `role` (`customer` | `merchant` | `admin`), `is_active`, `firebase_uid` (sparse unique), `auth_provider`, `created_at`, `updated_at`.
2. **`merchants`**:
   - Fields: `_id`, `user_id` (unique), `business_name`, `category`, `phone`, `address` (`city`, `state`), `status` (`pending` | `approved` | `rejected`), `created_at`, `updated_at`.
3. **`products`**:
   - Fields: `_id`, `merchant_id`, `name`, `description`, `category`, `price`, `currency` (`INR`), `stock`, `attributes`, `image_url`, `image_public_id`, `images` (`[{url, public_id}]`), `status` (`draft` | `published` | `archived`), `search_text`, `embedding` (768-dim vector), `embedding_model`, `created_at`, `updated_at`.
   - Indexes: `merchant_id`, `status`, `category`, `price`, compound `[merchant_id, status]`, text index `[search_text, "text"]`.
4. **`carts`**:
   - Fields: `_id`, `user_id`, `items` (`[{product_id, quantity, price_at_addition}]`), `status` (`active` | `converted` | `abandoned`), `created_at`, `updated_at`.
   - Index: `[user_id, status]`.
5. **`orders`**:
   - Fields: `_id`, `user_id`, `merchant_id`, `items` (`[{product_id, name, price, quantity, subtotal}]`), `amount_paise`, `currency`, `status` (`pending` | `paid` | `cancelled` | `failed`), `razorpay_order_id` (sparse unique), `created_at`, `updated_at`.
   - Indexes: `user_id`, `razorpay_order_id`.
6. **`payments`**:
   - Fields: `_id`, `order_id`, `razorpay_order_id`, `razorpay_payment_id` (partial unique index for strings), `amount_paise`, `currency`, `status` (`created` | `captured` | `failed`), `signature_verified`, `webhook_verified`, `created_at`, `updated_at`.
   - Indexes: `order_id`, partial unique `razorpay_payment_id`.
7. **`processed_webhooks`**:
   - Fields: `_id`, `event_id` (sparse unique), `event_type`, `processed_at`.
8. **`analytics_events`**:
   - Fields: `_id`, `event_type` (`product_view`, `search_query`, `cart_add`, `checkout_start`), `user_id`, `merchant_id`, `product_id`, `metadata`, `created_at`.
   - Indexes: `event_type`, `created_at`, `merchant_id`, `product_id`, `user_id`.
9. **`revenue_opportunities`**:
   - Fields: `_id`, `merchant_id`, `type` (`PRICING_OPTIMIZATION` | `INVENTORY_RESTOCK` | `SEARCH_CONVERSION_BOOST` | `DEMAND_SURGE`), `priority` (`high` | `medium` | `low`), `title`, `description`, `score`, `target`, `period_start`, `period_end`, `generated_at`, `analysis` (`{interpretation, recommended_actions}`).
   - Indexes: `merchant_id`, `type`, `priority`, compound unique `[merchant_id, type, target, period_start]`.
10. **`audit_logs`**:
    - Fields: `_id`, `actor_id`, `actor_role`, `action`, `resource_type`, `resource_id`, `result` (`SUCCESS` | `FAILURE`), `metadata`, `ip_address`, `user_agent`, `created_at`.
    - Indexes: `actor_id`, `action`, `resource_type`, `resource_id`, `created_at`, compound `[actor_id, created_at]`.

---

## 9. Authentication Architecture

RazorReach supports dual authentication:
1. **Native Email/Password**: Bcrypt hashing (`bcrypt.hashpw`) + PyJWT token generation (`HS256`).
2. **Social Sign-In (Google & Apple)**: Server-side Firebase ID Token verification via Firebase Admin SDK.

```
                  AUTHENTICATION FLOW
                           │
       ┌───────────────────┴───────────────────┐
       ▼                                       ▼
Native Email/Password                    Firebase Social Sign-In
       │                                       │
Frontend POST /api/auth/login            Frontend Firebase SDK Login
       │                                       │
MongoDB User Lookup                      Firebase ID Token
       │                                       │
Bcrypt Password Verify                   Frontend POST /api/auth/firebase
       │                                       │
       │                                 Firebase Admin SDK Verification
       │                                       │
       │                                 Local Account Linking / User Lookup
       │                                       │
       └───────────────────┬───────────────────┘
                           ▼
               Issue RazorReach JWT Token
            {"sub": user_id, "role": role}
                           │
                           ▼
          Frontend LocalStorage Persistence
```

---

## 10. Role-Based Access Control (RBAC)

RazorReach enforces strict role segregation across three explicit roles:

```
                            ROLE PERMISSIONS
                                   │
       ┌───────────────────────────┼───────────────────────────┐
       ▼                           ▼                           ▼
  CUSTOMER                      MERCHANT                     ADMIN
   (Role: customer)              (Role: merchant)             (Role: admin)
       │                           │                           │
 ├── AI Shopping Queries    ├── Merchant Onboarding     ├── Approve/Reject Merchants
 ├── Vector Product Search  ├── Product CRUD            ├── View Platform Audit Logs
 ├── Manage Cart Items      ├── Multi-Image Upload      └── System Maintenance
 ├── Razorpay Checkout      ├── Analytics Dashboard
 └── Order History          ├── Revenue Opportunities
                            ├── AI Revenue Agent
                            └── Merchant Audit Logs
```

---

## 11. Customer Journey & AI Search Architecture

### AI Search & Recommendation Pipeline

```
Customer Shopping Query ("waterproof laptop backpack under ₹2000")
       │
       ▼
POST /api/ai/search -> buyer_agent.py
       │
       ▼
Google Gemini 2.5 Flash API
       │
       ▼
Extract Structured SearchIntent
{"search_text": "laptop backpack", "category": "electronics", "max_price": 2000, "required_features": ["waterproof"]}
       │
       ▼
Generate Query Vector Embedding (768-dim) -> embeddings.py
       │
       ▼
MongoDB Hybrid Search (Vector Cosine Similarity + Keyword Exact Match Boost)
       │
       ▼
Hard Constraint Filter (Status = "published", Price <= Max Budget, Stock > 0)
       │
       ▼
Ground Recommendations with Verifiable Reasons
       │
       ▼
Return AISearchResponse to Customer UI
```

---

## 12. Revenue Intelligence Architecture

RazorReach features a **two-tier Revenue Intelligence Engine** designed specifically for merchants:

```
                      REVENUE INTELLIGENCE PIPELINE
                                   │
      Customer Search Events, Page Views, Inventory Stock & Purchases
                                   │
                                   ▼
                    Analytics Events Collection
                                   │
                                   ▼
               Opportunity Engine (opportunity_engine.py)
                 [Deterministic Rule-Based Detection]
                                   │
      ┌────────────────────────────┼────────────────────────────┐
      ▼                            ▼                            ▼
Pricing Optimization        Stock Restock Alert          Search Drop-Off Boost
(Price vs Market)           (Velocity <= 5 days)         (High search, 0 sales)
      │                            │                            │
      └────────────────────────────┼────────────────────────────┘
                                   ▼
                    `revenue_opportunities` Documents
                                   │
                                   ▼
                  Merchant Clicks "Analyze Opportunity"
                                   │
                                   ▼
                  AI Revenue Agent (revenue_agent.py)
                     [Gemini 2.5 Flash Assistant]
                                   │
                                   ▼
             Root-Cause Interpretation & Actionable Strategy
```

1. **Deterministic Opportunity Engine (`opportunity_engine.py`)**:
   - Executes objective analysis on analytics events and sales records.
   - Detects pricing misalignments, stockout risks, and high-demand search drop-offs without AI hallucination risk.
2. **AI Revenue Agent (`revenue_agent.py`)**:
   - Uses Gemini 2.5 Flash to synthesize merchant performance metrics and generate strategic growth guidance.
   - Operates within safety boundaries (advisory recommendations only).

---

## 13. Payment Architecture & Checkout Flow

```
                      RAZORPAY PAYMENT FLOW
                                │
Customer Selects Product Recommendation / Cart Item
                                │
                                ▼
GET /api/cart/preview -> Server Calculates Total in Paise (Authoritative)
                                │
                                ▼
POST /api/payments/create
 ├── Validates Live Stock & Price
 ├── Creates Pending Order Document in MongoDB (`orders`)
 ├── Calls Razorpay SDK `client.order.create(amount_paise, currency="INR")`
 └── Creates Payment Document in MongoDB (`payments`)
                                │
                                ▼
Returns `razorpay_order_id`, `razorpay_key_id`, `amount_paise`
                                │
                                ▼
Customer Completes Razorpay Modal Payment
                                │
                                ▼
POST /api/payments/verify
 ├── Verifies HMAC-SHA256 Signature using `RAZORPAY_KEY_SECRET`
 ├── Updates Payment Status to `captured`
 ├── Updates Order Status to `paid`
 └── Clears Customer Cart & Records Audit Log Event
```

---

## 14. Product Image Architecture

```
Merchant Selects Image Files (JPEG, PNG, WEBP, <= 5MB)
       │
       ▼
Frontend Image Manager Modal Preview & Validation
       │
       ▼
POST /api/products/{id}/image (Multipart Form-Data)
       │
       ▼
Cloudinary Storage Integration (`cloudinary.py`)
 [Uploads asset to Cloudinary / Data-URI fallback]
       │
       ▼
Updates Product Document in MongoDB
 `images`: [{ "url": secure_url, "public_id": public_id }]
 `image_url`: primary_url
       │
       ▼
Customer AI Search & Product Pages Display Image
```

---

## 15. Security Architecture

- **Authoritative Server Pricing**: All order totals and amounts are computed on the backend in integer paise (`₹1,499` = `149900` paise). Frontend amounts are ignored during payment initialization.
- **HMAC SHA256 Verification**: Every Razorpay payment confirmation and webhook event undergoes HMAC-SHA256 signature verification using the backend secret key.
- **Bcrypt Password Hashing**: User passwords are encrypted with individual salts using Bcrypt before storage in MongoDB Atlas.
- **Sanitized Logging**: API keys, JWT tokens, password hashes, and Razorpay secrets are masked in logs.
- **Partial Index Constraints**: `razorpay_payment_id` uses a partial unique index filtering non-null strings to avoid key collision during pending order creation.

---

## 16. Error Handling Strategy

| Status Code | Exception Type | Description |
|---|---|---|
| `400 Bad Request` | `HTTPException` | Invalid payload, empty search query, invalid file type |
| `401 Unauthorized` | `HTTPException` | Missing or expired JWT token, invalid password |
| `403 Forbidden` | `HTTPException` | Insufficient role permissions or unapproved merchant |
| `404 Not Found` | `HTTPException` | Product, order, or user resource not found |
| `413 Content Too Large` | `HTTPException` | Product image file size > 5MB |
| `415 Unsupported Media` | `HTTPException` | File extension not in `.jpg`, `.jpeg`, `.png`, `.webp` |
| `503 Service Unavailable` | `HTTPException` | MongoDB Atlas network timeout or external integration failure |

---

## 17. Testing Architecture

The backend includes a comprehensive automated test suite powered by **Pytest** and **Pytest-AsyncIO**:

```bash
# Run complete backend test suite
.\venv\Scripts\pytest
```

### Verification Results
- **Backend Test Suite**: **165 / 165 Passed (100%)**
  - `test_analytics.py`: 9 passed
  - `test_audit.py`: 7 passed
  - `test_auth.py`: 13 passed
  - `test_buyer_agent.py`: 16 passed
  - `test_cart.py`: 12 passed
  - `test_database.py`: 6 passed
  - `test_firebase_auth.py`: 10 passed
  - `test_health.py`: 1 passed
  - `test_hybrid_search.py`: 11 passed
  - `test_merchants.py`: 13 passed
  - `test_opportunity_engine.py`: 8 passed
  - `test_payments.py`: 7 passed
  - `test_products.py`: 25 passed
  - `test_revenue_agent.py`: 7 passed
  - `test_search.py`: 20 passed
- **Frontend Production Build**: **Passed with 0 errors** (`npm run build`)

---

## 18. Actual vs. Planned Feature Status

| Feature / Component | Status | Implementation Details |
|---|---|---|
| Customer AI Buyer Assistant | **IMPLEMENTED** | Conversational Gemini search, intent parsing, grounded reasons |
| Vector & Hybrid Search | **IMPLEMENTED** | 768-dim embeddings cosine similarity + text index keyword boost |
| Cart & Checkout Preview | **IMPLEMENTED** | Server-authoritative totals, cart item management |
| Razorpay Payments | **IMPLEMENTED** | Order creation, HMAC verification, webhook handler, paise amounts |
| Dual Authentication | **IMPLEMENTED** | Native Bcrypt/JWT + Firebase Social Sign-In |
| Role-Based Authorization | **IMPLEMENTED** | Explicit guards for `customer`, `merchant`, and `admin` |
| Merchant Product CRUD | **IMPLEMENTED** | Complete product lifecycle management & search reindexing |
| Multi-Image Management | **IMPLEMENTED** | Cloudinary multi-file upload, preview, primary tag, deletion |
| Revenue Opportunity Engine | **IMPLEMENTED** | Deterministic detection for pricing, stock, demand, and search drop-offs |
| AI Revenue Agent | **IMPLEMENTED** | Strategic opportunity interpretation & growth recommendations |
| Merchant & Admin Audit Log | **IMPLEMENTED** | Immutable security audit trail in MongoDB Atlas |
| Merchant Onboarding & Admin Approval | **IMPLEMENTED** | Admin merchant approval workflow |

---

## 19. Buildathon Alignment (Track 1: AI Growth & Agentic Commerce)

RazorReach directly fulfills all Track 1 criteria:
1. **AI Buyer Shopping Experience**: Moves beyond keyword lookup to natural language intent understanding and grounded recommendation reasoning.
2. **Merchant Growth Intelligence**: Empowers small merchants with automated revenue discovery engines.
3. **Agentic Commerce**: Combines LLM intelligence with deterministic safety guards, server-side price validation, and Razorpay integration.
4. **Auditability & Trust**: Maintains audit trails for system actions and user transactions.

---

## 20. Architecture Summary

RazorReach delivers an end-to-end, production-ready, agentic commerce platform. By combining FastAPI, React 19, MongoDB Atlas, Google Gemini, and Razorpay, the platform demonstrates how modern AI agents can drive customer discovery and merchant revenue while adhering to enterprise standards for security and reliability.

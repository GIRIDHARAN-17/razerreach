# RazorReach — Buildathon Live Demonstration Checklist & Runbook

> **Purpose**: Pre-flight verification, presentation execution, and contingency protocols for the Razorpay Buildathon demonstration.

---

## 📋 Phase 1: Pre-Demo Verification (10 Minutes Prior)

### 1. Service Availability Check
- [ ] Backend health endpoints responding with HTTP 200 OK:
  - `http://localhost:8000/health` (Root Health Check)
  - `http://localhost:8000/api/health/db` (MongoDB Atlas Connection)
- [ ] Frontend running cleanly:
  - `http://localhost:3000` (Customer Storefront)
  - `http://localhost:3000/merchant` (Merchant Intelligence Hub)

### 2. Demo Dataset Validation
- [ ] Reset and verify the demo dataset:
  ```bash
  cd backend
  python scripts/seed_demo.py --reset
  ```
- [ ] Confirm output reports:
  - 8 products indexed into hybrid vector search.
  - 76 deterministic demand signals seeded.
  - 4 opportunity types detected (Stock Gap, Low Conversion, Cart Abandonment, Unserved Demand).
  - 2 verified paid orders totaling ₹2,298.00.

### 3. Demo Credentials Ready
- [ ] **Merchant**: `merchant@razorreach.test` / `RazorReach@Merchant2026!`
- [ ] **Customer**: `customer@razorreach.test` / `RazorReach@Customer2026!`
- [ ] **Admin**: `admin@razorreach.test` / `RazorReach@Admin2026!`

### 4. Browser Tabs Pre-Arranged
- [ ] **Tab 1**: Merchant Hub (`/merchant`) logged in as `merchant@razorreach.test`.
- [ ] **Tab 2**: Customer Store (`/app`) logged in as `customer@razorreach.test` (or incognito).
- [ ] **Tab 3**: Razorpay Test Mode Dashboard (optional, for visual webhook verification).

---

## 🎬 Phase 2: Live Demonstration Flow (5:00 Minutes)

| Time | Phase | Target Screen | Key Action / Verification |
|---|---|---|---|
| **0:00–0:30** | The Problem | Merchant Hub | Explain merchant revenue blind spots (stockouts, zero searches, drop-offs). |
| **0:30–1:15** | Opportunity Engine | Opportunities Tab | Show 4 detected opportunities and real quantified potential loss. |
| **1:15–2:00** | Revenue Agent | Opportunity Card | Open analysis: Point out **FACT** vs. **HYPOTHESIS** vs. **SUGGESTION**. |
| **2:00–3:00** | AI Buyer Discovery | Customer Store | Query: *"durable backpack with laptop compartment"*; then *"show me the second one"*. |
| **3:00–4:00** | Bounded Commerce | Cart & Checkout | Highlight Policy Gate bounds; complete Razorpay Test Mode card transaction. |
| **4:00–4:30** | Verified Revenue | Merchant Dashboard | Show Verified Revenue update and new order in recent activity list. |
| **4:30–5:00** | Audit Trail | Audit Tab | Open `PAYMENT_VERIFIED` event drawer: complete causal traceability. |

---

## 🛡 Phase 3: Contingency & Failure Recovery Protocols

### Protocol A: External Gemini API Rate-Limited (HTTP 429) or Offline
- **Built-in Resilience**: RazorReach includes an active resilience circuit breaker and deterministic keyword/BM25 fallback.
- **Action**: No panic. Search continues working deterministically. Point this out as a built-in architectural resilience feature:
  > *"Notice how the system handles external AI degradation: the resilience layer seamlessly fell back to deterministic ranking, preserving uptime."*

### Protocol B: Demo Dataset Corrupted or Out-of-Sync
- **Immediate Recovery**:
  ```bash
  cd backend
  python scripts/seed_demo.py --reset
  ```
- Takes under 15 seconds to completely purge and restore the 8 products, signals, opportunities, and verified revenue records.

### Protocol C: Razorpay Checkout JS Network Delay
- If local network blocks Razorpay modal:
  - Explain the server-side order creation (`POST /api/payments/create`) returning authoritative paise.
  - Show the existing verified orders and payment audit trail created during the demo seeding.

### Protocol D: Public Internet Latency / Cloud Deployment Downtime
- Run local development fallback:
  - Backend: `http://localhost:8000`
  - Frontend: `http://localhost:3000`
- Both local and production configurations share 100% identical schemas, routes, and security boundaries.

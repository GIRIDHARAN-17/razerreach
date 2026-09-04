# RazorReach Frontend API Service Mapping

This document maps frontend API service functions (`src/services/api/`) to authoritative backend FastAPI REST endpoints.

---

## 1. Authentication Services (`authApi.js`)
- `authApi.register(userData)` ➔ `POST /api/auth/register` (Public)
- `authApi.login(credentials)` ➔ `POST /api/auth/login` (Public)
- `authApi.firebaseLogin(idToken)` ➔ `POST /api/auth/firebase` (Public, exchange Firebase ID Token for RazorReach JWT)
- `authApi.getMe()` ➔ `GET /api/auth/me` (Authenticated User)

---

## 2. Product Catalog Services (`productApi.js`)
- `productApi.listProducts(params)` ➔ `GET /api/products` (Public, optional query filters)
- `productApi.getProduct(id)` ➔ `GET /api/products/{product_id}` (Public)
- `productApi.createProduct(data)` ➔ `POST /api/products` (Approved Merchant)
- `productApi.updateProduct(id, data)` ➔ `PUT /api/products/{product_id}` (Owner Merchant)
- `productApi.archiveProduct(id)` ➔ `DELETE /api/products/{product_id}` (Owner Merchant)
- `productApi.reindexProduct(id)` ➔ `POST /api/products/{product_id}/reindex` (Owner Merchant)

---

## 3. Search & AI Buyer Agent Services (`searchApi.js`)
- `searchApi.hybridSearch(params)` ➔ `GET /api/search` (Public)
- `searchApi.semanticSearch(params)` ➔ `GET /api/search/semantic` (Public)
- `searchApi.aiSearch(data)` ➔ `POST /api/ai/search` (Authenticated Customer)

---

## 4. Shopping Cart & Checkout Services (`cartApi.js`)
- `cartApi.getCart()` ➔ `GET /api/cart` (Authenticated Customer)
- `cartApi.addItem(product_id, quantity)` ➔ `POST /api/cart/items` (Authenticated Customer)
- `cartApi.updateItem(product_id, quantity)` ➔ `PUT /api/cart/items/{product_id}` (Authenticated Customer)
- `cartApi.removeItem(product_id)` ➔ `DELETE /api/cart/items/{product_id}` (Authenticated Customer)
- `cartApi.clearCart()` ➔ `DELETE /api/cart` (Authenticated Customer)
- `cartApi.checkoutPreview()` ➔ `POST /api/checkout/preview` (Authenticated Customer)

---

## 5. Orders & Payments Services (`orderApi.js`, `paymentApi.js`)
- `orderApi.getOrders()` ➔ `GET /api/orders` (Authenticated Customer)
- `orderApi.getOrder(id)` ➔ `GET /api/orders/{order_id}` (Authenticated Customer)
- `paymentApi.createPaymentOrder()` ➔ `POST /api/payments/create` (Authenticated Customer)
- `paymentApi.verifyPayment(payload)` ➔ `POST /api/payments/verify` (Authenticated Customer)

---

## 6. Merchant Profile & Analytics Services (`merchantApi.js`, `analyticsApi.js`, `opportunityApi.js`)
- `merchantApi.getProfile()` ➔ `GET /api/merchants/me` (Merchant)
- `merchantApi.createProfile(data)` ➔ `POST /api/merchants` (Merchant)
- `merchantApi.updateProfile(data)` ➔ `PUT /api/merchants/me` (Merchant)
- `merchantApi.getDashboard()` ➔ `GET /api/merchants/dashboard` (Merchant)
- `analyticsApi.getSummary(periodDays)` ➔ `GET /api/merchants/analytics/summary` (Merchant)
- `analyticsApi.getOpportunities(periodDays)` ➔ `GET /api/merchants/opportunities` (Merchant)
- `analyticsApi.generateOpportunities(periodDays)` ➔ `POST /api/merchants/opportunities/generate` (Merchant)
- `opportunityApi.analyzeSingle(id)` ➔ `POST /api/merchants/opportunities/{opportunity_id}/analyze` (Merchant)
- `opportunityApi.analyzeBulk(limit)` ➔ `POST /api/merchants/opportunities/analyze` (Merchant)

---

## 7. Platform Audit Trail Services (`auditApi.js`)
- `auditApi.getAdminAuditLogs(params)` ➔ `GET /api/admin/audit-logs` (Admin)
- `auditApi.getMerchantAuditLogs(params)` ➔ `GET /api/merchants/audit-logs` (Merchant)

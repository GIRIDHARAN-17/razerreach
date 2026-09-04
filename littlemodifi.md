TASK: FIX CART → CHECKOUT → RAZORPAY PAYMENT FLOW

PROBLEM:
The Customer Cart page is working correctly.

However, when clicking:

"Proceed to Checkout"

the application navigates to the New Search / AI Buyer page instead of
opening the existing Checkout & Payment flow.

DO NOT redesign the Cart page.

Fix the navigation and checkout integration.

============================================================
1. TRACE THE EXISTING IMPLEMENTATION FIRST
============================================================

Before changing code, inspect:

- CartPage
- cartApi/service
- CheckoutPage
- checkoutApi/service
- paymentApi/service
- existing Razorpay integration
- React Router configuration
- CustomerLayout
- /checkout route

Find exactly why:

Proceed to Checkout

currently navigates to:

/shop

or the New Search page.

Do NOT guess.

============================================================
2. CORRECT ROUTE
============================================================

The Cart button:

Proceed to Checkout

must navigate to:

/checkout

NOT:

/shop
/search
/app
/

Use the existing React Router route if /checkout already exists.

Do not create a duplicate checkout route.

============================================================
3. CHECKOUT PAGE
============================================================

When /checkout loads:

fetch the current authenticated user's cart/order information using
the existing backend APIs.

Use the existing:

POST /api/checkout/preview

endpoint.

Do NOT calculate the trusted payment amount only on the frontend.

The backend is authoritative.

============================================================
4. CHECKOUT PREVIEW FLOW
============================================================

Expected flow:

Cart
 ↓
Click "Proceed to Checkout"
 ↓
/checkout
 ↓
POST /api/checkout/preview
 ↓
Backend validates cart
 ↓
Backend calculates trusted amount
 ↓
Checkout page displays preview
 ↓
"Pay with Razorpay"
 ↓
POST /api/payments/create
 ↓
Razorpay Checkout
 ↓
Payment completed
 ↓
POST /api/payments/verify
 ↓
Order/payment status updated
 ↓
/orders
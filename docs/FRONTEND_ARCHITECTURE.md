# RazorReach Frontend Architecture & Design System Guide

This document details the frontend architecture, authentication flow, design system, ReactBits strategy, and route protection rules for **RazorReach**.

---

## 1. Directory Structure

```
frontend/
├── src/
│   ├── assets/               # Static image and vector assets
│   ├── components/
│   │   ├── common/           # Reusable UI states (LoadingSpinner, ErrorState, EmptyState, GlobalErrorBoundary)
│   │   ├── layout/           # Portal layouts (PublicLayout, CustomerLayout, MerchantLayout, AdminLayout)
│   │   └── reactbits/        # Isolated ReactBits component library
│   │       ├── GradientWaves/
│   │       ├── ParticleText/
│   │       ├── ScrollReveal/
│   │       ├── SpotlightCard/
│   │       ├── TiltedCard/
│   │       ├── CountUp/
│   │       ├── FadeContent/
│   │       └── WebThreads/
│   ├── config/               # Environment settings loader (env.js)
│   ├── context/              # Global React Context (AuthContext)
│   ├── pages/                # Page route components
│   │   ├── public/           # Landing, Login, Signup, AuthCallback
│   │   ├── customer/         # Shop, Search, ProductDetail, Cart, Checkout, Orders, OrderDetail
│   │   ├── merchant/         # Dashboard, Products, Analytics, Opportunities, RevenueAgent
│   │   └── admin/            # AdminDashboard, AuditLogs
│   ├── routes/               # PublicRoute, ProtectedRoute, RoleProtectedRoute, AppRoutes
│   ├── services/
│   │   ├── api/              # Centralized apiClient and domain API modules
│   │   └── firebase/         # Firebase Web SDK client configuration
│   ├── styles/               # Design tokens and utilities (index.css)
│   ├── App.jsx               # Root application wrapper
│   └── main.jsx              # React entry point
├── .env.example              # Allowed frontend environment variables
├── package.json              # Dependencies and scripts
└── vite.config.js            # Vite bundler configuration
```

---

## 2. Authentication Architecture

RazorReach uses a dual-layer authentication architecture:
1. **Firebase Authentication (External Identity)**: Google & Apple Sign-In on the client side obtain a Firebase ID Token.
2. **RazorReach JWT (Application Authorization)**: The client POSTs the Firebase ID Token to `POST /api/auth/firebase`. The backend verifies the token server-side, resolves/links the local user, and issues a standard RazorReach JWT.
3. **Storage & Headers**: The RazorReach JWT is saved in `localStorage` (`razorreach_token`) and automatically attached to protected requests via `Authorization: Bearer <RAZORREACH_JWT>`.
4. **401 Unauthenticated Handling**: `apiClient.js` intercepts HTTP 401 responses and triggers `logout()`, clearing client credentials and redirecting to `/login`.

---

## 3. Route Hierarchy & RBAC Protection

| Route Path | Layout | Route Guard | Allowed Roles |
|---|---|---|---|
| `/` | `PublicLayout` | `PublicRoute` | Anyone |
| `/login` | `PublicLayout` | `PublicRoute (restricted)` | Unauthenticated |
| `/signup` | `PublicLayout` | `PublicRoute (restricted)` | Unauthenticated |
| `/shop` | `CustomerLayout` | `RoleProtectedRoute` | `customer` |
| `/search` | `CustomerLayout` | `RoleProtectedRoute` | `customer` |
| `/products/:id` | `CustomerLayout` | `RoleProtectedRoute` | `customer` |
| `/cart` | `CustomerLayout` | `RoleProtectedRoute` | `customer` |
| `/checkout` | `CustomerLayout` | `RoleProtectedRoute` | `customer` |
| `/orders` | `CustomerLayout` | `RoleProtectedRoute` | `customer` |
| `/merchant/*` | `MerchantLayout` | `RoleProtectedRoute` | `merchant` |
| `/admin/*` | `AdminLayout` | `RoleProtectedRoute` | `admin` |

---

## 4. Visual Identity & Design System

- **Visual Direction**: Dark-first, futuristic AI commerce.
- **Background**: Near-black (`#090a0f`, `#0d0e15`).
- **Surfaces**: Glassmorphism cards (`#131520` with translucent backdrop blur).
- **Primary Accent**: Electric Violet (`#7c3aed`, `#8b5cf6`).
- **Secondary Accent**: Cyan (`#06b6d4`, `#22d3ee`).
- **Typography**: `Outfit` for headings, `Inter` for body.
- **Accessibility**: Visible focus rings, screen reader labels, and `prefers-reduced-motion` animation disables.

---

## 5. Security & Secret Protection

- Frontend `.env` contains ONLY `VITE_` prefixed public configurations (`VITE_API_BASE_URL`, `VITE_FIREBASE_*`).
- Backend secrets (`RAZORPAY_KEY_SECRET`, `GEMINI_API_KEY`, `FIREBASE_PRIVATE_KEY`, `MONGODB_URI`) are NEVER included or exposed in frontend code.
- Authorization decisions are enforced server-side. Frontend route guards exist for user experience.

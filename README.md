# SoleThief (ソールシーフ) — E-Commerce & Sneaker Archive

SoleThief is a high-performance sneaker vault combining Tokyo streetwear aesthetics with an immutable, secure e-commerce architecture. Built with React 19, Vite, Tailwind CSS, Matter.js physics, GSAP animations, Supabase PostgreSQL, and Razorpay payment integration.

---

## ⚡ Dual-Mode Architecture

SoleThief operates in a resilient **Dual-Mode Architecture** designed for seamless transitions between demonstration/offline environments and live enterprise deployments:

| Capability | 🧪 Preview Mode (Zero Setup / Offline) | 🚀 Live Supabase Mode (Production) |
|---|---|---|
| **Trigger** | Default when `.env` is blank or unconfigured | Enabled when valid `VITE_SUPABASE_URL` and keys exist in `.env` |
| **Catalog** | 4 authentic Tokyo drop pairs loaded from static archive | Fetched live from `public.products` table |
| **Authentication** | Instant 1-click test personas (`Collector`, `Sneakerhead`) | Supabase Auth (Email OTP / Password / PKCE tokens) |
| **Bag & Wishlist** | Client-persisted (`solethief.cart.v1`, `solethief.wishlist.v1`) | Client-persisted with live DB stock resolution |
| **Checkout & Orders** | Simulated order generation with GST 18% and instant ST-ID | Atomic server Edge Functions, DB repricing, inventory locking |
| **Payments** | Simulated instant payment / mock test mode | Authoritative Razorpay gateway with HMAC SHA-256 webhooks |
| **Admin Console** | Shibuya Command (`/admin`) with local operator session | Query against `public.admin_roles` table with failure-closed RLS |

---

## 🚀 Quickstart

### Prerequisites
- Node.js 22.12+ (tested on Node 22.12.0 / 24.13.1)
- npm 10+

### Installation & Run
```bash
# 1. Install dependencies
npm install

# 2. Start Vite development server
npm run dev

# 3. Run test suites
npm test

# 4. Lint codebase
npm run lint

# 5. Production build
npm run build
```

---

## 🔐 Credentials & Supabase Setup Guide

When ready to switch from **Preview Mode** to **Live Supabase Mode**, follow these copy-paste steps:

### Step 1: Configure Client Environment Variables
Copy `.env.example` to `.env` (or update existing `.env`):
```env
# Public client configuration only (safe for browser bundles)
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
# Alternatively use legacy anon key:
# VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
> **Security Guardrail:** `src/lib/supabase.js` strictly inspects the key format. If a `service_role` secret is mistakenly passed to `VITE_SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_ANON_KEY`, the client fails closed and throws an error to prevent leaking backend credentials to the browser.

### Step 2: Run Database Migrations
1. Open the **SQL Editor** in your Supabase Dashboard (or use `supabase db push`).
2. Run [`supabase/migrations/202610100001_foundation.sql`](supabase/migrations/202610100001_foundation.sql):
   - Sets up `products`, `profiles`, `admin_roles`, `addresses`, `orders`, `order_items`, and `inventory_pairs` tables.
   - Configures airtight Row Level Security (RLS) policies and revokes unauthorized write access.
3. Run [`supabase/migrations/202610100002_catalog_seed.sql`](supabase/migrations/202610100002_catalog_seed.sql):
   - Populates the 4 core sneaker drops with integer paise pricing (`1900000`, `1850000`, `1650000`, `1650000`).
   - Inserts physical inventory rows with initial state `unavailable` awaiting physical authentication.

### Step 3: Configure Auth in Supabase Dashboard
1. Go to **Authentication -> URL Configuration** in your Supabase project dashboard.
2. Set **Site URL** to your production domain or local preview URL (e.g. `http://localhost:5173` or your Cloudflare tunnel domain).
3. Add redirect URLs under **Redirect URLs** (e.g., `http://localhost:5173/**`).

### Step 4: Provision an Admin User
1. Create a user via Supabase Auth (or sign in via the app's `/account` page with email).
2. Obtain the user's UUID from the `auth.users` table.
3. In the Supabase SQL Editor, run:
```sql
-- Grant admin access to trusted operator
INSERT INTO public.admin_roles (user_id, role)
VALUES ('YOUR-USER-UUID-HERE', 'admin')
ON CONFLICT (user_id) DO NOTHING;
```
Now this user can access `/admin` with full operational privileges.

### Step 5: Configure Backend Secrets & Edge Functions
Edge Functions live in `supabase/functions/` and execute in a trusted server-side runtime. They require private secrets never exposed to the client:

In your Supabase project dashboard (**Project Settings -> Secrets** or `supabase secrets set`):
```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_secret_key
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_razorpay_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_signing_secret
```

Deploy Edge Functions:
```bash
supabase functions deploy create-order --no-verify-jwt
supabase functions deploy razorpay-webhook --no-verify-jwt
```

---

## 🏛️ Architectural Pillars

1. **Catalog & Physics Engine:**
   - Interactive hero showcase powered by Matter.js rigid bodies and GSAP animation sequences.
   - Numeric route resolution (`/product/:id`) with strict decimal validation and image asset sanitization.
2. **Deterministic Cart & Wishlist:**
   - Single-pair allocation invariant (one physical pair per drop).
   - All financial math computed in integer paise (`₹1.00 = 100 paise`), eliminating floating-point rounding bugs.
3. **Identity & Customer Profile:**
   - Customer-isolated profile and address models enforcing 6-digit Indian PIN codes and `IN` country code.
   - Dual-persona instant testing in Preview Mode with realistic Bangalore and Mumbai addresses.
4. **Checkout & Order Lifecycle:**
   - Server-authoritative repricing: cart items are validated against live database rows before order creation.
   - Indian GST standard calculation (18%) and selectable courier tiers (Standard vs Shibuya Priority Air).
   - Strict status transition state machine: `pending_payment` -> `paid` -> `processing` -> `shipped` -> `delivered`.
5. **Shibuya Command Admin Console (`/admin`):**
   - Real-time inventory tracking (`available`, `reserved`, `sold`, `archived`) and physical authentication tags (`ST-AUTH-XXX-TYO`).
   - Sneaker drop editor and order fulfillment management.
   - Executive KPIs: Total Revenue, Active Drops, Available Pairs, and Pending Shipments.

---

## 🧪 Verification & Test Suite

The test suite contains 36 automated unit tests validating all domain invariants:
- `tests/foundation.test.js`: Supabase initialization, credential protection, adapter contracts, seed fidelity.
- `tests/commerce.test.js`: Cart storage validation, decimal parsing, single-pair limits, filter logic.
- `tests/auth-wishlist.test.js`: Wishlist operations, PIN code validation, profile schema, mock accounts.
- `tests/checkout-orders.test.js`: Order ID generation, integer paise math, GST 18%, FIFO history, lifecycle transitions.
- `tests/admin.test.js`: Operator access control, live RLS isolation, drop creation validation, fulfillment operations, KPI formulas.

Run all tests:
```bash
npm test
```
Lint code:
```bash
npm run lint
```
Build bundle:
```bash
npm run build
```

---

## 🌐 Live Preview & Tunnels
- Local Dev URL: `http://localhost:5173`
- Active Cloudflare Tunnel: `https://bras-mother-ricky-app.trycloudflare.com`

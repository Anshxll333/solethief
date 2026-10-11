# Supabase Architecture & Production Setup Guide

This document is the definitive operational guide for the SoleThief backend infrastructure, database migrations, Row Level Security (RLS) enforcement, Edge Functions, and dual-mode runtime contracts.

---

## ⚡ Dual-Mode System Contract

SoleThief implements a **Dual-Mode Architecture**:

```
                         ┌────────────────────────┐
                         │   SoleThief Frontend   │
                         └───────────┬────────────┘
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
      [Preview Mode (Offline)]               [Live Supabase Mode]
   • No .env or blank credentials          • Valid VITE_SUPABASE_URL + Key
   • Static 4-shoe drop archive            • Live public.products table
   • In-memory / localStorage Cart         • Stock-verified cart resolution
   • Mock Personas (Collector/Sneakerhead) • Supabase Auth (JWT / PKCE)
   • Local Order Simulation (GST 18%)      • Edge Function Repricing & Orders
   • Shibuya Command Operator toggle       • public.admin_roles authorization
```

1. **Preview Mode:**
   - Automatically engaged when `VITE_SUPABASE_URL` or public keys are blank/unconfigured.
   - Provides an instant zero-latency experience for development, offline demos, and design reviews.
   - Mock profiles, addresses, and order simulations work with zero external dependencies.
2. **Live Supabase Mode:**
   - Enabled immediately when valid public credentials are supplied in `.env`.
   - Never trusts browser prices, quantities, or stock flags.
   - All mutations pass through strict server-enforced RLS policies or privileged Edge Functions.

---

## 🔐 Credentials & Environment Separation

SoleThief maintains a strict security boundary between client-exposed environment variables and backend-only secrets:

### 1. Frontend Client Configuration (`.env`)
Only publishable credentials belong in the project root `.env`:
```env
# Public browser configuration ONLY
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_<your-public-key>

# Alternative legacy anon key (prefer publishable key above):
# VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
*Guards in [`src/lib/supabase.js`](src/lib/supabase.js:13) will reject any key with `role: "service_role"`, failing closed to prevent accidental secret leakage into client bundles.*

### 2. Backend Server Secrets (`supabase/functions/.env`)
Backend secrets must **NEVER** be committed to Git or referenced in frontend code:
```env
# SERVER-SIDE ONLY (Injected into hosted Supabase Edge Functions)
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-secret-key>
RAZORPAY_KEY_ID=<your-razorpay-key-id>
RAZORPAY_KEY_SECRET=<your-razorpay-key-secret>
RAZORPAY_WEBHOOK_SECRET=<your-razorpay-webhook-secret>
```

---

## 📋 Copy-Paste Setup Instructions

Follow these steps when provisioning a new Supabase project:

### Step 1: Execute Database Migrations
Open the **SQL Editor** in your Supabase project dashboard and run:

1. **Foundation Schema & RLS:**
   Execute [`supabase/migrations/202610100001_foundation.sql`](supabase/migrations/202610100001_foundation.sql)
   - Creates `products`, `profiles`, `admin_roles`, `addresses`, `orders`, `order_items`, `inventory_pairs`.
   - Enables Row Level Security on all 7 tables.
   - Revokes unauthorized write access from `public`, `anon`, and `authenticated`.
   - Adds check constraints for integer paise (`price_minor >= 0`), Indian 6-digit PIN codes (`^[0-9]{6}$`), and currency (`INR`).

2. **Sneaker Drops Catalog Seed:**
   Execute [`supabase/migrations/202610100002_catalog_seed.sql`](supabase/migrations/202610100002_catalog_seed.sql)
   - Inserts the 4 launch pairs:
     - ID 1: Nike SB Dunk Low Tokyo 2004 (`1900000` paise = ₹19,000.00)
     - ID 2: ASICS Gel-Kayano 14 Metallic Plum (`1850000` paise = ₹18,500.00)
     - ID 3: ASICS SCLAW Matte Obsidian US 10 (`1650000` paise = ₹16,500.00)
     - ID 4: ASICS SCLAW Matte Obsidian US 8 (`1650000` paise = ₹16,500.00)
   - Seeds inventory pairs with `unavailable` state pending physical sneaker authentication.

3. **Shop Categories (additive):**
   Execute `supabase/migrations/202610110001_shop_categories.sql` after both existing migrations. Do not replace or rerun the foundation on an existing database. See the Shop Categories contract below.

### Step 2: Configure Supabase Authentication
1. Navigate to **Authentication -> URL Configuration** in the Supabase Dashboard.
2. In **Site URL**, specify your application URL (e.g. `http://localhost:5173` or your production domain).
3. In **Redirect URLs**, add wildcard paths (e.g. `http://localhost:5173/**`, `https://*.trycloudflare.com/**`).

### Step 3: Provision an Administrator User
1. Register or sign in with your email in the application via `/account`.
2. Locate your user UUID in the `auth.users` table (or dashboard).
3. Run this query in the Supabase SQL Editor:
```sql
-- Replace 'YOUR-USER-UUID-HERE' with your actual auth user UUID
INSERT INTO public.admin_roles (user_id, role)
VALUES ('YOUR-USER-UUID-HERE', 'admin')
ON CONFLICT (user_id) DO NOTHING;
```
4. Verify the signed-in user's access through `public.is_shop_admin()` (no arguments). It returns only a boolean derived from the session identity. Never query `public.admin_roles` from a browser: that table remains private. UI integration is separate from this migration.

### Step 4: Deploy Server Edge Functions
To handle live order creation and Razorpay webhooks:

1. Install Supabase CLI and link your project:
```bash
supabase login
supabase link --project-ref <your-project-ref>
```

2. Set backend secrets in Supabase:
```bash
supabase secrets set RAZORPAY_KEY_ID="rzp_test_..."
supabase secrets set RAZORPAY_KEY_SECRET="..."
supabase secrets set RAZORPAY_WEBHOOK_SECRET="..."
```

3. Deploy Edge Functions:
```bash
supabase functions deploy create-order --no-verify-jwt
supabase functions deploy razorpay-webhook --no-verify-jwt
```

4. Configure Webhook in Razorpay Dashboard:
- Webhook URL: `https://<your-project-ref>.supabase.co/functions/v1/razorpay-webhook`
- Secret: `<your-razorpay-webhook-secret>`
- Active Events: `payment.captured`, `order.paid`, `payment.failed`

---

## 🛡️ Database Security & RLS Acceptance Matrix

| Actor / Operation | Target Table | Expected Result | Policy / Constraint |
|---|---|---|---|
| **Anonymous** | `products` | ✅ Read active drops only | `products_public_read` (`using (active)`) |
| **Anonymous** | `products` | ❌ Insert, update, delete denied | No grants |
| **Anonymous** | `inventory_pairs`, `admin_roles` | ❌ Denied | All access revoked |
| **Authenticated Customer A** | `profiles` | ✅ Read & update own profile | `profiles_self_read`, `profiles_self_update` |
| **Customer A** | `profiles` (Customer B) | ❌ Denied | RLS `id = auth.uid()` |
| **Customer A** | `addresses` | ✅ Manage own addresses | `addresses_self_*` (`user_id = auth.uid()`) |
| **Customer A** | `addresses` (Customer B) | ❌ Denied | Zero rows accessible |
| **Customer A** | `orders`, `order_items` | ✅ Read own historical orders | `orders_self_read`, `order_items_self_read` |
| **Customer A** | `orders` | ❌ Client insert or update denied | No browser insert/update grant |
| **Any Browser** | `admin_roles` | ❌ Denied | No browser grants |
| **Service Role** | All tables | ✅ Full access for Edge Functions | `grant all ... to service_role` |

---

## 🔬 Local Test Execution

To verify the local security and domain implementation before running migrations:
```bash
# Full test suite (36 tests)
npm test

# Linter (0 errors, 0 warnings)
npm run lint

# Production bundle check
npm run build
```

## Shop Categories: Schema and Client Contracts

### Setup and verification boundary

Apply `202610110001_shop_categories.sql` only after the foundation and catalog seed, through your normal migration process. This change is additive; existing migrations are preserved. It does not deploy anything, configure authentication, make inventory available, or implement checkout. No remote database or secrets were accessed during implementation, and no deployment has been verified. The SQL acceptance script is supplied but has not been executed against PostgreSQL in this environment (neither psql nor Supabase CLI was found on PATH).

The no-auth local demo is browser-only state, not a Supabase administrator session. A demo operator toggle cannot authorize these database operations. Live writes require a real Supabase Auth user and trusted operator provisioning in `public.admin_roles` using Step 3. Only an operator/service-side workflow may provision or revoke roles; never expose a service-role key in the browser. Removing the user's role row revokes the next request's admin access. JavaScript/UI wiring is a separate workstream.

### Tables and visibility

- `public.shop_categories`: generated UUID `id`; trimmed, nonempty, control-free `name` (1-120 characters); unique lowercase alphanumeric/hyphen `slug` (1-120 characters); nullable `image_url`; nonnegative integer `display_order` (default 0); boolean `is_visible` (default true); finite `created_at` and `updated_at` timestamps (default now). The UUID, slug and creation timestamp cannot be changed; updates advance the update timestamp. Browser writes cannot set timestamps or IDs.
- Images accept null, an HTTPS URL with a simple alphanumeric/dot/hyphen host and optional numeric port, or a site-relative path beginning with one slash followed by an alphanumeric, underscore or hyphen. Paths permit only ASCII letters, digits, underscore, dot, slash and hyphen. Maximum length is 2048. Empty strings, HTTP, protocol-relative URLs, credentials, backslashes, controls, all percent escapes, query strings and fragments are rejected deliberately. Use null to clear an image; signed/query-string URLs are not supported. This constraint applies to category images, not the preexisting product image fields.
- `public.shop_category_products`: only `category_id` UUID and `product_id` integer, with a composite primary key. Category deletion cascades to membership rows only. Product deletion is restricted while memberships exist; it never deletes a category. Removing membership never deletes a product or changes stock.
- Anonymous and ordinary authenticated users can read visible categories and only memberships whose category is visible AND product is active. Admins can read hidden categories, all memberships and inactive products. Category/membership CRUD is admin-only under both USING and WITH CHECK policies. Category creation accepts name, slug, image_url, display_order and is_visible; edits accept all except slug. Membership edits accept both key columns, subject to foreign keys and uniqueness.
- No direct product write grants or new inventory/order grants are added. Stock and orders remain server-managed. The new product RPC is the only added product-write entry point.
- Sort category reads by `display_order` then `slug` for deterministic ties. Do not hard-code generated category UUIDs; resolve seed slugs. Seeds use orders 1-9: Travis Scott (`travis-scott`), Low Dunks (`low-dunks`), Retro 4 (`retro-4`), Air Jordans (`air-jordans`), Leather Shoes (`leather-shoes`), Air Forces (`air-forces`), Adidas (`adidas`), New Balance (`new-balance`), Limited (`limited`). They start visible with null images. Seed slug conflicts are ignored, never overwritten. No memberships are seeded.

### RPC 1: admin capability

SQL signature: `public.is_shop_admin() returns boolean`.

```js
const { data, error } = await supabase.rpc('is_shop_admin')
```

No parameters and no role/user records in the result. Returns true only when `auth.uid()` matches a provisioned admin, otherwise false (including anonymous callers). SECURITY DEFINER uses an empty search_path and fully qualified application objects. PUBLIC execution is revoked; anon and authenticated receive explicit execution grants because public-read RLS evaluation also needs this helper. An unauthenticated SQL Editor session is not a browser identity and normally returns false.

### RPC 2: atomic product creation

SQL signature: `public.admin_create_shop_product(p_product jsonb) returns public.products`.

```js
const { data, error } = await supabase.rpc('admin_create_shop_product', {
  p_product: {
    id: 101,
    name: 'Example pair',
    brand: 'Nike',
    size: 'US 9',
    price_minor: 1900000,
    front_image: '/shoes/example-front.png',
    side_image: '/shoes/example-side.png',
    currency: 'INR',
    active: false
  }
}).single()
```

Required fields: explicit JSON integer `id` (1-2147483647), nonnegative JSON integer `price_minor` (0-2147483647), and nonempty JSON strings `name`, `brand`, `size`, `front_image`, `side_image`. Optional `currency` must be the string `INR` (default INR); optional `active` must be a JSON boolean (default false). Explicit nulls, numeric strings, fractional numeric inputs and unknown keys are rejected. No caller-supplied creation timestamp, inventory state or memberships are accepted. IDs are caller-managed: choose an unused positive integer, and handle collisions; do not assume max(id)+1 is concurrency-safe.

The returned SQL composite is one product row with `id`, `name`, `brand`, `size`, `price_minor`, `currency`, `front_image`, `side_image`, `active`, `created_at`. PostgREST exposes the composite as a row result; the example requests single-object representation. The function inserts the product and its `inventory_pairs` row with state `unavailable`, null order and null reservation in one transaction. Even active products remain unavailable for purchase until a separate trusted stock workflow changes inventory. No upsert: an existing ID raises SQLSTATE 23505 (normally HTTP 409), with no mutation. A failure on either insert rolls back both writes.

Only authenticated callers have EXECUTE, and the function checks the caller's admin status internally before processing input. Non-admin requests fail with 42501. Malformed field types/unknown keys fail with 22023; integer overflow uses 22003; foundation check constraints use 23514. Handle Supabase's `error.code`, not only HTTP status. SECURITY DEFINER has an empty search_path; it does not accept a caller-supplied identity or expose role rows.

### Executable local SQL acceptance tests

`supabase/tests/shop_categories.sql` is a plain SQL assertion script (not pgTAP). Run only as postgres against a disposable local Supabase database with all three migrations applied. It creates temporary fixtures, assumes its high product IDs/test UUIDs are unused, switches between anon/customer/admin roles with local JWT claims, and rolls everything back. Do not run against production.

```sh
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/tests/shop_categories.sql
```

Use your local database's actual port and password prompt; do not embed remote credentials. Tests cover public visibility, inactive admin reads, forbidden customer writes, admin CRUD, private roles/inventory, restricted order writes, immutable slugs, image rejection, product FK restriction, category membership cascade, duplicate product conflicts, and forced second-write failure proving atomic rollback. Any unexpected result raises an exception; ON_ERROR_STOP makes the command fail. JavaScript tests/build alone cannot verify PostgreSQL grants or RLS. SQL execution and hosted deployment remain unverified until an operator runs the migration and these checks locally.

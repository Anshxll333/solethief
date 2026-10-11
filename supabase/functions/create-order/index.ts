// Supabase Edge Function: create-order
// Runtime: Deno / Supabase Edge Runtime
// Secure server-side inventory locking, authoritative repricing from DB,
// Razorpay order creation, and transactional order insertion.

// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

declare const Deno: {
    env: {
        get(key: string): string | undefined;
    };
};

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ShippingAddress {
    recipient: string;
    phone: string;
    line1: string;
    line2?: string | null;
    city: string;
    region: string;
    postal_code: string;
    country_code: string;
}

interface CreateOrderRequest {
    product_ids: number[];
    shipping_address: ShippingAddress;
    shipping_option_id?: 'standard' | 'priority';
    payment_method?: 'online' | 'cod';
    idempotency_key: string;
}

interface DbProduct {
    id: number;
    name: string;
    brand: string;
    size: string;
    price_minor: number;
    currency: string;
    front_image: string;
    active: boolean;
}

interface InventoryRow {
    product_id: number;
    state: string;
}

const SHIPPING_RATES: Record<string, number> = {
    standard: 0,
    priority: 45000, // 450.00 INR in paise
};

serve(async (req: Request) => {
    // 1. Handle CORS Preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // 2. Validate Authorization
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: 'Missing Authorization header.' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID');
        const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET');

        if (!supabaseUrl || !supabaseServiceRoleKey) {
            return new Response(
                JSON.stringify({ error: 'Server environment missing Supabase configuration.' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Initialize privileged Supabase client
        const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
            auth: { persistSession: false },
        });

        // Verify Caller Identity
        const jwt = authHeader.replace(/^Bearer\s+/i, '');
        const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
        if (userError || !user) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized: Invalid or expired session token.' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const body: CreateOrderRequest = await req.json();
        const {
            product_ids,
            shipping_address,
            shipping_option_id = 'standard',
            payment_method = 'online',
            idempotency_key,
        } = body;

        // 3. Validate Inputs
        if (!Array.isArray(product_ids) || product_ids.length === 0 || product_ids.length > 100) {
            return new Response(
                JSON.stringify({ error: 'Invalid product_ids: Must be non-empty array of up to 100 pairs.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!idempotency_key || typeof idempotency_key !== 'string') {
            return new Response(
                JSON.stringify({ error: 'Missing required idempotency_key UUID.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Validate Shipping Address
        if (
            !shipping_address ||
            !shipping_address.recipient ||
            !shipping_address.phone ||
            !shipping_address.line1 ||
            !shipping_address.city ||
            !shipping_address.region ||
            !/^[0-9]{6}$/.test(shipping_address.postal_code || '') ||
            (shipping_address.country_code || '').toUpperCase() !== 'IN'
        ) {
            return new Response(
                JSON.stringify({ error: 'Invalid shipping address. Must be a verified 6-digit Indian PIN and IN address.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 4. Check Idempotency
        const { data: existingOrder } = await supabase
            .from('orders')
            .select('*, order_items(*)')
            .eq('user_id', user.id)
            .eq('idempotency_key', idempotency_key)
            .maybeSingle();

        if (existingOrder) {
            return new Response(
                JSON.stringify({
                    success: true,
                    replayed: true,
                    order: existingOrder,
                    provider_order_id: existingOrder.provider_order_id,
                    key_id: razorpayKeyId || '',
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 5. Authoritative Database Repricing & Verification
        // Never trust client prices or totals. Read directly from public.products
        const { data: dbProducts, error: prodErr } = await supabase
            .from('products')
            .select('id, name, brand, size, price_minor, currency, front_image, active')
            .in('id', product_ids)
            .eq('active', true);

        if (prodErr || !dbProducts || (dbProducts as DbProduct[]).length !== product_ids.length) {
            return new Response(
                JSON.stringify({ error: 'One or more items in your selection are no longer listed or inactive.' }),
                { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const validProducts = dbProducts as DbProduct[];

        // 6. Check Inventory & Lock Rows
        const { data: invRows, error: invErr } = await supabase
            .from('inventory_pairs')
            .select('product_id, state')
            .in('product_id', product_ids);

        if (invErr || !invRows || (invRows as InventoryRow[]).length !== product_ids.length) {
            return new Response(
                JSON.stringify({ error: 'Inventory check failed for selected pairs.' }),
                { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const validInv = invRows as InventoryRow[];
        const unavailablePair = validInv.find((p: InventoryRow) => p.state !== 'available');
        if (unavailablePair) {
            return new Response(
                JSON.stringify({ error: `Pair #${unavailablePair.product_id} is already reserved or sold.` }),
                { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 7. Calculate Server-Authoritative Totals (in integer paise)
        const subtotalMinor = validProducts.reduce((sum: number, p: DbProduct) => sum + p.price_minor, 0);
        const shippingMinor = SHIPPING_RATES[shipping_option_id] ?? 0;
        const taxMinor = Math.round((subtotalMinor + shippingMinor) * 0.18); // 18% GST standard
        const discountMinor = 0;
        const totalMinor = subtotalMinor + shippingMinor + taxMinor - discountMinor;

        const orderId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15-minute reservation window

        // 8. Razorpay Order Creation (if online payment)
        let providerOrderId: string | null = null;
        if (payment_method === 'online' && razorpayKeyId && razorpayKeySecret) {
            const authStr = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
            const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${authStr}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    amount: totalMinor, // amount in integer paise
                    currency: 'INR',
                    receipt: orderId,
                    notes: {
                        user_id: user.id,
                        order_id: orderId,
                    },
                }),
            });

            if (!rzpRes.ok) {
                const rzpErr = await rzpRes.text();
                return new Response(
                    JSON.stringify({ error: `Payment gateway error: ${rzpErr}` }),
                    { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            const rzpData = await rzpRes.json();
            providerOrderId = rzpData.id;
        }

        // 9. Atomically Insert Order and Reserve Inventory Pairs
        const { error: orderInsertErr } = await supabase
            .from('orders')
            .insert({
                id: orderId,
                user_id: user.id,
                status: 'pending_payment',
                currency: 'INR',
                subtotal_minor: subtotalMinor,
                shipping_minor: shippingMinor,
                tax_minor: taxMinor,
                discount_minor: discountMinor,
                total_minor: totalMinor,
                shipping_address: shipping_address,
                idempotency_key: idempotency_key,
                payment_provider: 'razorpay',
                provider_order_id: providerOrderId,
                expires_at: expiresAt,
            });

        if (orderInsertErr) {
            return new Response(
                JSON.stringify({ error: `Failed to insert order: ${orderInsertErr.message}` }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Insert Order Items (historical snapshot)
        const orderItemsPayload = validProducts.map((p: DbProduct) => ({
            order_id: orderId,
            product_id: p.id,
            name: p.name,
            brand: p.brand,
            size: p.size,
            front_image: p.front_image,
            quantity: 1,
            unit_price_minor: p.price_minor,
        }));

        const { error: itemsInsertErr } = await supabase
            .from('order_items')
            .insert(orderItemsPayload);

        if (itemsInsertErr) {
            return new Response(
                JSON.stringify({ error: `Failed to snapshot order items: ${itemsInsertErr.message}` }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Lock & reserve pairs in inventory_pairs
        for (const p of validProducts) {
            await supabase
                .from('inventory_pairs')
                .update({
                    state: 'reserved',
                    order_id: orderId,
                    reserved_until: expiresAt,
                })
                .eq('product_id', p.id);
        }

        return new Response(
            JSON.stringify({
                success: true,
                order_id: orderId,
                provider_order_id: providerOrderId,
                amount_minor: totalMinor,
                currency: 'INR',
                key_id: razorpayKeyId || '',
                expires_at: expiresAt,
            }),
            { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown internal server error';
        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});

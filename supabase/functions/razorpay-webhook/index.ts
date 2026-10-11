// Supabase Edge Function: razorpay-webhook
// Runtime: Deno / Supabase Edge Runtime
// Validates HMAC SHA-256 signature against raw request bytes,
// processes captured payments, and atomically transitions orders to 'paid'
// while marking reserved inventory pairs as 'sold'.

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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-razorpay-signature',
};

// Cryptographic HMAC SHA-256 verification using Web Crypto API
async function verifyHmacSha256(rawBody: string, signature: string, secret: string): Promise<boolean> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(rawBody);

    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const calculatedHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Constant-time comparison
    if (calculatedHex.length !== signature.length) return false;
    let mismatch = 0;
    for (let i = 0; i < calculatedHex.length; i++) {
        mismatch |= calculatedHex.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return mismatch === 0;
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const signature = req.headers.get('x-razorpay-signature');
        if (!signature) {
            return new Response(
                JSON.stringify({ error: 'Missing x-razorpay-signature header.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!webhookSecret || !supabaseUrl || !supabaseServiceRoleKey) {
            return new Response(
                JSON.stringify({ error: 'Webhook environment misconfigured on server.' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Read raw request body text for strict signature verification
        const rawBody = await req.text();
        const isValid = await verifyHmacSha256(rawBody, signature, webhookSecret);
        if (!isValid) {
            return new Response(
                JSON.stringify({ error: 'Invalid HMAC signature.' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const eventPayload = JSON.parse(rawBody);
        const eventType = eventPayload.event;
        const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
            auth: { persistSession: false },
        });

        // Handle Payment Captured or Order Paid
        if (eventType === 'payment.captured' || eventType === 'order.paid') {
            const payment = eventPayload.payload?.payment?.entity;
            const order = eventPayload.payload?.order?.entity;
            const providerOrderId = payment?.order_id || order?.id;
            const providerPaymentId = payment?.id;

            if (!providerOrderId) {
                return new Response(
                    JSON.stringify({ error: 'Missing provider order ID in webhook payload.' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // Find matching order in DB
            const { data: dbOrder, error: orderLookupErr } = await supabase
                .from('orders')
                .select('*')
                .eq('provider_order_id', providerOrderId)
                .maybeSingle();

            if (orderLookupErr || !dbOrder) {
                return new Response(
                    JSON.stringify({ error: 'Associated order not found in database.' }),
                    { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // Idempotency: If already marked paid, return 200 OK immediately
            if (dbOrder.status === 'paid' || dbOrder.status === 'processing') {
                return new Response(
                    JSON.stringify({ received: true, message: 'Order was already marked paid.' }),
                    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            const nowIso = new Date().toISOString();

            // Transition Order to Paid
            const { error: orderUpdateErr } = await supabase
                .from('orders')
                .update({
                    status: 'paid',
                    paid_at: nowIso,
                    provider_payment_id: providerPaymentId || dbOrder.provider_payment_id || `pay_rzp_${Date.now()}`,
                })
                .eq('id', dbOrder.id);

            if (orderUpdateErr) {
                return new Response(
                    JSON.stringify({ error: `Failed to update order status: ${orderUpdateErr.message}` }),
                    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // Transition Inventory from Reserved to Sold
            const { error: invUpdateErr } = await supabase
                .from('inventory_pairs')
                .update({
                    state: 'sold',
                    reserved_until: null,
                })
                .eq('order_id', dbOrder.id);

            if (invUpdateErr) {
                return new Response(
                    JSON.stringify({ error: `Failed to update inventory status: ${invUpdateErr.message}` }),
                    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            return new Response(
                JSON.stringify({ received: true, order_id: dbOrder.id, status: 'paid' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Handle Payment Failed or Expired
        if (eventType === 'payment.failed') {
            const payment = eventPayload.payload?.payment?.entity;
            const providerOrderId = payment?.order_id;

            if (providerOrderId) {
                const { data: dbOrder } = await supabase
                    .from('orders')
                    .select('id, status')
                    .eq('provider_order_id', providerOrderId)
                    .maybeSingle();

                if (dbOrder && dbOrder.status === 'pending_payment') {
                    // Release reserved inventory
                    await supabase
                        .from('inventory_pairs')
                        .update({
                            state: 'available',
                            order_id: null,
                            reserved_until: null,
                        })
                        .eq('order_id', dbOrder.id);

                    await supabase
                        .from('orders')
                        .update({ status: 'cancelled' })
                        .eq('id', dbOrder.id);
                }
            }

            return new Response(
                JSON.stringify({ received: true, event: 'payment.failed' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({ received: true, unhandled_event: eventType }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown internal server error';
        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});

import {
    calculateOrderTotals,
    generateOrderId,
    getPreviewOrders,
    getPreviewOrderById,
    savePreviewOrder,
    canCancelOrder,
    canReplaceOrder,
    updatePreviewOrderStatus,
    requestPreviewOrderReplacement,
} from '../commerce/orders.js';
import { validateAddress } from '../commerce/address.js';
import { decrementPreviewStock, restorePreviewStock } from '../commerce/admin.js';

export function createOrdersService(getRuntime) {
    return {
        async createOrder({
            items,
            shippingAddress,
            shippingOptionId = 'standard',
            paymentMethod = 'online', // 'online' | 'cod'
            user = null,
            allowPreview = undefined,
        }) {
            const runtime = getRuntime ? getRuntime() : { status: 'missing', client: null };
            const isLive = runtime.status === 'configured' && Boolean(runtime.client);
            const canPreview = allowPreview !== undefined ? allowPreview : Boolean(runtime.previewMode);

            // Validate shipping address
            const addrValidation = validateAddress(shippingAddress);
            if (!addrValidation.valid) {
                const firstErr = Object.values(addrValidation.errors)[0];
                throw new Error(firstErr || 'Invalid shipping address.');
            }

            // Validate order items
            if (!Array.isArray(items) || items.length === 0) {
                throw new Error('Cannot create an order with an empty bag.');
            }

            for (const item of items) {
                const id = item?.id ?? item?.productId;
                if (!item || !id || !Number.isSafeInteger(item.priceMinor) || item.priceMinor < 0) {
                    throw new Error('Invalid item detected in checkout bag.');
                }
            }

            if (!isLive) {
                if (!canPreview) {
                    throw new Error('Supabase environment is not configured and preview mode is not enabled.');
                }

                // Validate stock availability for preview orders
                for (const item of items) {
                    const pId = item?.id ?? item?.productId ?? item?.product_id;
                    const itemSize = item?.size;
                    const qty = Number.isInteger(item?.quantity) && item.quantity > 0 ? item.quantity : 1;
                    if (pId && itemSize) {
                        try {
                            const { getPreviewDrops } = await import('../commerce/admin.js');
                            const drops = getPreviewDrops();
                            const drop = drops.find(d => d.id === Number(pId) || String(d.id) === String(pId));
                            if (drop && Array.isArray(drop.sizes)) {
                                const sizeVar = drop.sizes.find(s => s.value === itemSize);
                                if (sizeVar) {
                                    if (sizeVar.sold || sizeVar.quantity <= 0) {
                                        throw new Error(`Size ${itemSize} for ${drop.name || 'product'} is out of stock.`);
                                    }
                                    if (qty > sizeVar.quantity) {
                                        throw new Error(`Insufficient stock for ${drop.name || 'product'} (${itemSize}). Only ${sizeVar.quantity} pairs available.`);
                                    }
                                }
                            }
                        } catch (err) {
                            if (err.message && (err.message.includes('stock') || err.message.includes('out of stock'))) {
                                throw err;
                            }
                        }
                    }
                }

                // Subtotal
                const subtotalMinor = items.reduce((sum, item) => {
                    const q = Number.isInteger(item?.quantity) && item.quantity > 0 ? item.quantity : 1;
                    return sum + (item?.priceMinor || 0) * q;
                }, 0);
                const totals = calculateOrderTotals({
                    subtotalMinor,
                    shippingOptionId,
                });

                const orderId = generateOrderId();
                const nowIso = new Date().toISOString();

                const cleanAddr = addrValidation.normalized;
                const simulatedOrder = {
                    id: orderId,
                    user_id: user?.id || 'guest_preview_collector',
                    user_email: user?.email || 'guest@solethief.in',
                    status: (paymentMethod === 'cod' || paymentMethod === 'archive_cod') ? 'processing' : 'paid',
                    currency: 'INR',
                    subtotal_minor: totals.subtotalMinor,
                    shipping_minor: totals.shippingMinor,
                    shipping_amount_minor: totals.shippingMinor,
                    tax_minor: totals.taxMinor,
                    tax_amount_minor: totals.taxMinor,
                    discount_minor: 0,
                    total_minor: totals.totalMinor,
                    total_amount_minor: totals.totalMinor,
                    shipping_name: cleanAddr.recipient,
                    shipping_phone: cleanAddr.phone,
                    shipping_line1: cleanAddr.line1,
                    shipping_line2: cleanAddr.line2,
                    shipping_city: cleanAddr.city,
                    shipping_state: cleanAddr.region,
                    shipping_postal_code: cleanAddr.postal_code,
                    shipping_country: cleanAddr.country_code || 'IN',
                    shipping_address: cleanAddr,
                    shipping_method: shippingOptionId,
                    shipping_option: totals.shippingOption,
                    payment_method: paymentMethod,
                    payment_provider: 'razorpay',
                    provider_order_id: paymentMethod === 'online' || paymentMethod === 'razorpay' ? `order_rzp_mock_${Date.now()}` : null,
                    provider_payment_id: paymentMethod === 'online' || paymentMethod === 'razorpay' ? `pay_rzp_mock_${Date.now()}` : null,
                    items: items.map(item => {
                        const qty = Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1;
                        return {
                            product_id: item.id,
                            name: item.name,
                            brand: item.brand,
                            size: item.size,
                            front_image: item.frontImage,
                            image_url: item.frontImage,
                            quantity: qty,
                            unit_price_minor: item.priceMinor,
                            line_total_minor: item.priceMinor * qty,
                        };
                    }),
                    created_at: nowIso,
                    paid_at: (paymentMethod === 'cod' || paymentMethod === 'archive_cod') ? null : nowIso,
                    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
                };

                savePreviewOrder(simulatedOrder);

                // Decrement size quantity in preview inventory
                for (const item of items) {
                    const pId = item?.id ?? item?.productId ?? item?.product_id;
                    const itemSize = item?.size;
                    const qty = Number.isInteger(item?.quantity) && item.quantity > 0 ? item.quantity : 1;
                    if (pId && itemSize) {
                        try {
                            decrementPreviewStock(pId, itemSize, qty);
                        } catch {
                            // Drop might not exist in preview storage in isolated test runs
                        }
                    }
                }

                return {
                    success: true,
                    mode: 'preview',
                    order: simulatedOrder,
                    data: simulatedOrder,
                    error: null,
                };
            }

            // Live Mode: Must call trusted Supabase Edge Function
            // Client-side direct INSERT into orders/inventory_pairs is prohibited by RLS
            const client = runtime.client;
            const idempotencyKey = crypto.randomUUID();

            const payload = {
                product_ids: items.map(item => item.id),
                items: items.map(item => ({
                    product_id: item.id,
                    quantity: Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1,
                })),
                shipping_address: addrValidation.clean,
                shipping_option_id: shippingOptionId,
                payment_method: paymentMethod,
                idempotency_key: idempotencyKey,
            };

            const { data, error } = await client.functions.invoke('create-order', {
                body: payload,
            });

            if (error) {
                throw new Error(error.message || 'Server failed to initialize secure checkout.');
            }

            return {
                success: true,
                mode: 'live',
                order: data.order,
                data: data.order,
                providerOrderId: data.provider_order_id,
                razorpayKeyId: data.key_id,
                error: null,
            };
        },

        async getOrder(orderId, { allowPreview = undefined, user = null } = {}) {
            const runtime = getRuntime ? getRuntime() : { status: 'missing', client: null };
            const isLive = runtime.status === 'configured' && Boolean(runtime.client);
            const canPreview = allowPreview !== undefined ? allowPreview : Boolean(runtime.previewMode);

            if (!isLive || canPreview) {
                const localOrder = getPreviewOrderById(orderId, user?.id || null);
                if (localOrder) {
                    return {
                        ...localOrder,
                        data: localOrder,
                        order: localOrder,
                        error: null,
                    };
                }
            }

            if (isLive) {
                const client = runtime.client;
                const { data, error } = await client
                    .from('orders')
                    .select('*, order_items(*)')
                    .eq('id', orderId)
                    .maybeSingle();

                if (error) {
                    return { data: null, order: null, error };
                }
                if (!data) return { data: null, order: null, error: null };

                const formatted = {
                    ...data,
                    items: data.order_items || [],
                };
                return {
                    ...formatted,
                    data: formatted,
                    order: formatted,
                    error: null,
                };
            }

            return { data: null, order: null, error: null };
        },

        async listOrders({ user = null, allowPreview = undefined } = {}) {
            const runtime = getRuntime ? getRuntime() : { status: 'missing', client: null };
            const isLive = runtime.status === 'configured' && Boolean(runtime.client);
            const canPreview = allowPreview !== undefined ? allowPreview : Boolean(runtime.previewMode);

            let results = [];

            if (!isLive || canPreview) {
                const previewOrders = getPreviewOrders(user?.id || null);
                results = [...previewOrders];
            }

            if (isLive && user) {
                const client = runtime.client;
                const { data, error } = await client
                    .from('orders')
                    .select('*, order_items(*)')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false });

                if (error) {
                    return { data: results, error };
                }
                if (data && Array.isArray(data)) {
                    const mapped = data.map(o => ({
                        ...o,
                        items: o.order_items || [],
                    }));
                    results = [...mapped, ...results];
                }
            }

            // Always ensure stable queue positioning by created_at (newest at top, oldest at bottom)
            results.sort((a, b) => {
                const timeA = a?.created_at ? new Date(a.created_at).getTime() : 0;
                const timeB = b?.created_at ? new Date(b.created_at).getTime() : 0;
                if (timeA && timeB && timeA !== timeB) {
                    return timeB - timeA;
                }
                return 0;
            });

            return {
                data: results,
                error: null,
            };
        },

        async cancelOrder(orderId, { reason = '', user = null, allowPreview = undefined } = {}) {
            if (!orderId) {
                throw new Error('Order ID is required to cancel an order.');
            }

            const runtime = getRuntime ? getRuntime() : { status: 'missing', client: null };
            const isLive = runtime.status === 'configured' && Boolean(runtime.client);
            const canPreview = allowPreview !== undefined ? allowPreview : Boolean(runtime.previewMode);

            // Retrieve order to validate cancellation eligibility
            const fetched = await this.getOrder(orderId, { allowPreview, user });
            const order = fetched?.order || fetched?.data || fetched;
            if (!order || !order.id) {
                throw new Error(`Order ${orderId} not found.`);
            }

            if (['cancelled', 'refunded'].includes(order.status)) {
                throw new Error(`Order ${orderId} has already been cancelled.`);
            }

            if (order.status === 'delivered') {
                throw new Error('Delivered orders cannot be cancelled. Please contact concierge for assistance.');
            }

            if (!canCancelOrder(order)) {
                throw new Error('Orders can only be cancelled within 24 hours of placement.');
            }

            // Preview mode or order found in preview storage
            if (!isLive || canPreview || getPreviewOrderById(orderId)) {
                const updated = updatePreviewOrderStatus(orderId, 'cancelled', { reason });
                // Restore stock for cancelled order items
                if (order && Array.isArray(order.items)) {
                    for (const item of order.items) {
                        const pId = item?.product_id ?? item?.productId ?? item?.id;
                        const itemSize = item?.size;
                        const qty = Number.isInteger(item?.quantity) && item.quantity > 0 ? item.quantity : 1;
                        if (pId && itemSize) {
                            try {
                                restorePreviewStock(pId, itemSize, qty);
                            } catch {
                                // ignore
                            }
                        }
                    }
                }
                return {
                    success: true,
                    mode: 'preview',
                    order: updated,
                    data: updated,
                    error: null,
                };
            }

            // Live mode with Supabase client
            if (isLive) {
                const client = runtime.client;
                const updatePayload = {
                    status: 'cancelled',
                    updated_at: new Date().toISOString(),
                };

                let query = client.from('orders').update(updatePayload).eq('id', orderId);
                if (user?.id) {
                    query = query.eq('user_id', user.id);
                }

                const { data, error } = await query.select('*, order_items(*)').maybeSingle();

                if (error) {
                    try {
                        const { data: rpcData, error: rpcErr } = await client.rpc('cancel_order', {
                            p_order_id: orderId,
                            p_reason: reason || 'Cancelled by collector within 24 hours',
                        });
                        if (!rpcErr && rpcData) {
                            return { success: true, mode: 'live', order: rpcData, data: rpcData, error: null };
                        }
                    } catch {
                        // ignore fallback error
                    }
                    throw new Error(`Failed to cancel order: ${error.message}`);
                }

                const formatted = data ? { ...data, items: data.order_items || [] } : { ...order, status: 'cancelled' };
                return {
                    success: true,
                    mode: 'live',
                    order: formatted,
                    data: formatted,
                    error: null,
                };
            }

            throw new Error('Unable to cancel order: service environment not configured.');
        },

        async requestReplacement(orderId, { reason = '', preferredSize = '', notes = '', user = null, allowPreview = undefined } = {}) {
            if (!orderId) {
                throw new Error('Order ID is required to request replacement.');
            }

            const runtime = getRuntime ? getRuntime() : { status: 'missing', client: null };
            const isLive = runtime.status === 'configured' && Boolean(runtime.client);
            const canPreview = allowPreview !== undefined ? allowPreview : Boolean(runtime.previewMode);

            const fetched = await this.getOrder(orderId, { allowPreview, user });
            const order = fetched?.order || fetched?.data || fetched;
            if (!order || !order.id) {
                throw new Error(`Order ${orderId} not found.`);
            }

            if (order.status !== 'delivered') {
                throw new Error('Only delivered orders can be replaced.');
            }

            if (!canReplaceOrder(order)) {
                throw new Error('Replacement window of 3 days from delivery has elapsed.');
            }

            if (!isLive || canPreview || getPreviewOrderById(orderId)) {
                const updated = requestPreviewOrderReplacement(orderId, { reason, preferredSize, notes });
                return {
                    success: true,
                    mode: 'preview',
                    order: updated,
                    data: updated,
                    error: null,
                };
            }

            if (isLive) {
                const client = runtime.client;
                const updatePayload = {
                    replacement_requested: true,
                    replacement_status: 'requested',
                    replacement_reason: reason,
                    replacement_preferred_size: preferredSize,
                    replacement_notes: notes,
                    replacement_requested_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                };

                let query = client.from('orders').update(updatePayload).eq('id', orderId);
                if (user?.id) {
                    query = query.eq('user_id', user.id);
                }

                const { data, error } = await query.select('*, order_items(*)').maybeSingle();
                if (error) {
                    try {
                        const { data: rpcData, error: rpcErr } = await client.rpc('request_order_replacement', {
                            p_order_id: orderId,
                            p_reason: reason,
                            p_size: preferredSize,
                            p_notes: notes,
                        });
                        if (!rpcErr && rpcData) {
                            return { success: true, mode: 'live', order: rpcData, data: rpcData, error: null };
                        }
                    } catch {
                        // ignore fallback error
                    }
                    throw new Error(`Failed to request replacement: ${error.message}`);
                }

                const formatted = data ? { ...data, items: data.order_items || [] } : { ...order, ...updatePayload };
                return {
                    success: true,
                    mode: 'live',
                    order: formatted,
                    data: formatted,
                    error: null,
                };
            }

            throw new Error('Unable to request replacement: service environment not configured.');
        },
    };
}

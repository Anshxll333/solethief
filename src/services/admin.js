import { getSupabaseRuntime } from '../lib/supabase.js';
import {
    getPreviewDrops,
    savePreviewDrops,
    getPreviewInventory,
    savePreviewInventory,
    getOperatorSession,
    setOperatorSession,
    validateDropInput,
    validateInventoryPairState,
    isValidAdminStatusTransition,
    calculateOperationalMetrics,
} from '../commerce/admin.js';
import {
    getPreviewOrders,
    savePreviewOrder,
} from '../commerce/orders.js';

export function getSampleSeedOrders() {
    return [
        {
            id: 'ST-2026-SHIB',
            user_id: 'usr_preview_arjun_01',
            user_email: 'collector@solethief.in',
            status: 'authenticating',
            currency: 'INR',
            subtotal_minor: 1900000,
            shipping_minor: 0,
            tax_minor: 342000,
            discount_minor: 0,
            total_minor: 2242000,
            total_amount_minor: 2242000,
            shipping_name: 'Arjun Rao',
            shipping_phone: '+91 98200 12345',
            shipping_line1: 'Flat 402, Sea View Apartments',
            shipping_line2: 'Carter Road, Bandra West',
            shipping_city: 'Mumbai',
            shipping_state: 'Maharashtra',
            shipping_postal_code: '400050',
            shipping_country: 'IN',
            shipping_address: {
                recipient: 'Arjun Rao',
                phone: '+91 98200 12345',
                line1: 'Flat 402, Sea View Apartments',
                line2: 'Carter Road, Bandra West',
                city: 'Mumbai',
                region: 'Maharashtra',
                postal_code: '400050',
                country_code: 'IN',
            },
            payment_method: 'online',
            payment_provider: 'razorpay',
            provider_order_id: 'order_rzp_shib_101',
            provider_payment_id: 'pay_rzp_shib_101',
            items: [
                {
                    product_id: 1,
                    name: 'MEXICO 66 FIRE',
                    brand: 'SOLETHIEF TIGER',
                    size: 'US 9',
                    front_image: '/shoes/transparent/shoe-1-front.png',
                    image_url: '/shoes/transparent/shoe-1-front.png',
                    quantity: 1,
                    unit_price_minor: 1900000,
                    line_total_minor: 1900000,
                },
            ],
            created_at: '2026-10-10T14:20:00Z',
            paid_at: '2026-10-10T14:22:00Z',
            fulfillment_notes: 'Physical authentication verified at Shibuya depot. Awaiting Tokyo dispatch.',
        },
        {
            id: 'ST-2026-VAPR',
            user_id: 'usr_preview_priya_02',
            user_email: 'priya@solethief.in',
            status: 'confirmed',
            currency: 'INR',
            subtotal_minor: 1850000,
            shipping_minor: 45000,
            tax_minor: 333000,
            discount_minor: 0,
            total_minor: 2228000,
            total_amount_minor: 2228000,
            shipping_name: 'Priya Sharma',
            shipping_phone: '+91 98450 67890',
            shipping_line1: '12, Indiranagar 100 Feet Road',
            shipping_line2: 'Near HAL 2nd Stage',
            shipping_city: 'Bengaluru',
            shipping_state: 'Karnataka',
            shipping_postal_code: '560038',
            shipping_country: 'IN',
            shipping_address: {
                recipient: 'Priya Sharma',
                phone: '+91 98450 67890',
                line1: '12, Indiranagar 100 Feet Road',
                line2: 'Near HAL 2nd Stage',
                city: 'Bengaluru',
                region: 'Karnataka',
                postal_code: '560038',
                country_code: 'IN',
            },
            payment_method: 'online',
            payment_provider: 'razorpay',
            provider_order_id: 'order_rzp_vapr_102',
            provider_payment_id: 'pay_rzp_vapr_102',
            items: [
                {
                    product_id: 2,
                    name: 'TRASPIK',
                    brand: 'SOLETHIEF VAPOR',
                    size: 'US 9',
                    front_image: '/shoes/transparent/shoe-2-front.png',
                    image_url: '/shoes/transparent/shoe-2-front.png',
                    quantity: 1,
                    unit_price_minor: 1850000,
                    line_total_minor: 1850000,
                },
            ],
            created_at: '2026-10-10T15:10:00Z',
            paid_at: '2026-10-10T15:12:00Z',
            fulfillment_notes: 'Order confirmed by buyer. Preparing authentication tag.',
        },
    ];
}

export function createAdminService(getRuntime = getSupabaseRuntime) {
    function readRuntime() {
        const runtime = getRuntime();
        if (runtime?.status === 'missing' && !runtime.client) return runtime;
        if (runtime?.status !== 'configured' || !runtime.client) {
            throw new Error(runtime?.message || 'Admin configuration is invalid.');
        }
        return runtime;
    }

    function requirePreview() {
        if (readRuntime().status !== 'missing') {
            throw new Error('Operator sessions are only available in local demo mode.');
        }
    }

    return {
        async checkAdminAccess({ user = null } = {}) {
            const runtime = readRuntime();
            const isLive = runtime.status === 'configured' && Boolean(runtime.client);

            if (isLive) {
                if (!user || !user.id) {
                    return {
                        isAdmin: false,
                        mode: 'live',
                        role: null,
                        error: 'Authentication required. No user session active.',
                    };
                }

                let data;
                try {
                    const response = await runtime.client.rpc('is_shop_admin');
                    if (response.error) throw response.error;
                    data = response.data;
                } catch (error) {
                    return {
                        isAdmin: false,
                        mode: 'live',
                        role: null,
                        error: error?.message || 'Database error validating admin privileges.',
                    };
                }

                if (data === true) {
                    return {
                        isAdmin: true,
                        mode: 'live',
                        role: 'admin',
                        error: null,
                    };
                }

                return {
                    isAdmin: false,
                    mode: 'live',
                    role: null,
                    error: 'Access restricted: User is not granted admin permissions.',
                };
            }

            // Preview Mode: Operator test credentials toggle
            const opSession = getOperatorSession();
            return {
                isAdmin: Boolean(opSession?.isOperator),
                mode: 'preview',
                role: opSession?.isOperator ? (opSession?.role || 'admin') : null,
                operatorId: opSession?.operatorId || 'op_shibuya_preview_01',
                error: opSession?.isOperator ? null : 'Access restricted: Preview operator toggle is off.',
            };
        },

        getOperatorSession() {
            requirePreview();
            return getOperatorSession();
        },

        setOperatorSession(session) {
            requirePreview();
            return setOperatorSession(session);
        },

        async getOperationalMetrics() {
            readRuntime();
            const drops = await this.listDrops();
            const inventory = await this.listInventory();
            const orders = await this.listOrders();

            return calculateOperationalMetrics({ drops, inventory, orders });
        },

        async listDrops() {
            const runtime = readRuntime();
            const isLive = runtime.status === 'configured' && Boolean(runtime.client);

            if (isLive) {
                const client = runtime.client;
                const { data, error } = await client
                    .from('products')
                    .select('*')
                    .order('id', { ascending: true });

                if (error) {
                    throw new Error(`Failed to list live drops: ${error.message}`);
                }

                return (data || []).map((row) => ({
                    id: row.id,
                    name: row.name,
                    brand: row.brand,
                    size: row.size,
                    priceMinor: row.price_minor,
                    currency: row.currency || 'INR',
                    frontImage: row.front_image,
                    sideImage: row.side_image,
                    active: row.active,
                    dropBatch: `SHIBUYA-0${row.id}`,
                    releaseDate: row.created_at ? row.created_at.slice(0, 10) : '2026-10-10',
                }));
            }

            return getPreviewDrops();
        },

        async createDrop(dropPayload) {
            const runtime = readRuntime();
            const validation = validateDropInput(dropPayload, false);
            if (!validation.valid) {
                const firstMsg = Object.values(validation.errors)[0];
                throw new Error(firstMsg || 'Invalid drop payload.');
            }

            const cleanDrop = validation.normalized;
            const isLive = runtime.status === 'configured' && Boolean(runtime.client);

            if (isLive) {
                const client = runtime.client;
                const { data, error } = await client.rpc('admin_create_shop_product', {
                    p_product: {
                        id: cleanDrop.id,
                        name: cleanDrop.name,
                        brand: cleanDrop.brand,
                        size: cleanDrop.size,
                        price_minor: cleanDrop.priceMinor,
                        currency: 'INR',
                        front_image: cleanDrop.frontImage,
                        side_image: cleanDrop.sideImage,
                        active: cleanDrop.active,
                    },
                });

                if (error) {
                    throw new Error(`Failed to create drop: ${error.message}`, { cause: error });
                }

                return data;
            }

            const current = getPreviewDrops();
            if (current.some((d) => d.id === cleanDrop.id)) {
                throw new Error(`Drop with ID ${cleanDrop.id} already exists.`);
            }

            const updatedDrops = [...current, cleanDrop].sort((a, b) => a.id - b.id);
            savePreviewDrops(updatedDrops);

            // Initialize inventory pair for drop
            const inv = getPreviewInventory();
            inv[cleanDrop.id] = {
                productId: cleanDrop.id,
                state: 'available',
                verified: true,
                verificationStatus: 'verified',
                verifiedBy: 'Store Operator (Preview)',
                verifiedAt: new Date().toISOString(),
                serialTag: `ST-AUTH-00${cleanDrop.id}-TYO`,
                boxCondition: 'Pristine box, authentication verified',
            };
            savePreviewInventory(inv);

            return cleanDrop;
        },

        async updateDrop(id, patch) {
            const numericId = Number(id);
            const runtime = readRuntime();
            const isLive = runtime.status === 'configured' && Boolean(runtime.client);

            if (isLive) {
                const client = runtime.client;
                const updateFields = {};
                if (patch.name !== undefined) updateFields.name = patch.name;
                if (patch.brand !== undefined) updateFields.brand = patch.brand;
                if (patch.size !== undefined) updateFields.size = patch.size;
                if (patch.priceMinor !== undefined) updateFields.price_minor = patch.priceMinor;
                if (patch.frontImage !== undefined) updateFields.front_image = patch.frontImage;
                if (patch.sideImage !== undefined) updateFields.side_image = patch.sideImage;
                if (patch.active !== undefined) updateFields.active = patch.active;

                const { data, error } = await client
                    .from('products')
                    .update(updateFields)
                    .eq('id', numericId)
                    .select()
                    .single();

                if (error) {
                    throw new Error(`Failed to update drop: ${error.message}`);
                }
                return data;
            }

            const drops = getPreviewDrops();
            const index = drops.findIndex((d) => d.id === numericId);
            if (index === -1) {
                throw new Error(`Drop with ID ${numericId} not found.`);
            }

            const merged = { ...drops[index], ...patch, id: numericId };
            const validation = validateDropInput(merged, true);
            if (!validation.valid) {
                const firstMsg = Object.values(validation.errors)[0];
                throw new Error(firstMsg || 'Invalid drop update.');
            }

            drops[index] = validation.normalized;
            savePreviewDrops(drops);
            return drops[index];
        },

        async listInventory() {
            const runtime = readRuntime();
            const isLive = runtime.status === 'configured' && Boolean(runtime.client);

            if (isLive) {
                const client = runtime.client;
                const { data, error } = await client
                    .from('inventory_pairs')
                    .select('*')
                    .order('product_id', { ascending: true });

                if (error) {
                    throw new Error(`Failed to list inventory: ${error.message}`);
                }

                const map = {};
                for (const row of data || []) {
                    map[row.product_id] = {
                        productId: row.product_id,
                        state: row.state,
                        orderId: row.order_id,
                        reservedUntil: row.reserved_until,
                        verified: row.state === 'available',
                        verificationStatus: row.state === 'available' ? 'verified' : 'unverified',
                    };
                }
                return map;
            }

            return getPreviewInventory();
        },

        async updateInventoryPair(productId, updates = {}) {
            const runtime = readRuntime();
            const numId = Number(productId);
            if (updates.state && !validateInventoryPairState(updates.state)) {
                throw new Error(`Invalid inventory state: ${updates.state}`);
            }

            const isLive = runtime.status === 'configured' && Boolean(runtime.client);

            if (isLive) {
                const client = runtime.client;
                const dbPatch = {};
                if (updates.state) dbPatch.state = updates.state;
                if (updates.state === 'available') {
                    dbPatch.order_id = null;
                    dbPatch.reserved_until = null;
                }

                const { data, error } = await client
                    .from('inventory_pairs')
                    .update(dbPatch)
                    .eq('product_id', numId)
                    .select()
                    .single();

                if (error) {
                    throw new Error(`Failed to update inventory: ${error.message}`);
                }
                return data;
            }

            const inventory = getPreviewInventory();
            const existing = inventory[numId] || {
                productId: numId,
                state: 'available',
                verified: false,
                verificationStatus: 'unverified',
            };

            const updated = {
                ...existing,
                ...updates,
                productId: numId,
                updatedAt: new Date().toISOString(),
            };

            if (updates.state === 'available') {
                updated.orderId = null;
                updated.reservedUntil = null;
            }

            inventory[numId] = updated;
            savePreviewInventory(inventory);
            return updated;
        },

        async listOrders() {
            const runtime = readRuntime();
            const isLive = runtime.status === 'configured' && Boolean(runtime.client);

            if (isLive) {
                const client = runtime.client;
                const { data, error } = await client
                    .from('orders')
                    .select('*, order_items(*)')
                    .order('created_at', { ascending: false });

                if (error) {
                    throw new Error(`Failed to load orders: ${error.message}`);
                }

                return (data || []).map((o) => ({
                    ...o,
                    items: o.order_items || [],
                }));
            }

            const previewOrders = getPreviewOrders();
            if (previewOrders.length === 0) {
                // Populate sample preview orders
                const seeds = getSampleSeedOrders();
                for (const seed of seeds) {
                    savePreviewOrder(seed);
                }
                return seeds;
            }
            return previewOrders;
        },

        async updateOrderStatus(orderId, nextStatus, notes = '') {
            readRuntime();
            const orders = await this.listOrders();
            const order = orders.find((o) => o.id === orderId);
            if (!order) {
                throw new Error(`Order ${orderId} not found.`);
            }

            if (!isValidAdminStatusTransition(order.status, nextStatus)) {
                throw new Error(`Invalid status transition from "${order.status}" to "${nextStatus}".`);
            }

            const runtime = readRuntime();
            const isLive = runtime.status === 'configured' && Boolean(runtime.client);

            if (isLive) {
                const client = runtime.client;
                const { data, error } = await client
                    .from('orders')
                    .update({ status: nextStatus })
                    .eq('id', orderId)
                    .select()
                    .single();

                if (error) {
                    throw new Error(`Failed to update order status: ${error.message}`);
                }
                return data;
            }

            // Update in preview storage
            const updatedOrder = {
                ...order,
                status: nextStatus,
                fulfillment_notes: notes || order.fulfillment_notes || '',
                updated_at: new Date().toISOString(),
            };

            savePreviewOrder(updatedOrder);
            return updatedOrder;
        },

        generateDropId() {
            if (readRuntime().status === 'configured') return '';
            const drops = getPreviewDrops();
            const maxId = drops.reduce((max, d) => Math.max(max, Number(d.id) || 0), 0);
            return maxId + 1;
        },
    };
}

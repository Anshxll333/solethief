import React, { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
    ShieldCheck,
    Truck,
    CreditCard,
    AlertCircle,
    ArrowLeft,
    Lock,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useAuth } from '../auth/authContext.js';
import { useCommerce } from '../commerce/context.js';
import { formatMoney, resolveCart } from '../commerce/cart.js';
import { validateAddress } from '../commerce/address.js';
import { calculateOrderTotals, SHIPPING_OPTIONS } from '../commerce/orders.js';
import { createOrdersService } from '../services/orders.js';
import { createGlobalSettingsService, DEFAULT_GLOBAL_SETTINGS, STORAGE_KEY } from '../services/globalSettings.js';
import { getSupabaseRuntime } from '../lib/supabase.js';
import { shoesData } from '../data/shoes.js';

const INDIAN_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Delhi', 'Jammu and Kashmir', 'Ladakh',
];

const ordersService = createOrdersService(getSupabaseRuntime);
const globalSettingsService = createGlobalSettingsService(getSupabaseRuntime);

function loadRazorpayScript() {
    return new Promise((resolve) => {
        if (typeof window !== 'undefined' && window.Razorpay) {
            resolve(true);
            return;
        }
        if (typeof document === 'undefined') {
            resolve(false);
            return;
        }
        const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
        if (existing) {
            existing.addEventListener('load', () => resolve(true));
            existing.addEventListener('error', () => resolve(false));
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
    });
}

export default function Checkout() {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const { user, addresses, defaultAddressId, previewMode, runtimeMessage, authStatus } = useAuth();
    const { catalog, cart, clear: clearCart, remove } = useCommerce();

    // Check for single-item buy now parameters
    const buyItemParam = searchParams.get('buyItem') || location.state?.buyItem;
    const buyNowParam = searchParams.get('buyNow') || location.state?.buyNow;
    const sizeParam = searchParams.get('size') || location.state?.size;
    const qtyParam = Math.max(1, parseInt(searchParams.get('qty') || location.state?.qty || '1', 10));

    const isSingleItemCheckout = Boolean(buyItemParam || buyNowParam);

    // Guard: Require authenticated user so orders always link to user account history
    useEffect(() => {
        if (authStatus !== 'loading' && (!user || authStatus === 'unauthenticated')) {
            const returnUrl = encodeURIComponent(location.pathname + location.search);
            navigate(`/account?return=${returnUrl}`, { replace: true });
        }
    }, [user, authStatus, navigate, location]);

    // Resolve cart line items
    const lines = useMemo(() => resolveCart(cart, catalog), [cart, catalog]);

    // Single item from existing cart line
    const singleLineFromCart = useMemo(() => {
        if (!isSingleItemCheckout) return null;
        if (buyItemParam) {
            return lines.find(l =>
                l.lineId === buyItemParam ||
                String(l.id) === String(buyItemParam) ||
                (l.size && `${l.id}:${l.size}` === buyItemParam)
            );
        }
        if (buyNowParam) {
            return lines.find(l =>
                String(l.id) === String(buyNowParam) &&
                (!sizeParam || l.size === sizeParam)
            );
        }
        return null;
    }, [isSingleItemCheckout, buyItemParam, buyNowParam, sizeParam, lines]);

    // Direct product resolution if user came directly from product page
    const directProduct = useMemo(() => {
        if (!isSingleItemCheckout || singleLineFromCart) return null;
        const targetId = buyNowParam || String(buyItemParam).split(':')[0];
        const numId = Number(targetId);
        const catalogProd = catalog.products?.find(p => p.id === numId || String(p.id) === String(targetId));
        if (catalogProd) return catalogProd;
        const fallbackRaw = shoesData.find(s => s.id === numId || String(s.id) === String(targetId));
        if (fallbackRaw) {
            return {
                ...fallbackRaw,
                priceMinor: fallbackRaw.priceMinor || 1800000,
                currency: fallbackRaw.currency || 'INR',
            };
        }
        return null;
    }, [isSingleItemCheckout, singleLineFromCart, buyNowParam, buyItemParam, catalog.products]);

    // Effective lines for this checkout session
    const effectiveLines = useMemo(() => {
        if (isSingleItemCheckout) {
            if (singleLineFromCart && singleLineFromCart.product) {
                return [{
                    ...singleLineFromCart,
                    quantity: qtyParam || singleLineFromCart.quantity || 1,
                }];
            }
            if (directProduct) {
                return [{
                    id: directProduct.id,
                    lineId: sizeParam ? `${directProduct.id}:${sizeParam}` : String(directProduct.id),
                    product: directProduct,
                    size: sizeParam || directProduct.size,
                    quantity: qtyParam,
                }];
            }
        }
        return lines;
    }, [isSingleItemCheckout, singleLineFromCart, directProduct, sizeParam, qtyParam, lines]);

    const validLines = useMemo(() => effectiveLines.filter(l => Boolean(l.product)), [effectiveLines]);
    const hasItems = validLines.length > 0;

    // Default address resolution
    const defaultAddr = useMemo(() => {
        if (!addresses || addresses.length === 0) return null;
        return addresses.find(a => a.id === defaultAddressId) || addresses[0];
    }, [addresses, defaultAddressId]);

    // Global store settings for payment gateways
    const [globalSettings, setGlobalSettings] = useState(DEFAULT_GLOBAL_SETTINGS);

    useEffect(() => {
        let mounted = true;
        async function loadSettings() {
            try {
                const res = await globalSettingsService.loadPublic();
                if (mounted && res?.settings) {
                    setGlobalSettings(res.settings);
                }
            } catch {
                // Keep default
            }
        }
        loadSettings();

        const handleUpdate = (e) => {
            if (e.detail) {
                setGlobalSettings(e.detail);
            } else {
                loadSettings();
            }
        };

        const handleStorage = (e) => {
            if (e.key === STORAGE_KEY || !e.key) {
                loadSettings();
            }
        };

        if (typeof window !== 'undefined') {
            window.addEventListener('solethief:settings-updated', handleUpdate);
            window.addEventListener('storage', handleStorage);
        }

        return () => {
            mounted = false;
            if (typeof window !== 'undefined') {
                window.removeEventListener('solethief:settings-updated', handleUpdate);
                window.removeEventListener('storage', handleStorage);
            }
        };
    }, []);

    const razorpayConfig = globalSettings?.payment || DEFAULT_GLOBAL_SETTINGS.payment;
    const codConfig = globalSettings?.payment?.cod || DEFAULT_GLOBAL_SETTINGS.payment.cod;

    const isRazorpayMaintenance = Boolean(razorpayConfig.maintenance);
    const isRazorpayDisabled = razorpayConfig.enabled === false;
    const isRazorpaySelectable = !isRazorpayDisabled && !isRazorpayMaintenance;

    const isCodMaintenance = Boolean(codConfig.maintenance);
    const isCodDisabled = codConfig.enabled === false;
    const isCodSelectable = !isCodDisabled && !isCodMaintenance;

    const isAnyPaymentAvailable = isRazorpaySelectable || isCodSelectable;

    // Shipping selection: 'standard' | 'priority'
    const [shippingOptionId, setShippingOptionId] = useState('standard');

    // Payment method: 'online' | 'cod' | ''
    const [paymentMethod, setPaymentMethod] = useState(() => {
        if (isRazorpaySelectable) return 'online';
        if (isCodSelectable) return 'cod';
        return '';
    });

    // Automatically synchronize selection when payment availability changes
    useEffect(() => {
        if (paymentMethod === 'online' && !isRazorpaySelectable) {
            if (isCodSelectable) {
                setPaymentMethod('cod');
            } else {
                setPaymentMethod('');
            }
        } else if (paymentMethod === 'cod' && !isCodSelectable) {
            if (isRazorpaySelectable) {
                setPaymentMethod('online');
            } else {
                setPaymentMethod('');
            }
        } else if (!paymentMethod && isAnyPaymentAvailable) {
            if (isRazorpaySelectable) setPaymentMethod('online');
            else if (isCodSelectable) setPaymentMethod('cod');
        }
    }, [isRazorpaySelectable, isCodSelectable, isAnyPaymentAvailable, paymentMethod]);

    // Saved address selection vs new address
    const [selectedSavedAddrId, setSelectedSavedAddrId] = useState(() => defaultAddr?.id || 'custom');

    // Address form state
    const [addressForm, setAddressForm] = useState(() => ({
        recipient: defaultAddr?.recipient || '',
        phone: defaultAddr?.phone || '',
        line1: defaultAddr?.line1 || '',
        line2: defaultAddr?.line2 || '',
        city: defaultAddr?.city || '',
        region: defaultAddr?.region || 'Maharashtra',
        postal_code: defaultAddr?.postal_code || '',
        country_code: 'IN',
    }));

    const [addressErrors, setAddressErrors] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');

    // Subtotal and Totals
    const subtotalMinor = useMemo(() => {
        return validLines.reduce((sum, line) => sum + (line.product?.priceMinor || 0) * (line.quantity || 1), 0);
    }, [validLines]);

    const totals = useMemo(() => {
        if (!hasItems) {
            return {
                subtotalMinor: 0,
                shippingMinor: 0,
                taxMinor: 0,
                totalMinor: 0,
                shippingOption: SHIPPING_OPTIONS.standard,
            };
        }
        return calculateOrderTotals({
            subtotalMinor,
            shippingOptionId,
        });
    }, [hasItems, subtotalMinor, shippingOptionId]);

    const handlePlaceOrder = async (e) => {
        e.preventDefault();
        setSubmitError('');

        // 1. Validate items
        if (!hasItems) {
            setSubmitError('Your bag is empty. Please add available items before checkout.');
            return;
        }

        // 2. Validate payment gateway availability & selection
        if (!paymentMethod) {
            setSubmitError('Please select an active payment gateway to complete your order.');
            return;
        }

        if (paymentMethod === 'online') {
            if (!isRazorpaySelectable) {
                setSubmitError(razorpayConfig.maintenanceMessage || 'Razorpay online payment is currently undergoing scheduled maintenance. Please select Cash on Delivery.');
                return;
            }
            if (!razorpayConfig.keyId) {
                setSubmitError('Razorpay is not yet configured with an API Key ID in store administration settings. Please select Cash on Delivery or contact store support.');
                return;
            }
        }

        if (paymentMethod === 'cod' && !isCodSelectable) {
            setSubmitError(codConfig.maintenanceMessage || 'Cash on Delivery is currently paused for maintenance.');
            return;
        }

        // 3. Validate address
        const validation = validateAddress(addressForm);
        if (!validation.valid) {
            setAddressErrors(validation.errors);
            setSubmitError('Please correct the errors in your shipping address.');
            return;
        }

        setIsSubmitting(true);

        try {
            const itemsToOrder = validLines.map(l => ({
                ...l.product,
                size: l.size || l.product?.size,
                quantity: Number.isInteger(l.quantity) && l.quantity > 0 ? l.quantity : 1,
            }));

            const result = await ordersService.createOrder({
                items: itemsToOrder,
                shippingAddress: validation.clean,
                shippingOptionId,
                paymentMethod,
                user,
                allowPreview: previewMode,
            });

            if (result.success && result.order) {
                if (isSingleItemCheckout) {
                    // Remove ONLY the purchased item from the bag, safely preserving the user's remaining items
                    const itemToRemove = buyItemParam || (singleLineFromCart?.lineId || (singleLineFromCart?.size ? `${singleLineFromCart.id}:${singleLineFromCart.size}` : singleLineFromCart?.id));
                    if (itemToRemove) {
                        remove(itemToRemove);
                    }
                } else {
                    // Clear cart locally
                    clearCart();
                }

                // If live mode or configured key with online payment, open official modal
                const activeKeyId = result.razorpayKeyId || razorpayConfig.keyId;
                if (paymentMethod === 'online' && activeKeyId) {
                    const loaded = await loadRazorpayScript();
                    if (loaded && typeof window !== 'undefined' && window.Razorpay) {
                        const rzp = new window.Razorpay({
                            key: activeKeyId,
                            amount: result.order.total_minor,
                            currency: 'INR',
                            name: 'SOLETHIEF ARCHIVE',
                            description: `Archival Allocation #${result.order.id}`,
                            order_id: result.providerOrderId || undefined,
                            prefill: {
                                name: validation.clean.recipient,
                                contact: validation.clean.phone,
                                email: user?.email,
                            },
                            theme: {
                                color: '#151b2b',
                            },
                            handler: function () {
                                navigate(`/order-confirmation/${result.order.id}`);
                            },
                            modal: {
                                ondismiss: function () {
                                    navigate(`/order-confirmation/${result.order.id}`);
                                },
                            },
                        });
                        rzp.open();
                        return;
                    }
                }

                // Navigate to Order Confirmation
                navigate(`/order-confirmation/${result.order.id}`);
            } else {
                throw new Error('Order creation was unconfirmed.');
            }
        } catch (err) {
            setSubmitError(err.message || 'Failed to place order.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (authStatus === 'loading') {
        return (
            <div className="pageContainer">
                <Navbar />
                <main className="commercePage">
                    <p className="commerceState" role="status">Checking authentication...</p>
                </main>
                <Footer />
            </div>
        );
    }

    if (!user || authStatus === 'unauthenticated') {
        return (
            <div className="pageContainer">
                <Navbar />
                <main className="commercePage">
                    <p className="commerceState" role="status">Redirecting to sign in...</p>
                </main>
                <Footer />
            </div>
        );
    }

    return (
        <div className="pageContainer">
            <Navbar />
            <main className="commercePage checkoutPage">
                <p className="commerceEyebrow">SOLETHIEF / DISPATCH TERMINAL</p>

                <div className="commerceHeading">
                    <h1>Secure Checkout</h1>
                    <Link to="/cart" className="commerceTextLink">
                        <ArrowLeft size={16} aria-hidden="true" />
                        <span>Return to Bag{cart.ids?.length ? ` (${cart.ids.length})` : ''}</span>
                    </Link>
                </div>

                {isSingleItemCheckout && (
                    <div
                        className="accountPreviewNotice"
                        style={{
                            borderColor: 'rgba(152, 123, 71, 0.45)',
                            background: 'rgba(152, 123, 71, 0.08)',
                            marginBottom: '1.25rem',
                        }}
                        role="status"
                    >
                        <div className="accountPreviewNoticeHeader">
                            <Lock size={18} color="#987B47" aria-hidden="true" />
                            <strong style={{ color: '#11151F' }}>DIRECT ITEM CHECKOUT</strong>
                        </div>
                        <p style={{ color: '#4A463F', fontSize: '0.86rem', margin: '4px 0 0' }}>
                            You are checking out 1 specific item ({validLines[0]?.product?.name || 'Selected item'}{validLines[0]?.size ? ` • Size: ${validLines[0].size}` : ''}). {cart.ids?.length > 1 ? 'Other items in your bag will remain safely preserved.' : ''}
                        </p>
                    </div>
                )}

                {previewMode && (
                    <div className="accountPreviewNotice" role="region" aria-label="Preview Mode Notice">
                        <div className="accountPreviewNoticeHeader">
                            <AlertCircle size={20} aria-hidden="true" />
                            <strong>SIMULATED PREVIEW CHECKOUT</strong>
                        </div>
                        <p>
                            {runtimeMessage || 'Supabase live credentials are unconfigured. Placing an order here simulates instant reservation, creates a local preview order receipt, and clears your bag.'}
                        </p>
                    </div>
                )}

                {!hasItems ? (
                    <div className="commerceState">
                        <h2>Your bag is empty</h2>
                        <p>No pairs are currently selected for dispatch.</p>
                        <Link to="/shop" className="commerceButton">
                            Browse Active Archive
                        </Link>
                    </div>
                ) : (
                    <form className="checkoutLayout" onSubmit={handlePlaceOrder}>
                        {/* Main Left: Address, Shipping Option, Payment Method */}
                        <div className="checkoutMain">
                            {/* Section 1: Shipping Destination */}
                            <section className="checkoutBlockBrutalist" aria-labelledby="shipping-heading">
                                <div className="checkoutBrutalistBlockHeader">
                                    <div className="checkoutHeaderTitleWrap">
                                        <div className="checkoutTagRow">
                                            <span className="checkoutTagBadge">SECURE DISPATCH</span>
                                            <span className="checkoutTagCourier">DOMESTIC COURIER</span>
                                        </div>
                                        <div className="checkoutHeaderFlex">
                                            <Truck size={22} className="checkoutHeaderIcon" aria-hidden="true" />
                                            <h2 id="shipping-heading">1. Shipping Destination</h2>
                                        </div>
                                        <p className="checkoutBlockSubtext">
                                            All streetwear shipments are insured and dispatched within 24 hours in tamper-evident packaging.
                                        </p>
                                    </div>
                                    <div className="checkoutInsuredBadge">
                                        <ShieldCheck size={16} aria-hidden="true" />
                                        <span>100% TRANSIT INSURED</span>
                                    </div>
                                </div>

                                <div className="checkoutProtocolPills">
                                    <span className="checkoutProtocolPill">AIR CARGO / SURFACE</span>
                                    <span className="checkoutProtocolPill">PAN-INDIA 2-5 DAYS</span>
                                    <span className="checkoutProtocolPill">SIGNATURE REQUIRED</span>
                                </div>

                                {user && addresses && addresses.length > 0 && (
                                    <div className="checkoutSavedAddrSection">
                                        <div className="checkoutSubSectionTitle">Select Saved Delivery Point</div>
                                        <div className="checkoutSavedCardsGrid">
                                            {addresses.map(addr => {
                                                const isSelected = selectedSavedAddrId === addr.id;
                                                return (
                                                    <button
                                                        type="button"
                                                        key={addr.id}
                                                        className={`checkoutSavedCard ${isSelected ? 'isSelected' : ''}`}
                                                        onClick={() => {
                                                            setSelectedSavedAddrId(addr.id);
                                                            setAddressForm({
                                                                recipient: addr.recipient,
                                                                phone: addr.phone,
                                                                line1: addr.line1,
                                                                line2: addr.line2 || '',
                                                                city: addr.city,
                                                                region: addr.region,
                                                                postal_code: addr.postal_code,
                                                                country_code: 'IN',
                                                            });
                                                            setAddressErrors({});
                                                        }}
                                                    >
                                                        <div className="checkoutSavedCardHeader">
                                                            <span className="checkoutSavedCardTag">{addr.city?.toUpperCase()}</span>
                                                            {addr.id === defaultAddressId && (
                                                                <span className="checkoutTagBadge">DEFAULT</span>
                                                            )}
                                                        </div>
                                                        <span className="checkoutSavedRecipientName">{addr.recipient}</span>
                                                        <span className="checkoutSavedLines">
                                                            {addr.line1}{addr.line2 ? `, ${addr.line2}` : ''}<br />
                                                            {addr.city}, {addr.region} — {addr.postal_code}
                                                        </span>
                                                        {isSelected && (
                                                            <span className="checkoutSelectedBadge">
                                                                ✓ SELECTED FOR DISPATCH
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                            <button
                                                type="button"
                                                className={`checkoutNewAddrCard ${selectedSavedAddrId === 'custom' ? 'isSelected' : ''}`}
                                                onClick={() => {
                                                    setSelectedSavedAddrId('custom');
                                                    setAddressForm({
                                                        recipient: '',
                                                        phone: '',
                                                        line1: '',
                                                        line2: '',
                                                        city: '',
                                                        region: 'Maharashtra',
                                                        postal_code: '',
                                                        country_code: 'IN',
                                                    });
                                                }}
                                            >
                                                <span className="checkoutNewAddrIcon">+</span>
                                                <span className="checkoutNewAddrText">Add Custom Address</span>
                                                <span className="checkoutNewAddrSub">Ship to new destination</span>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="checkoutBrutalistForm">
                                    <div className="accountFormGrid">
                                        <div className="checkoutFieldBlock">
                                            <div className="checkoutFieldHeaderRow">
                                                <label className="checkoutFieldLabel" htmlFor="checkout-recipient">Recipient Full Name</label>
                                                <span className="checkoutFieldReqTag">REQUIRED</span>
                                            </div>
                                            <input
                                                id="checkout-recipient"
                                                type="text"
                                                required
                                                maxLength={120}
                                                className="checkoutBrutalistInput"
                                                value={addressForm.recipient}
                                                onChange={e => setAddressForm({ ...addressForm, recipient: e.target.value })}
                                                placeholder="Your Name"
                                            />
                                            {addressErrors.recipient && (
                                                <span className="accountFieldError">{addressErrors.recipient}</span>
                                            )}
                                        </div>

                                        <div className="checkoutFieldBlock">
                                            <div className="checkoutFieldHeaderRow">
                                                <label className="checkoutFieldLabel" htmlFor="checkout-phone">Contact Phone</label>
                                                <span className="checkoutFieldReqTag">REQUIRED</span>
                                            </div>
                                            <input
                                                id="checkout-phone"
                                                type="tel"
                                                required
                                                maxLength={32}
                                                className="checkoutBrutalistInput"
                                                value={addressForm.phone}
                                                onChange={e => setAddressForm({ ...addressForm, phone: e.target.value })}
                                                placeholder="Phone Number"
                                            />
                                            {addressErrors.phone && (
                                                <span className="accountFieldError">{addressErrors.phone}</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="checkoutFieldBlock">
                                        <div className="checkoutFieldHeaderRow">
                                            <label className="checkoutFieldLabel" htmlFor="checkout-line1">Address Line 1 (Street, Building, Flat)</label>
                                            <span className="checkoutFieldReqTag">REQUIRED</span>
                                        </div>
                                        <input
                                            id="checkout-line1"
                                            type="text"
                                            required
                                            maxLength={200}
                                            className="checkoutBrutalistInput"
                                            value={addressForm.line1}
                                            onChange={e => setAddressForm({ ...addressForm, line1: e.target.value })}
                                            placeholder="Enter your address"
                                        />
                                        {addressErrors.line1 && (
                                            <span className="accountFieldError">{addressErrors.line1}</span>
                                        )}
                                    </div>

                                    <div className="checkoutFieldBlock">
                                        <div className="checkoutFieldHeaderRow">
                                            <label className="checkoutFieldLabel" htmlFor="checkout-line2">Address Line 2 (Landmark, Suite)</label>
                                            <span className="checkoutFieldOptionalTag">OPTIONAL</span>
                                        </div>
                                        <input
                                            id="checkout-line2"
                                            type="text"
                                            maxLength={200}
                                            className="checkoutBrutalistInput"
                                            value={addressForm.line2}
                                            onChange={e => setAddressForm({ ...addressForm, line2: e.target.value })}
                                            placeholder="Apartment, suite, landmark (optional)"
                                        />
                                        {addressErrors.line2 && (
                                            <span className="accountFieldError">{addressErrors.line2}</span>
                                        )}
                                    </div>

                                    <div className="accountFormGrid">
                                        <div className="checkoutFieldBlock">
                                            <div className="checkoutFieldHeaderRow">
                                                <label className="checkoutFieldLabel" htmlFor="checkout-city">City</label>
                                                <span className="checkoutFieldReqTag">REQUIRED</span>
                                            </div>
                                            <input
                                                id="checkout-city"
                                                type="text"
                                                required
                                                maxLength={100}
                                                className="checkoutBrutalistInput"
                                                value={addressForm.city}
                                                onChange={e => setAddressForm({ ...addressForm, city: e.target.value })}
                                                placeholder="City"
                                            />
                                            {addressErrors.city && (
                                                <span className="accountFieldError">{addressErrors.city}</span>
                                            )}
                                        </div>

                                        <div className="checkoutFieldBlock">
                                            <div className="checkoutFieldHeaderRow">
                                                <label className="checkoutFieldLabel" htmlFor="checkout-region">State / Region</label>
                                                <span className="checkoutFieldReqTag">REQUIRED</span>
                                            </div>
                                            <select
                                                id="checkout-region"
                                                className="checkoutBrutalistInput"
                                                value={addressForm.region}
                                                onChange={e => setAddressForm({ ...addressForm, region: e.target.value })}
                                            >
                                                {INDIAN_STATES.map(st => (
                                                    <option key={st} value={st}>{st}</option>
                                                ))}
                                            </select>
                                            {addressErrors.region && (
                                                <span className="accountFieldError">{addressErrors.region}</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="accountFormGrid">
                                        <div className="checkoutFieldBlock">
                                            <div className="checkoutFieldHeaderRow">
                                                <label className="checkoutFieldLabel" htmlFor="checkout-postal">Postal PIN Code (6 digits)</label>
                                                <span className="checkoutFieldReqTag">REQUIRED</span>
                                            </div>
                                            <input
                                                id="checkout-postal"
                                                type="text"
                                                required
                                                maxLength={6}
                                                pattern="[0-9]{6}"
                                                className="checkoutBrutalistInput"
                                                value={addressForm.postal_code}
                                                onChange={e => setAddressForm({ ...addressForm, postal_code: e.target.value })}
                                                placeholder="Postal Code"
                                            />
                                            {addressErrors.postal_code && (
                                                <span className="accountFieldError">{addressErrors.postal_code}</span>
                                            )}
                                        </div>

                                        <div className="checkoutFieldBlock">
                                            <div className="checkoutFieldHeaderRow">
                                                <label className="checkoutFieldLabel" htmlFor="checkout-country">Country</label>
                                                <span className="checkoutFieldOptionalTag">LOCKED</span>
                                            </div>
                                            <input
                                                id="checkout-country"
                                                type="text"
                                                disabled
                                                value="India (IN)"
                                                className="checkoutBrutalistInput accountDisabledInput"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* Section 2: Shipping Method */}
                            <section className="checkoutBlock" aria-labelledby="shipping-method-heading">
                                <div className="checkoutBlockHeader">
                                    <ShieldCheck size={20} aria-hidden="true" />
                                    <h2 id="shipping-method-heading">2. Shipping Courier Method</h2>
                                </div>

                                <div className="checkoutRadioGroup" role="radiogroup" aria-labelledby="shipping-method-heading">
                                    <label
                                        className={`checkoutRadioOption ${shippingOptionId === 'standard' ? 'isSelected' : ''}`}
                                    >
                                        <input
                                            type="radio"
                                            name="shippingOption"
                                            value="standard"
                                            checked={shippingOptionId === 'standard'}
                                            onChange={() => setShippingOptionId('standard')}
                                        />
                                        <div className="checkoutRadioContent">
                                            <div className="checkoutRadioTitleRow">
                                                <span className="checkoutRadioTitle">Standard Insured Delivery</span>
                                                <span className="checkoutRadioPrice">FREE</span>
                                            </div>
                                            <p className="checkoutRadioDesc">
                                                3–5 business days • Complimentary full-transit courier coverage across India.
                                            </p>
                                        </div>
                                    </label>

                                    <label
                                        className={`checkoutRadioOption ${shippingOptionId === 'priority' ? 'isSelected' : ''}`}
                                    >
                                        <input
                                            type="radio"
                                            name="shippingOption"
                                            value="priority"
                                            checked={shippingOptionId === 'priority'}
                                            onChange={() => setShippingOptionId('priority')}
                                        />
                                        <div className="checkoutRadioContent">
                                            <div className="checkoutRadioTitleRow">
                                                <span className="checkoutRadioTitle">Priority Courier Express</span>
                                                <span className="checkoutRadioPrice">{formatMoney(SHIPPING_OPTIONS.priority.priceMinor)}</span>
                                            </div>
                                            <p className="checkoutRadioDesc">
                                                24–48 hours dispatch • Priority air freight handling and real-time tracking.
                                            </p>
                                        </div>
                                    </label>
                                </div>
                            </section>

                            {/* Section 3: Payment Method */}
                            <section className="checkoutBlock" aria-labelledby="payment-heading">
                                <div className="checkoutBlockHeader">
                                    <CreditCard size={20} aria-hidden="true" />
                                    <h2 id="payment-heading">3. Payment Selection</h2>
                                </div>

                                {!isAnyPaymentAvailable && (
                                    <div className="checkoutAlertBanner isMaintenance" role="alert">
                                        <AlertCircle size={20} aria-hidden="true" />
                                        <div>
                                            <strong>PAYMENT CHANNELS UNDER MAINTENANCE</strong>
                                            <p>All online and cash payment gateways are currently undergoing scheduled maintenance. Orders cannot be dispatched at this moment.</p>
                                        </div>
                                    </div>
                                )}

                                <div className="checkoutRadioGroup" role="radiogroup" aria-labelledby="payment-heading">
                                    {/* Razorpay Online */}
                                    <label
                                        className={`checkoutRadioOption ${paymentMethod === 'online' && isRazorpaySelectable ? 'isSelected' : ''} ${!isRazorpaySelectable ? 'isUnavailable isMaintenanceOption' : ''}`}
                                    >
                                        <input
                                            type="radio"
                                            name="paymentMethod"
                                            value="online"
                                            disabled={!isRazorpaySelectable}
                                            checked={paymentMethod === 'online' && isRazorpaySelectable}
                                            onChange={() => {
                                                if (isRazorpaySelectable) setPaymentMethod('online');
                                            }}
                                        />
                                        <div className="checkoutRadioContent">
                                            <div className="checkoutRadioTitleRow">
                                                <span className="checkoutRadioTitle">
                                                    <span>{razorpayConfig.title || 'Online Payment (UPI / Cards / Netbanking)'}</span>
                                                    {isRazorpayMaintenance && (
                                                        <span className="checkoutMaintenanceBadge">MAINTENANCE MODE ON</span>
                                                    )}
                                                    {isRazorpayDisabled && !isRazorpayMaintenance && (
                                                        <span className="checkoutMaintenanceBadge isOffline">OFFLINE / DISABLED</span>
                                                    )}
                                                </span>
                                                <span className="checkoutRadioPrice">
                                                    {isRazorpayMaintenance ? 'MAINTENANCE' : isRazorpayDisabled ? 'OFFLINE' : (razorpayConfig.mode === 'test' ? 'Razorpay Test' : 'Razorpay')}
                                                </span>
                                            </div>
                                            <p className="checkoutRadioDesc">
                                                {isRazorpayMaintenance
                                                    ? (razorpayConfig.maintenanceMessage || 'Razorpay online payment is currently undergoing scheduled maintenance. Please select Cash on Delivery or check back shortly.')
                                                    : isRazorpayDisabled
                                                    ? 'Razorpay online payment is currently disabled by store administration.'
                                                    : (razorpayConfig.description || 'Instant verification via official Razorpay India payment contract. All major UPI apps, credit/debit cards, and netbanking.')
                                                }
                                            </p>
                                        </div>
                                    </label>

                                    {/* Cash on Delivery */}
                                    <label
                                        className={`checkoutRadioOption ${paymentMethod === 'cod' && isCodSelectable ? 'isSelected' : ''} ${!isCodSelectable ? 'isUnavailable isMaintenanceOption' : ''}`}
                                    >
                                        <input
                                            type="radio"
                                            name="paymentMethod"
                                            value="cod"
                                            disabled={!isCodSelectable}
                                            checked={paymentMethod === 'cod' && isCodSelectable}
                                            onChange={() => {
                                                if (isCodSelectable) setPaymentMethod('cod');
                                            }}
                                        />
                                        <div className="checkoutRadioContent">
                                            <div className="checkoutRadioTitleRow">
                                                <span className="checkoutRadioTitle">
                                                    <span>{codConfig.title || 'Archive Reserve / Cash on Delivery'}</span>
                                                    {isCodMaintenance && (
                                                        <span className="checkoutMaintenanceBadge">MAINTENANCE MODE ON</span>
                                                    )}
                                                    {isCodDisabled && !isCodMaintenance && (
                                                        <span className="checkoutMaintenanceBadge isOffline">OFFLINE / DISABLED</span>
                                                    )}
                                                </span>
                                                <span className="checkoutRadioPrice">
                                                    {isCodMaintenance ? 'MAINTENANCE' : isCodDisabled ? 'OFFLINE' : 'COD'}
                                                </span>
                                            </div>
                                            <p className="checkoutRadioDesc">
                                                {isCodMaintenance
                                                    ? (codConfig.maintenanceMessage || 'Cash on Delivery is currently paused for maintenance.')
                                                    : isCodDisabled
                                                    ? 'Cash on Delivery is currently disabled by store administration.'
                                                    : (codConfig.description || 'Reserve your pair immediately. Complete payment in cash or UPI upon delivery authentication inspection.')
                                                }
                                            </p>
                                        </div>
                                    </label>
                                </div>
                            </section>
                        </div>

                        {/* Right: Order Review Summary Sticky Sidebar */}
                        <aside className="checkoutSummaryBox" aria-label="Order review summary">
                            <h2 className="checkoutSummaryTitle">Order Review</h2>

                            <ul className="checkoutLineItemsList">
                                {validLines.map(({ id, lineId, product, size, quantity }) => {
                                    const qty = Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
                                    const lineTotal = (product.priceMinor || 0) * qty;
                                    const displaySize = size || product?.size;
                                    const itemKey = lineId || (displaySize ? `${id}:${displaySize}` : String(id));
                                    return (
                                        <li key={itemKey} className="checkoutLineItem">
                                            <img
                                                src={product.frontImage}
                                                alt={`${product.name}, ${displaySize || ''}`}
                                                className="checkoutLineThumb"
                                            />
                                            <div className="checkoutLineDetails">
                                                <h3>{product.name}</h3>
                                                <p>{product.brand} • Size: {displaySize}</p>
                                                <p>Qty: {qty} {qty === 1 ? '(Single Pair)' : `(${qty} Pairs)`}</p>
                                            </div>
                                            <span className="checkoutLinePrice">
                                                {formatMoney(lineTotal)}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>

                            <div className="checkoutBreakdown">
                                <div className="checkoutBreakdownRow">
                                    <span>
                                        Subtotal (
                                        {validLines.reduce((s, l) => s + (l.quantity || 1), 0)}{' '}
                                        {validLines.reduce((s, l) => s + (l.quantity || 1), 0) === 1 ? 'pair' : 'pairs'}
                                        )
                                    </span>
                                    <span>{formatMoney(totals.subtotalMinor)}</span>
                                </div>
                                <div className="checkoutBreakdownRow">
                                    <span>Shipping ({totals.shippingOption.name})</span>
                                    <span>{totals.shippingMinor === 0 ? 'FREE' : formatMoney(totals.shippingMinor)}</span>
                                </div>
                                <div className="checkoutBreakdownRow">
                                    <span>GST (18% Indian Tax)</span>
                                    <span>{formatMoney(totals.taxMinor)}</span>
                                </div>
                                <div className="checkoutBreakdownRow isTotal">
                                    <span>Grand Total</span>
                                    <span>{formatMoney(totals.totalMinor)}</span>
                                </div>
                            </div>

                            {submitError && (
                                <div className="accountFeedback isError" role="alert" style={{ marginBottom: '1rem' }}>
                                    <AlertCircle size={18} aria-hidden="true" />
                                    <span>{submitError}</span>
                                </div>
                            )}

                            <button
                                type="submit"
                                className="checkoutPlaceOrderBtn"
                                disabled={isSubmitting || !hasItems || !isAnyPaymentAvailable || !paymentMethod}
                            >
                                {isSubmitting ? (
                                    <span>Processing Authorization...</span>
                                ) : !isAnyPaymentAvailable ? (
                                    <span>Gateways Under Maintenance</span>
                                ) : (
                                    <span>
                                        Place Order • {formatMoney(totals.totalMinor)}
                                    </span>
                                )}
                            </button>

                            <div className="checkoutGuaranteeNotice">
                                <p>
                                    <Lock size={12} style={{ display: 'inline', marginRight: '4px' }} />
                                    All drops are 100% physically authenticated prior to sealed packaging. 256-bit encrypted checkout.
                                </p>
                            </div>
                        </aside>
                    </form>
                )}
            </main>
            <Footer />
        </div>
    );
}

import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import { getSupabaseRuntime } from '../lib/supabase.js';

const INDIAN_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Delhi', 'Jammu and Kashmir', 'Ladakh',
];

const ordersService = createOrdersService(getSupabaseRuntime);

export default function Checkout() {
    const navigate = useNavigate();
    const { user, addresses, defaultAddressId, previewMode, runtimeMessage } = useAuth();
    const { catalog, cart, clear: clearCart } = useCommerce();

    // Resolve cart line items
    const lines = useMemo(() => resolveCart(cart, catalog), [cart, catalog]);
    const validLines = useMemo(() => lines.filter(l => Boolean(l.product)), [lines]);
    const hasItems = validLines.length > 0;

    // Default address resolution
    const defaultAddr = useMemo(() => {
        if (!addresses || addresses.length === 0) return null;
        return addresses.find(a => a.id === defaultAddressId) || addresses[0];
    }, [addresses, defaultAddressId]);

    // Shipping selection: 'standard' | 'priority'
    const [shippingOptionId, setShippingOptionId] = useState('standard');

    // Payment method: 'online' | 'cod'
    const [paymentMethod, setPaymentMethod] = useState('online');

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

    // Handle switching between saved addresses
    const handleSavedAddressChange = (e) => {
        const addrId = e.target.value;
        setSelectedSavedAddrId(addrId);
        if (addrId === 'custom') {
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
        } else {
            const found = addresses.find(a => a.id === addrId);
            if (found) {
                setAddressForm({
                    recipient: found.recipient,
                    phone: found.phone,
                    line1: found.line1,
                    line2: found.line2 || '',
                    city: found.city,
                    region: found.region,
                    postal_code: found.postal_code,
                    country_code: 'IN',
                });
                setAddressErrors({});
            }
        }
    };

    // Subtotal and Totals
    const subtotalMinor = useMemo(() => {
        return validLines.reduce((sum, line) => sum + (line.product?.priceMinor || 0), 0);
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

        // 2. Validate address
        const validation = validateAddress(addressForm);
        if (!validation.valid) {
            setAddressErrors(validation.errors);
            setSubmitError('Please correct the errors in your shipping address.');
            return;
        }

        setIsSubmitting(true);

        try {
            const itemsToOrder = validLines.map(l => l.product);

            const result = await ordersService.createOrder({
                items: itemsToOrder,
                shippingAddress: validation.clean,
                shippingOptionId,
                paymentMethod,
                user,
                allowPreview: previewMode,
            });

            if (result.success && result.order) {
                // Clear cart locally
                clearCart();
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

    return (
        <div className="pageContainer">
            <Navbar />
            <main className="commercePage checkoutPage">
                <p className="commerceEyebrow">SOLETHIEF / DISPATCH TERMINAL</p>

                <div className="commerceHeading">
                    <h1>Secure Checkout</h1>
                    <Link to="/cart" className="commerceTextLink">
                        <ArrowLeft size={16} aria-hidden="true" />
                        <span>Return to Bag</span>
                    </Link>
                </div>

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
                            <section className="checkoutBlock" aria-labelledby="shipping-heading">
                                <div className="checkoutBlockHeader">
                                    <Truck size={20} aria-hidden="true" />
                                    <h2 id="shipping-heading">1. Shipping Destination</h2>
                                </div>

                                {user && addresses.length > 0 && (
                                    <div className="checkoutSavedAddrSelect">
                                        <label htmlFor="saved-addr-select">Use Saved Address</label>
                                        <select
                                            id="saved-addr-select"
                                            value={selectedSavedAddrId}
                                            onChange={handleSavedAddressChange}
                                        >
                                            {addresses.map(addr => (
                                                <option key={addr.id} value={addr.id}>
                                                    {addr.recipient} - {addr.city}, {addr.region} ({addr.postal_code})
                                                </option>
                                            ))}
                                            <option value="custom">+ Enter New Shipping Address</option>
                                        </select>
                                    </div>
                                )}

                                <div className="accountForm">
                                    <div className="accountFormGrid">
                                        <label>
                                            Recipient Full Name *
                                            <input
                                                type="text"
                                                required
                                                maxLength={120}
                                                value={addressForm.recipient}
                                                onChange={e => setAddressForm({ ...addressForm, recipient: e.target.value })}
                                                placeholder="Arjun Rao"
                                            />
                                            {addressErrors.recipient && (
                                                <span className="accountFieldError">{addressErrors.recipient}</span>
                                            )}
                                        </label>
                                        <label>
                                            Phone Number *
                                            <input
                                                type="tel"
                                                required
                                                maxLength={32}
                                                value={addressForm.phone}
                                                onChange={e => setAddressForm({ ...addressForm, phone: e.target.value })}
                                                placeholder="+91 98200 12345"
                                            />
                                            {addressErrors.phone && (
                                                <span className="accountFieldError">{addressErrors.phone}</span>
                                            )}
                                        </label>
                                    </div>

                                    <label>
                                        Address Line 1 (Street, Building, Flat) *
                                        <input
                                            type="text"
                                            required
                                            maxLength={200}
                                            value={addressForm.line1}
                                            onChange={e => setAddressForm({ ...addressForm, line1: e.target.value })}
                                            placeholder="Flat 402, Sea View Apartments, Carter Road"
                                        />
                                        {addressErrors.line1 && (
                                            <span className="accountFieldError">{addressErrors.line1}</span>
                                        )}
                                    </label>

                                    <label>
                                        Address Line 2 (Landmark, Suite - Optional)
                                        <input
                                            type="text"
                                            maxLength={200}
                                            value={addressForm.line2}
                                            onChange={e => setAddressForm({ ...addressForm, line2: e.target.value })}
                                            placeholder="Near Joggers Park"
                                        />
                                        {addressErrors.line2 && (
                                            <span className="accountFieldError">{addressErrors.line2}</span>
                                        )}
                                    </label>

                                    <div className="accountFormGrid">
                                        <label>
                                            City *
                                            <input
                                                type="text"
                                                required
                                                maxLength={100}
                                                value={addressForm.city}
                                                onChange={e => setAddressForm({ ...addressForm, city: e.target.value })}
                                                placeholder="Mumbai"
                                            />
                                            {addressErrors.city && (
                                                <span className="accountFieldError">{addressErrors.city}</span>
                                            )}
                                        </label>
                                        <label>
                                            State / Region *
                                            <select
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
                                        </label>
                                    </div>

                                    <div className="accountFormGrid">
                                        <label>
                                            Postal PIN Code (6 digits) *
                                            <input
                                                type="text"
                                                required
                                                maxLength={6}
                                                pattern="[0-9]{6}"
                                                value={addressForm.postal_code}
                                                onChange={e => setAddressForm({ ...addressForm, postal_code: e.target.value })}
                                                placeholder="400050"
                                            />
                                            {addressErrors.postal_code && (
                                                <span className="accountFieldError">{addressErrors.postal_code}</span>
                                            )}
                                        </label>
                                        <label>
                                            Country
                                            <input
                                                type="text"
                                                disabled
                                                value="India (IN)"
                                                className="accountDisabledInput"
                                            />
                                        </label>
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

                                <div className="checkoutRadioGroup" role="radiogroup" aria-labelledby="payment-heading">
                                    <label
                                        className={`checkoutRadioOption ${paymentMethod === 'online' ? 'isSelected' : ''}`}
                                    >
                                        <input
                                            type="radio"
                                            name="paymentMethod"
                                            value="online"
                                            checked={paymentMethod === 'online'}
                                            onChange={() => setPaymentMethod('online')}
                                        />
                                        <div className="checkoutRadioContent">
                                            <div className="checkoutRadioTitleRow">
                                                <span className="checkoutRadioTitle">Online Payment (UPI / Cards / Netbanking)</span>
                                                <span className="checkoutRadioPrice">Razorpay</span>
                                            </div>
                                            <p className="checkoutRadioDesc">
                                                Instant verification via official Razorpay India payment contract. All major UPI apps, credit/debit cards, and netbanking.
                                            </p>
                                        </div>
                                    </label>

                                    <label
                                        className={`checkoutRadioOption ${paymentMethod === 'cod' ? 'isSelected' : ''}`}
                                    >
                                        <input
                                            type="radio"
                                            name="paymentMethod"
                                            value="cod"
                                            checked={paymentMethod === 'cod'}
                                            onChange={() => setPaymentMethod('cod')}
                                        />
                                        <div className="checkoutRadioContent">
                                            <div className="checkoutRadioTitleRow">
                                                <span className="checkoutRadioTitle">Archive Reserve / Cash on Delivery</span>
                                                <span className="checkoutRadioPrice">COD</span>
                                            </div>
                                            <p className="checkoutRadioDesc">
                                                Reserve your pair immediately. Complete payment in cash or UPI upon delivery authentication inspection.
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
                                {validLines.map(({ id, product }) => (
                                    <li key={id} className="checkoutLineItem">
                                        <img
                                            src={product.frontImage}
                                            alt={`${product.name}, ${product.size}`}
                                            className="checkoutLineThumb"
                                        />
                                        <div className="checkoutLineDetails">
                                            <h3>{product.name}</h3>
                                            <p>{product.brand} • Size: {product.size}</p>
                                            <p>Qty: 1 (Single Pair)</p>
                                        </div>
                                        <span className="checkoutLinePrice">
                                            {formatMoney(product.priceMinor)}
                                        </span>
                                    </li>
                                ))}
                            </ul>

                            <div className="checkoutBreakdown">
                                <div className="checkoutBreakdownRow">
                                    <span>Subtotal ({validLines.length} {validLines.length === 1 ? 'pair' : 'pairs'})</span>
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
                                disabled={isSubmitting || !hasItems}
                            >
                                {isSubmitting ? (
                                    <span>Processing Authorization...</span>
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

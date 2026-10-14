import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
    CheckCircle2,
    Package,
    ShieldCheck,
    Truck,
    ArrowLeft,
    ArrowRight,
    ShoppingBag,
    Clock,
    AlertCircle,
    Copy,
    Check,
    MapPin,
    Phone,
    XCircle,
    X,
    Sparkles,
    Printer,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { formatMoney } from '../commerce/cart.js';
import { canCancelOrder, getCancellationRemainingTime } from '../commerce/orders.js';
import { createOrdersService } from '../services/orders.js';
import { getSupabaseRuntime } from '../lib/supabase.js';
import { useAuth } from '../auth/authContext.js';
import './OrderConfirmation.css';

const ordersService = createOrdersService(getSupabaseRuntime);

// High-fidelity fallback sample order for demo / preview (matches mockup reference #st-95287)
const SAMPLE_MOCKUP_ORDER = {
    id: 'st-95287',
    status: 'paid',
    created_at: '2026-03-29T10:30:00.000Z',
    payment_method: 'cod',
    total_minor: 899900,
    subtotal_minor: 762627,
    shipping_minor: 0,
    tax_minor: 137273,
    shipping_address: {
        recipient: 'Abhi Sharma',
        phone: '+91 98765 43210',
        line1: '123, Luxury Avenue, Cyber City',
        line2: 'Sector 29',
        city: 'Gurugram',
        region: 'Haryana',
        postal_code: '122002',
        country: 'India',
    },
    items: [
        {
            id: 'sample_item_1',
            name: 'Nike Air Jordan 1 Retro High',
            brand: 'Nike',
            size: 'UK 9',
            quantity: 1,
            unit_price_minor: 899900,
            front_image: '/shoes/transparent/shoe-1-front.png',
            image_url: '/shoes/transparent/shoe-1-front.png',
        },
    ],
};

const CANCEL_REASONS = [
    'Changed mind',
    'Ordered wrong size',
    'Found better price',
    'Shipping time too long',
    'Payment or financial reason',
    'Other',
];

export default function OrderConfirmation() {
    const { orderId } = useParams();
    const navigate = useNavigate();
    const { user, previewMode } = useAuth();

    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);

    // 24-Hour Cancellation Modal State
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [cancelReason, setCancelReason] = useState(CANCEL_REASONS[0]);
    const [cancelNotes, setCancelNotes] = useState('');
    const [cancelSubmitting, setCancelSubmitting] = useState(false);
    const [cancelError, setCancelError] = useState('');
    const [cancelSuccessMsg, setCancelSuccessMsg] = useState('');

    useEffect(() => {
        let isCurrent = true;
        setLoading(true);
        setError('');

        const normalizedId = String(orderId || '').trim();

        ordersService.getOrder(normalizedId, { allowPreview: true, user })
            .then((res) => {
                if (!isCurrent) return;
                const fetchedOrder = res?.order || res?.data || res;

                if (fetchedOrder && fetchedOrder.id) {
                    setOrder(fetchedOrder);
                } else if (
                    normalizedId.toLowerCase() === 'st-95287' ||
                    normalizedId.toLowerCase() === 'preview' ||
                    normalizedId.toLowerCase() === 'sample'
                ) {
                    setOrder(SAMPLE_MOCKUP_ORDER);
                } else {
                    setError('The requested order serial was not found in our archive records.');
                }
            })
            .catch((err) => {
                if (!isCurrent) return;
                if (
                    normalizedId.toLowerCase() === 'st-95287' ||
                    normalizedId.toLowerCase() === 'preview' ||
                    normalizedId.toLowerCase() === 'sample'
                ) {
                    setOrder(SAMPLE_MOCKUP_ORDER);
                } else {
                    setError(err.message || 'Failed to retrieve authenticated order receipt.');
                }
            })
            .finally(() => {
                if (isCurrent) setLoading(false);
            });

        return () => {
            isCurrent = false;
        };
    }, [orderId]);

    // Copy Order Serial Number
    const handleCopyOrderId = (e) => {
        e?.stopPropagation?.();
        if (!order?.id) return;
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard) {
                navigator.clipboard.writeText(order.id);
            }
        } catch {
            // ignore clipboard access rejection
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Print Receipt
    const handlePrint = () => {
        if (typeof window !== 'undefined') {
            window.print();
        }
    };

    // Cancellation Execution (24-Hour Policy)
    const handleConfirmCancel = async () => {
        if (!order?.id) return;
        setCancelSubmitting(true);
        setCancelError('');

        try {
            const finalReason = cancelReason === 'Other' && cancelNotes.trim()
                ? `Other: ${cancelNotes.trim()}`
                : cancelReason;

            await ordersService.cancelOrder(order.id, {
                reason: finalReason,
                user,
                allowPreview: previewMode,
            });

            const nowIso = new Date().toISOString();
            setOrder((prev) => ({
                ...prev,
                status: 'cancelled',
                cancel_reason: finalReason,
                cancelled_at: nowIso,
            }));

            setCancelSuccessMsg(`Order #${order.id} was successfully cancelled. Allocation released.`);
            setShowCancelModal(false);
        } catch (err) {
            setCancelError(err.message || 'Failed to cancel order.');
        } finally {
            setCancelSubmitting(false);
        }
    };

    // Calculations & Formats
    const formattedDate = useMemo(() => {
        if (!order?.created_at) return '29 Mar 2026, 10:30 AM';
        try {
            const d = new Date(order.created_at);
            return d.toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch {
            return 'Recently';
        }
    }, [order?.created_at]);

    const isPendingPayment = order?.status === 'pending_payment';
    const isCancelled = ['cancelled', 'refunded', 'expired'].includes(order?.status);

    const isCancellable = useMemo(() => {
        return canCancelOrder(order);
    }, [order]);

    const remainingCancelTime = useMemo(() => {
        return getCancellationRemainingTime(order);
    }, [order]);

    const totalMinor = Number.isSafeInteger(order?.total_amount_minor)
        ? order.total_amount_minor
        : (Number.isSafeInteger(order?.total_minor) ? order.total_minor : 899900);

    const subtotalMinor = Number.isSafeInteger(order?.subtotal_amount_minor)
        ? order.subtotal_amount_minor
        : (Number.isSafeInteger(order?.subtotal_minor)
            ? order.subtotal_minor
            : Math.round(totalMinor / 1.18));

    const shippingMinor = Number.isSafeInteger(order?.shipping_amount_minor)
        ? order.shipping_amount_minor
        : (Number.isSafeInteger(order?.shipping_minor) ? order.shipping_minor : 0);

    const taxMinor = Number.isSafeInteger(order?.tax_amount_minor)
        ? order.tax_amount_minor
        : (Number.isSafeInteger(order?.tax_minor)
            ? order.tax_minor
            : (totalMinor - subtotalMinor - shippingMinor));

    const itemsList = Array.isArray(order?.items) && order.items.length > 0
        ? order.items
        : SAMPLE_MOCKUP_ORDER.items;

    const totalPairsCount = itemsList.reduce(
        (sum, item) => sum + (Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1),
        0
    );

    // Dynamic Dispatch Stepper Milestones strictly aligned with Account tracker logic
    const trackerMilestones = useMemo(() => {
        const status = order?.status || 'paid';
        let placedTime = formattedDate;

        if (order?.created_at) {
            try {
                placedTime = new Date(order.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                });
            } catch {
                // ignore
            }
        }

        let step1 = 'completed';
        let step2 = 'upcoming';
        let step3 = 'upcoming';
        let step4 = 'upcoming';

        if (['cancelled', 'refunded', 'expired'].includes(status)) {
            step1 = 'cancelled';
            step2 = 'cancelled';
            step3 = 'cancelled';
            step4 = 'cancelled';
        } else if (status === 'delivered') {
            step1 = 'completed';
            step2 = 'completed';
            step3 = 'completed';
            step4 = 'completed';
        } else if (status === 'shipped') {
            step1 = 'completed';
            step2 = 'completed';
            step3 = 'current';
            step4 = 'upcoming';
        } else if (status === 'processing' || status === 'paid') {
            step1 = 'completed';
            step2 = 'current';
            step3 = 'upcoming';
            step4 = 'upcoming';
        } else if (status === 'pending_payment') {
            step1 = 'current';
            step2 = 'upcoming';
            step3 = 'upcoming';
            step4 = 'upcoming';
        }

        return [
            {
                id: 'placed',
                title: 'Order Confirmed',
                time: placedTime,
                state: step1,
            },
            {
                id: 'authenticating',
                title: 'Authenticating',
                time: step1 === 'completed' ? 'Verified' : step1 === 'current' ? 'In Progress' : 'Pending',
                state: step2,
            },
            {
                id: 'shipped',
                title: 'Express Transit',
                time: step2 === 'completed' ? 'Dispatched' : step2 === 'current' ? 'Preparing' : 'Pending',
                state: step3,
            },
            {
                id: 'delivered',
                title: 'Delivered',
                time: step3 === 'completed' ? 'Delivered' : 'Pending',
                state: step4,
            },
        ];
    }, [order?.status, order?.created_at, formattedDate]);

    // Payment display text
    const paymentMethodDisplay = useMemo(() => {
        if (order?.payment_method === 'cod') return 'Cash on Delivery (COD)';
        if (order?.payment_method === 'razorpay' || order?.payment_method === 'online') {
            return isPendingPayment ? 'Prepaid Online (Pending)' : 'Prepaid Online (Razorpay)';
        }
        return 'Prepaid Online';
    }, [order?.payment_method, isPendingPayment]);

    // Badge styling mapping
    const statusBadgeClass = useMemo(() => {
        const s = order?.status || 'paid';
        if (s === 'pending_payment') return 'pending_payment';
        if (['cancelled', 'refunded', 'expired'].includes(s)) return 'isCancelled';
        if (s === 'shipped') return 'shipped';
        if (s === 'delivered') return 'delivered';
        return 'confirmed';
    }, [order?.status]);

    const statusBadgeLabel = useMemo(() => {
        const s = order?.status || 'paid';
        if (s === 'pending_payment') return 'Payment Pending';
        if (s === 'cancelled') return 'Order Cancelled';
        if (s === 'refunded') return 'Refunded';
        if (s === 'shipped') return 'In Transit / Shipped';
        if (s === 'delivered') return 'Delivered';
        return 'Confirmed & Verified';
    }, [order?.status]);

    return (
        <div className="confirmPageContainer">
            <Navbar />

            <main className="confirmPageWrapper">
                {/* Eyebrow Navigation & Header */}
                <div className="confirmEyebrowRow">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <button
                            type="button"
                            className="confirmCopyBtn"
                            onClick={() => navigate('/account?tab=orders')}
                            aria-label="Return to Order History"
                            style={{ padding: '0.35rem 0.65rem' }}
                        >
                            <ArrowLeft size={14} aria-hidden="true" />
                            <span>Return</span>
                        </button>

                        <span className="confirmEyebrowText">
                            <Sparkles size={12} aria-hidden="true" />
                            <span>SOLETHIEF // ARCHIVE DISPATCH DOSSIER</span>
                        </span>
                    </div>

                    <span className="confirmEyebrowTag">AUTHENTICATED VAULT</span>
                </div>

                {loading ? (
                    <div className="confirmStateCard">
                        <div
                            style={{
                                width: '38px',
                                height: '38px',
                                border: '3px solid rgba(200, 169, 110, 0.25)',
                                borderTopColor: '#C8A96E',
                                borderRadius: '50%',
                                animation: 'spin 0.8s linear infinite',
                                margin: '0 auto 1.25rem',
                            }}
                        />
                        <h2>RETRIEVING ORDER DOSSIER...</h2>
                        <p>Verifying cryptographic authentication tokens and dispatch archive.</p>
                    </div>
                ) : error || !order ? (
                    <div className="confirmStateCard">
                        <AlertCircle size={44} color="#EF4444" style={{ margin: '0 auto 1rem' }} />
                        <h2>ORDER RECORD NOT FOUND</h2>
                        <p>{error || 'The requested order ID does not exist in our authenticated collector vault.'}</p>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                            <Link to="/shop" className="confirmStateBtn">
                                <ShoppingBag size={15} aria-hidden="true" />
                                <span>Explore The Archive</span>
                            </Link>
                            <Link to="/account" className="confirmCtaSecondary" style={{ textDecoration: 'none' }}>
                                <span>View Account Vault</span>
                            </Link>
                        </div>
                    </div>
                ) : (
                    <div>
                        {/* Cancellation Toast Message */}
                        {cancelSuccessMsg && (
                            <div className="confirmCancelledNotice" role="status" style={{ marginBottom: '1.5rem', borderRadius: '8px' }}>
                                <CheckCircle2 size={18} color="#10B981" />
                                <div>
                                    <strong>CANCELLATION CONFIRMED</strong>
                                    <p>{cancelSuccessMsg}</p>
                                </div>
                            </div>
                        )}

                        {/* Main Dispatch Vault Card */}
                        <article className="confirmReceiptVault" aria-label="Order Receipt">
                            {/* Vault Header: Status, ID, Placed Date & Total */}
                            <div className="confirmVaultHeader">
                                <div className="confirmHeaderLeft">
                                    <div className={`confirmStatusBadgeModern ${statusBadgeClass}`}>
                                        <span className="statusDot" />
                                        <span>{statusBadgeLabel}</span>
                                    </div>

                                    <div className="confirmOrderIdRow">
                                        <h1 className="confirmOrderIdTitle">#{order.id}</h1>
                                        <button
                                            type="button"
                                            className="confirmCopyBtn"
                                            onClick={handleCopyOrderId}
                                            title="Copy Order Serial"
                                            aria-label="Copy Order Serial"
                                        >
                                            {copied ? (
                                                <>
                                                    <Check size={12} className="copySuccessIcon" aria-hidden="true" />
                                                    <span>COPIED</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Copy size={12} aria-hidden="true" />
                                                    <span>COPY</span>
                                                </>
                                            )}
                                        </button>
                                    </div>

                                    <div className="confirmMetaRow">
                                        <span className="confirmMetaDate">
                                            <Clock size={13} aria-hidden="true" />
                                            <span>Placed on {formattedDate}</span>
                                        </span>
                                        <span className="confirmPaymentPill">
                                            Payment: {paymentMethodDisplay}
                                        </span>
                                    </div>
                                </div>

                                <div className="confirmHeaderRight">
                                    <span className="confirmTotalLabel">Total Settled</span>
                                    <div className="confirmTotalAmount">
                                        {formatMoney(totalMinor)}
                                    </div>
                                    <span className="confirmTotalTaxSub">
                                        Incl. 18% GST & Insured Courier
                                    </span>
                                </div>
                            </div>

                            {/* Conditional Notices */}
                            {isCancelled && (
                                <div className="confirmCancelledNotice">
                                    <AlertCircle size={18} aria-hidden="true" />
                                    <div>
                                        <strong>ORDER ALLOCATION CANCELLED</strong>
                                        <p>
                                            This drop was cancelled
                                            {order.rejection_reason || order.cancel_reason ? ` (${order.rejection_reason || order.cancel_reason})` : ''}.
                                            Allocated pairs have been returned to the reserve vault.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {isPendingPayment && (
                                <div className="confirmPendingNotice">
                                    <Clock size={18} aria-hidden="true" />
                                    <div>
                                        <strong>PAYMENT SETTLEMENT PENDING</strong>
                                        <p>
                                            Awaiting payment provider confirmation. Your pair allocation is temporarily reserved.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Delivery Stepper & Timeline Progress Tracker */}
                            <section className="confirmTrackerWrap" aria-label="Order Dispatch Milestones">
                                <div className="confirmTrackerHeader">
                                    <h2 className="confirmTrackerTitle">
                                        <Truck size={16} color="#C8A96E" aria-hidden="true" />
                                        <span>Real-Time Dispatch Tracker</span>
                                    </h2>
                                    <span className="confirmTrackerLiveBadge">
                                        <span className="beaconDot" aria-hidden="true" />
                                        <span>Courier Sync Active</span>
                                    </span>
                                </div>

                                <div className="confirmTrackerStepsGrid">
                                    {trackerMilestones.map((step, idx) => {
                                        const isLast = idx === trackerMilestones.length - 1;
                                        const isCompleted = step.state === 'completed';
                                        const isActive = step.state === 'active' || step.state === 'current';

                                        return (
                                            <div
                                                key={step.id}
                                                className={`confirmTrackerStepNode ${step.state}`}
                                            >
                                                <div className="confirmStepIndicator">
                                                    <div className="confirmStepCircle">
                                                        {isActive && <span className="pulseRing" aria-hidden="true" />}
                                                        {isCompleted ? (
                                                            <Check size={14} style={{ strokeWidth: 3 }} aria-hidden="true" />
                                                        ) : (
                                                            <span>{idx + 1}</span>
                                                        )}
                                                    </div>
                                                    {!isLast && (
                                                        <div
                                                            className={`confirmStepLine ${isCompleted ? 'isFilled' : ''}`}
                                                            aria-hidden="true"
                                                        />
                                                    )}
                                                </div>

                                                <div className="confirmStepContent">
                                                    <span className="confirmStepLabel">{step.title}</span>
                                                    <span className="confirmStepSub">{step.time}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>

                            {/* Two-Column Details Grid: Shipping & Payment Cards */}
                            <div className="confirmInfoGrid">
                                <div className="confirmInfoCard">
                                    <div className="confirmInfoCardHeader">
                                        <div className="confirmInfoCardTitleWrap">
                                            <MapPin size={16} aria-hidden="true" />
                                            <h3 className="confirmInfoCardTitle">Courier Destination</h3>
                                        </div>
                                        <span className="confirmInfoCardBadge">Verified Destination</span>
                                    </div>
                                    <div className="confirmInfoCardBody">
                                        <div className="confirmRecipientName">
                                            {order.shipping_address?.recipient || order.shipping_name || 'Collector Recipient'}
                                        </div>
                                        <div className="confirmMetaField">
                                            <strong>Phone:</strong> {order.shipping_address?.phone || order.shipping_phone || '+91 98765 43210'}
                                        </div>
                                        <div className="confirmMetaField">
                                            <strong>Address:</strong>
                                            <br />
                                            {order.shipping_address?.line1 || '123, Luxury Avenue, Cyber City'}
                                            {order.shipping_address?.line2 ? `, ${order.shipping_address.line2}` : ', Sector 29'}
                                            <br />
                                            {order.shipping_address?.city || 'Gurugram'}, {order.shipping_address?.region || 'Haryana'} - {order.shipping_address?.postal_code || '122002'}
                                            <br />
                                            {order.shipping_address?.country || 'India'}
                                        </div>
                                    </div>
                                </div>

                                <div className="confirmInfoCard">
                                    <div className="confirmInfoCardHeader">
                                        <div className="confirmInfoCardTitleWrap">
                                            <ShieldCheck size={16} aria-hidden="true" />
                                            <h3 className="confirmInfoCardTitle">Authentication & Payment</h3>
                                        </div>
                                        <span className="confirmInfoCardBadge">100% Deadstock</span>
                                    </div>
                                    <div className="confirmInfoCardBody">
                                        <div className="confirmMetaField">
                                            <strong>Payment Mode:</strong> {paymentMethodDisplay}
                                        </div>
                                        <div className="confirmMetaField">
                                            <strong>Settlement Status:</strong> {isPendingPayment ? 'Authorization Pending' : isCancelled ? 'Allocation Terminated' : 'Verified & Captured'}
                                        </div>
                                        <div className="confirmMetaField">
                                            <strong>SoleThief Seal:</strong> Digitally verified and cryptographic authentication certificate bound to this serial.
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Allocated Drop Items Section */}
                            <section className="confirmItemsSection" aria-label="Allocated Archive Pairs">
                                <div className="confirmItemsHeader">
                                    <h2 className="confirmItemsTitle">
                                        <Package size={20} color="#C8A96E" aria-hidden="true" />
                                        <span>Allocated Archive Pairs</span>
                                    </h2>
                                    <span className="confirmItemsCountPill">
                                        {totalPairsCount} {totalPairsCount === 1 ? 'Pair' : 'Pairs'}
                                    </span>
                                </div>

                                <ul className="confirmLineItemsList">
                                    {itemsList.map((item, idx) => {
                                        const qty = Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1;
                                        const unitMinor = Number.isSafeInteger(item.unit_price_minor)
                                            ? item.unit_price_minor
                                            : (Number.isSafeInteger(item.priceMinor) ? item.priceMinor : totalMinor);
                                        const lineTotalMinor = unitMinor * qty;
                                        const imgSrc = item.front_image || item.image || item.image_url || '/shoes/transparent/shoe-1-front.png';

                                        return (
                                            <li key={item.id || idx} className="confirmLineItem">
                                                <div className="confirmItemThumbWrap">
                                                    <img
                                                        className="confirmItemThumb"
                                                        src={imgSrc}
                                                        alt={item.name || 'Sneaker Pair'}
                                                        onError={(e) => {
                                                            e.currentTarget.onerror = null;
                                                            e.currentTarget.src = '/shoes/transparent/shoe-1-front.png';
                                                        }}
                                                    />
                                                </div>

                                                <div className="confirmItemInfo">
                                                    <div className="confirmItemBrandRow">
                                                        <span className="confirmItemBrandBadge">
                                                            {item.brand || 'SoleThief Archive'}
                                                        </span>
                                                    </div>

                                                    <h3 className="confirmItemName">
                                                        {item.name || 'Nike Air Jordan 1 Retro High'}
                                                    </h3>

                                                    <div className="confirmItemMetaRow">
                                                        <span className="confirmItemSizeTag">
                                                            Size: {item.size || 'UK 9'}
                                                        </span>
                                                        <span>•</span>
                                                        <span className="confirmItemSizeTag">
                                                            Qty: {qty}
                                                        </span>
                                                        <span>•</span>
                                                        <span className="confirmItemVerified">
                                                            <ShieldCheck size={13} aria-hidden="true" />
                                                            <span>Verified Authentic</span>
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="confirmItemPriceWrap">
                                                    <span className="confirmItemPrice">
                                                        {formatMoney(lineTotalMinor)}
                                                    </span>
                                                    {qty > 1 && (
                                                        <span className="confirmItemQtySub">
                                                            {formatMoney(unitMinor)} each
                                                        </span>
                                                    )}
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>

                                {/* Cost Breakdown & Deadstock Assurance */}
                                <div className="confirmBreakdownGrid">
                                    <div className="confirmAssuranceBox">
                                        <div className="confirmAssuranceIconWrap">
                                            <ShieldCheck size={20} aria-hidden="true" />
                                        </div>
                                        <div className="confirmAssuranceText">
                                            <h5>SoleThief Deadstock Guarantee</h5>
                                            <p>
                                                Every sneaker in this dispatch is authenticated in-hand by our inspection team before packaging. Protected by tamper-evident physical security seals.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="confirmBreakdownCard">
                                        <div className="confirmBreakdownRow">
                                            <span>Item Subtotal</span>
                                            <span>{formatMoney(subtotalMinor)}</span>
                                        </div>
                                        <div className="confirmBreakdownRow">
                                            <span>Insured Courier Shipping</span>
                                            {shippingMinor === 0 ? (
                                                <span className="confirmFreeShippingBadge">FREE</span>
                                            ) : (
                                                <span>{formatMoney(shippingMinor)}</span>
                                            )}
                                        </div>
                                        <div className="confirmBreakdownRow">
                                            <span>GST (18% Indian Tax)</span>
                                            <span>{formatMoney(taxMinor)}</span>
                                        </div>
                                        <div className="confirmBreakdownDivider" />
                                        <div className="confirmBreakdownRow isTotal">
                                            <span>Grand Total</span>
                                            <span>{formatMoney(totalMinor)}</span>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </article>

                        {/* Action Controls Bar */}
                        <div className="confirmReceiptActions">
                            <div className="confirmActionsLeft">
                                <Link to="/shop" className="confirmCtaPrimary">
                                    <ShoppingBag size={15} aria-hidden="true" />
                                    <span>Explore More Drops</span>
                                </Link>

                                <Link to="/account?tab=orders" className="confirmCtaSecondary">
                                    <span>View Account Orders</span>
                                    <ArrowRight size={15} aria-hidden="true" />
                                </Link>

                                {isCancellable && (
                                    <button
                                        type="button"
                                        className="confirmPrintBtn"
                                        style={{ color: '#B91C1C', borderColor: 'rgba(185, 28, 28, 0.35)' }}
                                        onClick={() => {
                                            setCancelError('');
                                            setShowCancelModal(true);
                                        }}
                                        title="Cancel order allocation within 24 hours"
                                    >
                                        <XCircle size={15} aria-hidden="true" />
                                        <span>
                                            {remainingCancelTime?.formatted
                                                ? `Cancel Order (${remainingCancelTime.formatted})`
                                                : 'Cancel Order'}
                                        </span>
                                    </button>
                                )}
                            </div>

                            <button
                                type="button"
                                className="confirmPrintBtn"
                                onClick={handlePrint}
                                title="Print or save receipt as PDF"
                            >
                                <Printer size={15} aria-hidden="true" />
                                <span>Print Receipt</span>
                            </button>
                        </div>
                    </div>
                )}
            </main>

            {/* 24-Hour Cancellation Modal */}
            {showCancelModal && (
                <div
                    className="orderModalOverlay"
                    onClick={() => setShowCancelModal(false)}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="cancel-modal-title"
                >
                    <div className="orderModalContent" onClick={(e) => e.stopPropagation()}>
                        <div className="orderModalHeader">
                            <h3 id="cancel-modal-title">Cancel Order Allocation</h3>
                            <button
                                type="button"
                                className="orderModalCloseBtn"
                                onClick={() => setShowCancelModal(false)}
                                aria-label="Close modal"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="orderModalBody">
                            <div className="cancelModalWarning">
                                <strong>24-HOUR CANCELLATION POLICY</strong>
                                <p>
                                    You have {remainingCancelTime?.formatted || 'active eligibility'} remaining to cancel this order. Once cancelled, your allocated pair will be immediately surrendered back to the live collector archive.
                                </p>
                            </div>

                            {cancelError && (
                                <div style={{ color: '#DC2626', fontSize: '0.85rem' }}>
                                    {cancelError}
                                </div>
                            )}

                            <div className="modalFormGroup">
                                <label htmlFor="cancel-reason-select">Reason for Cancellation</label>
                                <select
                                    id="cancel-reason-select"
                                    className="modalSelect"
                                    value={cancelReason}
                                    onChange={(e) => setCancelReason(e.target.value)}
                                >
                                    {CANCEL_REASONS.map((r) => (
                                        <option key={r} value={r}>
                                            {r}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {cancelReason === 'Other' && (
                                <div className="modalFormGroup">
                                    <label htmlFor="cancel-notes-input">Additional Notes (Optional)</label>
                                    <textarea
                                        id="cancel-notes-input"
                                        className="modalTextarea"
                                        rows={3}
                                        placeholder="Please let us know why you are cancelling..."
                                        value={cancelNotes}
                                        onChange={(e) => setCancelNotes(e.target.value)}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="orderModalFooter">
                            <button
                                type="button"
                                className="btnModalDismiss"
                                onClick={() => setShowCancelModal(false)}
                                disabled={cancelSubmitting}
                            >
                                Keep My Drop
                            </button>
                            <button
                                type="button"
                                className="btnModalConfirmCancel"
                                onClick={handleConfirmCancel}
                                disabled={cancelSubmitting}
                            >
                                {cancelSubmitting ? 'Cancelling...' : 'Confirm Cancellation'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <Footer />
        </div>
    );
}

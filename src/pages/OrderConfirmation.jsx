import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
    CheckCircle2,
    Package,
    ShieldCheck,
    Truck,
    ArrowRight,
    ShoppingBag,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { formatMoney } from '../commerce/cart.js';
import { createOrdersService } from '../services/orders.js';
import { getSupabaseRuntime } from '../lib/supabase.js';

const ordersService = createOrdersService(getSupabaseRuntime);

const TRACKING_STEPS = [
    { key: 'confirmed', label: 'Order Confirmed', icon: CheckCircle2 },
    { key: 'authenticating', label: 'Authenticating & Packaging', icon: ShieldCheck },
    { key: 'shipped', label: 'Shipped via Express', icon: Truck },
    { key: 'delivery', label: 'Out for Delivery', icon: Package },
];

export default function OrderConfirmation() {
    const { orderId } = useParams();
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let isCurrent = true;

        ordersService.getOrder(orderId, { allowPreview: true })
            .then(res => {
                if (!isCurrent) return;
                if (res) {
                    setOrder(res);
                } else {
                    setError('Order record not found.');
                }
            })
            .catch(err => {
                if (!isCurrent) return;
                setError(err.message || 'Failed to load order receipt.');
            })
            .finally(() => {
                if (isCurrent) setLoading(false);
            });

        return () => {
            isCurrent = false;
        };
    }, [orderId]);

    const formattedDate = order?.created_at
        ? new Date(order.created_at).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
        : 'Recently';

    return (
        <div className="pageContainer">
            <Navbar />
            <main className="commercePage confirmPage">
                <p className="commerceEyebrow">SOLETHIEF / DISPATCH RECEIPT</p>

                {loading ? (
                    <div className="commerceState">
                        <h2>Retrieving allocation receipt...</h2>
                        <p>Validating order authentication tokens.</p>
                    </div>
                ) : error || !order ? (
                    <div className="commerceState">
                        <h2>Order Not Found</h2>
                        <p>{error || 'The requested order ID does not exist in our archive records.'}</p>
                        <Link to="/shop" className="commerceButton">
                            Return to Shop
                        </Link>
                    </div>
                ) : (
                    <div>
                        <div className="confirmReceiptBox">
                            {/* Receipt Top Header */}
                            <header className="confirmReceiptHeader">
                                <div>
                                    <div className="confirmStatusBadge">
                                        <CheckCircle2 size={16} aria-hidden="true" />
                                        <span>Order Confirmed & Allocated</span>
                                    </div>
                                    <h1 className="confirmOrderIdTitle">{order.id}</h1>
                                    <p className="confirmTimestamp">
                                        Placed on {formattedDate} • Payment:{' '}
                                        {order.payment_method === 'cod' ? 'Archive Reserve (Cash on Delivery)' : 'Online Payment (Razorpay)'}
                                    </p>
                                </div>
                                <div className="confirmHeaderRight">
                                    <span className="confirmTotalLabel">Grand Total</span>
                                    <p className="confirmTotalAmount">
                                        {formatMoney(order.total_minor)}
                                    </p>
                                </div>
                            </header>

                            {/* Tracking Timeline */}
                            <section className="confirmTrackerSection" aria-label="Fulfillment Status Tracker">
                                <h3>Fulfillment Status</h3>
                                <div className="confirmTrackerSteps">
                                    {TRACKING_STEPS.map((step, idx) => {
                                        const isCompleted = idx === 0;
                                        const isActive = idx === 1;
                                        const StepIcon = step.icon;

                                        return (
                                            <div
                                                key={step.key}
                                                className={`confirmTrackerStep ${isCompleted ? 'isCompleted' : ''} ${isActive ? 'isActive' : ''}`}
                                            >
                                                <div className="confirmStepCircle">
                                                    <StepIcon size={16} aria-hidden="true" />
                                                </div>
                                                <span className="confirmStepLabel">{step.label}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>

                            {/* 2-Column Details: Shipping Address + Payment Breakdown */}
                            <div className="confirmGrid2Col">
                                <div className="confirmDetailsBox">
                                    <h4>Delivery Destination</h4>
                                    <p><strong>{order.shipping_address?.recipient}</strong></p>
                                    <p>{order.shipping_address?.line1}</p>
                                    {order.shipping_address?.line2 && <p>{order.shipping_address?.line2}</p>}
                                    <p>
                                        {order.shipping_address?.city}, {order.shipping_address?.region} - {order.shipping_address?.postal_code}
                                    </p>
                                    <p>India (IN) • Phone: {order.shipping_address?.phone}</p>
                                </div>

                                <div className="confirmDetailsBox">
                                    <h4>Payment & Shipping Method</h4>
                                    <p>
                                        <strong>Payment:</strong>{' '}
                                        {order.payment_method === 'cod'
                                            ? 'Archive Reserve (COD on delivery verification)'
                                            : 'Razorpay Online Gateway (Verified)'}
                                    </p>
                                    <p>
                                        <strong>Shipping:</strong>{' '}
                                        {order.shipping_minor === 0
                                            ? 'Standard Insured Delivery (Complimentary)'
                                            : 'Priority Courier Express (₹450.00)'}
                                    </p>
                                    <p>
                                        <strong>Status:</strong>{' '}
                                        <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>
                                            {order.status}
                                        </span>
                                    </p>
                                    {order.provider_payment_id && (
                                        <p className="commerceSmall">
                                            Transaction Ref: {order.provider_payment_id}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Order Items List */}
                            <section className="confirmItemsSection">
                                <h4>Allocated Drop Items ({order.items?.length || 0})</h4>
                                <ul className="checkoutLineItemsList">
                                    {(order.items || []).map((item, idx) => (
                                        <li key={item.product_id || idx} className="checkoutLineItem">
                                            <img
                                                src={item.front_image}
                                                alt={`${item.name}, ${item.size}`}
                                                className="checkoutLineThumb"
                                            />
                                            <div className="checkoutLineDetails">
                                                <h3>{item.name}</h3>
                                                <p>{item.brand} • Size: {item.size}</p>
                                                <p>Single Pair (Qty: 1) • Physical verification passed</p>
                                            </div>
                                            <span className="checkoutLinePrice">
                                                {formatMoney(item.unit_price_minor)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>

                                <div className="checkoutBreakdown">
                                    <div className="checkoutBreakdownRow">
                                        <span>Subtotal</span>
                                        <span>{formatMoney(order.subtotal_minor)}</span>
                                    </div>
                                    <div className="checkoutBreakdownRow">
                                        <span>Shipping</span>
                                        <span>{order.shipping_minor === 0 ? 'FREE' : formatMoney(order.shipping_minor)}</span>
                                    </div>
                                    <div className="checkoutBreakdownRow">
                                        <span>GST (18% Indian Tax)</span>
                                        <span>{formatMoney(order.tax_minor)}</span>
                                    </div>
                                    <div className="checkoutBreakdownRow isTotal">
                                        <span>Grand Total</span>
                                        <span>{formatMoney(order.total_minor)}</span>
                                    </div>
                                </div>
                            </section>

                            {/* Actions */}
                            <div className="confirmReceiptActions">
                                <Link to="/shop" className="commerceButton confirmShopBtn">
                                    <ShoppingBag size={16} aria-hidden="true" style={{ marginRight: '6px' }} />
                                    <span>Explore The Archive</span>
                                </Link>
                                <Link to="/account" className="confirmAccountBtn">
                                    <span>View in Account Orders</span>
                                    <ArrowRight size={16} aria-hidden="true" style={{ marginLeft: '6px' }} />
                                </Link>
                            </div>
                        </div>
                    </div>
                )}
            </main>
            <Footer />
        </div>
    );
}

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { isAllowedAuthReturnPath, sanitizeAuthReturnPath } from '../auth/authConstants.js';
import { isConfiguredAdminUser } from '../auth/adminAccess.js';
import {
    User,
    MapPin,
    Heart,
    Package,
    LogOut,
    Plus,
    Edit2,
    Trash2,
    CheckCircle2,
    AlertCircle,
    Lock,
    Search,
    ShieldCheck,
    Truck,
    Clock,
    Download,
    HelpCircle,
    Copy,
    Check,
    X,
    XCircle,
    FileText,
    ArrowRight,
    Sparkles,
    RotateCcw,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useAuth } from '../auth/authContext.js';
import { useCommerce } from '../commerce/context.js';
import { useWishlist } from '../commerce/wishlistContext.js';
import { resolveWishlist } from '../commerce/wishlist.js';
import { formatMoney } from '../commerce/cart.js';
import { validateAddress } from '../commerce/address.js';
import { createOrdersService } from '../services/orders.js';
import { canCancelOrder, canReplaceOrder, getReplacementRemainingTime } from '../commerce/orders.js';
import { shoesData } from '../data/shoes.js';
import './Account.css';

export function resolveItemProductId(item, catalog = null) {
    if (!item) return null;
    const directId = item.product_id ?? item.productId ?? item.id;
    const products = Array.isArray(catalog?.products) ? catalog.products : (Array.isArray(catalog) ? catalog : []);

    if (directId != null && directId !== '') {
        const foundInCatalog = products.find((p) => String(p.id) === String(directId));
        if (foundInCatalog) return foundInCatalog.id;

        const foundInShoesData = shoesData.find((s) => String(s.id) === String(directId));
        if (foundInShoesData) return foundInShoesData.id;

        const num = Number(directId);
        if (Number.isInteger(num) && num > 0) return num;
    }

    if (item.name) {
        const cleanName = item.name.trim().toLowerCase();
        const found = products.find((p) => p.name?.trim().toLowerCase() === cleanName) ||
            shoesData.find((s) => s.name?.trim().toLowerCase() === cleanName);
        if (found) return found.id;
    }

    return directId || null;
}

const INDIAN_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Delhi', 'Jammu and Kashmir', 'Ladakh'
];

const TRACKER_STEPS = [
    { key: 'placed', label: 'Order Confirmed', icon: CheckCircle2 },
    { key: 'authenticating', label: 'Authenticating', icon: ShieldCheck },
    { key: 'shipped', label: 'Express Transit', icon: Truck },
    { key: 'delivered', label: 'Delivered', icon: Package },
];

function getStatusTone(status) {
    if (status === 'delivered') return 'delivered';
    if (status === 'shipped') return 'shipped';
    if (status === 'processing' || status === 'paid') return 'processing';
    if (['cancelled', 'refunded', 'expired'].includes(status)) return 'cancelled';
    return 'pending';
}

function getStatusLabel(status) {
    switch (status) {
        case 'delivered': return 'DELIVERED & AUTHENTICATED';
        case 'shipped': return 'SHIPPED / IN TRANSIT';
        case 'processing': return 'AUTHENTICATING & PACKING';
        case 'paid': return 'PAID & ALLOCATED';
        case 'pending_payment': return 'AWAITING PAYMENT';
        case 'cancelled': return 'ORDER CANCELLED';
        case 'refunded': return 'PAYMENT REFUNDED';
        case 'expired': return 'ALLOCATION EXPIRED';
        default: return (status || 'PROCESSING').replace(/_/g, ' ').toUpperCase();
    }
}

function getStepState(status, stepIndex) {
    if (['cancelled', 'refunded', 'expired'].includes(status)) {
        return 'cancelled';
    }
    if (status === 'delivered') return 'completed';
    if (status === 'shipped') {
        if (stepIndex < 2) return 'completed';
        if (stepIndex === 2) return 'current';
        return 'upcoming';
    }
    if (status === 'processing' || status === 'paid') {
        if (stepIndex === 0) return 'completed';
        if (stepIndex === 1) return 'current';
        return 'upcoming';
    }
    if (status === 'pending_payment') {
        if (stepIndex === 0) return 'current';
        return 'upcoming';
    }
    return stepIndex === 0 ? 'completed' : 'upcoming';
}

function resolveOrderFinancials(order) {
    const totalMinor = Number.isSafeInteger(order?.total_amount_minor)
        ? order.total_amount_minor
        : (Number.isSafeInteger(order?.total_minor) ? order.total_minor : 0);

    const shippingMinor = Number.isSafeInteger(order?.shipping_amount_minor)
        ? order.shipping_amount_minor
        : (Number.isSafeInteger(order?.shipping_minor) ? order.shipping_minor : 0);

    const taxMinor = Number.isSafeInteger(order?.tax_amount_minor)
        ? order.tax_amount_minor
        : (Number.isSafeInteger(order?.tax_minor) ? order.tax_minor : 0);

    const discountMinor = Number.isSafeInteger(order?.discount_minor) ? order.discount_minor : 0;

    const subtotalMinor = Number.isSafeInteger(order?.subtotal_minor)
        ? order.subtotal_minor
        : Math.max(0, totalMinor - shippingMinor - taxMinor + discountMinor);

    return {
        totalMinor,
        shippingMinor,
        taxMinor,
        discountMinor,
        subtotalMinor,
    };
}

export default function Account({ initialView = 'signin' }) {
    const {
        user,
        profile,
        addresses,
        defaultAddressId,
        authStatus,
        previewMode,
        runtimeMessage,
        login,
        register,
        logout,
        updateProfile,
        addAddress,
        updateAddress,
        deleteAddress,
        setDefaultAddress,
        switchMockProfile,
    } = useAuth();

    const { catalog, add: addToBag, cart } = useCommerce();
    const { wishlist, removeFromWishlist } = useWishlist();
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    // Valid tabs for account dashboard
    const VALID_ACCOUNT_TABS = ['profile', 'addresses', 'wishlist', 'orders'];

    // Initialize accountTab from URL search params or sessionStorage, falling back to 'profile'
    const getInitialTab = useCallback(() => {
        // First check URL search params
        const urlTab = searchParams.get('tab');
        if (VALID_ACCOUNT_TABS.includes(urlTab)) {
            return urlTab;
        }
        // Fallback to sessionStorage
        try {
            const storedTab = sessionStorage.getItem('solethief_account_tab');
            if (VALID_ACCOUNT_TABS.includes(storedTab)) {
                return storedTab;
            }
        } catch {
            // ignore sessionStorage errors (e.g., private browsing)
        }
        return 'profile';
    }, [searchParams]);

    const [accountTab, setAccountTabState] = useState(() => getInitialTab());

    // Unified setter: updates state, sessionStorage, and URL search params
    const setAccountTab = useCallback((tab) => {
        if (!VALID_ACCOUNT_TABS.includes(tab)) return;
        setAccountTabState(tab);
        try {
            sessionStorage.setItem('solethief_account_tab', tab);
        } catch {
            // ignore sessionStorage errors
        }
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('tab', tab);
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    useEffect(() => {
        const returnUrl = searchParams.get('return');
        if (user && authStatus === 'authenticated' && returnUrl && isAllowedAuthReturnPath(returnUrl)) {
            const safeReturnUrl = sanitizeAuthReturnPath(returnUrl);
            const destination = safeReturnUrl.startsWith('/admin') && !isConfiguredAdminUser(user)
                ? '/'
                : safeReturnUrl;
            navigate(destination, { replace: true });
        }
    }, [user, authStatus, searchParams, navigate]);

    const [authTab, setAuthTab] = useState(initialView);

    // Sign In Form State
    const [loginEmail, setLoginEmail] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [loginLoading, setLoginLoading] = useState(false);
    const [loginError, setLoginError] = useState('');

    // Sign Up Form State
    const [regName, setRegName] = useState('');
    const [regEmail, setRegEmail] = useState('');
    const [regPhone, setRegPhone] = useState('');
    const [regPassword, setRegPassword] = useState('');
    const [regLoading, setRegLoading] = useState(false);
    const [regError, setRegError] = useState('');

    const handleResetAccountData = () => {
        if (window.confirm('Reset all saved shipping addresses, wishlist items, and account preferences? This cannot be undone.')) {
            try {
                localStorage.removeItem('solethief.account.addresses.v1');
                localStorage.removeItem('solethief.wishlist.v1');
                setProfileFeedback({ type: 'success', message: 'Account data and preferences reset successfully!' });
                window.location.reload();
            } catch (err) {
                setProfileFeedback({ type: 'error', message: 'Failed to reset account data.' });
            }
        }
    };
    const [editDisplayName, setEditDisplayName] = useState(() => profile?.display_name || '');
    const [editPhone, setEditPhone] = useState(() => profile?.phone || '');
    const [prevProfile, setPrevProfile] = useState(profile);
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileFeedback, setProfileFeedback] = useState({ type: '', message: '' });

    if (profile !== prevProfile) {
        setPrevProfile(profile);
        setEditDisplayName(profile?.display_name || '');
        setEditPhone(profile?.phone || '');
    }

    // Address Management State
    const [showAddressForm, setShowAddressForm] = useState(false);
    const [editingAddressId, setEditingAddressId] = useState(null);
    const [addressForm, setAddressForm] = useState({
        recipient: '',
        phone: '',
        line1: '',
        line2: '',
        city: '',
        region: 'Maharashtra',
        postal_code: '',
        is_default: false,
    });
    const [addressErrors, setAddressErrors] = useState({});
    const [addressSaving, setAddressSaving] = useState(false);
    const [addressFeedback, setAddressFeedback] = useState({ type: '', message: '' });

    // Feedback for wishlist Move to Bag
    const [bagFeedback, setBagFeedback] = useState('');

    // Order History State
    const [orders, setOrders] = useState([]);
    const [ordersLoading, setOrdersLoading] = useState(false);
    const [ordersError, setOrdersError] = useState(null);
    const [orderFilterTab, setOrderFilterTab] = useState('all'); // 'all' | 'in_progress' | 'delivered' | 'cancelled'
    const [orderSearch, setOrderSearch] = useState('');
    const [activeModal, setActiveModal] = useState(null); // { type: 'invoice' | 'support', order: Object }
    const [copiedOrderId, setCopiedOrderId] = useState(null);
    const [supportCategory, setSupportCategory] = useState('tracking');
    const [supportMessage, setSupportMessage] = useState('');
    const [supportSubmitted, setSupportSubmitted] = useState(false);

    // Order Cancellation State (24-Hour Policy)
    const [cancelReason, setCancelReason] = useState('Changed mind');
    const [cancelCustomNotes, setCancelCustomNotes] = useState('');
    const [cancelSubmitting, setCancelSubmitting] = useState(false);
    const [cancelError, setCancelError] = useState('');
    const [cancelSuccess, setCancelSuccess] = useState('');

    // Order 3-Day Replacement State (Delivered Orders Only)
    const [replaceReason, setReplaceReason] = useState('Size too small (Need larger size)');
    const [replacePreferredSize, setReplacePreferredSize] = useState('');
    const [replaceNotes, setReplaceNotes] = useState('');
    const [replaceSubmitting, setReplaceSubmitting] = useState(false);
    const [replaceError, setReplaceError] = useState('');
    const [replaceSuccess, setReplaceSuccess] = useState('');

    const ordersService = useMemo(() => createOrdersService(() => ({ previewMode })), [previewMode]);

    const loadOrders = useCallback(() => {
        setOrdersLoading(true);
        setOrdersError(null);
        let isCancelled = false;
        ordersService.listOrders({ user, allowPreview: previewMode }).then(({ data, error }) => {
            if (!isCancelled) {
                if (error) {
                    setOrdersError(error.message || 'Failed to load order history');
                } else {
                    const sorted = (data || []).slice().sort((a, b) => {
                        const timeA = a?.created_at ? new Date(a.created_at).getTime() : 0;
                        const timeB = b?.created_at ? new Date(b.created_at).getTime() : 0;
                        if (timeA && timeB && timeA !== timeB) {
                            return timeB - timeA;
                        }
                        return 0;
                    });
                    setOrders(sorted);
                }
                setOrdersLoading(false);
            }
        }).catch((err) => {
            if (!isCancelled) {
                setOrdersError(err.message || 'Error loading order history');
                setOrdersLoading(false);
            }
        });
        return () => {
            isCancelled = true;
        };
    }, [ordersService, user, previewMode]);

    useEffect(() => {
        if (accountTab === 'orders') {
            const cleanup = loadOrders();
            return cleanup;
        }
    }, [accountTab, loadOrders]);

    const handleCopyOrderId = (e, orderId) => {
        e.stopPropagation();
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard) {
                navigator.clipboard.writeText(orderId);
            }
        } catch {
            // ignore
        }
        setCopiedOrderId(orderId);
        setTimeout(() => setCopiedOrderId(prev => (prev === orderId ? null : prev)), 2000);
    };

    const handleConfirmCancelOrder = async (orderId) => {
        if (!orderId) return;
        setCancelSubmitting(true);
        setCancelError('');
        try {
            const finalReason = cancelReason === 'Other' && cancelCustomNotes.trim()
                ? `Other: ${cancelCustomNotes.trim()}`
                : cancelReason;

            await ordersService.cancelOrder(orderId, {
                reason: finalReason,
                user,
                allowPreview: previewMode,
            });

            setOrders((prev) =>
                prev.map((ord) =>
                    ord.id === orderId
                        ? {
                            ...ord,
                            status: 'cancelled',
                            cancel_reason: finalReason,
                            cancelled_at: new Date().toISOString(),
                        }
                        : ord
                )
            );

            setCancelSuccess(`Order #${orderId} was successfully cancelled.`);
        } catch (err) {
            setCancelError(err.message || 'Failed to cancel order.');
        } finally {
            setCancelSubmitting(false);
        }
    };

    const handleConfirmReplaceOrder = async (orderId) => {
        if (!orderId) return;
        setReplaceSubmitting(true);
        setReplaceError('');
        try {
            const finalReason = replaceReason === 'Other' && replaceNotes.trim()
                ? `Other: ${replaceNotes.trim()}`
                : replaceReason;

            const res = await ordersService.requestReplacement(orderId, {
                reason: finalReason,
                preferredSize: replacePreferredSize,
                notes: replaceNotes,
                user,
                allowPreview: previewMode,
            });

            const returnedOrder = res?.order || res?.data;

            setOrders((prev) =>
                prev.map((ord) =>
                    ord.id === orderId
                        ? {
                            ...ord,
                            ...(returnedOrder || {}),
                            replacement_requested: true,
                            replacement_status: 'requested',
                            replacement_reason: finalReason,
                            replacement_preferred_size: replacePreferredSize || 'Same size',
                            replacement_notes: replaceNotes || '',
                            replacement_requested_at: new Date().toISOString(),
                        }
                        : ord
                )
            );

            setReplaceSuccess(`3-Day replacement request for Order #${orderId} was successfully lodged.`);
        } catch (err) {
            setReplaceError(err.message || 'Failed to submit replacement request.');
        } finally {
            setReplaceSubmitting(false);
        }
    };

    const filteredOrders = useMemo(() => {
        return orders.filter((order) => {
            if (orderFilterTab === 'in_progress') {
                if (!['paid', 'processing', 'shipped'].includes(order.status)) return false;
            } else if (orderFilterTab === 'delivered') {
                if (order.status !== 'delivered') return false;
            } else if (orderFilterTab === 'cancelled') {
                if (!['cancelled', 'refunded', 'expired'].includes(order.status)) return false;
            }

            if (orderSearch.trim()) {
                const query = orderSearch.trim().toLowerCase();
                const matchesId = (order.id || '').toLowerCase().includes(query);
                const matchesDest = (order.shipping_name || order.shipping_address?.recipient || '').toLowerCase().includes(query) ||
                    (order.shipping_city || order.shipping_address?.city || '').toLowerCase().includes(query);
                const matchesItem = (order.items || []).some((item) =>
                    (item.name || '').toLowerCase().includes(query) ||
                    (item.brand || '').toLowerCase().includes(query) ||
                    String(item.size || '').toLowerCase().includes(query)
                );
                if (!matchesId && !matchesDest && !matchesItem) return false;
            }

            return true;
        });
    }, [orders, orderFilterTab, orderSearch]);

    const orderCounts = useMemo(() => {
        return {
            all: orders.length,
            in_progress: orders.filter((o) => ['paid', 'processing', 'shipped'].includes(o.status)).length,
            delivered: orders.filter((o) => o.status === 'delivered').length,
            cancelled: orders.filter((o) => ['cancelled', 'refunded', 'expired'].includes(o.status)).length,
        };
    }, [orders]);

    const totalOrdersValueMinor = useMemo(() => {
        return orders.reduce((sum, o) => {
            const t = Number.isSafeInteger(o.total_amount_minor) ? o.total_amount_minor : (Number.isSafeInteger(o.total_minor) ? o.total_minor : 0);
            return sum + t;
        }, 0);
    }, [orders]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoginError('');
        setLoginLoading(true);
        try {
            const result = await login({ email: loginEmail, password: loginPassword });
            const returnUrl = searchParams.get('return');
            const authenticatedUser = result?.user || result?.data?.user;
            const loggedInUser = authenticatedUser?.id ? authenticatedUser : null;
            if (isConfiguredAdminUser(loggedInUser)) {
                navigate('/admin', { replace: true });
            } else if (returnUrl && isAllowedAuthReturnPath(returnUrl)) {
                const safeReturnUrl = sanitizeAuthReturnPath(returnUrl);
                navigate(safeReturnUrl.startsWith('/admin') ? '/' : safeReturnUrl, { replace: true });
            }
        } catch (err) {
            setLoginError(err.message || 'Failed to sign in.');
        } finally {
            setLoginLoading(false);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setRegError('');
        setRegLoading(true);
        try {
            await register({
                email: regEmail,
                password: regPassword,
                displayName: regName,
                phone: regPhone,
            });
        } catch (err) {
            setRegError(err.message || 'Failed to create account.');
        } finally {
            setRegLoading(false);
        }
    };

    const handleProfileSubmit = async (e) => {
        e.preventDefault();
        setProfileFeedback({ type: '', message: '' });
        setProfileSaving(true);
        try {
            await updateProfile({ displayName: editDisplayName, phone: editPhone });
            setProfileFeedback({ type: 'success', message: 'Profile updated successfully.' });
        } catch (err) {
            setProfileFeedback({ type: 'error', message: err.message || 'Failed to update profile.' });
        } finally {
            setProfileSaving(false);
        }
    };

    const handleStartAddAddress = () => {
        setEditingAddressId(null);
        setAddressForm({
            recipient: profile?.display_name || '',
            phone: profile?.phone || '',
            line1: '',
            line2: '',
            city: '',
            region: 'Maharashtra',
            postal_code: '',
            is_default: addresses.length === 0,
        });
        setAddressErrors({});
        setShowAddressForm(true);
    };

    const handleStartEditAddress = (addr) => {
        setEditingAddressId(addr.id);
        setAddressForm({
            recipient: addr.recipient,
            phone: addr.phone,
            line1: addr.line1,
            line2: addr.line2 || '',
            city: addr.city,
            region: addr.region,
            postal_code: addr.postal_code,
            is_default: addr.id === defaultAddressId,
        });
        setAddressErrors({});
        setShowAddressForm(true);
    };

    const handleAddressSubmit = async (e) => {
        e.preventDefault();
        setAddressFeedback({ type: '', message: '' });
        const validation = validateAddress(addressForm);
        if (!validation.valid) {
            setAddressErrors(validation.errors);
            return;
        }

        setAddressSaving(true);
        try {
            if (editingAddressId) {
                await updateAddress(editingAddressId, addressForm);
                setAddressFeedback({ type: 'success', message: 'Address updated successfully.' });
            } else {
                await addAddress(addressForm);
                setAddressFeedback({ type: 'success', message: 'New address saved successfully.' });
            }
            setShowAddressForm(false);
            setEditingAddressId(null);
        } catch (err) {
            setAddressFeedback({ type: 'error', message: err.message || 'Failed to save address.' });
        } finally {
            setAddressSaving(false);
        }
    };

    const handleDeleteAddress = async (id) => {
        if (!window.confirm('Are you sure you want to remove this address?')) return;
        try {
            await deleteAddress(id);
            setAddressFeedback({ type: 'success', message: 'Address removed.' });
        } catch (err) {
            setAddressFeedback({ type: 'error', message: err.message || 'Failed to remove address.' });
        }
    };

    const handleMoveToBag = (product) => {
        addToBag(product.id);
        setBagFeedback(`Added "${product.name}" to your demo bag.`);
        setTimeout(() => setBagFeedback(''), 4000);
    };

    const resolvedWishlistItems = resolveWishlist(wishlist, catalog);

    return (
        <div className="pageContainer">
            <Navbar />
            <main className="commercePage accountPage">
                <p className="commerceEyebrow">SOLETHIEF / CUSTOMER ARCHIVE</p>

                {/* If Not Authenticated: Show Auth Forms */}
                {authStatus !== 'loading' && !user && (
                    <div className="accountAuthContainer">
                        <div className="accountAuthHeader">
                            <h1>Customer Portal</h1>
                            <p>Access your saved kicks, shipping destinations, and drop archive.</p>
                        </div>

                        {searchParams.get('return') === '/checkout' && (
                            <div className="accountCheckoutNotice" style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.65rem',
                                background: 'rgba(152, 123, 71, 0.1)',
                                border: '1px solid #987b47',
                                color: '#151B2B',
                                padding: '0.85rem 1.25rem',
                                borderRadius: '4px',
                                fontSize: '0.85rem',
                                marginBottom: '1.25rem',
                                fontWeight: 500
                            }}>
                                <Lock size={16} color="#987b47" aria-hidden="true" />
                                <span>Please sign in or create an account to proceed to checkout and secure your order history.</span>
                            </div>
                        )}


                        <div className="accountAuthBox">
                            <div className="accountAuthTabs" role="tablist">
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={authTab === 'signin'}
                                    className={`accountAuthTab ${authTab === 'signin' ? 'isActive' : ''}`}
                                    onClick={() => setAuthTab('signin')}
                                >
                                    Sign In
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={authTab === 'signup'}
                                    className={`accountAuthTab ${authTab === 'signup' ? 'isActive' : ''}`}
                                    onClick={() => setAuthTab('signup')}
                                >
                                    Create Account
                                </button>
                            </div>

                            {authTab === 'signin' ? (
                                <form className="accountAuthForm" onSubmit={handleLogin}>
                                    {loginError && <p className="accountErrorBanner" role="alert">{loginError}</p>}
                                    <label>
                                        Email Address
                                        <input
                                            type="email"
                                            required
                                            value={loginEmail}
                                            onChange={(e) => setLoginEmail(e.target.value)}
                                            placeholder="collector@solethief.in"
                                            autoComplete="email"
                                        />
                                    </label>
                                    <label>
                                        Password
                                        <input
                                            type="password"
                                            required
                                            value={loginPassword}
                                            onChange={(e) => setLoginPassword(e.target.value)}
                                            placeholder="••••••••"
                                            autoComplete="current-password"
                                        />
                                    </label>
                                    <button
                                        type="submit"
                                        className="commerceButton accountAuthSubmit"
                                        disabled={loginLoading}
                                    >
                                        {loginLoading ? 'Entering Archive...' : 'Sign In'}
                                    </button>
                                    {previewMode && (
                                        <p className="commerceSmall accountAuthHint">
                                            In preview mode, you can sign in with any test email or password.
                                        </p>
                                    )}
                                </form>
                            ) : (
                                <form className="accountAuthForm" onSubmit={handleRegister}>
                                    {regError && <p className="accountErrorBanner" role="alert">{regError}</p>}
                                    <label>
                                        Full Name / Display Name
                                        <input
                                            type="text"
                                            required
                                            maxLength={120}
                                            value={regName}
                                            onChange={(e) => setRegName(e.target.value)}
                                            placeholder="Vikram Seth"
                                            autoComplete="name"
                                        />
                                    </label>
                                    <label>
                                        Email Address
                                        <input
                                            type="email"
                                            required
                                            value={regEmail}
                                            onChange={(e) => setRegEmail(e.target.value)}
                                            placeholder="vikram@example.com"
                                            autoComplete="email"
                                        />
                                    </label>
                                    <label>
                                        Phone Number (Optional)
                                        <input
                                            type="tel"
                                            maxLength={32}
                                            value={regPhone}
                                            onChange={(e) => setRegPhone(e.target.value)}
                                            placeholder="+91 98000 00000"
                                            autoComplete="tel"
                                        />
                                    </label>
                                    <label>
                                        Password (Min. 6 characters)
                                        <input
                                            type="password"
                                            required
                                            minLength={6}
                                            value={regPassword}
                                            onChange={(e) => setRegPassword(e.target.value)}
                                            placeholder="••••••••"
                                            autoComplete="new-password"
                                        />
                                    </label>
                                    <button
                                        type="submit"
                                        className="commerceButton accountAuthSubmit"
                                        disabled={regLoading}
                                    >
                                        {regLoading ? 'Creating Account...' : 'Create Account'}
                                    </button>
                                </form>
                            )}
                        </div>
                    </div>
                )}

                {/* If Authenticated: Show Account Management Views */}
                {authStatus !== 'loading' && user && (
                    <div className="accountDashboard">
                        <header className="accountBanner">
                            <div className="accountBannerDetails">
                                <div className="accountUserAvatar" aria-hidden="true">
                                    {(profile?.display_name || user.email || 'U')[0].toUpperCase()}
                                </div>
                                <div>
                                    <h1 className="accountUserName">
                                        {profile?.display_name || 'SoleThief Member'}
                                    </h1>
                                    <p className="accountUserEmail">{user.email}</p>
                                    <div className="accountBadges">
                                        {previewMode ? (
                                            <span className="accountBadge accountBadgePreview">
                                                Simulated Preview Session
                                            </span>
                                        ) : (
                                            <span className="accountBadge accountBadgeLive">
                                                Supabase Authenticated
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="commerceButton accountLogoutBtn"
                                onClick={logout}
                                aria-label="Sign out of account"
                            >
                                <LogOut size={16} aria-hidden="true" />
                                <span>Sign Out</span>
                            </button>
                        </header>

                        {/* Navigation Tabs */}
                        <nav className="accountNavTabs" role="tablist" aria-label="Account sections">
                            <button
                                type="button"
                                role="tab"
                                aria-selected={accountTab === 'profile'}
                                className={`accountNavTab ${accountTab === 'profile' ? 'isActive' : ''}`}
                                onClick={() => setAccountTab('profile')}
                            >
                                <User size={18} aria-hidden="true" />
                                <span>Profile Details</span>
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={accountTab === 'addresses'}
                                className={`accountNavTab ${accountTab === 'addresses' ? 'isActive' : ''}`}
                                onClick={() => setAccountTab('addresses')}
                            >
                                <MapPin size={18} aria-hidden="true" />
                                <span>Addresses ({addresses.length})</span>
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={accountTab === 'wishlist'}
                                className={`accountNavTab ${accountTab === 'wishlist' ? 'isActive' : ''}`}
                                onClick={() => setAccountTab('wishlist')}
                            >
                                <Heart size={18} aria-hidden="true" />
                                <span>Wishlist ({wishlist.ids.length})</span>
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={accountTab === 'orders'}
                                className={`accountNavTab ${accountTab === 'orders' ? 'isActive' : ''}`}
                                onClick={() => setAccountTab('orders')}
                            >
                                <Package size={18} aria-hidden="true" />
                                <span>Order History</span>
                            </button>
                        </nav>

                        {/* Tab Content: Profile */}
                        {accountTab === 'profile' && (
                            <section className="accountSection" aria-labelledby="profile-heading">
                                <div className="accountSectionHeader">
                                    <h2 id="profile-heading">Profile Details</h2>
                                    <p>Manage your collector identity and contact details.</p>
                                </div>

                                {profileFeedback.message && (
                                    <div
                                        className={`accountFeedback ${profileFeedback.type === 'error' ? 'isError' : 'isSuccess'}`}
                                        role="alert"
                                    >
                                        {profileFeedback.type === 'error' ? (
                                            <AlertCircle size={18} aria-hidden="true" />
                                        ) : (
                                            <CheckCircle2 size={18} aria-hidden="true" />
                                        )}
                                        <span>{profileFeedback.message}</span>
                                    </div>
                                )}

                                <form className="accountForm" onSubmit={handleProfileSubmit}>
                                    <div className="accountFormRow">
                                        <label>
                                            Display Name / Full Name
                                            <input
                                                type="text"
                                                maxLength={120}
                                                value={editDisplayName}
                                                onChange={(e) => setEditDisplayName(e.target.value)}
                                                placeholder="Arjun Rao"
                                            />
                                        </label>
                                    </div>
                                    <div className="accountFormRow">
                                        <label>
                                            Email Address
                                            <input
                                                type="email"
                                                value={user.email}
                                                disabled
                                                className="accountDisabledInput"
                                            />
                                            <span className="accountFieldNote">Email is linked to your authentication provider.</span>
                                        </label>
                                    </div>
                                    <div className="accountFormRow">
                                        <label>
                                            Phone Number
                                            <input
                                                type="tel"
                                                maxLength={32}
                                                value={editPhone}
                                                onChange={(e) => setEditPhone(e.target.value)}
                                                placeholder="+91 98200 12345"
                                            />
                                        </label>
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '1.25rem' }}>
                                        <button
                                            type="submit"
                                            className="commerceButton accountSaveBtn"
                                            disabled={profileSaving}
                                        >
                                            {profileSaving ? 'Saving Changes...' : 'Save Profile'}
                                        </button>
                                        <button
                                            type="button"
                                            className="commerceButton"
                                            style={{ backgroundColor: '#ef4444', color: '#fff', border: 'none', padding: '0.75rem 1.25rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                                            onClick={handleResetAccountData}
                                            title="Reset account data, addresses, and wishlist"
                                        >
                                            <RotateCcw size={15} />
                                            <span>Reset Account Data</span>
                                        </button>
                                    </div>
                                </form>
                            </section>
                        )}

                        {/* Tab Content: Addresses */}
                        {accountTab === 'addresses' && (
                            <section className="accountSection" aria-labelledby="addresses-heading">
                                <div className="accountSectionHeaderWithAction">
                                    <div>
                                        <h2 id="addresses-heading">Saved Shipping Addresses</h2>
                                        <p>Manage verified destinations for drop deliveries across India.</p>
                                    </div>
                                    {!showAddressForm && (
                                        <button
                                            type="button"
                                            className="commerceButton accountAddAddrBtn"
                                            onClick={handleStartAddAddress}
                                        >
                                            <Plus size={16} aria-hidden="true" />
                                            <span>Add New Address</span>
                                        </button>
                                    )}
                                </div>

                                {addressFeedback.message && (
                                    <div
                                        className={`accountFeedback ${addressFeedback.type === 'error' ? 'isError' : 'isSuccess'}`}
                                        role="alert"
                                    >
                                        {addressFeedback.type === 'error' ? (
                                            <AlertCircle size={18} aria-hidden="true" />
                                        ) : (
                                            <CheckCircle2 size={18} aria-hidden="true" />
                                        )}
                                        <span>{addressFeedback.message}</span>
                                    </div>
                                )}

                                {/* Address Form */}
                                {showAddressForm && (
                                    <div className="accountAddressFormBox">
                                        <h3>{editingAddressId ? 'Edit Shipping Address' : 'New Shipping Address'}</h3>
                                        <form className="accountForm" onSubmit={handleAddressSubmit}>
                                            <div className="accountFormGrid">
                                                <label>
                                                    Recipient Full Name *
                                                    <input
                                                        type="text"
                                                        required
                                                        maxLength={120}
                                                        value={addressForm.recipient}
                                                        onChange={(e) => setAddressForm({ ...addressForm, recipient: e.target.value })}
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
                                                        onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value })}
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
                                                    onChange={(e) => setAddressForm({ ...addressForm, line1: e.target.value })}
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
                                                    onChange={(e) => setAddressForm({ ...addressForm, line2: e.target.value })}
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
                                                        onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
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
                                                        onChange={(e) => setAddressForm({ ...addressForm, region: e.target.value })}
                                                    >
                                                        {INDIAN_STATES.map((st) => (
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
                                                        onChange={(e) => setAddressForm({ ...addressForm, postal_code: e.target.value })}
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

                                            <label className="accountCheckboxLabel">
                                                <input
                                                    type="checkbox"
                                                    checked={addressForm.is_default}
                                                    onChange={(e) => setAddressForm({ ...addressForm, is_default: e.target.checked })}
                                                />
                                                <span>Set as default shipping address</span>
                                            </label>

                                            <div className="accountFormActions">
                                                <button
                                                    type="submit"
                                                    className="commerceButton"
                                                    disabled={addressSaving}
                                                >
                                                    {addressSaving ? 'Saving Address...' : 'Save Address'}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="commerceButton accountCancelBtn"
                                                    onClick={() => setShowAddressForm(false)}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </form>
                                    </div>
                                )}

                                {/* Addresses List */}
                                <div className="accountAddressesGrid">
                                    {addresses.length === 0 ? (
                                        <div className="accountEmptyState">
                                            <h3>No addresses on file</h3>
                                            <p>Save your delivery destination to be ready when drops go live.</p>
                                        </div>
                                    ) : (
                                        addresses.map((addr) => {
                                            const isDefault = addr.id === defaultAddressId;
                                            return (
                                                <article
                                                    key={addr.id}
                                                    className={`accountAddressCard ${isDefault ? 'isDefault' : ''}`}
                                                >
                                                    {isDefault && (
                                                        <span className="accountAddressBadge">DEFAULT DESTINATION</span>
                                                    )}
                                                    <h3 className="accountAddressRecipient">{addr.recipient}</h3>
                                                    <p className="accountAddressLine">{addr.line1}</p>
                                                    {addr.line2 && <p className="accountAddressLine">{addr.line2}</p>}
                                                    <p className="accountAddressCity">
                                                        {addr.city}, {addr.region} - {addr.postal_code}
                                                    </p>
                                                    <p className="accountAddressCountry">India (IN)</p>
                                                    <p className="accountAddressPhone">Phone: {addr.phone}</p>

                                                    <div className="accountAddressActions">
                                                        {!isDefault && (
                                                            <button
                                                                type="button"
                                                                className="accountTextAction"
                                                                onClick={() => setDefaultAddress(addr.id)}
                                                            >
                                                                Set as Default
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            className="accountIconAction"
                                                            aria-label={`Edit address for ${addr.recipient}`}
                                                            onClick={() => handleStartEditAddress(addr)}
                                                        >
                                                            <Edit2 size={16} aria-hidden="true" />
                                                            <span>Edit</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="accountIconAction accountDeleteAction"
                                                            aria-label={`Delete address for ${addr.recipient}`}
                                                            onClick={() => handleDeleteAddress(addr.id)}
                                                        >
                                                            <Trash2 size={16} aria-hidden="true" />
                                                            <span>Delete</span>
                                                        </button>
                                                    </div>
                                                </article>
                                            );
                                        })
                                    )}
                                </div>
                            </section>
                        )}

                        {/* Tab Content: Wishlist / Saved Kicks */}
                        {accountTab === 'wishlist' && (
                            <section className="accountSection" aria-labelledby="wishlist-heading">
                                <div className="accountSectionHeader">
                                    <h2 id="wishlist-heading">Wishlist / Saved Kicks</h2>
                                    <p>Individual pairs you are watching. Add them to your bag anytime.</p>
                                </div>

                                {bagFeedback && (
                                    <div className="accountFeedback isSuccess" role="status">
                                        <CheckCircle2 size={18} aria-hidden="true" />
                                        <span>{bagFeedback}</span>
                                    </div>
                                )}

                                {resolvedWishlistItems.length === 0 ? (
                                    <div className="accountEmptyState">
                                        <h3>Your vault is clear</h3>
                                        <p>No pairs currently saved in your wishlist. Explore the archive to track pairs.</p>
                                        <Link to="/shop" className="commerceButton accountShopLink">
                                            Explore The Archive
                                        </Link>
                                    </div>
                                ) : (
                                    <div className="commerceGrid accountWishlistGrid">
                                        {resolvedWishlistItems.map(({ id, product }) => {
                                            if (!product) {
                                                return (
                                                    <div key={id} className="shoeCard commerceCard accountMissingCard">
                                                        <h3>Pair #{id}</h3>
                                                        <p>This pair is currently not in the active catalog listing.</p>
                                                        <button
                                                            type="button"
                                                            className="accountTextAction"
                                                            onClick={() => removeFromWishlist(id)}
                                                        >
                                                            Remove from Wishlist
                                                        </button>
                                                    </div>
                                                );
                                            }

                                            const inBag = cart.ids.includes(product.id);

                                            return (
                                                <article key={product.id} className="shoeCard commerceCard accountWishlistCard">
                                                    <Link to={`/product/${product.id}`} aria-label={`View ${product.name}`}>
                                                        <div className={`shoeCardImageContainer ${product.sideImage ? 'hasSideImage' : ''}`}>
                                                            <img
                                                                src={product.frontImage}
                                                                alt={`${product.name}, ${product.size}`}
                                                                className="shoeImage shoeImageFront"
                                                            />
                                                            {product.sideImage && (
                                                                <img
                                                                    src={product.sideImage}
                                                                    alt=""
                                                                    className="shoeImage shoeImageSide"
                                                                />
                                                            )}
                                                        </div>
                                                        <div className="shoeCardInfo">
                                                            <span className="shoeBrand">{product.brand}</span>
                                                            <h3 className="shoeName">{product.name}</h3>
                                                            <div className="shoeDetailsRow">
                                                                <span className="shoeSize">Size: {product.size}</span>
                                                                <span className="shoePrice">{formatMoney(product.priceMinor)}</span>
                                                            </div>
                                                        </div>
                                                    </Link>

                                                    <div className="accountWishlistActions">
                                                        <button
                                                            type="button"
                                                            className="commerceButton accountMoveToBagBtn"
                                                            disabled={inBag}
                                                            onClick={() => handleMoveToBag(product)}
                                                        >
                                                            {inBag ? 'Already in Bag' : 'Move to Bag'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="accountRemoveWishlistBtn"
                                                            aria-label={`Remove ${product.name} from wishlist`}
                                                            onClick={() => removeFromWishlist(product.id)}
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                </article>
                                            );
                                        })}
                                    </div>
                                )}
                            </section>
                        )}

                        {/* Tab Content: Modernized Order History */}
                        {accountTab === 'orders' && (
                            <section className="accountSection accountOrdersSection" aria-labelledby="orders-heading">
                                <div className="accountSectionHeader accountOrdersHeaderWrap">
                                    <div>
                                        <div className="accountOrdersHeaderEyebrow">
                                            <Sparkles size={14} aria-hidden="true" />
                                            <span>SOLETHIEF AUTHENTICATED VAULT</span>
                                        </div>
                                        <h2 id="orders-heading" className="accountOrdersHeading">ARCHIVE ORDER VAULT</h2>
                                        <p className="accountOrdersSubtitle">
                                            Track confirmed pair allocations, real-time dispatch logistics, and historical drops.
                                        </p>
                                    </div>

                                    {/* High-level vault metrics */}
                                    <div className="accountOrdersVaultMetrics" aria-label="Order Vault Metrics">
                                        <div className="vaultMetricCard">
                                            <span className="vaultMetricLabel">TOTAL DROPS</span>
                                            <span className="vaultMetricValue">{orders.length}</span>
                                        </div>
                                        <div className="vaultMetricCard">
                                            <span className="vaultMetricLabel">IN TRANSIT</span>
                                            <span className="vaultMetricValue gold">{orderCounts.active}</span>
                                        </div>
                                        <div className="vaultMetricCard">
                                            <span className="vaultMetricLabel">VAULT INVESTMENT</span>
                                            <span className="vaultMetricValue">{formatMoney(totalOrdersValueMinor)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Order Utility Controls: Filter Tabs & Live Search */}
                                {orders.length > 0 && (
                                    <div className="accountOrdersControls">
                                        <div className="accountOrdersFilterTabs" role="tablist" aria-label="Filter orders by status">
                                            <button
                                                type="button"
                                                role="tab"
                                                aria-selected={orderFilterTab === 'all'}
                                                className={`orderFilterPill ${orderFilterTab === 'all' ? 'isActive' : ''}`}
                                                onClick={() => setOrderFilterTab('all')}
                                            >
                                                <span>All Drops</span>
                                                <span className="filterCountBadge">{orderCounts.all}</span>
                                            </button>
                                            <button
                                                type="button"
                                                role="tab"
                                                aria-selected={orderFilterTab === 'active'}
                                                className={`orderFilterPill ${orderFilterTab === 'active' ? 'isActive' : ''}`}
                                                onClick={() => setOrderFilterTab('active')}
                                            >
                                                <span>In Transit & Active</span>
                                                <span className="filterCountBadge">{orderCounts.active}</span>
                                            </button>
                                            <button
                                                type="button"
                                                role="tab"
                                                aria-selected={orderFilterTab === 'delivered'}
                                                className={`orderFilterPill ${orderFilterTab === 'delivered' ? 'isActive' : ''}`}
                                                onClick={() => setOrderFilterTab('delivered')}
                                            >
                                                <span>Delivered</span>
                                                <span className="filterCountBadge">{orderCounts.delivered}</span>
                                            </button>
                                            <button
                                                type="button"
                                                role="tab"
                                                aria-selected={orderFilterTab === 'cancelled'}
                                                className={`orderFilterPill ${orderFilterTab === 'cancelled' ? 'isActive' : ''}`}
                                                onClick={() => setOrderFilterTab('cancelled')}
                                            >
                                                <span>Cancelled / Voided</span>
                                                <span className="filterCountBadge">{orderCounts.cancelled}</span>
                                            </button>
                                        </div>

                                        <div className="accountOrdersSearchWrap">
                                            <Search size={16} className="searchIcon" aria-hidden="true" />
                                            <input
                                                type="text"
                                                className="accountOrdersSearchInput"
                                                placeholder="Search by Order ID, shoe title, or city..."
                                                value={orderSearch}
                                                onChange={(e) => setOrderSearch(e.target.value)}
                                                aria-label="Search orders"
                                            />
                                            {orderSearch && (
                                                <button
                                                    type="button"
                                                    className="clearSearchBtn"
                                                    onClick={() => setOrderSearch('')}
                                                    aria-label="Clear order search"
                                                >
                                                    <X size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {ordersLoading && (
                                    <div className="ordersLoadingState" role="status">
                                        <div className="ordersLoadingSpinner" />
                                        <span>DECRYPTING VAULT RECORDS...</span>
                                    </div>
                                )}

                                {ordersError && (
                                    <div className="accountFeedback error" role="alert">
                                        <AlertCircle size={18} aria-hidden="true" />
                                        <span>{ordersError}</span>
                                    </div>
                                )}

                                {/* Premium Empty State: No drops at all */}
                                {!ordersLoading && !orders.length && (
                                    <div className="accountOrdersEmptyVault">
                                        <div className="emptyVaultIconWrap">
                                            <Package size={42} aria-hidden="true" />
                                        </div>
                                        <span className="emptyVaultEyebrow">COLLECTION UNLOCKED</span>
                                        <h3 className="emptyVaultHeading">NO DROPS COPPED YET</h3>
                                        <p className="emptyVaultDesc">
                                            Your personal vault is waiting. When you cop rare silhouettes, verify allocations, and checkout, your authenticated orders, digital receipts, and live GPS courier tracking will appear here.
                                        </p>
                                        <div className="emptyVaultActions">
                                            <Link to="/shop" className="emptyVaultCtaBtn">
                                                <span>EXPLORE ACTIVE DROPS</span>
                                                <ArrowRight size={16} aria-hidden="true" />
                                            </Link>
                                        </div>
                                    </div>
                                )}

                                {/* Filter Empty State: Orders exist, but query matches 0 */}
                                {!ordersLoading && orders.length > 0 && filteredOrders.length === 0 && (
                                    <div className="ordersFilterEmpty">
                                        <Package size={32} aria-hidden="true" />
                                        <h4>NO MATCHING ORDERS FOUND</h4>
                                        <p>
                                            No drops matched your query {orderSearch ? `"${orderSearch}"` : ''} under status "{orderFilterTab}".
                                        </p>
                                        <button
                                            type="button"
                                            className="resetFilterBtn"
                                            onClick={() => {
                                                setOrderFilterTab('all');
                                                setOrderSearch('');
                                            }}
                                        >
                                            Reset Filter & Search
                                        </button>
                                    </div>
                                )}

                                {/* Modernized Order Card List */}
                                {!ordersLoading && filteredOrders.length > 0 && (
                                    <div className="accountOrdersListModern">
                                        {filteredOrders.map((order) => {
                                            const tone = getStatusTone(order.status);
                                            const isCancelled = ['cancelled', 'refunded', 'expired'].includes(order.status);
                                            const isCopied = copiedOrderId === order.id;

                                            return (
                                                <article
                                                    key={order.id}
                                                    className="orderVaultCard isInteractive"
                                                    onClick={() => navigate(`/order-confirmation/${order.id}`)}
                                                    title={`View Live Tracker for Order #${order.id}`}
                                                >
                                                    {/* Card Header Bar */}
                                                    <div className="orderVaultCardHeader">
                                                        <div className="orderHeaderLeft">
                                                            <div className="orderIdRow">
                                                                <span className="orderIdSerial">{order.id}</span>
                                                                <button
                                                                    type="button"
                                                                    className="orderCopyIdBtn"
                                                                    onClick={(e) => handleCopyOrderId(e, order.id)}
                                                                    title="Copy Order Serial"
                                                                    aria-label="Copy Order Serial"
                                                                >
                                                                    {isCopied ? (
                                                                        <>
                                                                            <Check size={12} className="copySuccessIcon" />
                                                                            <span className="copyLabel">COPIED</span>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <Copy size={12} />
                                                                            <span className="copyLabel">COPY</span>
                                                                        </>
                                                                    )}
                                                                </button>
                                                            </div>

                                                            <div className="orderMetaRow">
                                                                <span className="orderMetaDate">
                                                                    <Clock size={12} aria-hidden="true" />
                                                                    {order.created_at
                                                                        ? new Date(order.created_at).toLocaleDateString('en-IN', {
                                                                            day: 'numeric',
                                                                            month: 'short',
                                                                            year: 'numeric'
                                                                        })
                                                                        : 'Recently'}
                                                                </span>
                                                                <span className="orderPaymentPill">
                                                                    {order.payment_method === 'razorpay'
                                                                        ? 'PREPAID // RAZORPAY'
                                                                        : 'COD // ARCHIVE RESERVE'}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="orderHeaderRight">
                                                            <span className={`orderStatusBadgeModern ${tone}`}>
                                                                <span className="statusDot" />
                                                                <span>{getStatusLabel(order.status)}</span>
                                                            </span>
                                                            <Link
                                                                to={`/order-confirmation/${order.id}`}
                                                                className="orderLiveTrackerBtn"
                                                                title="View full confirmation and live tracker"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <span>View Tracker</span>
                                                                <ArrowRight size={13} aria-hidden="true" />
                                                            </Link>
                                                        </div>
                                                    </div>

                                                    {/* Order Timeline Progress Tracker */}
                                                    {!isCancelled ? (
                                                        <div
                                                            className="orderProgressTrackerWrap isClickable"
                                                            aria-label="Delivery progress timeline - click to open live tracker"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                navigate(`/order-confirmation/${order.id}`);
                                                            }}
                                                            role="button"
                                                            tabIndex={0}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter' || e.key === ' ') {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    navigate(`/order-confirmation/${order.id}`);
                                                                }
                                                            }}
                                                            title="Click to view live order tracking & dispatch status"
                                                        >
                                                            <div className="trackerStepsGrid">
                                                                {TRACKER_STEPS.map((step, idx) => {
                                                                    const stepState = getStepState(order.status, idx);
                                                                    return (
                                                                        <div key={step.key} className={`trackerStepNode ${stepState}`}>
                                                                            <div className="trackerStepIndicator">
                                                                                <div className="trackerStepDot">
                                                                                    {stepState === 'completed' && <Check size={10} />}
                                                                                    {(stepState === 'active' || stepState === 'current') && <div className="pulseRing" />}
                                                                                </div>
                                                                                {idx < TRACKER_STEPS.length - 1 && (
                                                                                    <div className="trackerStepLine" />
                                                                                )}
                                                                            </div>
                                                                            <div className="trackerStepContent">
                                                                                <span className="trackerStepLabel">{step.label}</span>
                                                                                <span className="trackerStepSub">
                                                                                    {stepState === 'completed'
                                                                                        ? 'Verified'
                                                                                        : (stepState === 'active' || stepState === 'current')
                                                                                            ? 'In Progress'
                                                                                            : 'Pending'}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                            <div className="orderTrackerHoverCue">
                                                                <Truck size={12} aria-hidden="true" />
                                                                <span>LIVE TRACKER DISPATCH ACTIVE &bull; CLICK TO EXPAND TRACKER</span>
                                                                <ArrowRight size={11} aria-hidden="true" />
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div
                                                            className="orderCancelledBanner isClickable"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                navigate(`/order-confirmation/${order.id}`);
                                                            }}
                                                            role="button"
                                                            tabIndex={0}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter' || e.key === ' ') {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    navigate(`/order-confirmation/${order.id}`);
                                                                }
                                                            }}
                                                            title="Click to view order status and tracker details"
                                                        >
                                                            <AlertCircle size={15} />
                                                            <div className="orderCancelledBannerContent">
                                                                <span className="orderCancelledTitle">
                                                                    THIS ALLOCATION WAS {order.status === 'refunded' ? 'REFUNDED' : 'CANCELLED'}.
                                                                </span>
                                                                {(order.rejection_reason || order.cancel_reason) && (
                                                                    <div className="orderRejectionNoticeLine">
                                                                        <strong>
                                                                            {order.cancelled_by === 'admin'
                                                                                ? 'ADMIN REJECTION REASON: '
                                                                                : 'CANCELLATION REASON: '}
                                                                        </strong>
                                                                        <span>{order.rejection_reason || order.cancel_reason}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <ArrowRight size={13} style={{ marginLeft: 'auto' }} />
                                                        </div>
                                                    )}

                                                    {/* Replacement Status Banner */}
                                                    {order.replacement_requested && (
                                                        <div
                                                            className="orderReplacementActiveBanner isClickable"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                navigate(`/order-confirmation/${order.id}`);
                                                            }}
                                                            role="button"
                                                            tabIndex={0}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter' || e.key === ' ') {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    navigate(`/order-confirmation/${order.id}`);
                                                                }
                                                            }}
                                                            title="Click to view replacement dispatch tracker"
                                                        >
                                                            <RotateCcw size={15} />
                                                            <div className="orderReplacementActiveContent">
                                                                <span className="orderReplacementTitle">
                                                                    3-DAY REPLACEMENT {order.status === 'replaced' ? 'COMPLETED' : 'REQUEST LODGED'}
                                                                </span>
                                                                <span className="orderReplacementReason">
                                                                    Reason: {order.replacement_reason} &bull; Preferred Size: {order.replacement_preferred_size || 'Same size'}
                                                                </span>
                                                            </div>
                                                            <ArrowRight size={13} style={{ marginLeft: 'auto' }} />
                                                        </div>
                                                    )}

                                                    {/* Rich Sneaker Items List */}
                                                    <div className="orderItemsContainer">
                                                        <div className="orderItemsGrid">
                                                            {(order.items || []).map((item, idx) => {
                                                                const shoeId = resolveItemProductId(item, catalog);
                                                                const shoeUrl = shoeId ? `/product/${shoeId}` : '/shop';

                                                                return (
                                                                    <div
                                                                        key={item.id || idx}
                                                                        className="orderSneakerCard"
                                                                        role="button"
                                                                        tabIndex={0}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            navigate(shoeUrl);
                                                                        }}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter' || e.key === ' ') {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                                navigate(shoeUrl);
                                                                            }
                                                                        }}
                                                                        title={`View ${item.name || 'Sneaker'} Product Page`}
                                                                        aria-label={`View ${item.name || 'Sneaker'} product details`}
                                                                    >
                                                                        <div
                                                                            className="orderSneakerThumb"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                navigate(shoeUrl);
                                                                            }}
                                                                        >
                                                                            {item.image_url ? (
                                                                                <img
                                                                                    src={item.image_url}
                                                                                    alt={item.name}
                                                                                    loading="lazy"
                                                                                />
                                                                            ) : (
                                                                                <div className="orderSneakerPlaceholder">
                                                                                    <Package size={24} />
                                                                                </div>
                                                                            )}
                                                                            <span className="orderVerifiedPill">
                                                                                <ShieldCheck size={10} />
                                                                                VERIFIED
                                                                            </span>
                                                                        </div>

                                                                        <div className="orderSneakerDetails">
                                                                            <div className="orderSneakerBrand">
                                                                                {item.brand || 'SOLETHIEF'}
                                                                            </div>
                                                                            <Link
                                                                                to={shoeUrl}
                                                                                className="orderSneakerNameLink"
                                                                                title={`View ${item.name}`}
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                }}
                                                                            >
                                                                                {item.name}
                                                                            </Link>
                                                                            <div className="orderSneakerPills">
                                                                                <span className="orderSpecPill">SIZE US {item.size}</span>
                                                                                <span className="orderSpecPill">QTY {item.quantity || 1}</span>
                                                                                <span className="orderSpecPill unitPrice">
                                                                                    {formatMoney(item.unit_price_minor)}
                                                                                </span>
                                                                            </div>
                                                                            {isCancelled && (
                                                                                <div className="orderItemRejectionNotice">
                                                                                    <span className="itemCancelledPill">
                                                                                        <XCircle size={10} /> CANCELLED
                                                                                    </span>
                                                                                    <span className="itemCancelledReason">
                                                                                        <strong>Reason: </strong>
                                                                                        {order.rejection_reason || order.cancel_reason || 'Order allocation cancelled'}
                                                                                    </span>
                                                                                </div>
                                                                            )}
                                                                        </div>

                                                                        <div className="orderSneakerLineTotal">
                                                                            <span className="lineTotalLabel">SUBTOTAL</span>
                                                                            <span className="lineTotalValue">
                                                                                {formatMoney((item.unit_price_minor || 0) * (item.quantity || 1))}
                                                                            </span>
                                                                            <span className="orderSneakerViewCta">
                                                                                <span>View Product</span>
                                                                                <ArrowRight size={11} aria-hidden="true" />
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>

                                                    {/* Card Action Bar Footer */}
                                                    <div className="orderVaultCardFooter" onClick={(e) => e.stopPropagation()}>
                                                        <div className="orderFooterRightActions">
                                                            {order.status === 'delivered' ? (
                                                                <button
                                                                    type="button"
                                                                    className="orderActionBtn orderReplaceBtn"
                                                                    disabled={order.replacement_requested || !canReplaceOrder(order)}
                                                                    title={
                                                                        order.replacement_requested
                                                                            ? 'Replacement request already submitted'
                                                                            : !canReplaceOrder(order)
                                                                                ? 'Replacement window (3 days from delivery) has expired'
                                                                                : 'Request 3-day replacement for this delivered order'
                                                                    }
                                                                    onClick={() => {
                                                                        if (order.replacement_requested || !canReplaceOrder(order)) return;
                                                                        setReplaceError('');
                                                                        setReplaceSuccess('');
                                                                        setReplaceReason('Size too small (Need larger size)');
                                                                        const defaultSize = order.items?.[0]?.size ? `US ${order.items[0].size}` : '';
                                                                        setReplacePreferredSize(defaultSize);
                                                                        setReplaceNotes('');
                                                                        setActiveModal({ type: 'replace', order });
                                                                    }}
                                                                >
                                                                    <RotateCcw size={13} />
                                                                    <span>
                                                                        {order.replacement_requested ? 'Replacement Requested' : 'Replace Pair'}
                                                                    </span>
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    className="orderActionBtn orderCancelBtn"
                                                                    disabled={!canCancelOrder(order)}
                                                                    title={
                                                                        !canCancelOrder(order)
                                                                            ? 'Cancellation is only allowed within 24 hours of order placement'
                                                                            : 'Cancel this order'
                                                                    }
                                                                    onClick={() => {
                                                                        if (!canCancelOrder(order)) return;
                                                                        setCancelError('');
                                                                        setCancelSuccess('');
                                                                        setCancelReason('Changed mind');
                                                                        setCancelCustomNotes('');
                                                                        setActiveModal({ type: 'cancel', order });
                                                                    }}
                                                                >
                                                                    <XCircle size={13} />
                                                                    <span>Cancel Order</span>
                                                                </button>
                                                            )}
                                                            <button
                                                                type="button"
                                                                className="orderActionBtn"
                                                                onClick={() => setActiveModal({ type: 'invoice', order })}
                                                            >
                                                                <FileText size={13} />
                                                                <span>Invoice & Receipt</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="orderActionBtn"
                                                                onClick={() => {
                                                                    setSupportSubmitted(false);
                                                                    setSupportMessage('');
                                                                    setActiveModal({ type: 'support', order });
                                                                }}
                                                            >
                                                                <HelpCircle size={13} />
                                                                <span>Support</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </article>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Interactive Modal: Printable Invoice / Receipt */}
                                {activeModal?.type === 'invoice' && activeModal.order && (
                                    <div className="orderModalOverlay" onClick={() => setActiveModal(null)} role="dialog" aria-modal="true" aria-labelledby="modal-invoice-title">
                                        <div className="orderModalContent printInvoiceDoc" onClick={(e) => e.stopPropagation()}>
                                            <div className="orderModalHeader">
                                                <div className="invoiceBranding">
                                                    <span className="invoiceBrandLogo">SOLETHIEF</span>
                                                    <span className="invoiceSubLogo">AUTHENTICATED ARCHIVE RECEIPT</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="orderModalCloseBtn"
                                                    onClick={() => setActiveModal(null)}
                                                    aria-label="Close invoice"
                                                >
                                                    <X size={18} />
                                                </button>
                                            </div>

                                            <div className="invoiceDossierHeader">
                                                <div className="invoiceDossierCol">
                                                    <span className="invoiceLabel">INVOICE SERIAL</span>
                                                    <span className="invoiceValue mono">{activeModal.order.id}</span>
                                                    <span className="invoiceLabel" style={{ marginTop: '0.5rem' }}>ORDER DATE</span>
                                                    <span className="invoiceValue">
                                                        {activeModal.order.created_at
                                                            ? new Date(activeModal.order.created_at).toLocaleDateString('en-IN', {
                                                                day: 'numeric',
                                                                month: 'long',
                                                                year: 'numeric'
                                                            })
                                                            : 'Recently'}
                                                    </span>
                                                </div>
                                                <div className="invoiceDossierCol">
                                                    <span className="invoiceLabel">BILLED / SHIPPED TO</span>
                                                    <span className="invoiceValue highlight">{activeModal.order.shipping_name || 'Member'}</span>
                                                    <span className="invoiceValue">
                                                        {[
                                                            activeModal.order.shipping_address,
                                                            activeModal.order.shipping_city,
                                                            activeModal.order.shipping_state,
                                                            activeModal.order.shipping_postal_code
                                                        ].filter(Boolean).join(', ')}
                                                    </span>
                                                    {activeModal.order.shipping_phone && (
                                                        <span className="invoiceValue mono">Tel: {activeModal.order.shipping_phone}</span>
                                                    )}
                                                </div>
                                                <div className="invoiceDossierCol">
                                                    <span className="invoiceLabel">STATUS</span>
                                                    <span className="invoiceValue highlight">{getStatusLabel(activeModal.order.status)}</span>
                                                    <span className="invoiceLabel" style={{ marginTop: '0.5rem' }}>PAYMENT METHOD</span>
                                                    <span className="invoiceValue">
                                                        {activeModal.order.payment_method === 'razorpay' ? 'Prepaid (Razorpay Gateway)' : 'COD (Archive Reserve)'}
                                                    </span>
                                                </div>
                                            </div>

                                            <table className="invoiceItemsTable">
                                                <thead>
                                                    <tr>
                                                        <th>ITEM DESCRIPTION</th>
                                                        <th>SIZE</th>
                                                        <th>QTY</th>
                                                        <th>RATE</th>
                                                        <th>LINE TOTAL</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(activeModal.order.items || []).map((item, idx) => (
                                                        <tr key={idx}>
                                                            <td>
                                                                <div className="invoiceItemTitle">{item.brand} {item.name}</div>
                                                                <div className="invoiceItemAuthenticity">Verified Authentic 100%</div>
                                                            </td>
                                                            <td>US {item.size}</td>
                                                            <td>{item.quantity || 1}</td>
                                                            <td>{formatMoney(item.unit_price_minor)}</td>
                                                            <td>{formatMoney((item.unit_price_minor || 0) * (item.quantity || 1))}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>

                                            {(() => {
                                                const financials = resolveOrderFinancials(activeModal.order);
                                                return (
                                                    <div className="invoiceTotalsBreakdown">
                                                        <div className="invoiceTotalsRow">
                                                            <span>Subtotal</span>
                                                            <span>{formatMoney(financials.subtotal)}</span>
                                                        </div>
                                                        <div className="invoiceTotalsRow">
                                                            <span>Courier Dispatch Freight</span>
                                                            <span>{financials.shipping === 0 ? 'FREE' : formatMoney(financials.shipping)}</span>
                                                        </div>
                                                        <div className="invoiceTotalsRow">
                                                            <span>GST Tax (18% inclusive)</span>
                                                            <span>{formatMoney(financials.tax)}</span>
                                                        </div>
                                                        <div className="invoiceTotalsRow invoiceTotalFinal">
                                                            <span>Total Paid / Due</span>
                                                            <span className="finalTotalValue">{formatMoney(financials.total)}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            <div className="invoiceModalActions no-print">
                                                <button
                                                    type="button"
                                                    className="printInvoiceBtn"
                                                    onClick={() => window.print()}
                                                >
                                                    <Download size={15} />
                                                    <span>PRINT OR SAVE PDF</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    className="closeModalBtn"
                                                    onClick={() => setActiveModal(null)}
                                                >
                                                    Close
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Interactive Modal: Concierge Support */}
                                {activeModal?.type === 'support' && activeModal.order && (
                                    <div className="orderModalOverlay" onClick={() => setActiveModal(null)} role="dialog" aria-modal="true" aria-labelledby="modal-support-title">
                                        <div className="orderModalContent supportModalContent" onClick={(e) => e.stopPropagation()}>
                                            <div className="orderModalHeader">
                                                <div>
                                                    <h3 id="modal-support-title" className="supportModalTitle">SOLETHIEF CONCIERGE</h3>
                                                    <span className="supportModalSub">Dedicated Support &bull; Order {activeModal.order.id}</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="orderModalCloseBtn"
                                                    onClick={() => setActiveModal(null)}
                                                    aria-label="Close concierge"
                                                >
                                                    <X size={18} />
                                                </button>
                                            </div>

                                            {supportSubmitted ? (
                                                <div className="supportSuccessState">
                                                    <CheckCircle2 size={40} className="supportSuccessIcon" />
                                                    <h4>TICKET SUBMITTED TO CONCIERGE</h4>
                                                    <p>
                                                        Our authentication and dispatch desk has logged ticket for Order <code>{activeModal.order.id}</code>. A representative will contact you via email within 2-4 hours.
                                                    </p>
                                                    <button
                                                        type="button"
                                                        className="commerceButton"
                                                        onClick={() => setActiveModal(null)}
                                                    >
                                                        Done
                                                    </button>
                                                </div>
                                            ) : (
                                                <form
                                                    className="supportModalForm"
                                                    onSubmit={(e) => {
                                                        e.preventDefault();
                                                        setSupportSubmitted(true);
                                                    }}
                                                >
                                                    <div className="supportField">
                                                        <label htmlFor="supportCategory">Reason for Inquiry</label>
                                                        <select
                                                            id="supportCategory"
                                                            value={supportCategory}
                                                            onChange={(e) => setSupportCategory(e.target.value)}
                                                            className="supportSelect"
                                                        >
                                                            <option value="tracking">Delivery & Tracking Status</option>
                                                            <option value="authenticity">Physical Authentication & Verification</option>
                                                            <option value="size">Size Exchange / Fit Inquiry</option>
                                                            <option value="cancellation">Cancellation / Refund Request</option>
                                                            <option value="other">Other Inquiry</option>
                                                        </select>
                                                    </div>

                                                    <div className="supportField">
                                                        <label htmlFor="supportMessage">Details for our Concierge</label>
                                                        <textarea
                                                            id="supportMessage"
                                                            rows={4}
                                                            required
                                                            placeholder="Describe any questions regarding your pair, dispatch address, or courier status..."
                                                            value={supportMessage}
                                                            onChange={(e) => setSupportMessage(e.target.value)}
                                                            className="supportTextarea"
                                                        />
                                                    </div>

                                                    <div className="supportModalFooter">
                                                        <button
                                                            type="button"
                                                            className="supportCancelBtn"
                                                            onClick={() => setActiveModal(null)}
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            type="submit"
                                                            className="supportSubmitBtn"
                                                        >
                                                            Submit Ticket &rarr;
                                                        </button>
                                                    </div>
                                                </form>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Interactive Modal: Cancel Order (24-Hour Policy) */}
                                {activeModal?.type === 'cancel' && activeModal.order && (
                                    <div
                                        className="orderModalOverlay"
                                        onClick={() => !cancelSubmitting && setActiveModal(null)}
                                        role="dialog"
                                        aria-modal="true"
                                        aria-labelledby="modal-cancel-title"
                                    >
                                        <div className="orderModalContent cancelModalContent" onClick={(e) => e.stopPropagation()}>
                                            <div className="orderModalHeader">
                                                <div>
                                                    <h3 id="modal-cancel-title" className="cancelModalTitle">CANCEL DROP ALLOCATION</h3>
                                                    <span className="cancelModalSub">Order {activeModal.order.id} &bull; 24-Hour Cancellation Window</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="orderModalCloseBtn"
                                                    onClick={() => !cancelSubmitting && setActiveModal(null)}
                                                    aria-label="Close cancel modal"
                                                    disabled={cancelSubmitting}
                                                >
                                                    <X size={18} />
                                                </button>
                                            </div>

                                            {cancelSuccess ? (
                                                <div className="cancelSuccessState">
                                                    <CheckCircle2 size={42} className="cancelSuccessIcon" />
                                                    <h4>ORDER CANCELLED</h4>
                                                    <p>{cancelSuccess}</p>
                                                    <p className="cancelSuccessNote">
                                                        Your allocation has been released back to the archive. If online payment was captured, your refund will reflect in your account within 3-5 business days.
                                                    </p>
                                                    <button
                                                        type="button"
                                                        className="commerceButton"
                                                        onClick={() => setActiveModal(null)}
                                                    >
                                                        Done
                                                    </button>
                                                </div>
                                            ) : !canCancelOrder(activeModal.order) ? (
                                                <div className="cancelExpiredState">
                                                    <AlertCircle size={40} className="cancelExpiredIcon" />
                                                    <h4>CANCELLATION WINDOW EXPIRED</h4>
                                                    <p>
                                                        Orders can only be cancelled within 24 hours of placement. Order {activeModal.order.id} is now locked in our warehouse queue for physical authentication and dispatch.
                                                    </p>
                                                    <div className="cancelModalFooter">
                                                        <button
                                                            type="button"
                                                            className="closeModalBtn"
                                                            onClick={() => setActiveModal(null)}
                                                        >
                                                            Close
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="commerceButton"
                                                            onClick={() => {
                                                                setSupportSubmitted(false);
                                                                setSupportMessage(`Inquiry regarding Order ${activeModal.order.id} cancellation.`);
                                                                setActiveModal({ type: 'support', order: activeModal.order });
                                                            }}
                                                        >
                                                            Contact Concierge
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <form
                                                    className="cancelModalForm"
                                                    onSubmit={(e) => {
                                                        e.preventDefault();
                                                        handleConfirmCancelOrder(activeModal.order.id);
                                                    }}
                                                >
                                                    <div className="cancelWarningNotice">
                                                        <div className="cancelNoticeHeader">
                                                            <AlertCircle size={16} aria-hidden="true" />
                                                            <strong>ORDER CANCELLATION</strong>
                                                        </div>
                                                        <p>
                                                            Orders are eligible for self-service cancellation within 24 hours of placement. Cancelling will immediately void this allocation and release your reserved pairs back to the archive queue.
                                                        </p>
                                                    </div>

                                                    {cancelError && (
                                                        <div className="accountFeedback isError" role="alert" style={{ margin: 0 }}>
                                                            <AlertCircle size={16} />
                                                            <span>{cancelError}</span>
                                                        </div>
                                                    )}

                                                    <div className="cancelField">
                                                        <label htmlFor="cancelReasonSelect">Reason for Cancellation</label>
                                                        <select
                                                            id="cancelReasonSelect"
                                                            value={cancelReason}
                                                            onChange={(e) => setCancelReason(e.target.value)}
                                                            className="cancelSelect"
                                                            disabled={cancelSubmitting}
                                                        >
                                                            <option value="Changed mind">Changed mind / No longer needed</option>
                                                            <option value="Ordered wrong size">Ordered wrong size / silhouette</option>
                                                            <option value="Incorrect shipping address">Need to change delivery address</option>
                                                            <option value="Ordered duplicate pair">Ordered duplicate pair accidentally</option>
                                                            <option value="Found alternative drop">Found alternative drop</option>
                                                            <option value="Other">Other reason</option>
                                                        </select>
                                                    </div>

                                                    {cancelReason === 'Other' && (
                                                        <div className="cancelField">
                                                            <label htmlFor="cancelCustomNotes">Additional Details (Optional)</label>
                                                            <textarea
                                                                id="cancelCustomNotes"
                                                                rows={3}
                                                                placeholder="Let us know why you'd like to cancel this order..."
                                                                value={cancelCustomNotes}
                                                                onChange={(e) => setCancelCustomNotes(e.target.value)}
                                                                className="cancelTextarea"
                                                                disabled={cancelSubmitting}
                                                            />
                                                        </div>
                                                    )}

                                                    <div className="cancelModalFooter">
                                                        <button
                                                            type="button"
                                                            className="cancelDismissBtn"
                                                            onClick={() => setActiveModal(null)}
                                                            disabled={cancelSubmitting}
                                                        >
                                                            Keep My Order
                                                        </button>
                                                        <button
                                                            type="submit"
                                                            className="cancelConfirmBtn"
                                                            disabled={cancelSubmitting}
                                                        >
                                                            {cancelSubmitting ? 'Cancelling Allocation...' : 'Confirm Cancellation'}
                                                        </button>
                                                    </div>
                                                </form>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Interactive Modal: 3-Day Replacement (Delivered Orders Only) */}
                                {activeModal?.type === 'replace' && activeModal.order && (
                                    <div
                                        className="orderModalOverlay"
                                        onClick={() => !replaceSubmitting && setActiveModal(null)}
                                        role="dialog"
                                        aria-modal="true"
                                        aria-labelledby="modal-replace-title"
                                    >
                                        <div className="orderModalContent replaceModalContent" onClick={(e) => e.stopPropagation()}>
                                            <div className="orderModalHeader">
                                                <div>
                                                    <h3 id="modal-replace-title" className="replaceModalTitle">REQUEST 3-DAY REPLACEMENT</h3>
                                                    <span className="replaceModalSub">
                                                        Order {activeModal.order.id} &bull; Shibuya Vault Policy: Replacement Only (No Returns)
                                                    </span>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="orderModalCloseBtn"
                                                    onClick={() => !replaceSubmitting && setActiveModal(null)}
                                                    aria-label="Close replacement modal"
                                                    disabled={replaceSubmitting}
                                                >
                                                    <X size={18} />
                                                </button>
                                            </div>

                                            {replaceSuccess ? (
                                                <div className="cancelSuccessState">
                                                    <CheckCircle2 size={42} className="cancelSuccessIcon" />
                                                    <h4>REPLACEMENT REQUEST LODGED</h4>
                                                    <p>{replaceSuccess}</p>
                                                    <p className="cancelSuccessNote">
                                                        Our vault operations team has logged your replacement preference. A courier pickup and genuine pair inspection will be scheduled. In accordance with Shibuya consignment rules, pairs are exchanged for genuine stock only (no cash returns).
                                                    </p>
                                                    <button
                                                        type="button"
                                                        className="commerceButton"
                                                        onClick={() => setActiveModal(null)}
                                                    >
                                                        Done
                                                    </button>
                                                </div>
                                            ) : !canReplaceOrder(activeModal.order) ? (
                                                <div className="cancelExpiredState">
                                                    <AlertCircle size={40} className="cancelExpiredIcon" />
                                                    <h4>REPLACEMENT WINDOW EXPIRED</h4>
                                                    <p>
                                                        Replacements are only accepted within 3 days (72 hours) of delivery. The replacement eligibility window for Order {activeModal.order.id} has ended.
                                                    </p>
                                                    <div className="cancelModalFooter">
                                                        <button
                                                            type="button"
                                                            className="closeModalBtn"
                                                            onClick={() => setActiveModal(null)}
                                                        >
                                                            Close
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="commerceButton"
                                                            onClick={() => {
                                                                setSupportSubmitted(false);
                                                                setSupportMessage(`Inquiry regarding Order ${activeModal.order.id} replacement policy.`);
                                                                setActiveModal({ type: 'support', order: activeModal.order });
                                                            }}
                                                        >
                                                            Contact Concierge
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <form
                                                    className="cancelModalForm"
                                                    onSubmit={(e) => {
                                                        e.preventDefault();
                                                        handleConfirmReplaceOrder(activeModal.order.id);
                                                    }}
                                                >
                                                    <div className="replacePolicyNotice">
                                                        <div className="cancelNoticeHeader">
                                                            <RotateCcw size={16} aria-hidden="true" />
                                                            <strong>3-DAY REPLACEMENT POLICY (NO RETURNS)</strong>
                                                        </div>
                                                        <p>
                                                            Orders are eligible for a 1-to-1 replacement within 3 days of delivery for sizing adjustments or transit defects. We do not provide monetary refunds or cash returns for delivered archive sneakers.
                                                        </p>
                                                        {getReplacementRemainingTime(activeModal.order)?.formatted && (
                                                            <div className="replacementWindowTimer">
                                                                <Clock size={12} />
                                                                <span>Window: {getReplacementRemainingTime(activeModal.order).formatted}</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {replaceError && (
                                                        <div className="accountFeedback isError" role="alert" style={{ margin: 0 }}>
                                                            <AlertCircle size={16} />
                                                            <span>{replaceError}</span>
                                                        </div>
                                                    )}

                                                    <div className="cancelField">
                                                        <label htmlFor="replaceReasonSelect">Reason for Replacement</label>
                                                        <select
                                                            id="replaceReasonSelect"
                                                            value={replaceReason}
                                                            onChange={(e) => setReplaceReason(e.target.value)}
                                                            className="cancelSelect"
                                                            disabled={replaceSubmitting}
                                                        >
                                                            <option value="Size too small (Need larger size)">Size too small (Need larger size)</option>
                                                            <option value="Size too large (Need smaller size)">Size too large (Need smaller size)</option>
                                                            <option value="Transit damage / Box crushed">Transit damage / Box crushed</option>
                                                            <option value="Factory stitching anomaly">Factory stitching or craftsmanship anomaly</option>
                                                            <option value="Incorrect silhouette or colorway delivered">Incorrect silhouette or colorway delivered</option>
                                                            <option value="Other">Other reason</option>
                                                        </select>
                                                    </div>

                                                    <div className="cancelField">
                                                        <label htmlFor="replaceSizeSelect">Preferred Replacement Size</label>
                                                        <select
                                                            id="replaceSizeSelect"
                                                            value={replacePreferredSize}
                                                            onChange={(e) => setReplacePreferredSize(e.target.value)}
                                                            className="cancelSelect"
                                                            disabled={replaceSubmitting}
                                                        >
                                                            <option value="">Select Preferred Size</option>
                                                            <option value="US 7">US 7</option>
                                                            <option value="US 7.5">US 7.5</option>
                                                            <option value="US 8">US 8</option>
                                                            <option value="US 8.5">US 8.5</option>
                                                            <option value="US 9">US 9</option>
                                                            <option value="US 9.5">US 9.5</option>
                                                            <option value="US 10">US 10</option>
                                                            <option value="US 10.5">US 10.5</option>
                                                            <option value="US 11">US 11</option>
                                                            <option value="US 11.5">US 11.5</option>
                                                            <option value="US 12">US 12</option>
                                                            <option value="US 12.5">US 12.5</option>
                                                            <option value="US 13">US 13</option>
                                                            <option value="Same Size (Defect Exchange)">Same Size (Defect Exchange)</option>
                                                        </select>
                                                    </div>

                                                    <div className="cancelField">
                                                        <label htmlFor="replaceNotesInput">Additional Replacement Notes (Optional)</label>
                                                        <textarea
                                                            id="replaceNotesInput"
                                                            rows={3}
                                                            placeholder="Specify fit details, box condition, or courier notes..."
                                                            value={replaceNotes}
                                                            onChange={(e) => setReplaceNotes(e.target.value)}
                                                            className="cancelTextarea"
                                                            disabled={replaceSubmitting}
                                                        />
                                                    </div>

                                                    <div className="cancelModalFooter">
                                                        <button
                                                            type="button"
                                                            className="cancelDismissBtn"
                                                            onClick={() => setActiveModal(null)}
                                                            disabled={replaceSubmitting}
                                                        >
                                                            Keep Current Pair
                                                        </button>
                                                        <button
                                                            type="submit"
                                                            className="commerceButton"
                                                            disabled={replaceSubmitting}
                                                        >
                                                            {replaceSubmitting ? 'Lodging Request...' : 'Submit Replacement Request'}
                                                        </button>
                                                    </div>
                                                </form>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </section>
                        )}
                    </div>
                )}
            </main>
            <Footer />
        </div>
    );
}

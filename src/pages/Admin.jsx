import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
    ShieldCheck,
    Package,
    TrendingUp,
    Layers,
    Plus,
    Edit3,
    CheckCircle2,
    AlertCircle,
    Truck,
    Lock,
    Search,
    RefreshCw,
    Eye,
    Sliders,
    ArrowUpRight,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useAuth } from '../auth/authContext.js';
import { getSupabaseRuntime } from '../lib/supabase.js';
import { createAdminService } from '../services/admin.js';
import { formatMoney } from '../commerce/cart.js';
import {
    INVENTORY_STATES,
    ADMIN_FULFILLMENT_TRANSITIONS,
} from '../commerce/admin.js';
import ShopCollectionsAdmin from './ShopCollectionsAdmin.jsx';

export default function Admin() {
    const { user, profile } = useAuth();

    // Keyed remount on user identity change to immediately clear state and prevent stale async grants
    return <AdminContent key={user?.id || 'anonymous'} user={user} profile={profile} />;
}

function AdminContent({ user, profile }) {
    const adminService = useMemo(() => createAdminService(getSupabaseRuntime), []);
    const runtimeStatus = getSupabaseRuntime().status;
    const isDemoAllowed = runtimeStatus === 'missing';

    // Access control state
    const [operatorSession, setOperatorSession] = useState(() => (isDemoAllowed ? adminService.getOperatorSession() : null));
    const isDemoOperatorActive = isDemoAllowed && Boolean(operatorSession?.isOperator);
    const [accessLoading, setAccessLoading] = useState(() => (isDemoAllowed ? false : true));
    const [hasAccess, setHasAccess] = useState(() => (isDemoAllowed ? Boolean(adminService.getOperatorSession()?.isOperator) : false));
    const [accessMode, setAccessMode] = useState(() => (isDemoAllowed ? 'preview' : 'live'));
    const [accessError, setAccessError] = useState('');
    const isAuthorized = Boolean(isDemoOperatorActive || hasAccess || (isDemoAllowed && operatorSession?.isOperator));
    const hasConsoleAccess = isAuthorized || (hasAccess || isDemoOperatorActive);

    // Dashboard tabs: 'collections' | 'drops' | 'orders'
    const [currentTab, setCurrentTab] = useState('collections');
    const [productRefreshTrigger, setProductRefreshTrigger] = useState(0);

    // Data states
    const [drops, setDrops] = useState([]);
    const [inventory, setInventory] = useState({});
    const [orders, setOrders] = useState([]);
    const [metrics, setMetrics] = useState({
        totalRevenueMinor: 0,
        activeDropsCount: 0,
        availablePairsCount: 0,
        pendingShipmentsCount: 0,
    });
    const [dataLoading, setDataLoading] = useState(false);
    const [feedback, setFeedback] = useState({ type: '', message: '' });

    // Modals / forms state
    const [showDropModal, setShowDropModal] = useState(false);
    const [editingDropId, setEditingDropId] = useState(null);
    const [dropForm, setDropForm] = useState({
        id: '',
        name: '',
        brand: 'SOLETHIEF',
        size: 'US 9',
        price: '18500.00',
        frontImage: '/shoes/transparent/shoe-1-front.png',
        sideImage: '/shoes/transparent/shoe-1-side.png',
        active: true,
        dropBatch: 'SHIBUYA-DROP-05',
        description: 'Limited edition archive sneaker.',
    });
    const [dropFormErrors, setDropFormErrors] = useState({});

    // Order details drawer / modal
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [orderStatusForm, setOrderStatusForm] = useState({
        status: '',
        notes: '',
    });
    const [orderSearchQuery, setOrderSearchQuery] = useState('');
    const [orderFilterStatus, setOrderFilterStatus] = useState('all');

    // Drops search & filter
    const [dropSearchQuery, setDropSearchQuery] = useState('');

    const refreshDashboardData = useCallback(async () => {
        setDataLoading(true);
        try {
            const [dropsList, invMap, ordersList, calculatedMetrics] = await Promise.all([
                adminService.listDrops(),
                adminService.listInventory(),
                adminService.listOrders(),
                adminService.getOperationalMetrics(),
            ]);
            setDrops(dropsList);
            setInventory(invMap);
            setOrders(ordersList);
            setMetrics(calculatedMetrics);
        } catch (err) {
            setFeedback({ type: 'error', message: err.message || 'Failed to load dashboard data.' });
        } finally {
            setDataLoading(false);
        }
    }, [adminService]);

    const checkAccess = useCallback(async () => {
        if (isDemoAllowed) {
            const currentSession = adminService.getOperatorSession();
            const isOp = Boolean(currentSession?.isOperator);
            setOperatorSession(currentSession);
            setAccessMode('preview');
            setAccessLoading(false);
            if (isOp) {
                setHasAccess(true);
                setAccessError('');
                await refreshDashboardData();
            } else {
                setHasAccess(false);
                setAccessError('Access restricted: Preview operator toggle is off.');
            }
            return;
        }

        setAccessLoading(true);
        setAccessError('');
        try {
            const res = await adminService.checkAdminAccess({ user });
            const granted = Boolean(res.isAdmin);
            setHasAccess(granted);
            setAccessMode(res.mode || 'live');
            if (!granted) {
                setAccessError(res.error || 'Access denied.');
            } else {
                await refreshDashboardData();
            }
        } catch (err) {
            setHasAccess(false);
            setAccessError(err?.message || 'Error verifying credentials.');
        } finally {
            setAccessLoading(false);
        }
    }, [adminService, user, isDemoAllowed, refreshDashboardData]);

    useEffect(() => {
        checkAccess();
    }, [checkAccess]);

    const handleToggleOperatorPreview = (forceEnable = null) => {
        if (!isDemoAllowed) return;
        const currentSession = adminService.getOperatorSession();
        const nextIsOp = typeof forceEnable === 'boolean' ? forceEnable : !currentSession?.isOperator;
        const newSession = {
            isOperator: nextIsOp,
            operatorId: nextIsOp ? 'op_shibuya_preview_01' : null,
            role: nextIsOp ? 'admin' : 'viewer',
        };
        adminService.setOperatorSession(newSession);
        setOperatorSession(newSession);
        setAccessMode('preview');
        if (nextIsOp) {
            setHasAccess(true);
            setAccessError('');
            refreshDashboardData();
        } else {
            setHasAccess(false);
            setAccessError('Access restricted: Preview operator toggle is off.');
        }
    };

    // Drops form handlers
    const openAddDropModal = () => {
        const nextId = adminService.generateDropId();
        setEditingDropId(null);
        setDropForm({
            id: nextId ? String(nextId) : '',
            name: '',
            brand: 'SOLETHIEF',
            size: 'US 9',
            price: '18500.00',
            frontImage: '/shoes/transparent/shoe-1-front.png',
            sideImage: '/shoes/transparent/shoe-1-side.png',
            active: true,
            dropBatch: nextId ? `SHIBUYA-DROP-0${nextId}` : 'SHIBUYA-VAULT-DROP',
            description: 'SoleThief Tokyo vault edition authenticated pair.',
        });
        setDropFormErrors({});
        setShowDropModal(true);
    };

    const openEditDropModal = (drop) => {
        setEditingDropId(drop.id);
        setDropForm({
            id: String(drop.id),
            name: drop.name,
            brand: drop.brand,
            size: drop.size,
            price: (drop.priceMinor / 100).toFixed(2),
            frontImage: drop.frontImage,
            sideImage: drop.sideImage,
            active: drop.active !== false,
            dropBatch: drop.dropBatch || `SHIBUYA-DROP-0${drop.id}`,
            description: drop.description || '',
        });
        setDropFormErrors({});
        setShowDropModal(true);
    };

    const handleSaveDrop = async (e) => {
        e.preventDefault();
        setDropFormErrors({});
        try {
            const payload = {
                id: Number(dropForm.id),
                name: dropForm.name,
                brand: dropForm.brand,
                size: dropForm.size,
                price: dropForm.price,
                frontImage: dropForm.frontImage,
                sideImage: dropForm.sideImage,
                active: dropForm.active,
                dropBatch: dropForm.dropBatch,
                description: dropForm.description,
            };

            if (editingDropId) {
                await adminService.updateDrop(editingDropId, payload);
                setFeedback({ type: 'success', message: `Drop #${editingDropId} updated successfully.` });
            } else {
                await adminService.createDrop(payload);
                setFeedback({ type: 'success', message: `New sneaker drop #${payload.id} published to vault.` });
                setProductRefreshTrigger((prev) => prev + 1);
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('shop-categories-updated'));
                }
            }

            setShowDropModal(false);
            await refreshDashboardData();
        } catch (err) {
            setDropFormErrors({ form: err.message });
        }
    };

    // Inventory status update
    const handleUpdateInventory = async (productId, patch) => {
        try {
            await adminService.updateInventoryPair(productId, patch);
            setFeedback({ type: 'success', message: `Pair #${productId} inventory state updated.` });
            await refreshDashboardData();
        } catch (err) {
            setFeedback({ type: 'error', message: err.message || 'Failed to update inventory.' });
        }
    };

    // Order status update
    const handleUpdateOrderStatus = async (e) => {
        e.preventDefault();
        if (!selectedOrder || !orderStatusForm.status) return;

        try {
            const updated = await adminService.updateOrderStatus(
                selectedOrder.id,
                orderStatusForm.status,
                orderStatusForm.notes
            );
            setSelectedOrder(updated);
            setFeedback({
                type: 'success',
                message: `Order ${selectedOrder.id} status transitioned to "${orderStatusForm.status}".`,
            });
            await refreshDashboardData();
        } catch (err) {
            setFeedback({ type: 'error', message: err.message || 'Failed to update order fulfillment.' });
        }
    };

    // Filtered lists
    const filteredDrops = useMemo(() => {
        if (!dropSearchQuery.trim()) return drops;
        const q = dropSearchQuery.toLowerCase();
        return drops.filter(
            (d) =>
                d.name.toLowerCase().includes(q) ||
                d.brand.toLowerCase().includes(q) ||
                String(d.id).includes(q)
        );
    }, [drops, dropSearchQuery]);

    const filteredOrders = useMemo(() => {
        return orders.filter((o) => {
            const matchesStatus = orderFilterStatus === 'all' || o.status === orderFilterStatus;
            const matchesQuery =
                !orderSearchQuery.trim() ||
                o.id.toLowerCase().includes(orderSearchQuery.toLowerCase()) ||
                (o.shipping_name && o.shipping_name.toLowerCase().includes(orderSearchQuery.toLowerCase())) ||
                (o.user_email && o.user_email.toLowerCase().includes(orderSearchQuery.toLowerCase()));
            return matchesStatus && matchesQuery;
        });
    }, [orders, orderFilterStatus, orderSearchQuery]);

    return (
        <div className="adminRoot">
            <Navbar />

            <main className="commercePage adminPageContainer" id="admin-main">
                {/* Header with Title and Mode Badges */}
                <header className="adminHeaderSection">
                    <div className="adminTitleWrapper">
                        <span className="adminKanjiSub">渋谷統括本部 / OPERATIONS CONSOLE</span>
                        <h1 className="adminTitle">SHIBUYA COMMAND</h1>
                        <p className="adminSubtitle">
                            Drop allocation, physical authentication records, and client fulfillment ledger.
                        </p>
                    </div>

                    <div className="adminControlsGroup">
                        {isDemoAllowed ? (
                            <div className="adminOperatorBadgeGroup" data-access-mode={accessMode}>
                                <span className={`adminOperatorBadge ${operatorSession?.isOperator ? 'isActive' : 'isInactive'}`}>
                                    <ShieldCheck size={16} />
                                    {operatorSession?.isOperator ? 'DEMO OPERATOR: ACTIVE' : 'DEMO OPERATOR: DISABLED'}
                                </span>
                                <button
                                    type="button"
                                    className="adminModeToggleButton"
                                    onClick={handleToggleOperatorPreview}
                                    aria-label="Toggle demo operator mode"
                                >
                                    {operatorSession?.isOperator ? 'Deactivate Demo' : 'Activate Demo (Local browser only, no authentication)'}
                                </button>
                            </div>
                        ) : (
                            <span className="adminLiveBadge">
                                <ShieldCheck size={16} />
                                {runtimeStatus === 'configured' ? (
                                    `LIVE OPERATOR: ${profile?.display_name || user?.email || 'ADMINISTRATOR'}`
                                ) : (
                                    'LIVE MODE (FAIL-CLOSED)'
                                )}
                            </span>
                        )}

                        <button
                            type="button"
                            className="adminRefreshButton"
                            onClick={refreshDashboardData}
                            disabled={dataLoading}
                            aria-label="Refresh console data"
                        >
                            <RefreshCw size={16} className={dataLoading ? 'adminSpin' : ''} />
                            <span>Sync</span>
                        </button>
                    </div>
                </header>

                {/* Feedback Toast */}
                {feedback.message && (
                    <div className={`adminFeedbackBanner ${feedback.type}`} role="status">
                        {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                        <span>{feedback.message}</span>
                        <button
                            type="button"
                            className="adminCloseFeedback"
                            onClick={() => setFeedback({ type: '', message: '' })}
                            aria-label="Dismiss feedback"
                        >
                            &times;
                        </button>
                    </div>
                )}

                {/* Access Restricted View */}
                {accessLoading && !isAuthorized ? (
                    <section className="adminCard adminLoadingCard" aria-live="polite">
                        <RefreshCw size={32} className="adminSpin" />
                        <p>Authenticating cryptographic operator permissions...</p>
                    </section>
                ) : !isAuthorized || !hasConsoleAccess ? (
                    <section className="adminCard adminRestrictedCard" aria-labelledby="restricted-title">
                        <div className="adminRestrictedIconWrapper">
                            <Lock size={48} />
                        </div>
                        <span className="adminRestrictedKanji">立 入 禁 止</span>
                        <h2 id="restricted-title" className="adminRestrictedTitle">
                            ACCESS RESTRICTED
                        </h2>
                        <p className="adminRestrictedText">
                            {accessError || 'This operations console is restricted to authenticated store operators possessing the admin role.'}
                        </p>
                        <div className="adminRestrictedActions">
                            {isDemoAllowed ? (
                                <button
                                    type="button"
                                    className="adminPrimaryButton"
                                    onClick={() => handleToggleOperatorPreview(true)}
                                >
                                    Enable Demo Operator Mode (Local browser only, no authentication)
                                </button>
                            ) : (
                                <Link to="/account?return=/admin" className="adminPrimaryButton">
                                    Sign In With Operator Credentials
                                </Link>
                            )}
                            <Link to="/shop" className="adminSecondaryButton">
                                Return to Public Shop
                            </Link>
                        </div>
                    </section>
                ) : (
                    <>
                        {/* Executive KPIs Snapshot */}
                        <section className="adminMetricsGrid" aria-label="Executive KPIs">
                            <div className="adminMetricCard">
                                <div className="adminMetricIcon"><TrendingUp size={22} /></div>
                                <div className="adminMetricContent">
                                    <span className="adminMetricKanji">総売上 / REVENUE</span>
                                    <div className="adminMetricValue">{formatMoney(metrics.totalRevenueMinor)}</div>
                                    <span className="adminMetricMeta">From {metrics.totalOrdersCount} placed orders</span>
                                </div>
                            </div>

                            <div className="adminMetricCard">
                                <div className="adminMetricIcon"><Layers size={22} /></div>
                                <div className="adminMetricContent">
                                    <span className="adminMetricKanji">有効ドロップ / ACTIVE DROPS</span>
                                    <div className="adminMetricValue">{metrics.activeDropsCount} Pairs</div>
                                    <span className="adminMetricMeta">Catalog listings online</span>
                                </div>
                            </div>

                            <div className="adminMetricCard">
                                <div className="adminMetricIcon"><Package size={22} /></div>
                                <div className="adminMetricContent">
                                    <span className="adminMetricKanji">在庫ペア / AVAILABLE</span>
                                    <div className="adminMetricValue">{metrics.availablePairsCount} Pairs</div>
                                    <span className="adminMetricMeta">Deadstock verified in vault</span>
                                </div>
                            </div>

                            <div className="adminMetricCard">
                                <div className="adminMetricIcon"><Truck size={22} /></div>
                                <div className="adminMetricContent">
                                    <span className="adminMetricKanji">出荷待ち / DISPATCH QUEUE</span>
                                    <div className="adminMetricValue">{metrics.pendingShipmentsCount} Orders</div>
                                    <span className="adminMetricMeta">Pending fulfillment</span>
                                </div>
                            </div>
                        </section>

                        {/* Navigation Tabs */}
                        <nav className="adminTabsNav" aria-label="Dashboard views">
                            <button
                                type="button"
                                className={`adminTabButton ${currentTab === 'collections' ? 'isActive' : ''}`}
                                onClick={() => setCurrentTab('collections')}
                                aria-selected={currentTab === 'collections'}
                            >
                                <Sliders size={18} />
                                <span>SHOP COLLECTIONS</span>
                            </button>
                            <button
                                type="button"
                                className={`adminTabButton ${currentTab === 'drops' ? 'isActive' : ''}`}
                                onClick={() => setCurrentTab('drops')}
                                aria-selected={currentTab === 'drops'}
                            >
                                <Package size={18} />
                                <span>INVENTORY & DROPS</span>
                                <span className="adminTabCount">{drops.length}</span>
                            </button>
                            <button
                                type="button"
                                className={`adminTabButton ${currentTab === 'orders' ? 'isActive' : ''}`}
                                onClick={() => setCurrentTab('orders')}
                                aria-selected={currentTab === 'orders'}
                            >
                                <Truck size={18} />
                                <span>FULFILLMENT & ORDERS</span>
                                <span className="adminTabCount">{orders.length}</span>
                            </button>
                        </nav>

                        {/* TAB 0: Shop Collections (Default) */}
                        {currentTab === 'collections' && (
                            <ShopCollectionsAdmin
                                onOpenCreateDrop={openAddDropModal}
                                refreshTrigger={productRefreshTrigger}
                            />
                        )}

                        {/* TAB 1: Inventory & Drops Management */}
                        {currentTab === 'drops' && (
                            <section className="adminSection" aria-labelledby="drops-management-title">
                                <div className="adminSectionToolbar">
                                    <div className="adminSearchBox">
                                        <Search size={18} />
                                        <input
                                            type="text"
                                            placeholder="Filter drops by name, brand, or ID..."
                                            value={dropSearchQuery}
                                            onChange={(e) => setDropSearchQuery(e.target.value)}
                                            aria-label="Filter sneaker drops"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        className="adminPrimaryButton adminAddDropButton"
                                        onClick={openAddDropModal}
                                    >
                                        <Plus size={18} />
                                        <span>New Sneaker Drop</span>
                                    </button>
                                </div>

                                <div className="adminDropsTableContainer">
                                    <table className="adminTable" aria-label="Sneaker catalog drops">
                                        <thead>
                                            <tr>
                                                <th scope="col">PAIR ID</th>
                                                <th scope="col">SNEAKER / MODEL</th>
                                                <th scope="col">SIZE</th>
                                                <th scope="col">PRICE (INR)</th>
                                                <th scope="col">CATALOG VISIBILITY</th>
                                                <th scope="col">INVENTORY STATE</th>
                                                <th scope="col">AUTHENTICATION</th>
                                                <th scope="col">OPERATOR ACTIONS</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredDrops.map((drop) => {
                                                const invItem = inventory[drop.id] || {
                                                    state: 'available',
                                                    verified: false,
                                                    verificationStatus: 'unverified',
                                                };

                                                return (
                                                    <tr key={drop.id} className="adminTableRow">
                                                        <td className="adminCellId">
                                                            <span className="adminPairBadge">#{drop.id}</span>
                                                        </td>
                                                        <td className="adminCellProduct">
                                                            <div className="adminProductCellContent">
                                                                <img
                                                                    src={drop.frontImage}
                                                                    alt={drop.name}
                                                                    className="adminShoeThumb"
                                                                />
                                                                <div>
                                                                    <div className="adminProductBrand">{drop.brand}</div>
                                                                    <div className="adminProductName">{drop.name}</div>
                                                                    <span className="adminProductBatch">{drop.dropBatch || 'Tokyo Archive'}</span>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <span className="adminSizeTag">{drop.size}</span>
                                                        </td>
                                                        <td className="adminCellPrice">
                                                            {formatMoney(drop.priceMinor)}
                                                        </td>
                                                        <td>
                                                            <span className={`adminStatusBadge ${drop.active ? 'badgeActive' : 'badgeInactive'}`}>
                                                                {drop.active ? 'ACTIVE' : 'HIDDEN'}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <select
                                                                className={`adminStateSelect state-${invItem.state}`}
                                                                value={invItem.state}
                                                                onChange={(e) => handleUpdateInventory(drop.id, { state: e.target.value })}
                                                                aria-label={`Inventory state for drop #${drop.id}`}
                                                            >
                                                                {INVENTORY_STATES.map((st) => (
                                                                    <option key={st} value={st}>
                                                                        {st.toUpperCase()}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </td>
                                                        <td>
                                                            <div className="adminVerificationBox">
                                                                <button
                                                                    type="button"
                                                                    className={`adminVerifyToggle ${invItem.verified ? 'isVerified' : 'isUnverified'}`}
                                                                    onClick={() => handleUpdateInventory(drop.id, {
                                                                        verified: !invItem.verified,
                                                                        verificationStatus: !invItem.verified ? 'verified' : 'unverified',
                                                                        verifiedBy: !invItem.verified ? (user?.email || 'Store Operator') : null,
                                                                        verifiedAt: !invItem.verified ? new Date().toISOString() : null,
                                                                    })}
                                                                    aria-label={`Toggle physical verification for drop #${drop.id}`}
                                                                >
                                                                    {invItem.verified ? (
                                                                        <>
                                                                            <ShieldCheck size={14} />
                                                                            <span>VERIFIED</span>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <AlertCircle size={14} />
                                                                            <span>UNVERIFIED</span>
                                                                        </>
                                                                    )}
                                                                </button>
                                                                {invItem.serialTag && (
                                                                    <span className="adminSerialTag">{invItem.serialTag}</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <div className="adminRowActions">
                                                                <button
                                                                    type="button"
                                                                    className="adminIconAction"
                                                                    onClick={() => openEditDropModal(drop)}
                                                                    aria-label={`Edit drop #${drop.id}`}
                                                                    title="Edit Drop Metadata"
                                                                >
                                                                    <Edit3 size={16} />
                                                                </button>
                                                                <Link
                                                                    to={`/product/${drop.id}`}
                                                                    className="adminIconAction"
                                                                    aria-label={`View drop #${drop.id} on storefront`}
                                                                    title="View on Storefront"
                                                                >
                                                                    <ArrowUpRight size={16} />
                                                                </Link>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        )}

                        {/* TAB 2: Order Fulfillment & Operations */}
                        {currentTab === 'orders' && (
                            <section className="adminSection" aria-labelledby="order-fulfillment-title">
                                <div className="adminSectionToolbar">
                                    <div className="adminSearchBox">
                                        <Search size={18} />
                                        <input
                                            type="text"
                                            placeholder="Search orders by ID, recipient, or email..."
                                            value={orderSearchQuery}
                                            onChange={(e) => setOrderSearchQuery(e.target.value)}
                                            aria-label="Search customer orders"
                                        />
                                    </div>

                                    <div className="adminFilterGroup">
                                        <Sliders size={18} />
                                        <select
                                            value={orderFilterStatus}
                                            onChange={(e) => setOrderFilterStatus(e.target.value)}
                                            aria-label="Filter orders by status"
                                            className="adminFilterSelect"
                                        >
                                            <option value="all">ALL STATUSES ({orders.length})</option>
                                            <option value="pending_payment">PENDING PAYMENT</option>
                                            <option value="paid">PAID</option>
                                            <option value="confirmed">CONFIRMED</option>
                                            <option value="authenticating">AUTHENTICATING</option>
                                            <option value="processing">PROCESSING</option>
                                            <option value="shipped">SHIPPED</option>
                                            <option value="delivered">DELIVERED</option>
                                            <option value="cancelled">CANCELLED</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="adminOrdersTableContainer">
                                    <table className="adminTable" aria-label="Customer orders ledger">
                                        <thead>
                                            <tr>
                                                <th scope="col">ORDER ID</th>
                                                <th scope="col">TIMESTAMP</th>
                                                <th scope="col">CUSTOMER</th>
                                                <th scope="col">ITEMS</th>
                                                <th scope="col">TOTAL (INR)</th>
                                                <th scope="col">PAYMENT</th>
                                                <th scope="col">STATUS</th>
                                                <th scope="col">FULFILLMENT</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredOrders.length === 0 ? (
                                                <tr>
                                                    <td colSpan="8" className="adminEmptyTableCell">
                                                        No orders found matching the filter criteria.
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredOrders.map((order) => {
                                                    const itemsCount = (order.items || []).length;
                                                    const totalPaise = order.total_minor ?? order.total_amount_minor ?? 0;

                                                    return (
                                                        <tr key={order.id} className="adminTableRow">
                                                            <td className="adminCellOrderId">
                                                                <button
                                                                    type="button"
                                                                    className="adminOrderLink"
                                                                    onClick={() => {
                                                                        setSelectedOrder(order);
                                                                        setOrderStatusForm({
                                                                            status: order.status,
                                                                            notes: order.fulfillment_notes || '',
                                                                        });
                                                                    }}
                                                                >
                                                                    {order.id}
                                                                </button>
                                                            </td>
                                                            <td className="adminCellTime">
                                                                {new Date(order.created_at).toLocaleDateString('en-IN', {
                                                                    day: 'numeric',
                                                                    month: 'short',
                                                                    year: 'numeric',
                                                                })}
                                                            </td>
                                                            <td>
                                                                <div className="adminCustomerCell">
                                                                    <div className="adminCustomerName">{order.shipping_name || 'Customer'}</div>
                                                                    <div className="adminCustomerEmail">{order.user_email || order.shipping_phone || 'Private'}</div>
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <span className="adminItemBadge">
                                                                    {itemsCount} {itemsCount === 1 ? 'Pair' : 'Pairs'}
                                                                </span>
                                                            </td>
                                                            <td className="adminCellPrice">
                                                                {formatMoney(totalPaise)}
                                                            </td>
                                                            <td>
                                                                <span className="adminPaymentMethodBadge">
                                                                    {order.payment_method === 'cod' ? 'COD' : 'RAZORPAY'}
                                                                </span>
                                                            </td>
                                                            <td>
                                                                <span className={`adminOrderStatusBadge status-${order.status}`}>
                                                                    {order.status.toUpperCase()}
                                                                </span>
                                                            </td>
                                                            <td>
                                                                <button
                                                                    type="button"
                                                                    className="adminFulfillButton"
                                                                    onClick={() => {
                                                                        setSelectedOrder(order);
                                                                        setOrderStatusForm({
                                                                            status: order.status,
                                                                            notes: order.fulfillment_notes || '',
                                                                        });
                                                                    }}
                                                                >
                                                                    <Eye size={14} />
                                                                    <span>Inspect</span>
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        )}
                    </>
                )}

                {/* MODAL: Add / Edit Drop */}
                {showDropModal && (
                    <div className="adminModalOverlay" role="dialog" aria-modal="true" aria-labelledby="drop-modal-title">
                        <div className="adminModalCard">
                            <div className="adminModalHeader">
                                <div>
                                    <span className="adminKanjiSub">ドロップ登録 / CATALOG DROP</span>
                                    <h3 id="drop-modal-title" className="adminModalTitle">
                                        {editingDropId ? `EDIT DROP #${editingDropId}` : 'PUBLISH NEW SNEAKER DROP'}
                                    </h3>
                                </div>
                                <button
                                    type="button"
                                    className="adminModalClose"
                                    onClick={() => setShowDropModal(false)}
                                    aria-label="Close modal"
                                >
                                    &times;
                                </button>
                            </div>

                            <form onSubmit={handleSaveDrop} className="adminDropForm">
                                {dropFormErrors.form && (
                                    <div className="adminFormErrorBanner">
                                        <AlertCircle size={16} />
                                        <span>{dropFormErrors.form}</span>
                                    </div>
                                )}

                                <div className="adminFormGrid">
                                    <label className="adminFormLabel">
                                        <span>PAIR ID (Positive Integer)</span>
                                        <input
                                            type="number"
                                            value={dropForm.id}
                                            onChange={(e) => setDropForm({ ...dropForm, id: e.target.value })}
                                            disabled={Boolean(editingDropId)}
                                            required
                                            min="1"
                                            className="adminInput"
                                        />
                                    </label>

                                    <label className="adminFormLabel">
                                        <span>BRAND / LABEL</span>
                                        <input
                                            type="text"
                                            value={dropForm.brand}
                                            onChange={(e) => setDropForm({ ...dropForm, brand: e.target.value })}
                                            required
                                            placeholder="e.g. SOLETHIEF TIGER"
                                            className="adminInput"
                                        />
                                    </label>

                                    <label className="adminFormLabel">
                                        <span>MODEL / SILHOUETTE</span>
                                        <input
                                            type="text"
                                            value={dropForm.name}
                                            onChange={(e) => setDropForm({ ...dropForm, name: e.target.value })}
                                            required
                                            placeholder="e.g. MEXICO 66 FIRE"
                                            className="adminInput"
                                        />
                                    </label>

                                    <label className="adminFormLabel">
                                        <span>SIZE (US / UK / EU)</span>
                                        <input
                                            type="text"
                                            value={dropForm.size}
                                            onChange={(e) => setDropForm({ ...dropForm, size: e.target.value })}
                                            required
                                            placeholder="e.g. US 9"
                                            className="adminInput"
                                        />
                                    </label>

                                    <label className="adminFormLabel">
                                        <span>PRICE IN INR (₹)</span>
                                        <input
                                            type="text"
                                            value={dropForm.price}
                                            onChange={(e) => setDropForm({ ...dropForm, price: e.target.value })}
                                            required
                                            placeholder="e.g. 19000.00"
                                            className="adminInput"
                                        />
                                    </label>

                                    <label className="adminFormLabel">
                                        <span>DROP BATCH CODE</span>
                                        <input
                                            type="text"
                                            value={dropForm.dropBatch}
                                            onChange={(e) => setDropForm({ ...dropForm, dropBatch: e.target.value })}
                                            placeholder="e.g. SHIBUYA-DROP-01"
                                            className="adminInput"
                                        />
                                    </label>
                                </div>

                                <div className="adminFormGrid">
                                    <label className="adminFormLabel">
                                        <span>FRONT ANGLE IMAGE PATH</span>
                                        <input
                                            type="text"
                                            value={dropForm.frontImage}
                                            onChange={(e) => setDropForm({ ...dropForm, frontImage: e.target.value })}
                                            required
                                            className="adminInput"
                                        />
                                        <div className="adminQuickImagePicks">
                                            {[1, 2, 3, 4, 5].map((idx) => (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    className="adminImagePickBtn"
                                                    onClick={() => setDropForm({
                                                        ...dropForm,
                                                        frontImage: `/shoes/transparent/shoe-${idx}-front.png`,
                                                        sideImage: `/shoes/transparent/shoe-${idx}-side.png`,
                                                    })}
                                                >
                                                    Preset #{idx}
                                                </button>
                                            ))}
                                        </div>
                                    </label>

                                    <label className="adminFormLabel">
                                        <span>SIDE PROFILE IMAGE PATH</span>
                                        <input
                                            type="text"
                                            value={dropForm.sideImage}
                                            onChange={(e) => setDropForm({ ...dropForm, sideImage: e.target.value })}
                                            required
                                            className="adminInput"
                                        />
                                    </label>
                                </div>

                                <label className="adminFormLabel">
                                    <span>ARCHIVE NOTES / PROVENANCE</span>
                                    <textarea
                                        rows="2"
                                        value={dropForm.description}
                                        onChange={(e) => setDropForm({ ...dropForm, description: e.target.value })}
                                        className="adminTextarea"
                                    />
                                </label>

                                <div className="adminCheckboxRow">
                                    <label className="adminCheckboxLabel">
                                        <input
                                            type="checkbox"
                                            checked={dropForm.active}
                                            onChange={(e) => setDropForm({ ...dropForm, active: e.target.checked })}
                                        />
                                        <span>Active catalog listing (visible on public shop)</span>
                                    </label>
                                </div>

                                <div className="adminModalFooter">
                                    <button
                                        type="button"
                                        className="adminSecondaryButton"
                                        onClick={() => setShowDropModal(false)}
                                    >
                                        Cancel
                                    </button>
                                    <button type="submit" className="adminPrimaryButton">
                                        {editingDropId ? 'Save Changes' : 'Publish Drop'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* MODAL / DRAWER: Order Inspection & Fulfillment */}
                {selectedOrder && (
                    <div className="adminModalOverlay" role="dialog" aria-modal="true" aria-labelledby="order-drawer-title">
                        <div className="adminModalCard adminOrderDrawerCard">
                            <div className="adminModalHeader">
                                <div>
                                    <span className="adminKanjiSub">出荷管理 / FULFILLMENT DOSSIER</span>
                                    <h3 id="order-drawer-title" className="adminModalTitle">
                                        ORDER {selectedOrder.id}
                                    </h3>
                                </div>
                                <button
                                    type="button"
                                    className="adminModalClose"
                                    onClick={() => setSelectedOrder(null)}
                                    aria-label="Close order details"
                                >
                                    &times;
                                </button>
                            </div>

                            <div className="adminOrderModalBody">
                                {/* Order Status Progression Card */}
                                <div className="adminOrderFulfillSection">
                                    <h4 className="adminSubsectionTitle">OPERATOR FULFILLMENT ACTION</h4>
                                    <p className="adminSubsectionDesc">
                                        Advance order state through the authenticated Japanese streetwear lifecycle:
                                        <br />
                                        <strong>Confirmed</strong> &rarr; <strong>Authenticating</strong> &rarr; <strong>Shipped</strong> &rarr; <strong>Delivered</strong>
                                    </p>

                                    <form onSubmit={handleUpdateOrderStatus} className="adminFulfillForm">
                                        <div className="adminFulfillRow">
                                            <label className="adminFormLabel">
                                                <span>TRANSITION TO STATUS</span>
                                                <select
                                                    value={orderStatusForm.status}
                                                    onChange={(e) => setOrderStatusForm({ ...orderStatusForm, status: e.target.value })}
                                                    className="adminSelect"
                                                >
                                                    <option value={selectedOrder.status}>
                                                        Current: {selectedOrder.status.toUpperCase()}
                                                    </option>
                                                    {(ADMIN_FULFILLMENT_TRANSITIONS[selectedOrder.status] || []).map((st) => (
                                                        <option key={st} value={st}>
                                                            &rarr; {st.toUpperCase()}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>

                                            <label className="adminFormLabel adminFlexGrow">
                                                <span>AUTHENTICATION / TRACKING NOTES</span>
                                                <input
                                                    type="text"
                                                    value={orderStatusForm.notes}
                                                    onChange={(e) => setOrderStatusForm({ ...orderStatusForm, notes: e.target.value })}
                                                    placeholder="e.g. AWB #BLUEDART-889102 dispatched from Shibuya vault"
                                                    className="adminInput"
                                                />
                                            </label>

                                            <button
                                                type="submit"
                                                className="adminPrimaryButton adminCommitStatusBtn"
                                                disabled={orderStatusForm.status === selectedOrder.status}
                                            >
                                                Commit State
                                            </button>
                                        </div>
                                    </form>
                                </div>

                                {/* Order Summary Grid */}
                                <div className="adminOrderDetailsGrid">
                                    {/* Shipping Address */}
                                    <div className="adminDetailBlock">
                                        <h4 className="adminSubsectionTitle">SHIPPING DESTINATION</h4>
                                        <div className="adminAddressDisplay">
                                            <p className="adminAddrName">{selectedOrder.shipping_name || selectedOrder.shipping_address?.recipient}</p>
                                            <p>{selectedOrder.shipping_line1 || selectedOrder.shipping_address?.line1}</p>
                                            {selectedOrder.shipping_line2 && <p>{selectedOrder.shipping_line2}</p>}
                                            <p>
                                                {selectedOrder.shipping_city || selectedOrder.shipping_address?.city},{' '}
                                                {selectedOrder.shipping_state || selectedOrder.shipping_address?.region} -{' '}
                                                {selectedOrder.shipping_postal_code || selectedOrder.shipping_address?.postal_code}
                                            </p>
                                            <p className="adminAddrCountry">
                                                {selectedOrder.shipping_country || selectedOrder.shipping_address?.country_code || 'IN'} &bull;{' '}
                                                Phone: {selectedOrder.shipping_phone || selectedOrder.shipping_address?.phone}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Payment & Financials */}
                                    <div className="adminDetailBlock">
                                        <h4 className="adminSubsectionTitle">FINANCIAL SETTLEMENT</h4>
                                        <div className="adminFinancialDisplay">
                                            <div className="adminFinRow">
                                                <span>Subtotal:</span>
                                                <span>{formatMoney(selectedOrder.subtotal_minor || 0)}</span>
                                            </div>
                                            <div className="adminFinRow">
                                                <span>Insured Shipping:</span>
                                                <span>{formatMoney(selectedOrder.shipping_minor || 0)}</span>
                                            </div>
                                            <div className="adminFinRow">
                                                <span>GST (18%):</span>
                                                <span>{formatMoney(selectedOrder.tax_minor || 0)}</span>
                                            </div>
                                            <div className="adminFinRow adminFinTotal">
                                                <span>Total Settled:</span>
                                                <span>{formatMoney(selectedOrder.total_minor ?? selectedOrder.total_amount_minor ?? 0)}</span>
                                            </div>
                                            <div className="adminFinProvider">
                                                <span>Payment: <strong>{selectedOrder.payment_method?.toUpperCase()}</strong></span>
                                                {selectedOrder.provider_order_id && (
                                                    <span className="adminProviderId">Ref: {selectedOrder.provider_order_id}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Line Items */}
                                <div className="adminOrderItemsSection">
                                    <h4 className="adminSubsectionTitle">LINE ITEMS (DEADSTOCK PAIRS)</h4>
                                    <div className="adminItemsList">
                                        {(selectedOrder.items || []).map((item, i) => (
                                            <div key={i} className="adminItemRow">
                                                <img
                                                    src={item.front_image || item.image_url || '/shoes/transparent/shoe-1-front.png'}
                                                    alt={item.name}
                                                    className="adminItemImage"
                                                />
                                                <div className="adminItemDetails">
                                                    <span className="adminItemBrand">{item.brand}</span>
                                                    <span className="adminItemName">{item.name}</span>
                                                    <span className="adminItemSize">Size: {item.size} &bull; Qty: {item.quantity || 1}</span>
                                                </div>
                                                <div className="adminItemPrice">
                                                    {formatMoney(item.line_total_minor || item.unit_price_minor || 0)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            <Footer />
        </div>
    );
}

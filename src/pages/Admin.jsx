import TransparentArtwork from '../components/TransparentArtwork';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
    Trash2,
    Users,
    MessageSquare,
    Ban,
    Check,
    Download,
    Upload,
    Flame,
    Sparkles,
    Save,
    Send,
    CreditCard,
    RotateCcw,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useAuth } from '../auth/authContext.js';
import { getSupabaseRuntime } from '../lib/supabase.js';
import { createAdminService } from '../services/admin.js';
import { createShopCategoriesService } from '../services/shopCategories.js';
import { formatMoney } from '../commerce/cart.js';
import {
    INVENTORY_STATES,
    ADMIN_FULFILLMENT_TRANSITIONS,
    ADMIN_ORDER_FILTERS,
    normalizeAdminOrderFilter,
    compressImage,
    compressImageFile,
    downloadAndOptimizeRemoteImage,
    isOnlineImageUrl,
    calculateOperationalMetrics,
} from '../commerce/admin.js';
import ShopCollectionsAdmin from './ShopCollectionsAdmin.jsx';
import AdminHomeShowcase from './AdminHomeShowcase.jsx';
import AdminNewDrops from './AdminNewDrops.jsx';
import { createGlobalSettingsService, DEFAULT_GLOBAL_SETTINGS } from '../services/globalSettings.js';

function GlobalControlHub({ settings, setSettings, onSave, onTestPayment, loading }) {
    const [paymentTestResult, setPaymentTestResult] = useState(null);
    const [testingPayment, setTestingPayment] = useState(false);

    const update = (section, field, value) =>
        setSettings((current) => ({
            ...current,
            [section]: { ...current[section], [field]: value },
        }));

    const updateNav = (index, field, value) =>
        setSettings((current) => ({
            ...current,
            navigation: current.navigation.map((item, itemIndex) =>
                itemIndex === index ? { ...item, [field]: value } : item
            ),
        }));

    const removeNav = (index) =>
        setSettings((current) => ({
            ...current,
            navigation: current.navigation.filter((_, itemIndex) => itemIndex !== index),
        }));

    const addNav = () =>
        setSettings((current) => ({
            ...current,
            navigation: [
                ...current.navigation,
                {
                    label: 'New Link',
                    href: '/',
                    visible: true,
                    displayOrder: (current.navigation.length + 1) * 10,
                },
            ],
        }));

    const testPayment = async () => {
        setTestingPayment(true);
        setPaymentTestResult(null);
        try {
            const result = await onTestPayment();
            setPaymentTestResult(
                result.ok
                    ? { ok: true, message: 'Protected payment connection verified successfully.' }
                    : { ok: false, message: result.error || 'Protected payment test connection failed.' }
            );
        } catch (err) {
            setPaymentTestResult({ ok: false, message: err.message || 'Payment test failed.' });
        } finally {
            setTestingPayment(false);
        }
    };

    const handleResetDefaults = () => {
        if (window.confirm('Reset all storefront settings (Banner, Navigation, Footer, SEO, Payment) to original system defaults?')) {
            setSettings(JSON.parse(JSON.stringify(DEFAULT_GLOBAL_SETTINGS)));
        }
    };

    return (
        <section className="adminSection" aria-labelledby="global-control-title">
            <div className="adminSectionToolbar">
                <div>
                    <span className="adminKanjiSub">全体統括設定 / STOREFRONT CONFIGURATION</span>
                    <h2 id="global-control-title">Storefront Control Hub</h2>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'rgba(21, 27, 43, 0.65)' }}>
                        Manage public hero banner, store navigation menu, footer information, SEO meta tags, and payment infrastructure.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                        type="button"
                        className="adminSecondaryButton"
                        onClick={handleResetDefaults}
                        title="Reset all settings to defaults"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <RotateCcw size={15} />
                        <span>Reset Defaults</span>
                    </button>
                    <button type="button" className="adminPrimaryButton" onClick={onSave} disabled={loading}>
                        {loading ? (
                            <>
                                <RefreshCw size={14} className="adminSpin" />
                                <span>Saving...</span>
                            </>
                        ) : (
                            <>
                                <Save size={15} />
                                <span>Save All Settings</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            <div className="adminGlobalHubGrid">
                {/* 1. HOMEPAGE BANNER & LIVE PREVIEW */}
                <div className="adminCard adminGlobalCard adminGlobalSpan2">
                    <div className="adminGlobalCardHeader">
                        <div>
                            <span className="adminKanjiSub">告知バナー / HERO ANNOUNCEMENT</span>
                            <h3 className="adminGlobalCardTitle">Homepage Announcement Banner</h3>
                        </div>
                        <label className="adminCheckboxLabel" style={{ minHeight: 'auto' }}>
                            <input
                                type="checkbox"
                                checked={settings.banner.enabled !== false}
                                onChange={(e) => update('banner', 'enabled', e.target.checked)}
                            />
                            <span>Banner Enabled</span>
                        </label>
                    </div>

                    <div className="adminBannerSplitLayout">
                        <div className="adminBannerInputs">
                            <label className="adminFormLabel">
                                <span>EYEBROW TAG</span>
                                <input
                                    className="adminInput"
                                    value={settings.banner.eyebrow}
                                    onChange={(e) => update('banner', 'eyebrow', e.target.value)}
                                    placeholder="e.g. NEW DROP"
                                />
                            </label>
                            <label className="adminFormLabel">
                                <span>MAIN HEADLINE</span>
                                <input
                                    className="adminInput"
                                    value={settings.banner.title}
                                    onChange={(e) => update('banner', 'title', e.target.value)}
                                    placeholder="e.g. THE VAULT IS OPEN"
                                />
                            </label>
                            <label className="adminFormLabel">
                                <span>BODY COPY</span>
                                <textarea
                                    className="adminTextarea"
                                    rows="2"
                                    value={settings.banner.body}
                                    onChange={(e) => update('banner', 'body', e.target.value)}
                                    placeholder="e.g. Authenticated pairs. Tokyo-sourced deadstock."
                                />
                            </label>
                            <div className="adminFormGrid" style={{ marginBottom: 0 }}>
                                <label className="adminFormLabel">
                                    <span>CTA BUTTON TEXT</span>
                                    <input
                                        className="adminInput"
                                        value={settings.banner.ctaLabel}
                                        onChange={(e) => update('banner', 'ctaLabel', e.target.value)}
                                        placeholder="e.g. Explore Vault"
                                    />
                                </label>
                                <label className="adminFormLabel">
                                    <span>CTA TARGET URL</span>
                                    <input
                                        className="adminInput"
                                        value={settings.banner.ctaHref}
                                        onChange={(e) => update('banner', 'ctaHref', e.target.value)}
                                        placeholder="e.g. /shop"
                                    />
                                </label>
                            </div>
                        </div>

                        <div className="adminBannerPreviewBox">
                            <span className="adminBannerPreviewLabel">Live Storefront Preview</span>
                            <div className="adminBannerLiveCard">
                                <span className="adminBannerLiveEyebrow">{settings.banner.eyebrow || 'NEW DROP'}</span>
                                <h4 className="adminBannerLiveTitle">{settings.banner.title || 'THE VAULT IS OPEN'}</h4>
                                <p className="adminBannerLiveBody">{settings.banner.body || 'Authenticated pairs. Tokyo-sourced.'}</p>
                                <span className="adminBannerLiveBtn">
                                    {settings.banner.ctaLabel || 'Explore Drop'} &rarr;
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. NAVIGATION BUILDER */}
                <div className="adminCard adminGlobalCard adminGlobalSpan2">
                    <div className="adminGlobalCardHeader">
                        <div>
                            <span className="adminKanjiSub">サイト構造 / STORE NAVIGATION</span>
                            <h3 className="adminGlobalCardTitle">Storefront Navigation Builder</h3>
                        </div>
                        <button type="button" className="adminSecondaryButton" onClick={addNav} style={{ minHeight: '38px', padding: '0 1rem', fontSize: '0.78rem' }}>
                            <Plus size={14} /> <span>Add Link</span>
                        </button>
                    </div>

                    <div className="adminNavBuilderList">
                        {settings.navigation.map((item, index) => (
                            <div className="adminNavBuilderRow" key={`${item.label}-${index}`}>
                                <div className="adminNavOrderBadge">#{item.displayOrder || (index + 1) * 10}</div>
                                <input
                                    className="adminInput"
                                    aria-label="Navigation label"
                                    value={item.label}
                                    placeholder="Link Label"
                                    onChange={(e) => updateNav(index, 'label', e.target.value)}
                                />
                                <input
                                    className="adminInput"
                                    aria-label="Navigation URL"
                                    value={item.href}
                                    placeholder="/target-url"
                                    onChange={(e) => updateNav(index, 'href', e.target.value)}
                                />
                                <input
                                    className="adminInput adminNavOrderInput"
                                    aria-label="Navigation order"
                                    type="number"
                                    value={item.displayOrder}
                                    onChange={(e) => updateNav(index, 'displayOrder', Number(e.target.value))}
                                />
                                <label className="adminCheckboxLabel" style={{ minHeight: 'auto', whiteSpace: 'nowrap' }}>
                                    <input
                                        type="checkbox"
                                        checked={item.visible}
                                        onChange={(e) => updateNav(index, 'visible', e.target.checked)}
                                    />
                                    <span>Visible</span>
                                </label>
                                <button
                                    type="button"
                                    className="adminIconAction adminDangerAction"
                                    style={{ width: '38px', height: '38px', flex: '0 0 38px' }}
                                    onClick={() => removeNav(index)}
                                    aria-label={`Remove navigation item ${item.label}`}
                                    title="Delete link"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 3. POLICIES & FOOTER */}
                <div className="adminCard adminGlobalCard">
                    <div className="adminGlobalCardHeader">
                        <div>
                            <span className="adminKanjiSub">規約と連絡先 / POLICIES & BRAND INFO</span>
                            <h3 className="adminGlobalCardTitle">Footer, Policies & Social</h3>
                        </div>
                    </div>
                    <div className="adminGlobalFieldsCol">
                        {Object.entries(settings.footer).map(([field, value]) => (
                            <label className="adminFormLabel" key={field}>
                                <span>{field.replace(/([A-Z])/g, ' $1').toUpperCase()}</span>
                                <textarea
                                    className="adminTextarea"
                                    rows="2"
                                    value={value}
                                    onChange={(e) => update('footer', field, e.target.value)}
                                    placeholder={`Enter ${field}...`}
                                />
                            </label>
                        ))}
                    </div>
                </div>

                {/* 4. SEO METADATA */}
                <div className="adminCard adminGlobalCard">
                    <div className="adminGlobalCardHeader">
                        <div>
                            <span className="adminKanjiSub">メタデータ / SEARCH OPTIMIZATION</span>
                            <h3 className="adminGlobalCardTitle">Search Engine Optimization (SEO)</h3>
                        </div>
                    </div>
                    <div className="adminGlobalFieldsCol">
                        {Object.entries(settings.seo).map(([field, value]) => (
                            <label className="adminFormLabel" key={field}>
                                <span>{field.replace(/([A-Z])/g, ' $1').toUpperCase()}</span>
                                <input
                                    className="adminInput"
                                    value={value}
                                    onChange={(e) => update('seo', field, e.target.value)}
                                    placeholder={`e.g. SoleThief ${field}`}
                                />
                            </label>
                        ))}
                    </div>
                </div>

                {/* 5. PAYMENT GATEWAY */}
                <div className="adminCard adminGlobalCard adminGlobalSpan2">
                    <div className="adminGlobalCardHeader">
                        <div>
                            <span className="adminKanjiSub">決済ゲートウェイ / PAYMENT GATEWAY</span>
                            <h3 className="adminGlobalCardTitle">Payment Infrastructure Integration</h3>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <span className={`adminStatusBadge ${settings.payment.maintenance ? 'badgeMaintenance' : settings.payment.enabled ? 'badgeActive' : 'badgeInactive'}`}>
                                {settings.payment.maintenance ? 'MAINTENANCE MODE ON' : settings.payment.enabled ? 'GATEWAY ACTIVE' : 'GATEWAY DISABLED'}
                            </span>
                        </div>
                    </div>

                    <div className="adminPaymentFieldsRow2">
                        <label className="adminPaymentField">
                            <span>PAYMENT PROVIDER</span>
                            <input
                                className="adminInput"
                                value={settings.payment.provider}
                                onChange={(e) => update('payment', 'provider', e.target.value)}
                                placeholder="razorpay / stripe"
                            />
                        </label>
                        <label className="adminPaymentField">
                            <span>PUBLIC KEY ID</span>
                            <input
                                className="adminInput"
                                value={settings.payment.keyId}
                                onChange={(e) => update('payment', 'keyId', e.target.value)}
                                placeholder="rzp_live_... / pk_live_..."
                            />
                        </label>
                    </div>

                    <div className="adminPaymentSecurityNote">
                        <ShieldCheck size={16} />
                        <span>Security Notice: Secret keys are cryptographically guarded on the server and never exposed to client browsers.</span>
                    </div>

                    <div className="adminPaymentControlActions">
                        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
                            <label className="adminCheckboxLabel">
                                <input
                                    type="checkbox"
                                    checked={settings.payment.enabled}
                                    onChange={(e) => update('payment', 'enabled', e.target.checked)}
                                />
                                <span>Enable live gateway for customer checkout</span>
                            </label>

                            <label className="adminCheckboxLabel" style={{ color: settings.payment.maintenance ? '#b45309' : '#151b2b' }}>
                                <input
                                    type="checkbox"
                                    checked={Boolean(settings.payment.maintenance)}
                                    onChange={(e) => update('payment', 'maintenance', e.target.checked)}
                                />
                                <span>Maintenance Mode (Disable customer selection)</span>
                            </label>
                        </div>

                        <button
                            type="button"
                            className="adminSecondaryButton"
                            onClick={testPayment}
                            disabled={testingPayment}
                        >
                            {testingPayment ? (
                                <>
                                    <RefreshCw size={14} className="adminSpin" />
                                    <span>Testing Connection...</span>
                                </>
                            ) : (
                                <>
                                    <CreditCard size={14} />
                                    <span>Test Protected Server Connection</span>
                                </>
                            )}
                        </button>
                    </div>

                    {paymentTestResult && (
                        <div className={`adminFeedbackBanner ${paymentTestResult.ok ? 'success' : 'error'}`} style={{ marginTop: '1rem', marginBottom: 0 }}>
                            {paymentTestResult.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                            <span>{paymentTestResult.message}</span>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}

function PaymentGatewayManager({ settings, setSettings, onSave, onTestPayment, loading }) {
    const [paymentTestResult, setPaymentTestResult] = useState(null);
    const [testingPayment, setTestingPayment] = useState(false);
    const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);

    const payment = settings?.payment || {};
    const cod = payment?.cod || {};

    const updatePayment = (field, value) => {
        setSettings((current) => ({
            ...current,
            payment: {
                ...current.payment,
                [field]: value,
            },
        }));
    };

    const updateCod = (field, value) => {
        setSettings((current) => ({
            ...current,
            payment: {
                ...current.payment,
                cod: {
                    ...(current.payment?.cod || {}),
                    [field]: value,
                },
            },
        }));
    };

    const handleSave = async () => {
        setSaveSuccessNotice(false);
        try {
            await onSave();
            setSaveSuccessNotice(true);
            setTimeout(() => setSaveSuccessNotice(false), 4500);
        } catch {
            // onSave handles error feedback
        }
    };

    const testPayment = async () => {
        setTestingPayment(true);
        setPaymentTestResult(null);
        try {
            const result = await onTestPayment();
            setPaymentTestResult(
                result.ok
                    ? { ok: true, message: 'Protected payment connection verified successfully.' }
                    : { ok: false, message: result.error || 'Protected payment test connection failed.' }
            );
        } catch (err) {
            setPaymentTestResult({ ok: false, message: err.message || 'Payment test failed.' });
        } finally {
            setTestingPayment(false);
        }
    };

    return (
        <section className="adminSection" aria-labelledby="payment-gateways-title">
            <div className="adminSectionToolbar">
                <div>
                    <span className="adminKanjiSub">決済ゲートウェイ管理 / PAYMENT GATEWAY CONTROLLER</span>
                    <h2 id="payment-gateways-title">Payment Gateway Management</h2>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'rgba(21, 27, 43, 0.65)' }}>
                        Control live customer payment gateways (Razorpay & COD), toggle emergency maintenance mode, configure public API keys, or disable methods instantly.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <button
                        type="button"
                        className="adminPrimaryButton"
                        onClick={handleSave}
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <RefreshCw size={15} className="adminSpin" />
                                <span>Saving Gateways...</span>
                            </>
                        ) : (
                            <>
                                <Save size={15} />
                                <span>Save Gateway Settings</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {saveSuccessNotice && (
                <div className="adminFeedbackBanner success" style={{ marginBottom: '1.25rem' }}>
                    <CheckCircle2 size={16} />
                    <span>Payment gateway configuration saved successfully and synchronized with customer checkout!</span>
                </div>
            )}

            {/* Quick Status KPI Cards */}
            <div className="adminCustomerStatsGrid" style={{ marginBottom: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <div className="adminCustomerStatBox" style={{ background: '#FAF6EF' }}>
                    <span className="adminCustomerStatLabel">RAZORPAY GATEWAY</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                        <span className={`adminStatusBadge ${payment.maintenance ? 'badgeMaintenance' : payment.enabled ? 'badgeActive' : 'badgeInactive'}`}>
                            {payment.maintenance ? 'MAINTENANCE MODE ON' : payment.enabled ? 'GATEWAY ACTIVE' : 'GATEWAY OFF / DISABLED'}
                        </span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'rgba(21, 27, 43, 0.6)', marginTop: '0.25rem' }}>
                        {payment.mode === 'live' ? 'Live Production Mode' : 'Sandbox / Test Mode'}
                    </span>
                </div>

                <div className="adminCustomerStatBox" style={{ background: '#FAF6EF' }}>
                    <span className="adminCustomerStatLabel">CASH ON DELIVERY (COD)</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                        <span className={`adminStatusBadge ${cod.maintenance ? 'badgeMaintenance' : cod.enabled !== false ? 'badgeActive' : 'badgeInactive'}`}>
                            {cod.maintenance ? 'MAINTENANCE MODE ON' : cod.enabled !== false ? 'COD ACTIVE' : 'COD DISABLED'}
                        </span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'rgba(21, 27, 43, 0.6)', marginTop: '0.25rem' }}>
                        Archive Reserve / Courier Doorstep
                    </span>
                </div>

                <div className="adminCustomerStatBox" style={{ background: '#FAF6EF' }}>
                    <span className="adminCustomerStatLabel">BACKEND API CREDENTIALS</span>
                    <strong style={{ fontSize: '0.95rem', color: payment.keyId ? '#2e6930' : '#a36214', marginTop: '0.25rem' }}>
                        {payment.keyId ? 'Key ID Configured' : 'No Key ID Set (Missing Backend Config)'}
                    </strong>
                    <span style={{ fontSize: '0.75rem', color: 'rgba(21, 27, 43, 0.6)' }}>
                        {payment.secretConfigured ? 'Server secret encrypted' : 'Secret unverified'}
                    </span>
                </div>

                <div className="adminCustomerStatBox" style={{ background: '#FAF6EF' }}>
                    <span className="adminCustomerStatLabel">CHECKOUT SAFETY GUARD</span>
                    <strong style={{ fontSize: '0.95rem', color: (payment.enabled && !payment.keyId && !payment.maintenance) ? '#dc2626' : '#2e6930', marginTop: '0.25rem' }}>
                        {(payment.enabled && !payment.keyId && !payment.maintenance) ? 'Attention Required' : 'Guarded & Operational'}
                    </strong>
                    <span style={{ fontSize: '0.75rem', color: 'rgba(21, 27, 43, 0.6)' }}>
                        {(payment.enabled && !payment.keyId && !payment.maintenance) ? 'Missing Key: turn off or enable maintenance' : 'Unselectable when offline'}
                    </span>
                </div>
            </div>

            <div className="adminGlobalGrid">
                {/* 1. RAZORPAY GATEWAY CARD */}
                <div className="adminCard adminGlobalCard adminGlobalSpan2">
                    <div className="adminGlobalCardHeader">
                        <div>
                            <span className="adminKanjiSub">オンライン決済 / RAZORPAY DIGITAL GATEWAY</span>
                            <h3 className="adminGlobalCardTitle">Razorpay Gateway Configuration</h3>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span className={`adminStatusBadge ${payment.maintenance ? 'badgeMaintenance' : payment.enabled ? 'badgeActive' : 'badgeInactive'}`}>
                                {payment.maintenance ? 'MAINTENANCE MODE ON' : payment.enabled ? 'GATEWAY ACTIVE' : 'GATEWAY DISABLED'}
                            </span>
                            <span className="adminStatusBadge" style={{ background: '#eef2ff', color: '#3730a3', borderColor: '#c7d2fe' }}>
                                {payment.mode === 'live' ? 'LIVE PRODUCTION' : 'TEST / SANDBOX'}
                            </span>
                        </div>
                    </div>

                    {/* Master Toggles: Enabled & Maintenance Mode */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', background: '#F3EFE6', padding: '1.25rem', border: '1px solid rgba(21, 27, 43, 0.12)' }}>
                        {/* Toggle 1: Power Switch */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            <label className="adminCheckboxLabel" style={{ minHeight: 'auto', fontWeight: '700', fontSize: '0.9rem' }}>
                                <input
                                    type="checkbox"
                                    checked={Boolean(payment.enabled)}
                                    onChange={(e) => updatePayment('enabled', e.target.checked)}
                                />
                                <span>Enable Razorpay Gateway</span>
                            </label>
                            <span style={{ fontSize: '0.78rem', color: 'rgba(21, 27, 43, 0.65)', paddingLeft: '1.6rem' }}>
                                Turn OFF to completely disable Razorpay at checkout.
                            </span>
                        </div>

                        {/* Toggle 2: Maintenance Mode Switch */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            <label className="adminCheckboxLabel" style={{ minHeight: 'auto', fontWeight: '700', fontSize: '0.9rem', color: payment.maintenance ? '#b45309' : '#151b2b' }}>
                                <input
                                    type="checkbox"
                                    checked={Boolean(payment.maintenance)}
                                    onChange={(e) => updatePayment('maintenance', e.target.checked)}
                                />
                                <span>Emergency Maintenance Mode</span>
                            </label>
                            <span style={{ fontSize: '0.78rem', color: 'rgba(21, 27, 43, 0.65)', paddingLeft: '1.6rem' }}>
                                When ON, option is unselectable at checkout and shows a "Maintenance Mode On" banner.
                            </span>
                        </div>
                    </div>

                    {/* Warning if Razorpay enabled but keyId missing */}
                    {payment.enabled && !payment.keyId && !payment.maintenance && (
                        <div className="adminFeedbackBanner error" style={{ margin: 0 }}>
                            <AlertCircle size={16} />
                            <span>
                                <strong>Configuration Warning:</strong> Razorpay is enabled, but no Public Key ID is configured. Because backend credentials are missing, customers will not be able to complete live Razorpay transactions. Either provide your Key ID, toggle ON Maintenance Mode, or turn OFF this gateway.
                            </span>
                        </div>
                    )}

                    {payment.maintenance && (
                        <div className="adminFeedbackBanner warning" style={{ margin: 0, background: '#fef3c7', borderColor: '#f59e0b', color: '#92400e' }}>
                            <AlertCircle size={16} />
                            <span>
                                <strong>Maintenance Mode Active:</strong> Razorpay online payment cannot be selected by customers in the checkout page. The maintenance badge and message below are currently displayed to all visitors.
                            </span>
                        </div>
                    )}

                    {/* Maintenance Message */}
                    <label className="adminFormLabel">
                        <span>MAINTENANCE MODE MESSAGE (SHOWN TO CUSTOMERS AT CHECKOUT)</span>
                        <textarea
                            className="adminTextarea"
                            rows="2"
                            value={payment.maintenanceMessage || ''}
                            onChange={(e) => updatePayment('maintenanceMessage', e.target.value)}
                            placeholder="e.g. Razorpay online payment is currently undergoing scheduled maintenance. Please select Cash on Delivery or check back shortly."
                        />
                        <span style={{ fontSize: '0.75rem', color: 'rgba(21, 27, 43, 0.6)' }}>
                            This custom note is shown beneath the unselectable Razorpay option when Maintenance Mode is ON.
                        </span>
                    </label>

                    {/* Razorpay Parameters */}
                    <div className="adminPaymentFieldsRow4">
                        <label className="adminPaymentField">
                            <span>GATEWAY ENVIRONMENT MODE</span>
                            <select
                                className="adminSelect"
                                value={payment.mode || 'test'}
                                onChange={(e) => updatePayment('mode', e.target.value)}
                            >
                                <option value="test">Test Mode / Sandbox (Mock UPI)</option>
                                <option value="live">Live Production (Real Banking)</option>
                            </select>
                        </label>

                        <label className="adminPaymentField">
                            <span>PUBLIC KEY ID</span>
                            <input
                                className="adminInput"
                                value={payment.keyId || ''}
                                onChange={(e) => updatePayment('keyId', e.target.value.trim())}
                                placeholder="rzp_test_... or rzp_live_..."
                            />
                        </label>

                        <label className="adminPaymentField">
                            <span>DISPLAY TITLE (SHOWN AT CHECKOUT)</span>
                            <input
                                className="adminInput"
                                value={payment.title || 'Online Payment (UPI / Cards / Netbanking)'}
                                onChange={(e) => updatePayment('title', e.target.value)}
                                placeholder="Online Payment (UPI / Cards / Netbanking)"
                            />
                        </label>

                        <label className="adminPaymentField">
                            <span>GATEWAY PROVIDER NAME</span>
                            <input
                                className="adminInput"
                                value={payment.provider || 'razorpay'}
                                onChange={(e) => updatePayment('provider', e.target.value)}
                                placeholder="razorpay"
                            />
                        </label>
                    </div>

                    <label className="adminFormLabel">
                        <span>DISPLAY DESCRIPTION (SHOWN AT CHECKOUT)</span>
                        <textarea
                            className="adminTextarea"
                            rows="2"
                            value={payment.description || ''}
                            onChange={(e) => updatePayment('description', e.target.value)}
                            placeholder="Instant verification via official Razorpay India payment contract. All major UPI apps, credit/debit cards, and netbanking."
                        />
                    </label>

                    <div className="adminPaymentSecurityNote">
                        <ShieldCheck size={16} />
                        <span>Security Standard: Secret keys are managed server-side via Supabase Edge Function environment secrets and are never exposed in the browser bundle.</span>
                    </div>

                    {/* Test Connection */}
                    <div className="adminPaymentControlActions">
                        <span style={{ fontSize: '0.82rem', color: 'rgba(21, 27, 43, 0.7)' }}>
                            Verify backend connection with Razorpay APIs:
                        </span>
                        <button
                            type="button"
                            className="adminSecondaryButton"
                            onClick={testPayment}
                            disabled={testingPayment}
                        >
                            {testingPayment ? (
                                <>
                                    <RefreshCw size={14} className="adminSpin" />
                                    <span>Testing API Link...</span>
                                </>
                            ) : (
                                <>
                                    <CreditCard size={14} />
                                    <span>Test Protected Server Connection</span>
                                </>
                            )}
                        </button>
                    </div>

                    {paymentTestResult && (
                        <div className={`adminFeedbackBanner ${paymentTestResult.ok ? 'success' : 'error'}`} style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                            {paymentTestResult.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                            <span>{paymentTestResult.message}</span>
                        </div>
                    )}
                </div>

                {/* 2. CASH ON DELIVERY (COD) CARD */}
                <div className="adminCard adminGlobalCard adminGlobalSpan2">
                    <div className="adminGlobalCardHeader">
                        <div>
                            <span className="adminKanjiSub">代金引換 / ARCHIVE RESERVE (COD)</span>
                            <h3 className="adminGlobalCardTitle">Cash on Delivery (COD) Options</h3>
                        </div>
                        <span className={`adminStatusBadge ${cod.maintenance ? 'badgeMaintenance' : cod.enabled !== false ? 'badgeActive' : 'badgeInactive'}`}>
                            {cod.maintenance ? 'MAINTENANCE MODE ON' : cod.enabled !== false ? 'COD ACTIVE' : 'COD DISABLED'}
                        </span>
                    </div>

                    {/* COD Toggles */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', background: '#F3EFE6', padding: '1.25rem', border: '1px solid rgba(21, 27, 43, 0.12)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            <label className="adminCheckboxLabel" style={{ minHeight: 'auto', fontWeight: '700', fontSize: '0.9rem' }}>
                                <input
                                    type="checkbox"
                                    checked={cod.enabled !== false}
                                    onChange={(e) => updateCod('enabled', e.target.checked)}
                                />
                                <span>Enable Cash on Delivery (Archive Reserve)</span>
                            </label>
                            <span style={{ fontSize: '0.78rem', color: 'rgba(21, 27, 43, 0.65)', paddingLeft: '1.6rem' }}>
                                Allows customers to reserve pairs and pay cash/UPI on delivery inspection.
                            </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            <label className="adminCheckboxLabel" style={{ minHeight: 'auto', fontWeight: '700', fontSize: '0.9rem', color: cod.maintenance ? '#b45309' : '#151b2b' }}>
                                <input
                                    type="checkbox"
                                    checked={Boolean(cod.maintenance)}
                                    onChange={(e) => updateCod('maintenance', e.target.checked)}
                                />
                                <span>COD Maintenance Mode</span>
                            </label>
                            <span style={{ fontSize: '0.78rem', color: 'rgba(21, 27, 43, 0.65)', paddingLeft: '1.6rem' }}>
                                When ON, COD option is unselectable and shows a maintenance badge.
                            </span>
                        </div>
                    </div>

                    {cod.maintenance && (
                        <div className="adminFeedbackBanner warning" style={{ margin: 0, background: '#fef3c7', borderColor: '#f59e0b', color: '#92400e' }}>
                            <AlertCircle size={16} />
                            <span>
                                <strong>COD Maintenance Active:</strong> Cash on Delivery cannot be selected by customers at checkout.
                            </span>
                        </div>
                    )}

                    <label className="adminFormLabel">
                        <span>COD MAINTENANCE MESSAGE</span>
                        <textarea
                            className="adminTextarea"
                            rows="2"
                            value={cod.maintenanceMessage || ''}
                            onChange={(e) => updateCod('maintenanceMessage', e.target.value)}
                            placeholder="e.g. Cash on Delivery is currently paused for logistical maintenance."
                        />
                    </label>

                    <div className="adminPaymentFieldsRow2">
                        <label className="adminPaymentField">
                            <span>COD TITLE (SHOWN AT CHECKOUT)</span>
                            <input
                                className="adminInput"
                                value={cod.title || 'Archive Reserve / Cash on Delivery'}
                                onChange={(e) => updateCod('title', e.target.value)}
                                placeholder="Archive Reserve / Cash on Delivery"
                            />
                        </label>

                        <label className="adminPaymentField">
                            <span>COD DESCRIPTION (SHOWN AT CHECKOUT)</span>
                            <input
                                className="adminInput"
                                value={cod.description || 'Reserve your pair immediately. Complete payment in cash or UPI upon delivery authentication inspection.'}
                                onChange={(e) => updateCod('description', e.target.value)}
                                placeholder="Reserve your pair immediately..."
                            />
                        </label>
                    </div>
                </div>
            </div>

            {/* Bottom Save Bar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', gap: '1rem' }}>
                <button
                    type="button"
                    className="adminPrimaryButton"
                    onClick={handleSave}
                    disabled={loading}
                    style={{ minWidth: '220px', minHeight: '48px', justifyContent: 'center' }}
                >
                    {loading ? (
                        <>
                            <RefreshCw size={16} className="adminSpin" />
                            <span>Saving Changes...</span>
                        </>
                    ) : (
                        <>
                            <Save size={16} />
                            <span>Save Gateway Settings</span>
                        </>
                    )}
                </button>
            </div>
        </section>
    );
}

export default function Admin() {
    const { user, profile } = useAuth();

    // Keyed remount on user identity change to immediately clear state and prevent stale async grants
    return <AdminContent key={user?.id || 'anonymous'} user={user} profile={profile} />;
}

function AdminContent({ user, profile }) {
    const adminService = useMemo(() => createAdminService(getSupabaseRuntime), []);
    const globalSettingsService = useMemo(() => createGlobalSettingsService(getSupabaseRuntime), []);

    // Access control state
    const [accessLoading, setAccessLoading] = useState(true);
    const [hasAccess, setHasAccess] = useState(false);
    const [accessError, setAccessError] = useState('');
    const isAuthorized = hasAccess;
    const hasConsoleAccess = hasAccess;

    // Dashboard tabs: storefront administration plus customer operations.
    const [currentTab, setCurrentTab] = useState('collections');
    const [users, setUsers] = useState([]);
    const [userSearch, setUserSearch] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);
    const [tickets, setTickets] = useState([]);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [ticketReply, setTicketReply] = useState('');
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
        totalOrdersCount: 0,
    });

    const liveMetrics = useMemo(() => {
        const calculated = calculateOperationalMetrics({ drops, inventory, orders });
        const hasInventoryData = Object.keys(inventory || {}).length > 0;
        const fallbackAvailable = !hasInventoryData && drops.length > 0
            ? drops.reduce((acc, d) => acc + (d.sizes?.reduce((s, z) => s + (Number(z.quantity) || 0), 0) || (d.active !== false ? 1 : 0)), 0)
            : (metrics.availablePairsCount || 0);

        return {
            totalRevenueMinor: calculated.totalRevenueMinor || metrics.totalRevenueMinor || 0,
            activeDropsCount: calculated.activeDropsCount ?? metrics.activeDropsCount ?? drops.filter((d) => d.active !== false).length,
            availablePairsCount: hasInventoryData ? calculated.availablePairsCount : (fallbackAvailable || calculated.availablePairsCount),
            pendingShipmentsCount: calculated.pendingShipmentsCount ?? metrics.pendingShipmentsCount ?? 0,
            totalOrdersCount: calculated.totalOrdersCount || metrics.totalOrdersCount || orders.length || 0,
        };
    }, [drops, inventory, orders, metrics]);

    const [dataLoading, setDataLoading] = useState(false);
    const [syncState, setSyncState] = useState('idle');
    const [feedback, setFeedback] = useState({ type: '', message: '' });
    const [globalSettings, setGlobalSettings] = useState(DEFAULT_GLOBAL_SETTINGS);
    const [globalSettingsLoading, setGlobalSettingsLoading] = useState(false);

    // Modals / forms state
    const [showDropModal, setShowDropModal] = useState(false);
    const [editingDropId, setEditingDropId] = useState(null);
    const [isSavingDrop, setIsSavingDrop] = useState(false);
    const [isProcessingImage, setIsProcessingImage] = useState(false);
    const [processingImageField, setProcessingImageField] = useState(null);
    const [isProcessingRemoteImage, setIsProcessingRemoteImage] = useState(false);
    const [remoteProcessingField, setRemoteProcessingField] = useState(null);
    const [remoteStatusMessage, setRemoteStatusMessage] = useState('');
    const [remoteImageStatus, setRemoteImageStatus] = useState({});
    const [remoteImageErrors, setRemoteImageErrors] = useState({});
    const [remoteImageSuccess, setRemoteImageSuccess] = useState({});

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
        comparePrice: '',
        status: 'active',
        tags: [],
        categoryId: '',
        upperMaterial: '',
        soleMaterial: '',
        careInstructions: '',
        images: [],
        additionalImages: '',
        sizes: [{ value: 'US 9', quantity: 1, sold: false }],
    });
    const [dropFormErrors, setDropFormErrors] = useState({});

    const [additionalUrlInput, setAdditionalUrlInput] = useState('');
    const [isProcessingAdditional, setIsProcessingAdditional] = useState(false);
    const [additionalManagerStatus, setAdditionalManagerStatus] = useState('');
    const [additionalManagerError, setAdditionalManagerError] = useState('');
    const additionalFileInputRef = useRef(null);

    const additionalImageList = useMemo(() => {
        if (!dropForm.additionalImages) return [];
        return dropForm.additionalImages
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);
    }, [dropForm.additionalImages]);

    // Order details drawer / modal & Reject Modal
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [orderStatusForm, setOrderStatusForm] = useState({
        status: '', notes: '', trackingId: '', returnAction: 'return', returnReason: '',
    });
    const [rejectModalOrder, setRejectModalOrder] = useState(null);
    const [rejectionReason, setRejectionReason] = useState('Product authenticity failed physical vault inspection');
    const [customRejectionReason, setCustomRejectionReason] = useState('');
    const [isSubmittingReject, setIsSubmittingReject] = useState(false);
    const [courierPartner, setCourierPartner] = useState('bluedart');
    const [checklistState, setChecklistState] = useState({
        boxBarcode: true,
        insoleUv: true,
        nfcTag: true,
        doubleBox: true,
    });
    const [orderSearchQuery, setOrderSearchQuery] = useState('');
    const [orderFilterStatus, setOrderFilterStatus] = useState('all');

    // Drops search & filter
    const [dropSearchQuery, setDropSearchQuery] = useState('');
    const [dropFilterStatus, setDropFilterStatus] = useState('all');
    const [dropFilterCategory, setDropFilterCategory] = useState('all');
    const [catalogCategories, setCatalogCategories] = useState([]);
    const [catalogTags, setCatalogTags] = useState([]);
    const categoriesService = useMemo(() => createShopCategoriesService(getSupabaseRuntime), []);

    const refreshDashboardData = useCallback(async () => {
        setDataLoading(true);
        try {
            const [dropsList, invMap, ordersList, calculatedMetrics, categoryData, tagsList] = await Promise.all([
                adminService.listDrops(),
                adminService.listInventory(),
                adminService.listOrders(),
                adminService.getOperationalMetrics(),
                categoriesService.list({ admin: true }).catch(() => ({ categories: [] })),
                adminService.listTags().catch(() => []),
            ]);
            setDrops(dropsList);
            setInventory(invMap);
            setOrders(ordersList);
            setMetrics(calculatedMetrics);
            setCatalogCategories(categoryData.categories || []);
            setCatalogTags(tagsList || []);
        } catch (err) {
            setFeedback({ type: 'error', message: err.message || 'Failed to load dashboard data.' });
        } finally {
            setDataLoading(false);
        }
    }, [adminService, categoriesService]);

    const handleManualSync = useCallback(async () => {
        if (syncState === 'syncing' || dataLoading) return;
        setSyncState('syncing');
        const startTime = Date.now();
        try {
            await refreshDashboardData();
            const elapsed = Date.now() - startTime;
            if (elapsed < 650) {
                await new Promise((resolve) => setTimeout(resolve, 650 - elapsed));
            }
            setSyncState('synced');
            setFeedback({ type: 'success', message: 'Console data synchronized with live ledger.' });
            setTimeout(() => {
                setSyncState('idle');
            }, 1800);
            setTimeout(() => {
                setFeedback((prev) => (prev.message === 'Console data synchronized with live ledger.' ? { type: '', message: '' } : prev));
            }, 4500);
        } catch (err) {
            setSyncState('idle');
            setFeedback({ type: 'error', message: err?.message || 'Sync failed.' });
        }
    }, [syncState, dataLoading, refreshDashboardData]);

    const refreshCustomerData = useCallback(async () => {
        const [userList, ticketList] = await Promise.all([
            adminService.listUsers({ search: userSearch }),
            adminService.listSupportTickets(),
        ]);
        setUsers(userList);
        setTickets(ticketList);
    }, [adminService, userSearch]);

    const checkAccess = useCallback(async () => {
        setAccessLoading(true);
        setAccessError('');
        try {
            const res = await adminService.checkAdminAccess({ user });
            const granted = Boolean(res.isAdmin);
            setHasAccess(granted);
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
    }, [adminService, user, refreshDashboardData]);

    useEffect(() => {
        checkAccess();
    }, [checkAccess]);

    const loadGlobalSettings = useCallback(async () => {
        setGlobalSettingsLoading(true);
        try { const result = await globalSettingsService.load(); setGlobalSettings(result.settings); }
        catch (error) { setFeedback({ type: 'error', message: error.message || 'Failed to load global settings.' }); }
        finally { setGlobalSettingsLoading(false); }
    }, [globalSettingsService]);

    useEffect(() => { if (isAuthorized) loadGlobalSettings(); }, [isAuthorized, loadGlobalSettings]);

    const saveGlobalSettings = async () => {
        setGlobalSettingsLoading(true);
        try { const result = await globalSettingsService.save(globalSettings); setGlobalSettings(result.settings); setFeedback({ type: 'success', message: 'Global settings saved.' }); }
        catch (error) { setFeedback({ type: 'error', message: error.message || 'Failed to save global settings.' }); }
        finally { setGlobalSettingsLoading(false); }
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
            images: [],
            additionalImages: '',
            sizes: [{ value: 'US 9', quantity: 1, sold: false }],
            dropBatch: nextId ? `SHIBUYA-DROP-0${nextId}` : 'SHIBUYA-VAULT-DROP',
            description: 'SoleThief Tokyo vault edition authenticated pair.',
            comparePrice: '',
            status: 'active',
            tags: [],
            categoryId: '',
            upperMaterial: '',
            soleMaterial: '',
            careInstructions: '',
        });
        setRemoteImageStatus({});
        setRemoteImageErrors({});
        setRemoteImageSuccess({});
        setIsProcessingRemoteImage(false);
        setRemoteProcessingField(null);
        setRemoteStatusMessage('');
        setAdditionalUrlInput('');
        setIsProcessingAdditional(false);
        setAdditionalManagerStatus('');
        setAdditionalManagerError('');
        if (additionalFileInputRef.current) additionalFileInputRef.current.value = '';
        setDropFormErrors({});
        setShowDropModal(true);
    };

    const openEditDropModal = (drop) => {
        setEditingDropId(drop.id);
        const extraImages = Array.isArray(drop.images) && drop.images.length > 2
            ? drop.images.slice(2).join('\n')
            : (typeof drop.additionalImages === 'string' ? drop.additionalImages : '');
        setDropForm({
            id: String(drop.id),
            name: drop.name,
            brand: drop.brand,
            size: drop.size,
            price: (drop.priceMinor / 100).toFixed(2),
            frontImage: drop.frontImage,
            sideImage: drop.sideImage,
            active: (drop.status ? drop.status !== 'draft' : drop.active !== false),
            images: drop.images || [],
            additionalImages: extraImages,
            sizes: drop.sizes || [{ value: drop.size, quantity: 1, sold: false }],
            dropBatch: drop.dropBatch || `SHIBUYA-DROP-0${drop.id}`,
            description: drop.description || '',
            comparePrice: drop.comparePriceMinor ? (drop.comparePriceMinor / 100).toFixed(2) : '',
            status: ['active', 'sold_out', 'draft'].includes(drop.status) ? drop.status : (drop.active === false ? 'draft' : 'active'),
            tags: Array.isArray(drop.tags) ? drop.tags : [],
            categoryId: drop.categoryId || '',
            upperMaterial: drop.upperMaterial || '',
            soleMaterial: drop.soleMaterial || '',
            careInstructions: drop.careInstructions || '',
        });
        setRemoteImageStatus({});
        setRemoteImageErrors({});
        setRemoteImageSuccess({});
        setIsProcessingRemoteImage(false);
        setRemoteProcessingField(null);
        setRemoteStatusMessage('');
        setAdditionalUrlInput('');
        setIsProcessingAdditional(false);
        setAdditionalManagerStatus('');
        setAdditionalManagerError('');
        if (additionalFileInputRef.current) additionalFileInputRef.current.value = '';
        setDropFormErrors({});
        setShowDropModal(true);
    };

    const handleDownloadAndOptimizeField = async (field, overrideUrl = null) => {
        const rawUrl = (overrideUrl !== null ? overrideUrl : dropForm[field])?.trim();
        if (!rawUrl || !isOnlineImageUrl(rawUrl)) return;

        setIsProcessingRemoteImage(true);
        setRemoteProcessingField(field);
        setRemoteStatusMessage('Contacting image resolver...');
        setRemoteImageStatus((prev) => ({ ...prev, [field]: 'Downloading & optimizing image...' }));
        setRemoteImageErrors((prev) => {
            const next = { ...prev };
            delete next[field];
            return next;
        });
        setRemoteImageSuccess((prev) => {
            const next = { ...prev };
            delete next[field];
            return next;
        });

        try {
            const optimized = await downloadAndOptimizeRemoteImage(rawUrl, {
                maxDimension: 1200,
                quality: 0.8,
                onStatus: (msg) => {
                    setRemoteStatusMessage(msg);
                    setRemoteImageStatus((prev) => ({ ...prev, [field]: msg }));
                },
            });

            if (optimized) {
                setDropForm((current) => ({ ...current, [field]: optimized }));
                const sizeKb = Math.round(optimized.length / 1024);
                setRemoteImageSuccess((prev) => ({
                    ...prev,
                    [field]: `Downloaded & optimized (${sizeKb} KB)`,
                }));
                setFeedback({
                    type: 'success',
                    message: `${field === 'frontImage' ? 'Front' : 'Side'} image downloaded and optimized (${sizeKb} KB).`,
                });
            }
        } catch (err) {
            console.error(`[Admin.jsx] Failed to download remote image for ${field}:`, err);
            const errMsg = err.message || 'Failed to download image. The link may be broken or unreachable.';
            setRemoteImageErrors((prev) => ({ ...prev, [field]: errMsg }));
            setFeedback({
                type: 'error',
                message: `Could not download ${field === 'frontImage' ? 'front' : 'side'} image: ${errMsg}`,
            });
        } finally {
            setIsProcessingRemoteImage(false);
            setRemoteProcessingField(null);
            setRemoteStatusMessage('');
            setRemoteImageStatus((prev) => {
                const next = { ...prev };
                delete next[field];
                return next;
            });
        }
    };

    const handleImageInputPaste = (e, field) => {
        const pasted = e.clipboardData?.getData('text')?.trim();
        if (pasted && isOnlineImageUrl(pasted)) {
            setDropForm((prev) => ({ ...prev, [field]: pasted }));
            setTimeout(() => {
                handleDownloadAndOptimizeField(field, pasted);
            }, 60);
        }
    };

    const handleImageFileSelect = async (e, field) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsProcessingImage(true);
        setProcessingImageField(field);
        try {
            const compressed = await compressImageFile(file, {
                maxDimension: 1200,
                quality: 0.8,
            });
            if (compressed) {
                setDropForm((current) => ({ ...current, [field]: compressed }));
                setFeedback({
                    type: 'success',
                    message: `${field === 'frontImage' ? 'Front' : 'Side'} image processed (${Math.round(compressed.length / 1024)} KB).`,
                });
            }
        } catch (err) {
            console.error(`[Admin.jsx] Failed to compress ${field}:`, err);
            const reader = new FileReader();
            reader.onload = () => setDropForm((current) => ({ ...current, [field]: reader.result }));
            reader.readAsDataURL(file);
        } finally {
            setIsProcessingImage(false);
            setProcessingImageField(null);
        }
    };

    const handleRemoveAdditionalImage = (indexToRemove) => {
        const list = (dropForm.additionalImages || '')
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);
        const updated = list.filter((_, idx) => idx !== indexToRemove);
        setDropForm((prev) => ({
            ...prev,
            additionalImages: updated.join('\n'),
        }));
        setAdditionalManagerError('');
    };

    const handleAddAdditionalFile = async (e) => {
        const file = e.target?.files?.[0];
        if (!file) return;

        setIsProcessingAdditional(true);
        setAdditionalManagerStatus('Optimizing image from device...');
        setAdditionalManagerError('');

        try {
            const compressed = await compressImageFile(file, {
                maxDimension: 1200,
                quality: 0.8,
            });
            if (compressed) {
                setDropForm((prev) => {
                    const list = (prev.additionalImages || '')
                        .split('\n')
                        .map((l) => l.trim())
                        .filter(Boolean);
                    return {
                        ...prev,
                        additionalImages: [...list, compressed].join('\n'),
                    };
                });
                setFeedback({
                    type: 'success',
                    message: 'Additional image added from device.',
                });
            }
        } catch (err) {
            console.error('[Admin.jsx] Failed to compress additional image file:', err);
            setAdditionalManagerError(err.message || 'Failed to process selected image file.');
        } finally {
            setIsProcessingAdditional(false);
            setAdditionalManagerStatus('');
            if (e.target) {
                e.target.value = '';
            }
        }
    };

    const handleAddAdditionalUrl = async (overrideUrl = null) => {
        const targetUrl = (overrideUrl !== null ? overrideUrl : additionalUrlInput)?.trim();
        if (!targetUrl) return;

        if (!isOnlineImageUrl(targetUrl)) {
            setAdditionalManagerError('Please enter a valid web image URL (http/https).');
            return;
        }

        setIsProcessingAdditional(true);
        setAdditionalManagerStatus('Downloading & optimizing image from web...');
        setAdditionalManagerError('');

        try {
            const optimized = await downloadAndOptimizeRemoteImage(targetUrl, {
                maxDimension: 1200,
                quality: 0.8,
                onStatus: (msg) => {
                    setAdditionalManagerStatus(msg);
                },
            });

            if (optimized) {
                setDropForm((prev) => {
                    const list = (prev.additionalImages || '')
                        .split('\n')
                        .map((l) => l.trim())
                        .filter(Boolean);
                    return {
                        ...prev,
                        additionalImages: [...list, optimized].join('\n'),
                    };
                });
                setAdditionalUrlInput('');
                setFeedback({
                    type: 'success',
                    message: 'Additional image downloaded and added successfully.',
                });
            }
        } catch (err) {
            console.error('[Admin.jsx] Failed to download additional remote image:', err);
            setAdditionalManagerError(err.message || 'Failed to download image. The link may be broken or unreachable.');
        } finally {
            setIsProcessingAdditional(false);
            setAdditionalManagerStatus('');
        }
    };

    const handleAdditionalUrlPaste = (e) => {
        const pasted = e.clipboardData?.getData('text')?.trim();
        if (pasted && isOnlineImageUrl(pasted)) {
            setAdditionalUrlInput(pasted);
            setTimeout(() => {
                handleAddAdditionalUrl(pasted);
            }, 60);
        }
    };

    const handleSaveDrop = async (e) => {
        e.preventDefault();
        setDropFormErrors({});
        setIsSavingDrop(true);
        try {
            let frontImage = (dropForm.frontImage || '').trim();
            let sideImage = (dropForm.sideImage || '').trim();
            let additionalImagesStr = dropForm.additionalImages || '';

            // Auto-download front image if it is an online URL
            if (isOnlineImageUrl(frontImage)) {
                setFeedback({ type: 'info', message: 'Downloading & optimizing front image...' });
                try {
                    frontImage = await downloadAndOptimizeRemoteImage(frontImage, {
                        maxDimension: 1200,
                        quality: 0.8,
                    });
                    setDropForm((current) => ({ ...current, frontImage }));
                } catch (dlErr) {
                    throw new Error(`Failed to download front image: ${dlErr.message}`);
                }
            } else if (typeof frontImage === 'string' && frontImage.startsWith('data:') && frontImage.length > 200000) {
                frontImage = await compressImage(frontImage, { maxDimension: 1200, quality: 0.8 });
            }

            // Auto-download side image if it is an online URL
            if (isOnlineImageUrl(sideImage)) {
                setFeedback({ type: 'info', message: 'Downloading & optimizing side image...' });
                try {
                    sideImage = await downloadAndOptimizeRemoteImage(sideImage, {
                        maxDimension: 1200,
                        quality: 0.8,
                    });
                    setDropForm((current) => ({ ...current, sideImage }));
                } catch (dlErr) {
                    throw new Error(`Failed to download side image: ${dlErr.message}`);
                }
            } else if (typeof sideImage === 'string' && sideImage.startsWith('data:') && sideImage.length > 200000) {
                sideImage = await compressImage(sideImage, { maxDimension: 1200, quality: 0.8 });
            }

            // Auto-download any online URLs in additionalImages
            const extraLines = (additionalImagesStr || '').split('\n');
            let extraModified = false;
            const processedExtraLines = [];
            for (let i = 0; i < extraLines.length; i++) {
                const line = extraLines[i].trim();
                if (isOnlineImageUrl(line)) {
                    setFeedback({ type: 'info', message: `Downloading additional image ${i + 1}...` });
                    try {
                        const dl = await downloadAndOptimizeRemoteImage(line, {
                            maxDimension: 1200,
                            quality: 0.8,
                        });
                        processedExtraLines.push(dl);
                        extraModified = true;
                    } catch (dlErr) {
                        throw new Error(`Failed to download additional image (line ${i + 1}): ${dlErr.message}`);
                    }
                } else {
                    processedExtraLines.push(extraLines[i]);
                }
            }
            if (extraModified) {
                additionalImagesStr = processedExtraLines.join('\n');
                setDropForm((current) => ({ ...current, additionalImages: additionalImagesStr }));
            }

            const status = ['active', 'sold_out', 'draft'].includes(dropForm.status)
                ? dropForm.status
                : (dropForm.active === false ? 'draft' : 'active');
            const active = status !== 'draft';
            const extraImages = (additionalImagesStr || '')
                .split('\n')
                .map((value) => value.trim())
                .filter(Boolean);
            const allImages = [
                typeof frontImage === 'string' ? frontImage.trim() : '',
                typeof sideImage === 'string' ? sideImage.trim() : '',
                ...extraImages,
            ].filter(Boolean);
            const payload = {
                id: Number(dropForm.id),
                name: dropForm.name,
                brand: dropForm.brand,
                size: dropForm.size,
                price: dropForm.price,
                frontImage,
                sideImage,
                active,
                additionalImages: additionalImagesStr,
                images: allImages,
                sizes: dropForm.sizes,
                dropBatch: dropForm.dropBatch,
                description: dropForm.description,
                comparePrice: dropForm.comparePrice,
                status,
                tags: dropForm.tags,
                categoryId: dropForm.categoryId,
                upperMaterial: dropForm.upperMaterial,
                soleMaterial: dropForm.soleMaterial,
                careInstructions: dropForm.careInstructions,
            };

            if (editingDropId) {
                await adminService.updateDrop(editingDropId, payload);
                setFeedback({ type: 'success', message: `Drop #${editingDropId} updated successfully.` });
                setProductRefreshTrigger((prev) => prev + 1);
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('shop-categories-updated'));
                }
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
        } finally {
            setIsSavingDrop(false);
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
                orderStatusForm.notes,
                orderStatusForm.trackingId
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

    const handleInitiateReturn = async () => {
        if (!selectedOrder) return;
        try {
            const updated = await adminService.initiateOrderReturn(selectedOrder.id, { action: orderStatusForm.returnAction, reason: orderStatusForm.returnReason });
            setSelectedOrder(updated);
            setOrderStatusForm({ ...orderStatusForm, status: updated.status, returnReason: '' });
            setFeedback({ type: 'success', message: `Order ${selectedOrder.id} marked ${updated.status}.` });
            await refreshDashboardData();
        } catch (err) { setFeedback({ type: 'error', message: err.message }); }
    };

    // Quick accept order
    const handleQuickAcceptOrder = async (order) => {
        try {
            const nextStatus = 'confirmed';
            const note = 'Order accepted by Shibuya vault operator. Ready for physical authentication.';
            const updated = await adminService.updateOrderStatus(order.id, nextStatus, note, order.tracking_id || '');
            setFeedback({
                type: 'success',
                message: `Order ${order.id} accepted! Status transitioned to "CONFIRMED".`,
            });
            if (selectedOrder && selectedOrder.id === order.id) {
                setSelectedOrder(updated);
                setOrderStatusForm((prev) => ({
                    ...prev,
                    status: updated.status,
                    notes: updated.fulfillment_notes || '',
                    trackingId: updated.tracking_id || '',
                }));
            }
            await refreshDashboardData();
        } catch (err) {
            setFeedback({ type: 'error', message: err.message || 'Failed to accept order.' });
        }
    };

    // Open reject modal
    const handleOpenRejectModal = (order) => {
        setRejectModalOrder(order);
        setRejectionReason('Product authenticity failed physical vault inspection');
        setCustomRejectionReason('');
    };

    // Confirm reject order
    const handleConfirmRejectOrder = async () => {
        if (!rejectModalOrder) return;
        const finalReason = rejectionReason === 'custom'
            ? (customRejectionReason.trim() || 'Rejected by Administrator')
            : rejectionReason;

        setIsSubmittingReject(true);
        try {
            const updated = await adminService.updateOrderStatus(
                rejectModalOrder.id,
                'cancelled',
                finalReason,
                rejectModalOrder.tracking_id || ''
            );
            setFeedback({
                type: 'success',
                message: `Order ${rejectModalOrder.id} rejected. Customer cancellation reason set to: "${finalReason}".`,
            });
            if (selectedOrder && selectedOrder.id === rejectModalOrder.id) {
                setSelectedOrder(updated);
                setOrderStatusForm((prev) => ({
                    ...prev,
                    status: updated.status,
                    notes: updated.fulfillment_notes || '',
                    trackingId: updated.tracking_id || '',
                }));
            }
            setRejectModalOrder(null);
            await refreshDashboardData();
        } catch (err) {
            setFeedback({ type: 'error', message: err.message || 'Failed to reject order.' });
        } finally {
            setIsSubmittingReject(false);
        }
    };

    // Advance order stage
    const handleAdvanceOrderStage = async (nextStatus, autoNote = '') => {
        if (!selectedOrder) return;
        try {
            const notesToUse = autoNote || orderStatusForm.notes || `Order progressed to ${nextStatus.toUpperCase()} via Operator Fulfillment Action.`;
            const trackingToUse = orderStatusForm.trackingId || selectedOrder.tracking_id || '';
            const updated = await adminService.updateOrderStatus(
                selectedOrder.id,
                nextStatus,
                notesToUse,
                trackingToUse
            );
            setSelectedOrder(updated);
            setOrderStatusForm((prev) => ({
                ...prev,
                status: updated.status,
                notes: updated.fulfillment_notes || '',
                trackingId: updated.tracking_id || '',
            }));
            setFeedback({
                type: 'success',
                message: `Order ${selectedOrder.id} successfully updated to "${nextStatus.toUpperCase()}".`,
            });
            await refreshDashboardData();
        } catch (err) {
            setFeedback({ type: 'error', message: err.message || `Failed to transition to ${nextStatus}.` });
        }
    };

    // Generate courier AWB
    const handleGenerateAwb = (partner = courierPartner) => {
        let prefix = 'BD';
        let partnerName = 'Blue Dart Express';
        if (partner === 'delhivery') {
            prefix = 'DL';
            partnerName = 'Delhivery Air';
        } else if (partner === 'dtdc') {
            prefix = 'DTDC';
            partnerName = 'DTDC Priority';
        } else if (partner === 'fedex') {
            prefix = 'FDX';
            partnerName = 'FedEx Express';
        }
        const randomDigits = Math.floor(10000000 + Math.random() * 90000000);
        const generatedAwb = `${prefix}-${randomDigits}-IN`;
        const generatedNote = `Dispatched via ${partnerName}. Airway Bill #${generatedAwb}. Verified Japanese Shibuya shipment.`;

        setOrderStatusForm((prev) => ({
            ...prev,
            trackingId: generatedAwb,
            notes: prev.notes ? `${prev.notes} | ${generatedNote}` : generatedNote,
            status: (prev.status === 'confirmed' || prev.status === 'authenticating' || prev.status === 'paid' || prev.status === 'processing') ? 'shipped' : prev.status,
        }));

        setFeedback({
            type: 'success',
            message: `Generated courier tracking AWB: ${generatedAwb} (${partnerName}). Ready to commit state.`,
        });
    };

    // Approve customer 3-day replacement
    const handleApproveReplacement = async (order = selectedOrder) => {
        if (!order) return;
        try {
            const replacementNote = `Replacement approved for size ${order.replacement_preferred_size || 'requested size'}. Reverse pickup initiated and replacement pair allocated from Shibuya depot.`;
            const updated = await adminService.updateOrderStatus(
                order.id,
                'replaced',
                replacementNote,
                order.tracking_id || `REV-PICKUP-${Math.floor(100000 + Math.random() * 900000)}`
            );
            setSelectedOrder(updated);
            setOrderStatusForm((prev) => ({
                ...prev,
                status: updated.status,
                notes: updated.fulfillment_notes || '',
                trackingId: updated.tracking_id || '',
            }));
            setFeedback({
                type: 'success',
                message: `3-Day Replacement approved for Order ${order.id}! Status transitioned to "REPLACED".`,
            });
            await refreshDashboardData();
        } catch (err) {
            setFeedback({ type: 'error', message: err.message || 'Failed to approve replacement.' });
        }
    };

    // Filtered lists
    const filteredDrops = useMemo(() => {
        const q = dropSearchQuery.trim().toLowerCase();
        return drops.filter((d) => {
            const matchesQuery = !q || d.name.toLowerCase().includes(q) || d.brand.toLowerCase().includes(q) || String(d.id).includes(q);
            const matchesStatus = dropFilterStatus === 'all' || (d.status || (d.active === false ? 'draft' : 'active')) === dropFilterStatus;
            const matchesCategory = dropFilterCategory === 'all' || String(d.categoryId || '') === dropFilterCategory;
            return matchesQuery && matchesStatus && matchesCategory;
        });
    }, [drops, dropSearchQuery, dropFilterStatus, dropFilterCategory]);

    const filteredOrders = useMemo(() => {
        return orders.filter((o) => {
            const statusSet = normalizeAdminOrderFilter(orderFilterStatus);
            const matchesStatus = !statusSet || statusSet.includes(o.status);
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
                        <span className="adminLiveBadge">
                            <ShieldCheck size={16} />
                            LIVE OPERATOR: {profile?.display_name || user?.email || 'ADMINISTRATOR'}
                        </span>

                        <button
                            type="button"
                            className={`adminRefreshButton ${syncState === 'syncing' ? 'isSyncing' : ''} ${syncState === 'synced' ? 'isSynced' : ''}`}
                            onClick={handleManualSync}
                            disabled={syncState === 'syncing' || dataLoading}
                            aria-label="Refresh console data"
                        >
                            {syncState === 'synced' ? (
                                <>
                                    <Check size={16} className="adminSyncCheckIcon" />
                                    <span>Synced</span>
                                </>
                            ) : (
                                <>
                                    <RefreshCw size={16} className={syncState === 'syncing' || dataLoading ? 'adminSpin' : ''} />
                                    <span>{syncState === 'syncing' ? 'Syncing...' : 'Sync'}</span>
                                </>
                            )}
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
                            <Link to="/" className="adminPrimaryButton">
                                Return Home
                            </Link>
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
                                    <div className="adminMetricValue">{formatMoney(liveMetrics.totalRevenueMinor)}</div>
                                    <span className="adminMetricMeta">From {liveMetrics.totalOrdersCount} placed orders</span>
                                </div>
                            </div>

                            <div className="adminMetricCard">
                                <div className="adminMetricIcon"><Layers size={22} /></div>
                                <div className="adminMetricContent">
                                    <span className="adminMetricKanji">有効ドロップ / ACTIVE DROPS</span>
                                    <div className="adminMetricValue">{liveMetrics.activeDropsCount} Pairs</div>
                                    <span className="adminMetricMeta">Catalog listings online</span>
                                </div>
                            </div>

                            <div className="adminMetricCard">
                                <div className="adminMetricIcon"><Package size={22} /></div>
                                <div className="adminMetricContent">
                                    <span className="adminMetricKanji">在庫ペア / AVAILABLE</span>
                                    <div className="adminMetricValue">{liveMetrics.availablePairsCount} Pairs</div>
                                    <span className="adminMetricMeta">Deadstock verified in vault</span>
                                </div>
                            </div>

                            <div className="adminMetricCard">
                                <div className="adminMetricIcon"><Truck size={22} /></div>
                                <div className="adminMetricContent">
                                    <span className="adminMetricKanji">出荷待ち / DISPATCH QUEUE</span>
                                    <div className="adminMetricValue">{liveMetrics.pendingShipmentsCount} Orders</div>
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
                                className={`adminTabButton ${currentTab === 'new-drops' ? 'isActive' : ''}`}
                                onClick={() => setCurrentTab('new-drops')}
                                aria-selected={currentTab === 'new-drops'}
                            >
                                <Flame size={18} />
                                <span>NEW DROPS PAGE</span>
                            </button>
                            <button
                                type="button"
                                className={`adminTabButton ${currentTab === 'home-showcase' ? 'isActive' : ''}`}
                                onClick={() => setCurrentTab('home-showcase')}
                                aria-selected={currentTab === 'home-showcase'}
                            >
                                <Sparkles size={18} />
                                <span>HOME SHOWCASE</span>
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
                            <button type="button" className={`adminTabButton ${currentTab === 'users' ? 'isActive' : ''}`} onClick={() => { setCurrentTab('users'); refreshCustomerData(); }} aria-selected={currentTab === 'users'}>
                                <Users size={18} /><span>USERS</span><span className="adminTabCount">{users.length}</span>
                            </button>
                            <button type="button" className={`adminTabButton ${currentTab === 'tickets' ? 'isActive' : ''}`} onClick={() => { setCurrentTab('tickets'); refreshCustomerData(); }} aria-selected={currentTab === 'tickets'}>
                                <MessageSquare size={18} /><span>SUPPORT TICKETS</span><span className="adminTabCount">{tickets.length}</span>
                            </button>
                            <button type="button" className={`adminTabButton ${currentTab === 'global' ? 'isActive' : ''}`} onClick={() => setCurrentTab('global')} aria-selected={currentTab === 'global'}><Sliders size={18} /><span>GLOBAL CONTROL HUB</span></button>
                            <button
                                type="button"
                                className={`adminTabButton ${currentTab === 'payments' ? 'isActive' : ''}`}
                                onClick={() => setCurrentTab('payments')}
                                aria-selected={currentTab === 'payments'}
                            >
                                <CreditCard size={18} />
                                <span>PAYMENT GATEWAYS</span>
                            </button>
                        </nav>

                        {currentTab === 'global' && (
                            <GlobalControlHub
                                settings={globalSettings}
                                setSettings={setGlobalSettings}
                                onSave={saveGlobalSettings}
                                onTestPayment={() => globalSettingsService.testPaymentConnection()}
                                loading={globalSettingsLoading}
                                onNavigatePaymentsTab={() => setCurrentTab('payments')}
                            />
                        )}

                        {currentTab === 'payments' && (
                            <PaymentGatewayManager
                                settings={globalSettings}
                                setSettings={setGlobalSettings}
                                onSave={saveGlobalSettings}
                                onTestPayment={() => globalSettingsService.testPaymentConnection()}
                                loading={globalSettingsLoading}
                            />
                        )}

                        {/* TAB 0: Shop Collections (Default) */}
                        {currentTab === 'collections' && (
                            <ShopCollectionsAdmin
                                onOpenCreateDrop={openAddDropModal}
                                refreshTrigger={productRefreshTrigger}
                            />
                        )}

                        {/* TAB: New Drops Page Management */}
                        {currentTab === 'new-drops' && (
                            <AdminNewDrops
                                onOpenCreateDrop={openAddDropModal}
                                onNavigateDropsTab={() => setCurrentTab('drops')}
                                dropsCount={drops.length}
                            />
                        )}

                        {/* TAB: Home Showcase Floating Shoes Management */}
                        {currentTab === 'home-showcase' && (
                            <AdminHomeShowcase />
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
                                    <select className="adminFilterSelect" value={dropFilterStatus} onChange={(e) => setDropFilterStatus(e.target.value)} aria-label="Filter products by status">
                                        <option value="all">ALL STATUSES</option>
                                        <option value="active">ACTIVE</option>
                                        <option value="sold_out">SOLD OUT</option>
                                        <option value="draft">DRAFT</option>
                                    </select>
                                    <select className="adminFilterSelect" value={dropFilterCategory} onChange={(e) => setDropFilterCategory(e.target.value)} aria-label="Filter products by category">
                                        <option value="all">ALL CATEGORIES</option>
                                        {catalogCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                                    </select>
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
                                                <th scope="col">SIZES / STOCK</th>
                                                <th scope="col">PRICE / COMPARE</th>
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
                                                                <TransparentArtwork
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
                                                            <div className="adminSizePills">
                                                                {(drop.sizes?.length ? drop.sizes : [{ value: drop.size, quantity: invItem.state === 'available' ? 1 : 0 }]).map((size) => (
                                                                    <span className={`adminSizeTag ${size.sold || size.quantity <= 0 ? 'badgeInactive' : ''}`} key={size.value}>
                                                                        {size.value} ({size.quantity}){size.sold || size.quantity <= 0 ? ' · OUT' : ''}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </td>
                                                        <td className="adminCellPrice">
                                                            {formatMoney(drop.priceMinor)}
                                                            {drop.comparePriceMinor > drop.priceMinor && <del>{formatMoney(drop.comparePriceMinor)}</del>}
                                                        </td>
                                                        <td>
                                                            <span className={`adminStatusBadge ${drop.active ? 'badgeActive' : 'badgeInactive'}`}>
                                                                {(drop.status || (drop.active ? 'active' : 'draft')).replace('_', ' ').toUpperCase()}
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
                                                            <div className="adminRowActions adminInventoryActions">
                                                                <button
                                                                    type="button"
                                                                    className="adminIconAction"
                                                                    onClick={() => openEditDropModal(drop)}
                                                                    aria-label={`Edit drop #${drop.id}`}
                                                                    title="Edit Drop Metadata"
                                                                >
                                                                    <Edit3 size={16} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="adminIconAction adminDangerAction"
                                                                    onClick={async () => {
                                                                        if (!window.confirm(`Delete ${drop.name}?`)) return;
                                                                        try {
                                                                            await adminService.deleteDrop(drop.id);
                                                                            setFeedback({ type: 'success', message: `Drop #${drop.id} deleted.` });
                                                                            refreshDashboardData();
                                                                        } catch (error) {
                                                                            setFeedback({ type: 'error', message: error.message });
                                                                        }
                                                                    }}
                                                                    aria-label={`Delete drop #${drop.id}`}
                                                                    title="Delete Drop"
                                                                >
                                                                    <Trash2 size={16} />
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
                                            {ADMIN_ORDER_FILTERS.map((filter) => <option key={filter} value={filter}>{filter.toUpperCase()}</option>)}
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
                                                <th scope="col">ACTIONS / FULFILLMENT</th>
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
                                                                            notes: order.fulfillment_notes || '', trackingId: order.tracking_id || order.awb || '', returnAction: 'return', returnReason: '',
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
                                                            <td className="adminCellActions">
                                                                <div className="adminTableActionsGroup">
                                                                    {/* Quick Accept button for new/pending/paid/processing orders */}
                                                                    {['pending_payment', 'paid', 'processing'].includes(order.status) && (
                                                                        <button
                                                                            type="button"
                                                                            className="adminQuickActionBtn adminAcceptBtn"
                                                                            onClick={() => handleQuickAcceptOrder(order)}
                                                                            title="Accept order into Tokyo fulfillment vault"
                                                                        >
                                                                            <Check size={13} />
                                                                            <span>Accept</span>
                                                                        </button>
                                                                    )}

                                                                    {/* Quick Reject button for orders not yet shipped/delivered/cancelled */}
                                                                    {!['shipped', 'delivered', 'cancelled', 'refunded'].includes(order.status) && (
                                                                        <button
                                                                            type="button"
                                                                            className="adminQuickActionBtn adminRejectBtn"
                                                                            onClick={() => handleOpenRejectModal(order)}
                                                                            title="Reject order with specific reason for customer"
                                                                        >
                                                                            <Ban size={13} />
                                                                            <span>Reject</span>
                                                                        </button>
                                                                    )}

                                                                    {/* 3-Day Replacement review button if requested by customer */}
                                                                    {(order.replacement_requested || order.replacement_status === 'requested') && (
                                                                        <button
                                                                            type="button"
                                                                            className="adminQuickActionBtn adminReplacementBtn"
                                                                            onClick={() => {
                                                                                setSelectedOrder(order);
                                                                                setOrderStatusForm({
                                                                                    status: 'replaced',
                                                                                    notes: `Replacement approved for size ${order.replacement_preferred_size || 'requested size'}`,
                                                                                    trackingId: order.tracking_id || '',
                                                                                    returnAction: 'replace',
                                                                                    returnReason: order.replacement_reason || '',
                                                                                });
                                                                            }}
                                                                            title="Customer requested 3-day replacement"
                                                                        >
                                                                            <RotateCcw size={13} />
                                                                            <span>Replace</span>
                                                                        </button>
                                                                    )}

                                                                    <button
                                                                        type="button"
                                                                        className="adminFulfillButton"
                                                                        onClick={() => {
                                                                            setSelectedOrder(order);
                                                                            setOrderStatusForm({
                                                                                status: order.status,
                                                                                notes: order.fulfillment_notes || '',
                                                                                trackingId: order.tracking_id || order.awb || '',
                                                                                returnAction: 'return',
                                                                                returnReason: '',
                                                                            });
                                                                        }}
                                                                        title="Inspect full order dossier"
                                                                    >
                                                                        <Eye size={14} />
                                                                        <span>Inspect</span>
                                                                    </button>
                                                                </div>
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

                        {currentTab === 'users' && (
                            <section className="adminSection" aria-labelledby="users-title">
                                <div className="adminSectionToolbar">
                                    <div className="adminSearchBox">
                                        <Search size={18} />
                                        <input
                                            value={userSearch}
                                            onChange={(e) => setUserSearch(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && refreshCustomerData()}
                                            placeholder="Search customers by name, email, or phone..."
                                            aria-label="Search customers"
                                        />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <span style={{ fontSize: '0.82rem', color: 'rgba(21, 27, 43, 0.65)', fontWeight: 600 }}>
                                            {users.length} {users.length === 1 ? 'Customer' : 'Customers'}
                                        </span>
                                        <button type="button" className="adminSecondaryButton" onClick={refreshCustomerData}>
                                            <RefreshCw size={15} /> <span>Refresh</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="adminOrdersTableContainer">
                                    <table className="adminTable" aria-label="Customer users">
                                        <thead>
                                            <tr>
                                                <th scope="col">CUSTOMER</th>
                                                <th scope="col">EMAIL ADDRESS</th>
                                                <th scope="col">PHONE</th>
                                                <th scope="col">ORDERS</th>
                                                <th scope="col">LIFETIME VALUE</th>
                                                <th scope="col">STATUS</th>
                                                <th scope="col">OPERATOR ACTIONS</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {users.length === 0 ? (
                                                <tr>
                                                    <td colSpan="7" className="adminEmptyTableCell">
                                                        No customers found matching search criteria.
                                                    </td>
                                                </tr>
                                            ) : (
                                                users.map((customer) => (
                                                    <tr key={customer.id} className="adminTableRow">
                                                        <td>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                                                <div className="adminCustomerAvatar">
                                                                    {(customer.display_name?.[0] || customer.email?.[0] || 'U').toUpperCase()}
                                                                </div>
                                                                <div style={{ fontWeight: 600, color: '#151B2B' }}>
                                                                    {customer.display_name || 'Unnamed customer'}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <span style={{ color: 'rgba(21, 27, 43, 0.85)', fontSize: '0.84rem' }}>
                                                                {customer.email || 'Private'}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <span style={{ color: 'rgba(21, 27, 43, 0.65)', fontSize: '0.82rem' }}>
                                                                {customer.phone || '—'}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <span className="adminItemBadge">
                                                                {customer.order_count ?? customer.orders?.length ?? 0} {((customer.order_count ?? customer.orders?.length ?? 0) === 1) ? 'Order' : 'Orders'}
                                                            </span>
                                                        </td>
                                                        <td className="adminCellPrice">
                                                            {formatMoney(customer.lifetime_value || 0)}
                                                        </td>
                                                        <td>
                                                            <span className={`adminStatusBadge ${customer.is_blocked ? 'badgeInactive' : 'badgeActive'}`}>
                                                                {customer.is_blocked ? 'BLOCKED' : 'ACTIVE'}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <div className="adminRowActions">
                                                                <button
                                                                    type="button"
                                                                    className="adminFulfillButton"
                                                                    onClick={async () => {
                                                                        await adminService.setUserBlocked(customer.id, !customer.is_blocked, 'Admin console action');
                                                                        refreshCustomerData();
                                                                    }}
                                                                    aria-label={`${customer.is_blocked ? 'Unblock' : 'Block'} ${customer.email}`}
                                                                >
                                                                    {customer.is_blocked ? <Check size={14} /> : <Ban size={14} />}
                                                                    <span>{customer.is_blocked ? 'Unblock' : 'Block'}</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="adminOrderLink"
                                                                    onClick={() => setSelectedUser(customer)}
                                                                >
                                                                    Details
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Customer Details Modal Dialog */}
                                {selectedUser && (
                                    <div className="adminModalOverlay" role="dialog" aria-modal="true" aria-labelledby="customer-modal-title">
                                        <div className="adminModalCard adminCustomerModalCard">
                                            <div className="adminModalHeader">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                                                    <div className="adminCustomerAvatar large">
                                                        {(selectedUser.display_name?.[0] || selectedUser.email?.[0] || 'U').toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <span className="adminKanjiSub">顧客プロファイル / CLIENT PROFILE</span>
                                                        <h3 id="customer-modal-title" className="adminModalTitle">
                                                            {selectedUser.display_name || selectedUser.email}
                                                        </h3>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="adminModalClose"
                                                    onClick={() => setSelectedUser(null)}
                                                    aria-label="Close customer details"
                                                >
                                                    &times;
                                                </button>
                                            </div>

                                            <div className="adminCustomerModalBody">
                                                <div className="adminCustomerStatsGrid">
                                                    <div className="adminCustomerStatBox">
                                                        <span className="adminCustomerStatLabel">Email</span>
                                                        <span className="adminCustomerStatVal">{selectedUser.email || 'Private'}</span>
                                                    </div>
                                                    <div className="adminCustomerStatBox">
                                                        <span className="adminCustomerStatLabel">Phone</span>
                                                        <span className="adminCustomerStatVal">{selectedUser.phone || 'No phone'}</span>
                                                    </div>
                                                    <div className="adminCustomerStatBox">
                                                        <span className="adminCustomerStatLabel">Account Status</span>
                                                        <span className={`adminStatusBadge ${selectedUser.is_blocked ? 'badgeInactive' : 'badgeActive'}`}>
                                                            {selectedUser.is_blocked ? 'BLOCKED' : 'ACTIVE'}
                                                        </span>
                                                    </div>
                                                    <div className="adminCustomerStatBox">
                                                        <span className="adminCustomerStatLabel">Total Spent</span>
                                                        <span className="adminCustomerStatVal price">
                                                            {formatMoney(selectedUser.lifetime_value || 0)}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="adminCustomerHistorySection">
                                                    <h4 className="adminSubsectionTitle">ORDER HISTORY</h4>
                                                    {(selectedUser.orders || []).length === 0 ? (
                                                        <p style={{ fontSize: '0.85rem', color: 'rgba(21, 27, 43, 0.65)', padding: '0.75rem 0' }}>
                                                            No placed orders recorded for this customer yet.
                                                        </p>
                                                    ) : (
                                                        <div className="adminCustomerOrdersList">
                                                            {(selectedUser.orders || []).map((order) => (
                                                                <div key={order.id} className="adminCustomerOrderRow">
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                                                        <span className="adminPairBadge">#{order.id}</span>
                                                                        <span style={{ fontSize: '0.75rem', color: 'rgba(21, 27, 43, 0.6)' }}>
                                                                            {order.created_at ? new Date(order.created_at).toLocaleDateString('en-IN') : 'Archive Record'}
                                                                        </span>
                                                                    </div>
                                                                    <div>
                                                                        <span className={`adminOrderStatusBadge status-${order.status}`}>
                                                                            {order.status?.toUpperCase()}
                                                                        </span>
                                                                    </div>
                                                                    <div className="adminCellPrice">
                                                                        {formatMoney(order.total_minor || order.total_amount_minor || 0)}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="adminModalFooter">
                                                    <button
                                                        type="button"
                                                        className="adminFulfillButton"
                                                        onClick={async () => {
                                                            await adminService.setUserBlocked(selectedUser.id, !selectedUser.is_blocked, 'Admin console action');
                                                            setSelectedUser((prev) => ({ ...prev, is_blocked: !prev.is_blocked }));
                                                            refreshCustomerData();
                                                        }}
                                                    >
                                                        {selectedUser.is_blocked ? <Check size={14} /> : <Ban size={14} />}
                                                        <span>{selectedUser.is_blocked ? 'Unblock Customer' : 'Block Customer'}</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="adminSecondaryButton"
                                                        onClick={() => setSelectedUser(null)}
                                                    >
                                                        Close
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </section>
                        )}

                        {currentTab === 'tickets' && (
                            <section className="adminSection" aria-labelledby="tickets-title">
                                <div className="adminSectionToolbar">
                                    <div>
                                        <span className="adminKanjiSub">サポート管理 / CUSTOMER DISPATCH</span>
                                        <h2 id="tickets-title">Support Tickets</h2>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <span style={{ fontSize: '0.82rem', color: 'rgba(21, 27, 43, 0.65)', fontWeight: 600 }}>
                                            {tickets.length} {tickets.length === 1 ? 'Ticket' : 'Tickets'}
                                        </span>
                                        <button type="button" className="adminSecondaryButton" onClick={refreshCustomerData}>
                                            <RefreshCw size={15} /> <span>Refresh</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="adminOrdersTableContainer">
                                    <table className="adminTable" aria-label="Support tickets">
                                        <thead>
                                            <tr>
                                                <th scope="col">SUBJECT</th>
                                                <th scope="col">CUSTOMER</th>
                                                <th scope="col">STATUS</th>
                                                <th scope="col">UPDATED</th>
                                                <th scope="col">ACTION</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {tickets.length === 0 ? (
                                                <tr>
                                                    <td colSpan="5" className="adminEmptyTableCell">
                                                        No active support tickets found.
                                                    </td>
                                                </tr>
                                            ) : (
                                                tickets.map((ticket) => (
                                                    <tr key={ticket.id} className="adminTableRow">
                                                        <td>
                                                            <div style={{ fontWeight: 600, color: '#151B2B' }}>
                                                                {ticket.subject}
                                                            </div>
                                                            <span style={{ fontSize: '0.72rem', color: 'rgba(21, 27, 43, 0.55)' }}>
                                                                ID: {ticket.id}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <div className="adminCustomerCell">
                                                                <div className="adminCustomerName">{ticket.display_name || ticket.email}</div>
                                                                <div className="adminCustomerEmail">{ticket.email || 'Private'}</div>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <span className={`adminStatusBadge ${ticket.status === 'open' ? 'badgeActive' : 'badgeInactive'}`}>
                                                                {(ticket.status || 'open').toUpperCase()}
                                                            </span>
                                                        </td>
                                                        <td className="adminCellTime">
                                                            {ticket.updated_at ? new Date(ticket.updated_at).toLocaleString('en-IN', {
                                                                day: 'numeric',
                                                                month: 'short',
                                                                hour: '2-digit',
                                                                minute: '2-digit',
                                                            }) : '—'}
                                                        </td>
                                                        <td>
                                                            <button
                                                                type="button"
                                                                className="adminFulfillButton"
                                                                onClick={() => setSelectedTicket(ticket)}
                                                            >
                                                                <Eye size={14} />
                                                                <span>View messages</span>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Support Ticket Messages Modal */}
                                {selectedTicket && (
                                    <div className="adminModalOverlay" role="dialog" aria-modal="true" aria-labelledby="ticket-modal-title">
                                        <div className="adminModalCard adminTicketModalCard">
                                            <div className="adminModalHeader">
                                                <div>
                                                    <span className="adminKanjiSub">チケット対応 / SUPPORT DISPATCH</span>
                                                    <h3 id="ticket-modal-title" className="adminModalTitle">
                                                        {selectedTicket.subject}
                                                    </h3>
                                                    <p style={{ fontSize: '0.85rem', color: 'rgba(21, 27, 43, 0.7)', margin: '0.25rem 0 0' }}>
                                                        Customer: <strong>{selectedTicket.display_name || selectedTicket.email}</strong> &bull; Status: <span className={`adminStatusBadge ${selectedTicket.status === 'open' ? 'badgeActive' : 'badgeInactive'}`}>{selectedTicket.status?.toUpperCase()}</span>
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="adminModalClose"
                                                    onClick={() => setSelectedTicket(null)}
                                                    aria-label="Close ticket messages"
                                                >
                                                    &times;
                                                </button>
                                            </div>

                                            <div className="adminTicketModalBody">
                                                <div className="adminTicketThreadContainer">
                                                    {(selectedTicket.messages || []).length === 0 ? (
                                                        <p style={{ fontSize: '0.85rem', color: 'rgba(21, 27, 43, 0.65)', textAlign: 'center', padding: '1.5rem 0' }}>
                                                            No prior messages recorded in this ticket.
                                                        </p>
                                                    ) : (
                                                        (selectedTicket.messages || []).map((message) => (
                                                            <div
                                                                key={message.id}
                                                                className={`adminTicketMsgBubble ${message.is_admin ? 'isAdminMsg' : 'isCustomerMsg'}`}
                                                            >
                                                                <div className="adminTicketMsgHeader">
                                                                    <span className="adminTicketMsgAuthor">
                                                                        {message.is_admin ? 'ADMIN OPERATOR' : (selectedTicket.display_name || 'CUSTOMER')}
                                                                    </span>
                                                                    {message.created_at && (
                                                                        <span className="adminTicketMsgTime">
                                                                            {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="adminTicketMsgBody">{message.body}</div>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>

                                                <form
                                                    onSubmit={async (e) => {
                                                        e.preventDefault();
                                                        if (!ticketReply.trim()) return;
                                                        await adminService.replyToSupportTicket(selectedTicket.id, ticketReply);
                                                        setTicketReply('');
                                                        refreshCustomerData();
                                                    }}
                                                    className="adminTicketReplyArea"
                                                >
                                                    <label className="adminFormLabel">
                                                        <span>OPERATOR REPLY</span>
                                                        <textarea
                                                            rows="3"
                                                            value={ticketReply}
                                                            onChange={(e) => setTicketReply(e.target.value)}
                                                            placeholder="Write an admin reply..."
                                                            aria-label="Admin ticket reply"
                                                            className="adminTextarea"
                                                            required
                                                        />
                                                    </label>

                                                    <div className="adminModalFooter">
                                                        <button
                                                            type="button"
                                                            className="adminSecondaryButton"
                                                            onClick={() => setSelectedTicket(null)}
                                                        >
                                                            Close
                                                        </button>
                                                        <button type="submit" className="adminPrimaryButton">
                                                            <Send size={14} />
                                                            <span>Send reply</span>
                                                        </button>
                                                    </div>
                                                </form>
                                            </div>
                                        </div>
                                    </div>
                                )}
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
                                        <span>COMPARE-AT PRICE (INR ₹)</span>
                                        <input type="text" value={dropForm.comparePrice} onChange={(e) => setDropForm({ ...dropForm, comparePrice: e.target.value })} placeholder="Optional original price" className="adminInput" />
                                    </label>
                                    <label className="adminFormLabel">
                                        <span>CATALOG STATUS</span>
                                        <select
                                            className="adminSelect"
                                            value={dropForm.status}
                                            onChange={(e) => {
                                                const nextStatus = e.target.value;
                                                setDropForm({ ...dropForm, status: nextStatus, active: nextStatus !== 'draft' });
                                            }}
                                        >
                                            <option value="active">Active</option>
                                            <option value="sold_out">Sold out</option>
                                            <option value="draft">Draft</option>
                                        </select>
                                    </label>
                                    <label className="adminFormLabel">
                                        <span>CATEGORY</span>
                                        <select className="adminSelect" value={dropForm.categoryId} onChange={(e) => setDropForm({ ...dropForm, categoryId: e.target.value })}>
                                            <option value="">Uncategorized</option>
                                            {catalogCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                                        </select>
                                    </label>
                                    <label className="adminFormLabel">
                                        <span>TAGS</span>
                                        <select className="adminSelect" multiple value={dropForm.tags} onChange={(e) => setDropForm({ ...dropForm, tags: Array.from(e.target.selectedOptions, (option) => option.value) })}>
                                            {catalogTags.map((tag) => <option key={tag.id || tag.slug} value={tag.slug || tag.name}>{tag.name}</option>)}
                                        </select>
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
                                        <span>FRONT ANGLE IMAGE PATH / LINK</span>
                                        <input
                                            type="text"
                                            value={dropForm.frontImage}
                                            onChange={(e) => {
                                                setDropForm({ ...dropForm, frontImage: e.target.value });
                                                setRemoteImageErrors((prev) => { const n = { ...prev }; delete n.frontImage; return n; });
                                            }}
                                            onPaste={(e) => handleImageInputPaste(e, 'frontImage')}
                                            placeholder="/shoes/... or https://..."
                                            required
                                            className="adminInput"
                                        />
                                        {isOnlineImageUrl(dropForm.frontImage) && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                                <button
                                                    type="button"
                                                    className="adminSecondaryButton"
                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', fontSize: '0.78rem' }}
                                                    disabled={isProcessingRemoteImage || isProcessingImage}
                                                    onClick={() => handleDownloadAndOptimizeField('frontImage')}
                                                >
                                                    {isProcessingRemoteImage && remoteProcessingField === 'frontImage' ? (
                                                        <>
                                                            <RefreshCw size={12} className="adminSpin" />
                                                            <span>{remoteStatusMessage || 'Downloading & Optimizing...'}</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Download size={13} />
                                                            <span>Download & Optimize</span>
                                                        </>
                                                    )}
                                                </button>
                                                <span style={{ fontSize: '0.75rem', color: '#ff5e00' }}>Remote URL detected</span>
                                            </div>
                                        )}
                                        {remoteImageStatus.frontImage && !isOnlineImageUrl(dropForm.frontImage) && (
                                            <div style={{ fontSize: '0.8rem', color: '#ff5e00', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                                <RefreshCw size={12} className="adminSpin" />
                                                <span>{remoteImageStatus.frontImage}</span>
                                            </div>
                                        )}
                                        {remoteImageSuccess.frontImage && (
                                            <div style={{ fontSize: '0.8rem', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                                <CheckCircle2 size={12} />
                                                <span>{remoteImageSuccess.frontImage}</span>
                                            </div>
                                        )}
                                        {remoteImageErrors.frontImage && (
                                            <div style={{ fontSize: '0.8rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                                <AlertCircle size={12} />
                                                <span>{remoteImageErrors.frontImage}</span>
                                            </div>
                                        )}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="adminInput"
                                            disabled={isProcessingImage || isProcessingRemoteImage}
                                            onChange={(e) => handleImageFileSelect(e, 'frontImage')}
                                        />
                                        {isProcessingImage && processingImageField === 'frontImage' && (
                                            <div style={{ fontSize: '0.8rem', color: '#ff5e00', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                                <RefreshCw size={12} className="adminSpin" />
                                                <span>Optimizing image client-side...</span>
                                            </div>
                                        )}
                                        <div className="adminQuickImagePicks">
                                            {[1, 2, 3, 4, 5].map((idx) => (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    className="adminImagePickBtn"
                                                    onClick={() => {
                                                        setDropForm({
                                                            ...dropForm,
                                                            frontImage: `/shoes/transparent/shoe-${idx}-front.png`,
                                                            sideImage: `/shoes/transparent/shoe-${idx}-side.png`,
                                                        });
                                                        setRemoteImageErrors({});
                                                        setRemoteImageSuccess({});
                                                    }}
                                                >
                                                    Preset #{idx}
                                                </button>
                                            ))}
                                        </div>
                                    </label>

                                    <label className="adminFormLabel">
                                        <span>SIDE PROFILE IMAGE PATH / LINK</span>
                                        <input
                                            type="text"
                                            value={dropForm.sideImage}
                                            onChange={(e) => {
                                                setDropForm({ ...dropForm, sideImage: e.target.value });
                                                setRemoteImageErrors((prev) => { const n = { ...prev }; delete n.sideImage; return n; });
                                            }}
                                            onPaste={(e) => handleImageInputPaste(e, 'sideImage')}
                                            placeholder="/shoes/... or https://..."
                                            required
                                            className="adminInput"
                                        />
                                        {isOnlineImageUrl(dropForm.sideImage) && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                                <button
                                                    type="button"
                                                    className="adminSecondaryButton"
                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', fontSize: '0.78rem' }}
                                                    disabled={isProcessingRemoteImage || isProcessingImage}
                                                    onClick={() => handleDownloadAndOptimizeField('sideImage')}
                                                >
                                                    {isProcessingRemoteImage && remoteProcessingField === 'sideImage' ? (
                                                        <>
                                                            <RefreshCw size={12} className="adminSpin" />
                                                            <span>{remoteStatusMessage || 'Downloading & Optimizing...'}</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Download size={13} />
                                                            <span>Download & Optimize</span>
                                                        </>
                                                    )}
                                                </button>
                                                <span style={{ fontSize: '0.75rem', color: '#ff5e00' }}>Remote URL detected</span>
                                            </div>
                                        )}
                                        {remoteImageStatus.sideImage && !isOnlineImageUrl(dropForm.sideImage) && (
                                            <div style={{ fontSize: '0.8rem', color: '#ff5e00', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                                <RefreshCw size={12} className="adminSpin" />
                                                <span>{remoteImageStatus.sideImage}</span>
                                            </div>
                                        )}
                                        {remoteImageSuccess.sideImage && (
                                            <div style={{ fontSize: '0.8rem', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                                <CheckCircle2 size={12} />
                                                <span>{remoteImageSuccess.sideImage}</span>
                                            </div>
                                        )}
                                        {remoteImageErrors.sideImage && (
                                            <div style={{ fontSize: '0.8rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                                <AlertCircle size={12} />
                                                <span>{remoteImageErrors.sideImage}</span>
                                            </div>
                                        )}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="adminInput"
                                            disabled={isProcessingImage || isProcessingRemoteImage}
                                            onChange={(e) => handleImageFileSelect(e, 'sideImage')}
                                        />
                                        {isProcessingImage && processingImageField === 'sideImage' && (
                                            <div style={{ fontSize: '0.8rem', color: '#ff5e00', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                                <RefreshCw size={12} className="adminSpin" />
                                                <span>Optimizing image client-side...</span>
                                            </div>
                                        )}
                                    </label>
                                </div>

                                <div className="adminFormLabel" style={{ display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                        <span>ADDITIONAL PRODUCT IMAGES ({additionalImageList.length})</span>
                                        {additionalImageList.length > 0 && (
                                            <span style={{ fontSize: '0.75rem', color: '#888' }}>
                                                {additionalImageList.length} attached angle{additionalImageList.length > 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>

                                    <div className="adminAdditionalManager">
                                        {additionalImageList.length === 0 ? (
                                            <div className="adminAdditionalEmpty">
                                                <p>No additional images attached yet.</p>
                                                <span>Select a photo from your device or paste a web/Pinterest link below to add extra product angles.</span>
                                            </div>
                                        ) : (
                                            <div className="adminAdditionalGallery">
                                                {additionalImageList.map((imgUrl, idx) => (
                                                    <div key={`${idx}-${imgUrl.slice(0, 32)}`} className="adminAdditionalItem">
                                                        <div className="adminAdditionalThumb">
                                                            <img
                                                                src={imgUrl}
                                                                alt={`Additional angle ${idx + 1}`}
                                                                className="adminAdditionalThumbImg"
                                                                loading="lazy"
                                                            />
                                                        </div>
                                                        <div className="adminAdditionalInfo">
                                                            <span className="adminAdditionalBadge">Angle #{idx + 1}</span>
                                                            <span className="adminAdditionalMeta">
                                                                {imgUrl.startsWith('data:')
                                                                    ? `${Math.round(imgUrl.length / 1024)} KB`
                                                                    : (imgUrl.startsWith('/') ? 'Local File' : 'Web Link')}
                                                            </span>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            className="adminAdditionalRemoveBtn"
                                                            title="Remove image"
                                                            aria-label={`Remove additional angle ${idx + 1}`}
                                                            disabled={isProcessingAdditional}
                                                            onClick={() => handleRemoveAdditionalImage(idx)}
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div className="adminAdditionalControls">
                                            {/* Option A: Add Image from Device */}
                                            <div className="adminAdditionalUploadRow">
                                                <input
                                                    type="file"
                                                    ref={additionalFileInputRef}
                                                    accept="image/*"
                                                    id="admin-additional-file-input"
                                                    className="adminAdditionalFileInput"
                                                    disabled={isProcessingAdditional || isProcessingImage}
                                                    onChange={handleAddAdditionalFile}
                                                />
                                                <label
                                                    htmlFor="admin-additional-file-input"
                                                    className="adminAdditionalUploadBtn"
                                                    style={{ cursor: isProcessingAdditional || isProcessingImage ? 'not-allowed' : 'pointer' }}
                                                >
                                                    <Upload size={14} />
                                                    <span>Add Image from Device</span>
                                                </label>
                                                <span style={{ fontSize: '0.75rem', color: '#888' }}>
                                                    Auto-compressed client side
                                                </span>
                                            </div>

                                            <div className="adminAdditionalDivider">
                                                <span>OR PASTE IMAGE / PINTEREST LINK</span>
                                            </div>

                                            {/* Option B: Direct / Pinterest Link */}
                                            <div className="adminAdditionalUrlRow">
                                                <input
                                                    type="text"
                                                    className="adminInput"
                                                    style={{ flex: 1 }}
                                                    placeholder="Paste image link (.jpg, .png, .webp) or Pinterest pin..."
                                                    value={additionalUrlInput}
                                                    disabled={isProcessingAdditional}
                                                    onChange={(e) => {
                                                        setAdditionalUrlInput(e.target.value);
                                                        setAdditionalManagerError('');
                                                    }}
                                                    onPaste={handleAdditionalUrlPaste}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            handleAddAdditionalUrl();
                                                        }
                                                    }}
                                                />
                                                <button
                                                    type="button"
                                                    className="adminSecondaryButton"
                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                                                    disabled={isProcessingAdditional || !additionalUrlInput.trim()}
                                                    onClick={() => handleAddAdditionalUrl()}
                                                >
                                                    {isProcessingAdditional ? (
                                                        <>
                                                            <RefreshCw size={13} className="adminSpin" />
                                                            <span>Adding...</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Download size={13} />
                                                            <span>Add Link</span>
                                                        </>
                                                    )}
                                                </button>
                                            </div>

                                            {/* Status indicator */}
                                            {isProcessingAdditional && (
                                                <div className="adminAdditionalStatus">
                                                    <RefreshCw size={12} className="adminSpin" />
                                                    <span>{additionalManagerStatus || 'Optimizing and attaching image...'}</span>
                                                </div>
                                            )}

                                            {/* Error message */}
                                            {additionalManagerError && (
                                                <div className="adminAdditionalError">
                                                    <AlertCircle size={12} />
                                                    <span>{additionalManagerError}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="adminFormGrid">
                                    {(dropForm.sizes || []).map((item, index) => (
                                        <div className="adminSizeEditor" key={`${item.value}-${index}`}>
                                            <label className="adminFormLabel"><span>SIZE</span><input className="adminInput" value={item.value} onChange={(e) => setDropForm({ ...dropForm, sizes: dropForm.sizes.map((size, i) => i === index ? { ...size, value: e.target.value } : size) })} /></label>
                                            <label className="adminFormLabel"><span>QUANTITY</span><input className="adminInput" type="number" min="0" value={item.quantity} onChange={(e) => {
                                                const val = Number(e.target.value);
                                                setDropForm({
                                                    ...dropForm,
                                                    sizes: dropForm.sizes.map((size, i) =>
                                                        i === index ? { ...size, quantity: Math.max(0, val), sold: val <= 0 ? true : (size.quantity <= 0 && val > 0 ? false : size.sold) } : size
                                                    )
                                                });
                                            }} /></label>
                                            <label className="adminCheckboxLabel"><input type="checkbox" checked={item.sold} onChange={(e) => setDropForm({ ...dropForm, sizes: dropForm.sizes.map((size, i) => i === index ? { ...size, sold: e.target.checked } : size) })} /> Mark sold</label>
                                            <button type="button" className="adminSecondaryButton" onClick={() => setDropForm({ ...dropForm, sizes: dropForm.sizes.filter((_, i) => i !== index) })}>Remove size</button>
                                        </div>
                                    ))}
                                    <button type="button" className="adminSecondaryButton" onClick={() => setDropForm({ ...dropForm, sizes: [...dropForm.sizes, { value: '', quantity: 1, sold: false }] })}>Add size</button>
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

                                <div className="adminFormGrid">
                                    <label className="adminFormLabel">
                                        <span>UPPER MATERIAL</span>
                                        <input className="adminInput" value={dropForm.upperMaterial} onChange={(e) => setDropForm({ ...dropForm, upperMaterial: e.target.value })} placeholder="Leather, mesh, suede..." />
                                    </label>
                                    <label className="adminFormLabel">
                                        <span>SOLE MATERIAL</span>
                                        <input className="adminInput" value={dropForm.soleMaterial} onChange={(e) => setDropForm({ ...dropForm, soleMaterial: e.target.value })} placeholder="Rubber, EVA foam..." />
                                    </label>
                                </div>
                                <label className="adminFormLabel">
                                    <span>CARE INSTRUCTIONS</span>
                                    <textarea rows="2" className="adminTextarea" value={dropForm.careInstructions} onChange={(e) => setDropForm({ ...dropForm, careInstructions: e.target.value })} placeholder="Clean with a soft brush. Air dry away from direct heat." />
                                </label>

                                <div className="adminCheckboxRow">
                                    <label className="adminCheckboxLabel">
                                        <input
                                            type="checkbox"
                                            checked={dropForm.active}
                                            onChange={(e) => {
                                                const nextActive = e.target.checked;
                                                setDropForm({
                                                    ...dropForm,
                                                    active: nextActive,
                                                    status: nextActive ? (dropForm.status === 'draft' ? 'active' : dropForm.status) : 'draft',
                                                });
                                            }}
                                        />
                                        <span>Active catalog listing (visible on public shop)</span>
                                    </label>
                                </div>

                                <div className="adminModalFooter">
                                    <button
                                        type="button"
                                        className="adminSecondaryButton"
                                        onClick={() => setShowDropModal(false)}
                                        disabled={isSavingDrop || isProcessingImage}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="adminPrimaryButton"
                                        disabled={isSavingDrop || isProcessingImage}
                                    >
                                        {isSavingDrop ? (
                                            <>
                                                <RefreshCw size={14} className="adminSpin" />
                                                <span>Saving...</span>
                                            </>
                                        ) : isProcessingImage ? (
                                            <>
                                                <RefreshCw size={14} className="adminSpin" />
                                                <span>Optimizing Image...</span>
                                            </>
                                        ) : (
                                            editingDropId ? 'Save Changes' : 'Publish Drop'
                                        )}
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
                                    <div className="operatorSectionHeader">
                                        <div>
                                            <span className="adminKanjiSub">運用手順 / AUTHENTICATED WORKFLOW</span>
                                            <h4 className="adminSubsectionTitle">OPERATOR FULFILLMENT ACTION</h4>
                                        </div>
                                        <div className="operatorCurrentStatusPill">
                                            STATUS: <span className={`adminOrderStatusBadge status-${selectedOrder.status}`}>{selectedOrder.status.toUpperCase()}</span>
                                        </div>
                                    </div>
                                    <p className="adminSubsectionDesc">
                                        Complete end-to-end streetwear fulfillment pipeline:
                                        <strong> Paid</strong> &rarr; <strong>Confirmed</strong> &rarr; <strong>Authenticating</strong> &rarr; <strong>Shipped</strong> &rarr; <strong>Delivered</strong> &rarr; <strong>3-Day Replacement</strong>
                                    </p>

                                    {/* Visual Lifecycle Stepper */}
                                    <div className="operatorLifecycleStepper">
                                        {[
                                            { key: 'paid', label: 'Received & Paid', date: selectedOrder.paid_at || selectedOrder.created_at },
                                            { key: 'confirmed', label: 'Confirmed', date: selectedOrder.confirmed_at },
                                            { key: 'authenticating', label: 'Vault Auth', date: selectedOrder.status === 'authenticating' ? selectedOrder.updated_at : null },
                                            { key: 'shipped', label: 'Dispatched / In Transit', date: selectedOrder.shipped_at },
                                            { key: 'delivered', label: 'Delivered', date: selectedOrder.delivered_at },
                                        ].map((step, idx, arr) => {
                                            const statusOrder = ['pending_payment', 'paid', 'confirmed', 'authenticating', 'processing', 'shipped', 'delivered', 'replaced'];
                                            const curIdx = statusOrder.indexOf(selectedOrder.status);
                                            const stepIdx = statusOrder.indexOf(step.key);
                                            const isDone = (selectedOrder.status === 'delivered' || selectedOrder.status === 'replaced')
                                                ? true
                                                : selectedOrder.status === 'cancelled'
                                                    ? false
                                                    : curIdx >= stepIdx;
                                            const isCurrent = selectedOrder.status === step.key || (step.key === 'authenticating' && selectedOrder.status === 'processing');

                                            return (
                                                <div key={step.key} className={`operatorStepItem ${isDone ? 'isDone' : ''} ${isCurrent ? 'isCurrent' : ''}`}>
                                                    <div className="operatorStepIndicator">
                                                        <div className="operatorStepCircle">
                                                            {isDone ? <Check size={12} strokeWidth={3} /> : idx + 1}
                                                        </div>
                                                        {idx < arr.length - 1 && <div className="operatorStepLine" />}
                                                    </div>
                                                    <div className="operatorStepLabelWrap">
                                                        <span className="operatorStepName">{step.label}</span>
                                                        <span className="operatorStepState">
                                                            {isCurrent ? 'Active Now' : isDone ? 'Verified' : 'Pending'}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Rejection / Cancellation Dossier (if cancelled) */}
                                    {selectedOrder.status === 'cancelled' && (
                                        <div className="operatorAlertDossier isCancelled">
                                            <AlertCircle size={18} />
                                            <div>
                                                <strong>ORDER REJECTED / CANCELLED:</strong>
                                                <p className="operatorDossierText">
                                                    Reason: &ldquo;{selectedOrder.rejection_reason || selectedOrder.cancel_reason || 'Rejected by Administrator'}&rdquo;
                                                    {selectedOrder.cancelled_at && ` • Timestamp: ${new Date(selectedOrder.cancelled_at).toLocaleString('en-IN')}`}
                                                </p>
                                                <span className="operatorDossierHint">This reason is surfaced to the customer in their Order History.</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* 3-Day Customer Replacement Dossier (if replacement was requested) */}
                                    {(selectedOrder.replacement_requested || selectedOrder.status === 'replaced' || selectedOrder.replacement_status === 'requested') && (
                                        <div className="operatorAlertDossier isReplacement">
                                            <RotateCcw size={18} />
                                            <div className="operatorReplacementContent">
                                                <div className="operatorReplacementHead">
                                                    <strong>CUSTOMER 3-DAY REPLACEMENT DOSSIER:</strong>
                                                    <span className="operatorReplacementBadge">
                                                        {selectedOrder.status === 'replaced' ? 'REPLACEMENT COMPLETED' : 'ACTION REQUIRED'}
                                                    </span>
                                                </div>
                                                <div className="operatorReplacementDetailsGrid">
                                                    <div>
                                                        <span className="operatorLabel">REPLACEMENT REASON:</span>
                                                        <strong>{selectedOrder.replacement_reason || 'Reason not specified'}</strong>
                                                    </div>
                                                    <div>
                                                        <span className="operatorLabel">PREFERRED NEW SIZE:</span>
                                                        <strong>{selectedOrder.replacement_preferred_size || 'Same size'}</strong>
                                                    </div>
                                                    {selectedOrder.replacement_notes && (
                                                        <div className="operatorReplacementSpanAll">
                                                            <span className="operatorLabel">CUSTOMER NOTES:</span>
                                                            <span>{selectedOrder.replacement_notes}</span>
                                                        </div>
                                                    )}
                                                    {selectedOrder.replacement_requested_at && (
                                                        <div>
                                                            <span className="operatorLabel">REQUESTED AT:</span>
                                                            <span>{new Date(selectedOrder.replacement_requested_at).toLocaleString('en-IN')}</span>
                                                        </div>
                                                    )}
                                                </div>
                                                {selectedOrder.status !== 'replaced' && (
                                                    <div className="operatorReplacementActions">
                                                        <button
                                                            type="button"
                                                            className="adminPrimaryButton operatorApproveReplaceBtn"
                                                            onClick={() => handleApproveReplacement(selectedOrder)}
                                                        >
                                                            <CheckCircle2 size={14} />
                                                            <span>Approve Replacement & Allocate Pair</span>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Quick Stage Transition Actions */}
                                    <div className="operatorQuickActionsSection">
                                        <span className="operatorQuickLabel">ONE-CLICK QUICK STAGE ACTIONS:</span>
                                        <div className="operatorQuickButtonsRow">
                                            {['pending_payment', 'paid', 'processing'].includes(selectedOrder.status) && (
                                                <button
                                                    type="button"
                                                    className="operatorActionBtn operatorBtnGreen"
                                                    onClick={() => handleAdvanceOrderStage('confirmed', 'Order accepted & confirmed by operator.')}
                                                >
                                                    <Check size={14} />
                                                    <span>Accept & Confirm Order</span>
                                                </button>
                                            )}

                                            {(selectedOrder.status === 'confirmed' || selectedOrder.status === 'paid' || selectedOrder.status === 'processing') && (
                                                <button
                                                    type="button"
                                                    className="operatorActionBtn operatorBtnBlue"
                                                    onClick={() => handleAdvanceOrderStage('authenticating', 'Physical authentication underway in Shibuya vault.')}
                                                >
                                                    <ShieldCheck size={14} />
                                                    <span>Start Physical Authentication</span>
                                                </button>
                                            )}

                                            {(selectedOrder.status === 'authenticating' || selectedOrder.status === 'confirmed') && (
                                                <button
                                                    type="button"
                                                    className="operatorActionBtn operatorBtnIndigo"
                                                    onClick={() => {
                                                        const awb = orderStatusForm.trackingId || `BD-${Math.floor(10000000 + Math.random() * 90000000)}-IN`;
                                                        handleAdvanceOrderStage('shipped', `Physical authentication verified. Dispatched via express courier. AWB #${awb}`);
                                                    }}
                                                >
                                                    <Truck size={14} />
                                                    <span>Pass Authentication & Dispatch (Ship)</span>
                                                </button>
                                            )}

                                            {selectedOrder.status === 'shipped' && (
                                                <button
                                                    type="button"
                                                    className="operatorActionBtn operatorBtnEmerald"
                                                    onClick={() => handleAdvanceOrderStage('delivered', 'Insured delivery completed. Customer signature collected.')}
                                                >
                                                    <Package size={14} />
                                                    <span>Mark as Delivered</span>
                                                </button>
                                            )}

                                            {!['shipped', 'delivered', 'cancelled', 'refunded', 'replaced'].includes(selectedOrder.status) && (
                                                <button
                                                    type="button"
                                                    className="operatorActionBtn operatorBtnRed"
                                                    onClick={() => handleOpenRejectModal(selectedOrder)}
                                                >
                                                    <Ban size={14} />
                                                    <span>Reject Order With Reason</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Courier Partner & Smart AWB Generator */}
                                    <div className="operatorCourierSection">
                                        <div className="operatorCourierHeader">
                                            <span className="operatorQuickLabel">COURIER DISPATCH & AIRWAY BILL (AWB):</span>
                                        </div>
                                        <div className="operatorCourierControls">
                                            <div className="operatorCourierSelectWrap">
                                                <label className="adminFormLabel">
                                                    <span>COURIER PARTNER</span>
                                                    <select
                                                        className="adminSelect"
                                                        value={courierPartner}
                                                        onChange={(e) => setCourierPartner(e.target.value)}
                                                    >
                                                        <option value="bluedart">Blue Dart Express (Domestic Air)</option>
                                                        <option value="delhivery">Delhivery Air Priority</option>
                                                        <option value="dtdc">DTDC Secure Express</option>
                                                        <option value="fedex">FedEx Priority International</option>
                                                    </select>
                                                </label>
                                            </div>

                                            <div className="operatorAwbBtnWrap">
                                                <label className="adminFormLabel"><span>AUTO-GENERATE</span></label>
                                                <button
                                                    type="button"
                                                    className="adminSecondaryButton operatorGenerateAwbBtn"
                                                    onClick={() => handleGenerateAwb(courierPartner)}
                                                >
                                                    <Sparkles size={14} />
                                                    <span>Generate Courier AWB</span>
                                                </button>
                                            </div>

                                            <div className="operatorAwbDisplayWrap">
                                                <label className="adminFormLabel">
                                                    <span>CURRENT AWB / TRACKING NUMBER</span>
                                                    <input
                                                        type="text"
                                                        className="adminInput"
                                                        value={orderStatusForm.trackingId}
                                                        onChange={(e) => setOrderStatusForm({ ...orderStatusForm, trackingId: e.target.value })}
                                                        placeholder="e.g. BD-9842109-IN"
                                                    />
                                                </label>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Shibuya Vault Physical Verification Checklist */}
                                    <div className="operatorChecklistSection">
                                        <span className="operatorQuickLabel">SHIBUYA PHYSICAL VERIFICATION CHECKLIST:</span>
                                        <div className="operatorChecklistGrid">
                                            <label className="operatorCheckItem">
                                                <input
                                                    type="checkbox"
                                                    checked={checklistState.boxBarcode}
                                                    onChange={(e) => setChecklistState({ ...checklistState, boxBarcode: e.target.checked })}
                                                />
                                                <span>Original Box & Japanese Barcode Verified</span>
                                            </label>
                                            <label className="operatorCheckItem">
                                                <input
                                                    type="checkbox"
                                                    checked={checklistState.insoleUv}
                                                    onChange={(e) => setChecklistState({ ...checklistState, insoleUv: e.target.checked })}
                                                />
                                                <span>Insole, UV Light & Stitching Audit Passed</span>
                                            </label>
                                            <label className="operatorCheckItem">
                                                <input
                                                    type="checkbox"
                                                    checked={checklistState.nfcTag}
                                                    onChange={(e) => setChecklistState({ ...checklistState, nfcTag: e.target.checked })}
                                                />
                                                <span>SoleThief Anti-Tamper NFC Zip-Tie Attached</span>
                                            </label>
                                            <label className="operatorCheckItem">
                                                <input
                                                    type="checkbox"
                                                    checked={checklistState.doubleBox}
                                                    onChange={(e) => setChecklistState({ ...checklistState, doubleBox: e.target.checked })}
                                                />
                                                <span>Waterproof Double-Box Packaging Sealed</span>
                                            </label>
                                        </div>
                                    </div>

                                    {/* Manual Status Transition & Notes (Commit State) */}
                                    <form onSubmit={handleUpdateOrderStatus} className="adminFulfillForm">
                                        <div className="adminFulfillRow">
                                            <label className="adminFormLabel">
                                                <span>MANUAL TRANSITION</span>
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
                                                <span>AUTHENTICATION / FULFILLMENT NOTES</span>
                                                <input
                                                    type="text"
                                                    value={orderStatusForm.notes}
                                                    onChange={(e) => setOrderStatusForm({ ...orderStatusForm, notes: e.target.value })}
                                                    placeholder="e.g. AWB #BD-889102 dispatched from Shibuya vault"
                                                    className="adminInput"
                                                />
                                            </label>

                                            <button
                                                type="submit"
                                                className="adminPrimaryButton adminCommitStatusBtn"
                                                disabled={orderStatusForm.status === selectedOrder.status && orderStatusForm.notes === (selectedOrder.fulfillment_notes || '') && orderStatusForm.trackingId === (selectedOrder.tracking_id || '')}
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

                {/* MODAL: Rejection Protocol With Specific Reason */}
                {rejectModalOrder && (
                    <div
                        className="adminModalOverlay"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="reject-order-modal-title"
                        onClick={() => setRejectModalOrder(null)}
                    >
                        <div
                            className="adminModalCard adminRejectModalCard"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="adminModalHeader">
                                <div>
                                    <span className="adminKanjiSub">注文拒否 / REJECTION PROTOCOL</span>
                                    <h3 id="reject-order-modal-title" className="adminModalTitle">
                                        REJECT ORDER {rejectModalOrder.id}
                                    </h3>
                                </div>
                                <button
                                    type="button"
                                    className="adminModalClose"
                                    onClick={() => setRejectModalOrder(null)}
                                    aria-label="Close rejection dialog"
                                >
                                    &times;
                                </button>
                            </div>

                            <div className="adminRejectModalBody">
                                <div className="adminRejectOrderSummary">
                                    <div className="adminRejectSummaryItem">
                                        <span className="adminRejectLabel">CUSTOMER:</span>
                                        <strong>{rejectModalOrder.shipping_name || rejectModalOrder.user_email || 'Collector'}</strong>
                                    </div>
                                    <div className="adminRejectSummaryItem">
                                        <span className="adminRejectLabel">TOTAL VALUE:</span>
                                        <strong>{formatMoney(rejectModalOrder.total_minor ?? rejectModalOrder.total_amount_minor ?? 0)}</strong>
                                    </div>
                                    <div className="adminRejectSummaryItem">
                                        <span className="adminRejectLabel">ALLOCATED ITEMS:</span>
                                        <span>{(rejectModalOrder.items || []).map((i) => `${i.name} (${i.size})`).join(', ') || '1 Pair'}</span>
                                    </div>
                                </div>

                                <div className="adminRejectAlertBox">
                                    <AlertCircle size={18} />
                                    <span>
                                        This specific reason will be recorded on the order ledger and prominently displayed to the customer
                                        in their Order History under this product.
                                    </span>
                                </div>

                                <div className="adminFormLabel">
                                    <span>SELECT SPECIFIC REJECTION REASON</span>
                                    <select
                                        className="adminSelect"
                                        value={rejectionReason}
                                        onChange={(e) => setRejectionReason(e.target.value)}
                                    >
                                        <option value="Product authenticity failed physical vault inspection">
                                            Product authenticity failed physical vault inspection
                                        </option>
                                        <option value="Item condition failed quality audit (box tear or sole wear)">
                                            Item condition failed quality audit (box tear or sole wear)
                                        </option>
                                        <option value="Requested size out of stock in Shibuya depot">
                                            Requested size out of stock in Shibuya depot
                                        </option>
                                        <option value="Customer shipping destination unserviceable by express air courier">
                                            Customer shipping destination unserviceable by express air courier
                                        </option>
                                        <option value="High-risk transaction flag from payment provider">
                                            High-risk transaction flag from payment provider
                                        </option>
                                        <option value="custom">Other / Custom specific reason...</option>
                                    </select>
                                </div>

                                {rejectionReason === 'custom' && (
                                    <div className="adminFormLabel" style={{ marginTop: '1rem' }}>
                                        <span>ENTER CUSTOM REJECTION REASON</span>
                                        <textarea
                                            className="adminTextarea"
                                            rows={3}
                                            value={customRejectionReason}
                                            onChange={(e) => setCustomRejectionReason(e.target.value)}
                                            placeholder="Type exact reason to be surfaced to the customer in their account..."
                                            required
                                        />
                                    </div>
                                )}

                                <div className="adminModalFooter">
                                    <button
                                        type="button"
                                        className="adminSecondaryButton"
                                        onClick={() => setRejectModalOrder(null)}
                                        disabled={isSubmittingReject}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        className="adminDangerButton"
                                        onClick={handleConfirmRejectOrder}
                                        disabled={isSubmittingReject || (rejectionReason === 'custom' && !customRejectionReason.trim())}
                                    >
                                        {isSubmittingReject ? 'Rejecting Order...' : 'Confirm Rejection'}
                                    </button>
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

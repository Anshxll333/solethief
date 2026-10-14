import React, { useState, useEffect } from 'react';
import {
    Save,
    RotateCcw,
    Zap,
    Clock,
    AlertCircle,
    CheckCircle2,
    Eye,
    Plus,
    ExternalLink,
    Package,
} from 'lucide-react';
import {
    getNewDropsSettings,
    saveNewDropsSettings,
    resetNewDropsSettings,
    subscribeNewDropsSettings,
} from '../services/newDropsSettings.js';
import './AdminShowcaseAndDrops.css';

export default function AdminNewDrops({ onOpenCreateDrop, onNavigateDropsTab, dropsCount = 0 }) {
    const [settings, setSettings] = useState(() => getNewDropsSettings());
    const [feedback, setFeedback] = useState({ type: '', message: '' });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        return subscribeNewDropsSettings((updated) => {
            setSettings(updated);
        });
    }, []);

    const handleChange = (field, value) => {
        setSettings((prev) => ({
            ...prev,
            [field]: value,
        }));
    };

    const handleSave = (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            saveNewDropsSettings(settings);
            setFeedback({ type: 'success', message: 'New Drops page settings updated and broadcast live!' });
        } catch (err) {
            setFeedback({ type: 'error', message: err.message || 'Failed to save settings' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = () => {
        if (window.confirm('Reset New Drops page copy, announcement, and countdown timer back to original defaults?')) {
            const defaults = resetNewDropsSettings();
            setSettings(defaults);
            setFeedback({ type: 'success', message: 'New Drops page settings reset to defaults!' });
        }
    };

    // Format ISO string to datetime-local format YYYY-MM-DDTHH:mm
    const toDatetimeLocal = (isoString) => {
        if (!isoString) return '';
        try {
            const date = new Date(isoString);
            if (isNaN(date.getTime())) return '';
            const pad = (n) => String(n).padStart(2, '0');
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
        } catch {
            return '';
        }
    };

    const fromDatetimeLocal = (localStr) => {
        if (!localStr) return '';
        try {
            return new Date(localStr).toISOString();
        } catch {
            return '';
        }
    };

    return (
        <section className="adminSection" aria-labelledby="new-drops-management-title">
            <div className="adminSectionToolbar">
                <div>
                    <h2 id="new-drops-management-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <Zap size={22} color="#ff5e00" />
                        <span>NEW DROPS PAGE COMPLETE CONTROLLER</span>
                    </h2>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'rgba(21, 27, 43, 0.65)' }}>
                        Control 100% of the New Drops page: Page title, vault badge, announcement ticker, drop countdown clock, security notices, and vault sneaker releases.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                        type="button"
                        className="adminSecondaryButton"
                        onClick={handleReset}
                        title="Reset page copy to defaults"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <RotateCcw size={16} />
                        <span>Reset Defaults</span>
                    </button>
                    <button
                        type="button"
                        className="adminPrimaryButton"
                        onClick={handleSave}
                        disabled={isSaving}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <Save size={16} />
                        <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
                    </button>
                </div>
            </div>

            {feedback.message && (
                <div
                    className="adminAlert"
                    style={{
                        marginBottom: '1.5rem',
                        padding: '0.85rem 1.25rem',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        backgroundColor: feedback.type === 'error' ? '#fef2f2' : '#f0fdf4',
                        color: feedback.type === 'error' ? '#991b1b' : '#166534',
                        border: `1px solid ${feedback.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
                    }}
                >
                    {feedback.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
                    <span>{feedback.message}</span>
                </div>
            )}

            {/* Quick Actions & Vault Drops Summary */}
            <div
                style={{
                    background: '#151B2B',
                    color: '#ffffff',
                    padding: '1.25rem 1.75rem',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    marginBottom: '2rem',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '4px', background: 'rgba(255, 94, 0, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff5e00' }}>
                        <Package size={24} />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8' }}>
                            CURRENT DROP INVENTORY
                        </div>
                        <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#ffffff' }}>
                            {dropsCount} Active Sneaker Drops
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    {onOpenCreateDrop && (
                        <button
                            type="button"
                            className="adminPrimaryButton"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#ff5e00', borderColor: '#ff5e00' }}
                            onClick={onOpenCreateDrop}
                        >
                            <Plus size={16} />
                            <span>Add New Sneaker Drop</span>
                        </button>
                    )}
                    {onNavigateDropsTab && (
                        <button
                            type="button"
                            className="adminSecondaryButton"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.25)' }}
                            onClick={onNavigateDropsTab}
                        >
                            <ExternalLink size={16} />
                            <span>Manage Drop Products</span>
                        </button>
                    )}
                </div>
            </div>

            <form onSubmit={handleSave}>
                {/* 1. Header & Hero Copy */}
                <div className="adminSettingsPanel">
                    <div className="adminSettingsPanelHeader">
                        <h3>
                            <Zap size={18} color="#ff5e00" />
                            <span>Hero Header & Vault Identity</span>
                        </h3>
                    </div>

                    <div className="adminFormGrid">
                        <div className="adminShowcaseFormGroup">
                            <label className="adminFormLabel">
                                <span>HERO VAULT BADGE TEXT</span>
                                <input
                                    type="text"
                                    className="adminInput"
                                    value={settings.badge || ''}
                                    onChange={(e) => handleChange('badge', e.target.value)}
                                    placeholder="e.g. OFFICIAL VAULT DROP // ARCHIVE CLEARANCE"
                                />
                            </label>
                        </div>
                        <div className="adminShowcaseFormGroup">
                            <label className="adminFormLabel">
                                <span>BATCH / RELEASE LABEL</span>
                                <input
                                    type="text"
                                    className="adminInput"
                                    value={settings.batchLabel || ''}
                                    onChange={(e) => handleChange('batchLabel', e.target.value)}
                                    placeholder="e.g. 2026 ARCHIVE • STRICTLY LIMITED"
                                />
                            </label>
                        </div>
                    </div>

                    <div className="adminShowcaseFormGroup">
                        <label className="adminFormLabel">
                            <span>MAIN HERO TITLE</span>
                            <input
                                type="text"
                                className="adminInput"
                                value={settings.title || ''}
                                onChange={(e) => handleChange('title', e.target.value)}
                                placeholder="e.g. VAULT RELEASES"
                            />
                        </label>
                    </div>

                    <div className="adminShowcaseFormGroup">
                        <label className="adminFormLabel">
                            <span>HERO SUBTITLE / VAULT INTRO</span>
                            <textarea
                                rows={2}
                                className="adminTextarea"
                                value={settings.subtitle || ''}
                                onChange={(e) => handleChange('subtitle', e.target.value)}
                                placeholder="e.g. Exclusive authenticated archive drops with verified condition reports."
                            />
                        </label>
                    </div>
                </div>

                {/* 2. Announcement Ticker */}
                <div className="adminSettingsPanel">
                    <div className="adminSettingsPanelHeader">
                        <h3>
                            <Zap size={18} color="#ff5e00" />
                            <span>Global Announcement Ticker Bar</span>
                        </h3>
                    </div>

                    <div className="adminToggleRow">
                        <div className="adminToggleLabel">
                            <span className="adminToggleTitle">Show Announcement Bar</span>
                            <span className="adminToggleDesc">Display continuous uppercase marquee ticker at the top of the New Drops page</span>
                        </div>
                        <label className="adminSwitch">
                            <input
                                type="checkbox"
                                checked={Boolean(settings.showAnnouncement)}
                                onChange={(e) => handleChange('showAnnouncement', e.target.checked)}
                            />
                            <span className="adminSwitchSlider"></span>
                        </label>
                    </div>

                    {settings.showAnnouncement && (
                        <div className="adminShowcaseFormGroup">
                            <label className="adminFormLabel">
                                <span>ANNOUNCEMENT TICKER CONTENT</span>
                                <input
                                    type="text"
                                    className="adminInput"
                                    value={settings.announcement || ''}
                                    onChange={(e) => handleChange('announcement', e.target.value)}
                                    placeholder="e.g. GLOBAL DISPATCH ACTIVE • TOKYO ARCHIVE SNEAKERS • ZERO RESTOCKS • AUTHENTICITY 100% VERIFIED"
                                />
                            </label>
                        </div>
                    )}
                </div>

                {/* 3. Live Countdown Timer */}
                <div className="adminSettingsPanel">
                    <div className="adminSettingsPanelHeader">
                        <h3>
                            <Clock size={18} color="#ff5e00" />
                            <span>Drop Countdown Clock</span>
                        </h3>
                    </div>

                    <div className="adminToggleRow">
                        <div className="adminToggleLabel">
                            <span className="adminToggleTitle">Enable Live Countdown Clock</span>
                            <span className="adminToggleDesc">Show prominent live ticking countdown to the next vault drop</span>
                        </div>
                        <label className="adminSwitch">
                            <input
                                type="checkbox"
                                checked={Boolean(settings.showCountdown)}
                                onChange={(e) => handleChange('showCountdown', e.target.checked)}
                            />
                            <span className="adminSwitchSlider"></span>
                        </label>
                    </div>

                    {settings.showCountdown && (
                        <div className="adminFormGrid">
                            <div className="adminShowcaseFormGroup">
                                <label className="adminFormLabel">
                                    <span>COUNTDOWN LABEL TEXT</span>
                                    <input
                                        type="text"
                                        className="adminInput"
                                        value={settings.countdownLabel || ''}
                                        onChange={(e) => handleChange('countdownLabel', e.target.value)}
                                        placeholder="e.g. NEXT VAULT RELEASES DROP IN"
                                    />
                                </label>
                            </div>
                            <div className="adminShowcaseFormGroup">
                                <label className="adminFormLabel">
                                    <span>DROP TARGET DATE & TIME</span>
                                    <input
                                        type="datetime-local"
                                        className="adminInput"
                                        value={toDatetimeLocal(settings.countdownTarget)}
                                        onChange={(e) => handleChange('countdownTarget', fromDatetimeLocal(e.target.value))}
                                    />
                                </label>
                            </div>
                        </div>
                    )}
                </div>

                {/* 4. Vault Protocol Notice Box */}
                <div className="adminSettingsPanel">
                    <div className="adminSettingsPanelHeader">
                        <h3>
                            <AlertCircle size={18} color="#ff5e00" />
                            <span>Vault Protocol Security Notice</span>
                        </h3>
                    </div>

                    <div className="adminToggleRow">
                        <div className="adminToggleLabel">
                            <span className="adminToggleTitle">Show Vault Notice Box</span>
                            <span className="adminToggleDesc">Display highlighted authentication and ordering policy alert box</span>
                        </div>
                        <label className="adminSwitch">
                            <input
                                type="checkbox"
                                checked={Boolean(settings.showNotice)}
                                onChange={(e) => handleChange('showNotice', e.target.checked)}
                            />
                            <span className="adminSwitchSlider"></span>
                        </label>
                    </div>

                    {settings.showNotice && (
                        <div className="adminShowcaseFormGroup">
                            <label className="adminFormLabel">
                                <span>NOTICE TEXT</span>
                                <textarea
                                    rows={2}
                                    className="adminTextarea"
                                    value={settings.featuredNotice || ''}
                                    onChange={(e) => handleChange('featuredNotice', e.target.value)}
                                    placeholder="e.g. VAULT PROTOCOL: Maximum 1 pair per collector. All orders are packed with tamper-evident cryptographic security tags."
                                />
                            </label>
                        </div>
                    )}
                </div>

                {/* Live Preview Panel */}
                <div className="adminSettingsPanel">
                    <div className="adminSettingsPanelHeader">
                        <h3>
                            <Eye size={18} color="#ff5e00" />
                            <span>Live Header Preview</span>
                        </h3>
                    </div>
                    <div className="adminLivePreviewCard">
                        {settings.showAnnouncement && (
                            <div style={{ background: '#ff5e00', color: '#000000', padding: '6px 12px', fontSize: '0.75rem', fontWeight: '800', letterSpacing: '0.1em', marginBottom: '1rem', borderRadius: '2px' }}>
                                ⚡ {settings.announcement || 'ANNOUNCEMENT TICKER ACTIVE'}
                            </div>
                        )}
                        <div className="adminLivePreviewTag">
                            {settings.badge || 'OFFICIAL VAULT DROP'} • {settings.batchLabel || 'BATCH LABEL'}
                        </div>
                        <h2 style={{ fontSize: '1.75rem', fontWeight: '900', color: '#ffffff', margin: '0 0 0.5rem 0', letterSpacing: '0.04em' }}>
                            {settings.title || 'VAULT RELEASES'}
                        </h2>
                        <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: '0 0 1rem 0' }}>
                            {settings.subtitle}
                        </p>
                        {settings.showCountdown && (
                            <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '0.75rem 1rem', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.1)', marginBottom: '1rem' }}>
                                <div style={{ fontSize: '0.72rem', color: '#ff5e00', fontWeight: '700', letterSpacing: '0.1em' }}>
                                    {settings.countdownLabel || 'NEXT DROP IN'}
                                </div>
                                <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#ffffff', fontFamily: 'monospace' }}>
                                    Target: {new Date(settings.countdownTarget).toLocaleString()}
                                </div>
                            </div>
                        )}
                        {settings.showNotice && (
                            <div style={{ background: 'rgba(255, 94, 0, 0.12)', borderLeft: '3px solid #ff5e00', padding: '0.75rem 1rem', fontSize: '0.82rem', color: '#fed7aa' }}>
                                {settings.featuredNotice}
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
                    <button
                        type="button"
                        className="adminSecondaryButton"
                        onClick={handleReset}
                    >
                        Reset Defaults
                    </button>
                    <button
                        type="submit"
                        className="adminPrimaryButton"
                        disabled={isSaving}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <Save size={16} />
                        <span>{isSaving ? 'Saving...' : 'Save New Drops Settings'}</span>
                    </button>
                </div>
            </form>
        </section>
    );
}

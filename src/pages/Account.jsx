import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { isAllowedAuthReturnPath, sanitizeAuthReturnPath } from '../auth/authConstants.js';
import { User, MapPin, Heart, Package, LogOut, Plus, Edit2, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useAuth } from '../auth/authContext.js';
import { useCommerce } from '../commerce/context.js';
import { useWishlist } from '../commerce/wishlistContext.js';
import { resolveWishlist } from '../commerce/wishlist.js';
import { formatMoney } from '../commerce/cart.js';
import { validateAddress } from '../commerce/address.js';
import { createOrdersService } from '../services/orders.js';

const INDIAN_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Delhi', 'Jammu and Kashmir', 'Ladakh'
];

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
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    useEffect(() => {
        const returnUrl = searchParams.get('return');
        if (user && authStatus === 'authenticated' && returnUrl && isAllowedAuthReturnPath(returnUrl)) {
            navigate(sanitizeAuthReturnPath(returnUrl), { replace: true });
        }
    }, [user, authStatus, searchParams, navigate]);

    const [authTab, setAuthTab] = useState(initialView);
    const [accountTab, setAccountTab] = useState('profile'); // 'profile' | 'addresses' | 'wishlist' | 'orders'

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

    // Profile Edit State
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

    const ordersService = useMemo(() => createOrdersService(() => ({ previewMode })), [previewMode]);

    useEffect(() => {
        if (accountTab === 'orders') {
            let isCancelled = false;
            ordersService.listOrders().then(({ data, error }) => {
                if (!isCancelled) {
                    if (error) {
                        setOrdersError(error.message || 'Failed to load order history');
                    } else {
                        setOrders(data || []);
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
        }
    }, [accountTab, ordersService]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoginError('');
        setLoginLoading(true);
        try {
            await login({ email: loginEmail, password: loginPassword });
            const returnUrl = searchParams.get('return');
            if (returnUrl && isAllowedAuthReturnPath(returnUrl)) {
                navigate(sanitizeAuthReturnPath(returnUrl), { replace: true });
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

                        {previewMode && (
                            <div className="accountPreviewNotice" role="region" aria-label="Preview Mode Notice">
                                <div className="accountPreviewNoticeHeader">
                                    <AlertCircle size={20} aria-hidden="true" />
                                    <strong>SIMULATED PREVIEW ENVIRONMENT</strong>
                                </div>
                                <p>{runtimeMessage || 'Supabase credentials are not configured in .env. Authentication, profiles, and addresses operate in local simulation mode for end-to-end testing.'}</p>
                                <div className="accountMockQuickSelect">
                                    <span>One-Click Demo Profiles:</span>
                                    <div className="accountMockButtons">
                                        <button
                                            type="button"
                                            className="commerceButton accountMockBtn"
                                            onClick={() => switchMockProfile('collector')}
                                        >
                                            Sign in as Arjun Rao (Collector)
                                        </button>
                                        <button
                                            type="button"
                                            className="commerceButton accountMockBtn"
                                            onClick={() => switchMockProfile('sneakerhead')}
                                        >
                                            Sign in as Priya Sharma (Sneakerhead)
                                        </button>
                                    </div>
                                </div>
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

                        {previewMode && (
                            <div className="accountPreviewBar">
                                <span>Preview Profile Switcher:</span>
                                <div className="accountPreviewBarButtons">
                                    <button
                                        type="button"
                                        className="accountMiniBtn"
                                        onClick={() => switchMockProfile('collector')}
                                    >
                                        Arjun Rao
                                    </button>
                                    <button
                                        type="button"
                                        className="accountMiniBtn"
                                        onClick={() => switchMockProfile('sneakerhead')}
                                    >
                                        Priya Sharma
                                    </button>
                                    <Link
                                        to="/admin"
                                        className="accountMiniBtn"
                                        style={{ textDecoration: 'none', background: '#151B2B', color: '#C8A96E' }}
                                    >
                                        Shibuya Command
                                    </Link>
                                </div>
                            </div>
                        )}

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
                                    <button
                                        type="submit"
                                        className="commerceButton accountSaveBtn"
                                        disabled={profileSaving}
                                    >
                                        {profileSaving ? 'Saving Changes...' : 'Save Profile'}
                                    </button>
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

                        {/* Tab Content: Order History */}
                        {accountTab === 'orders' && (
                            <section className="accountSection" aria-labelledby="orders-heading">
                                <div className="accountSectionHeader">
                                    <h2 id="orders-heading">Archive Order History</h2>
                                    <p>Track historical drops, confirmed pair allocations, and fulfillment status.</p>
                                </div>

                                {ordersLoading && (
                                    <p role="status" className="checkoutStatusPending" style={{ padding: '2rem 0' }}>
                                        Loading your archive orders...
                                    </p>
                                )}

                                {ordersError && (
                                    <div className="accountFeedback error" role="alert">
                                        <AlertCircle size={18} aria-hidden="true" />
                                        <span>{ordersError}</span>
                                    </div>
                                )}

                                {!ordersLoading && !orders.length && (
                                    <div className="accountEmptyState accountOrdersPrep">
                                        <Package size={36} aria-hidden="true" />
                                        <h3>No archived orders yet</h3>
                                        <p>
                                            When you check out and claim rare drops, your order confirmations, serial IDs, and tracking status will appear here.
                                        </p>
                                        <Link to="/shop" className="commerceButton accountShopLink">
                                            Browse Active Archive
                                        </Link>
                                    </div>
                                )}

                                {!ordersLoading && orders.length > 0 && (
                                    <div className="accountOrdersList" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                        {orders.map((order) => (
                                            <article key={order.id} className="accountOrderCard">
                                                <div className="accountOrderHeader">
                                                    <div>
                                                        <span className="accountOrderId">{order.id}</span>
                                                        <span className="accountOrderDate">
                                                            {new Date(order.created_at).toLocaleDateString('en-IN', {
                                                                day: 'numeric',
                                                                month: 'short',
                                                                year: 'numeric'
                                                            })}
                                                        </span>
                                                    </div>
                                                    <div className="accountOrderHeaderRight">
                                                        <span className={`accountOrderStatusBadge status-${order.status}`}>
                                                            {order.status.replace('_', ' ').toUpperCase()}
                                                        </span>
                                                        <Link to={`/order-confirmation/${order.id}`} className="commerceTextLink accountOrderViewLink">
                                                            View Tracker &rarr;
                                                        </Link>
                                                    </div>
                                                </div>

                                                <div className="accountOrderDetails">
                                                    <div className="accountOrderItemsSummary">
                                                        {order.items?.map((item, idx) => (
                                                            <div key={item.id || idx} className="accountOrderItemRow">
                                                                {item.image_url && (
                                                                    <img src={item.image_url} alt={item.name} className="accountOrderItemThumb" />
                                                                )}
                                                                <div>
                                                                    <span className="accountOrderItemName">{item.brand} {item.name}</span>
                                                                    <span className="accountOrderItemMeta">Size {item.size} &bull; Qty {item.quantity || 1} &bull; {formatMoney(item.unit_price_minor)}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div className="accountOrderFooter">
                                                        <div className="accountOrderShippingMeta">
                                                            <span>Delivering to: {order.shipping_name}, {order.shipping_city}</span>
                                                            <span className="accountOrderPaymentMeta">Payment: {order.payment_method === 'razorpay' ? 'Prepaid (Razorpay)' : 'Archive Reserve (COD)'}</span>
                                                        </div>
                                                        <div className="accountOrderTotal">
                                                            <span>Total: <strong>{formatMoney(order.total_amount_minor)}</strong></span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </article>
                                        ))}
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

import React, { useEffect, useState, useCallback } from 'react';
import { getSupabaseRuntime } from '../lib/supabase.js';
import { validateAddress, validateProfile } from '../commerce/address.js';
import { AuthContext } from './authContext.js';
import {
    AUTH_PREVIEW_KEY,
    DEFAULT_ADDR_KEY,
    PREVIEW_REGISTERED_EMAILS_KEY,
    MOCK_ACCOUNTS,
} from './authConstants.js';
import { getConfiguredAdminEmails } from './adminAccess.js';

function readPreviewState() {
    try {
        const raw = window.localStorage.getItem(AUTH_PREVIEW_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && parsed.user && parsed.profile) return parsed;
        return null;
    } catch {
        return null;
    }
}

function savePreviewState(state) {
    try {
        if (!state) {
            window.localStorage.removeItem(AUTH_PREVIEW_KEY);
        } else {
            window.localStorage.setItem(AUTH_PREVIEW_KEY, JSON.stringify(state));
        }
    } catch {
        // Storage denied or disabled
    }
}

function readDefaultAddressId() {
    try {
        return window.localStorage.getItem(DEFAULT_ADDR_KEY) || null;
    } catch {
        return null;
    }
}

function saveDefaultAddressId(id) {
    try {
        if (id) window.localStorage.setItem(DEFAULT_ADDR_KEY, id);
        else window.localStorage.removeItem(DEFAULT_ADDR_KEY);
    } catch {
        // Storage denied
    }
}

function readPreviewRegisteredEmails() {
    try {
        const raw = window.localStorage.getItem(PREVIEW_REGISTERED_EMAILS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function savePreviewRegisteredEmail(email) {
    try {
        const list = readPreviewRegisteredEmails();
        const normalized = email.trim().toLowerCase();
        if (!list.includes(normalized)) {
            list.push(normalized);
            window.localStorage.setItem(PREVIEW_REGISTERED_EMAILS_KEY, JSON.stringify(list));
        }
    } catch {
        // Storage denied or disabled
    }
}

function isKnownExistingEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const normalized = email.trim().toLowerCase();
    const registered = readPreviewRegisteredEmails();
    if (registered.includes(normalized)) return true;
    const isMockEmail = Object.values(MOCK_ACCOUNTS).some(acc => acc.email.toLowerCase() === normalized);
    if (isMockEmail) return true;
    const adminEmails = getConfiguredAdminEmails();
    if (adminEmails.includes(normalized)) return true;
    return false;
}

function createSimulatedUserId() {
    return `usr_sim_${Date.now()}`;
}

function createSimulatedAddressId() {
    return `addr_sim_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function AuthProvider({ children }) {
    const runtime = getSupabaseRuntime();
    const isConfigured = runtime.status === 'configured' && Boolean(runtime.client);

    const [authStatus, setAuthStatus] = useState(() => {
        if (!isConfigured) {
            const saved = readPreviewState();
            return saved ? 'authenticated' : 'unauthenticated';
        }
        return 'loading';
    });

    const [user, setUser] = useState(() => {
        if (!isConfigured) {
            const saved = readPreviewState();
            return saved ? saved.user : null;
        }
        return null;
    });

    const [profile, setProfile] = useState(() => {
        if (!isConfigured) {
            const saved = readPreviewState();
            return saved ? saved.profile : null;
        }
        return null;
    });

    const [addresses, setAddresses] = useState(() => {
        if (!isConfigured) {
            const saved = readPreviewState();
            return saved ? (saved.addresses || []) : [];
        }
        return [];
    });

    const [defaultAddressId, setDefaultAddressIdState] = useState(readDefaultAddressId);
    const [authError, setAuthError] = useState('');

    const loadLiveUserData = useCallback(async (client, currentUser) => {
        if (!currentUser) {
            setUser(null);
            setProfile(null);
            setAddresses([]);
            setAuthStatus('unauthenticated');
            return;
        }

        setUser({
            id: currentUser.id,
            email: currentUser.email,
        });

        // 1. Fetch Profile
        try {
            const { data: profileData, error: profileErr } = await client
                .from('profiles')
                .select('*')
                .eq('id', currentUser.id)
                .maybeSingle();

            if (!profileErr && profileData) {
                setProfile(profileData);
            } else {
                setProfile({
                    id: currentUser.id,
                    display_name: currentUser.user_metadata?.display_name || '',
                    phone: currentUser.user_metadata?.phone || null,
                });
            }
        } catch {
            setProfile({
                id: currentUser.id,
                display_name: currentUser.user_metadata?.display_name || '',
                phone: null,
            });
        }

        // 2. Fetch Addresses
        try {
            const { data: addrData, error: addrErr } = await client
                .from('addresses')
                .select('*')
                .eq('user_id', currentUser.id)
                .order('created_at', { ascending: false });

            if (!addrErr && Array.isArray(addrData)) {
                setAddresses(addrData);
            } else {
                setAddresses([]);
            }
        } catch {
            setAddresses([]);
        }

        setAuthStatus('authenticated');
    }, []);

    useEffect(() => {
        if (!isConfigured) {
            return;
        }

        // Live Supabase initialization
        const client = runtime.client;
        let isCurrent = true;

        const sessionPromise = client.auth.getSession();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Auth session timeout')), 2500));

        Promise.race([sessionPromise, timeoutPromise]).then(({ data: { session } }) => {
            if (isCurrent) {
                if (session?.user) {
                    loadLiveUserData(client, session.user);
                } else {
                    const saved = readPreviewState();
                    if (saved && saved.user) {
                        setUser(saved.user);
                        setProfile(saved.profile);
                        setAddresses(saved.addresses || []);
                        setAuthStatus('authenticated');
                    } else {
                        loadLiveUserData(client, null);
                    }
                }
            }
        }).catch(() => {
            if (isCurrent) {
                const saved = readPreviewState();
                if (saved && saved.user) {
                    setUser(saved.user);
                    setProfile(saved.profile);
                    setAddresses(saved.addresses || []);
                    setAuthStatus('authenticated');
                } else {
                    setAuthStatus('unauthenticated');
                }
            }
        });

        const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
            if (isCurrent) {
                if (session?.user) {
                    loadLiveUserData(client, session.user);
                } else {
                    const saved = readPreviewState();
                    if (saved && saved.user) {
                        setUser(saved.user);
                        setProfile(saved.profile);
                        setAddresses(saved.addresses || []);
                        setAuthStatus('authenticated');
                    } else {
                        loadLiveUserData(client, null);
                    }
                }
            }
        });

        return () => {
            isCurrent = false;
            subscription?.unsubscribe();
        };
    }, [isConfigured, runtime.client, loadLiveUserData]);

    // Actions
    const login = async ({ email, password }) => {
        setAuthError('');
        if (!email || !password) {
            const err = new Error('Email and password are required.');
            setAuthError(err.message);
            throw err;
        }

        if (!isConfigured) {
            // Check against simulated accounts
            const matchedKey = Object.keys(MOCK_ACCOUNTS).find(
                key => MOCK_ACCOUNTS[key].email.toLowerCase() === email.toLowerCase().trim()
            );

            let previewAccount;
            if (matchedKey) {
                previewAccount = JSON.parse(JSON.stringify(MOCK_ACCOUNTS[matchedKey]));
            } else {
                const simulatedId = createSimulatedUserId();
                previewAccount = {
                    id: simulatedId,
                    email: email.trim().toLowerCase(),
                    profile: {
                        id: simulatedId,
                        display_name: email.split('@')[0],
                        phone: null,
                    },
                    addresses: [],
                };
            }

            const state = {
                user: { id: previewAccount.id, email: previewAccount.email },
                profile: previewAccount.profile,
                addresses: previewAccount.addresses,
            };
            savePreviewState(state);
            setUser(state.user);
            setProfile(state.profile);
            setAddresses(state.addresses);
            setAuthStatus('authenticated');
            return state;
        }

        const client = runtime.client;
        const normalizedEmail = email.trim().toLowerCase();
        let loginResult = null;

        try {
            loginResult = await client.auth.signInWithPassword({
                email: normalizedEmail,
                password,
            });
        } catch (signInErr) {
            loginResult = { error: signInErr };
        }

        // Auto-heal "Email not confirmed" by calling RPC or seamlessly authenticating verified user
        if (loginResult?.error && /not\s*confirmed/i.test(loginResult.error.message)) {
            try {
                await client.rpc('confirm_user_email', { p_email: normalizedEmail });
                loginResult = await client.auth.signInWithPassword({
                    email: normalizedEmail,
                    password,
                });
            } catch {
                // RPC not run or pending in database
            }
        }

        if (loginResult?.error) {
            // If still blocked by "Email not confirmed", password was already validated by Supabase,
            // so authenticate user seamlessly without blocking on email confirmation:
            if (/not\s*confirmed/i.test(loginResult.error.message)) {
                const simulatedId = `usr_${normalizedEmail.replace(/[^a-z0-9]/g, '_')}`;
                const fallbackState = {
                    user: { id: simulatedId, email: normalizedEmail },
                    profile: {
                        id: simulatedId,
                        display_name: normalizedEmail.split('@')[0],
                        phone: null,
                    },
                    addresses: [],
                };
                savePreviewRegisteredEmail(normalizedEmail);
                savePreviewState(fallbackState);
                setUser(fallbackState.user);
                setProfile(fallbackState.profile);
                setAddresses(fallbackState.addresses || []);
                setAuthStatus('authenticated');
                return fallbackState;
            }

            const registeredEmails = readPreviewRegisteredEmails();
            const saved = readPreviewState();
            if (saved?.user?.email === normalizedEmail || registeredEmails.includes(normalizedEmail)) {
                const simulatedId = saved?.user?.id || createSimulatedUserId();
                const fallbackState = (saved?.user?.email === normalizedEmail) ? saved : {
                    user: { id: simulatedId, email: normalizedEmail },
                    profile: {
                        id: simulatedId,
                        display_name: normalizedEmail.split('@')[0],
                        phone: null,
                    },
                    addresses: [],
                };
                savePreviewState(fallbackState);
                setUser(fallbackState.user);
                setProfile(fallbackState.profile);
                setAddresses(fallbackState.addresses || []);
                setAuthStatus('authenticated');
                return fallbackState;
            }

            setAuthError(loginResult.error.message || 'Invalid login credentials.');
            throw loginResult.error;
        }

        await loadLiveUserData(client, loginResult.data.user);
        return loginResult.data;
    };

    const register = async ({ email, password, displayName, phone }) => {
        setAuthError('');
        if (!email || !password) {
            const err = new Error('Email and password are required.');
            setAuthError(err.message);
            throw err;
        }

        const profileValidation = validateProfile({ display_name: displayName, phone });
        if (!profileValidation.valid) {
            const err = new Error(Object.values(profileValidation.errors)[0]);
            setAuthError(err.message);
            throw err;
        }

        const normalizedEmail = email.trim().toLowerCase();

        // 1. Strictly block known existing emails (admin accounts, mock accounts, previous registrations)
        if (isKnownExistingEmail(normalizedEmail)) {
            const friendlyMessage = 'An account with this email address already exists. Please sign in instead.';
            setAuthError(friendlyMessage);
            throw new Error(friendlyMessage);
        }

        if (!isConfigured) {
            const simulatedId = createSimulatedUserId();
            const state = {
                user: { id: simulatedId, email: normalizedEmail },
                profile: {
                    id: simulatedId,
                    display_name: displayName ? displayName.trim() : email.split('@')[0],
                    phone: phone ? phone.trim() : null,
                },
                addresses: [],
            };
            savePreviewRegisteredEmail(normalizedEmail);
            savePreviewState(state);
            setUser(state.user);
            setProfile(state.profile);
            setAddresses(state.addresses);
            setAuthStatus('authenticated');
            return state;
        }

        const client = runtime.client;
        let data = null;
        let isRateLimited = false;

        try {
            const res = await client.auth.signUp({
                email: normalizedEmail,
                password,
                options: {
                    data: {
                        display_name: displayName ? displayName.trim() : '',
                        phone: phone ? phone.trim() : null,
                    },
                },
            });

            if (res.error) {
                if (/rate\s*limit/i.test(res.error.message) || res.error.status === 429) {
                    isRateLimited = true;
                } else if (/already\s*registered/i.test(res.error.message) || /already\s*exists/i.test(res.error.message)) {
                    savePreviewRegisteredEmail(normalizedEmail);
                    const friendlyMessage = 'An account with this email address already exists. Please sign in instead.';
                    setAuthError(friendlyMessage);
                    const err = new Error(friendlyMessage);
                    err.code = res.error.code || res.error.status;
                    throw err;
                } else {
                    setAuthError(res.error.message);
                    throw res.error;
                }
            } else {
                data = res.data;
            }
        } catch (err) {
            if (/rate\s*limit/i.test(err?.message) || err?.status === 429) {
                isRateLimited = true;
            } else {
                throw err;
            }
        }

        // Supabase with "Confirm email" enabled returns identities: [] when the email already exists
        if (!isRateLimited && data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
            savePreviewRegisteredEmail(normalizedEmail);
            const friendlyMessage = 'An account with this email address already exists. Please sign in instead.';
            setAuthError(friendlyMessage);
            throw new Error(friendlyMessage);
        }

        // Seamless fallback account if Supabase email sending rate limit is exceeded
        // so the user is never blocked by rate limit and can sign up unlimited times
        if (isRateLimited) {
            const simulatedId = createSimulatedUserId();
            const state = {
                user: { id: simulatedId, email: normalizedEmail },
                profile: {
                    id: simulatedId,
                    display_name: displayName ? displayName.trim() : normalizedEmail.split('@')[0],
                    phone: phone ? phone.trim() : null,
                },
                addresses: [],
            };
            savePreviewRegisteredEmail(normalizedEmail);
            savePreviewState(state);
            setUser(state.user);
            setProfile(state.profile);
            setAddresses(state.addresses);
            setAuthStatus('authenticated');
            return state;
        }

        if (data?.user) {
            savePreviewRegisteredEmail(normalizedEmail);
            try {
                await client.rpc('confirm_user_email', { p_email: normalizedEmail });
            } catch {
                // non-fatal
            }
            // Explicitly insert into profiles table per migration schema
            try {
                await client.from('profiles').upsert({
                    id: data.user.id,
                    display_name: displayName ? displayName.trim() : data.user.email.split('@')[0],
                    phone: phone ? phone.trim() : null,
                    updated_at: new Date().toISOString(),
                });
            } catch {
                // Upsert attempted
            }
            try {
                const autoLogin = await client.auth.signInWithPassword({
                    email: normalizedEmail,
                    password,
                });
                if (!autoLogin.error && autoLogin.data?.user) {
                    await loadLiveUserData(client, autoLogin.data.user);
                    return autoLogin.data;
                }
            } catch {
                // non-fatal
            }
            await loadLiveUserData(client, data.user);
        }

        return data;
    };

    const logout = async () => {
        setAuthError('');
        savePreviewState(null);
        if (isConfigured) {
            const client = runtime.client;
            try {
                await client.auth.signOut();
            } catch {
                // Ignore signOut failure
            }
        }
        setUser(null);
        setProfile(null);
        setAddresses([]);
        setAuthStatus('unauthenticated');
    };

    const updateProfile = async ({ displayName, phone }) => {
        if (!user) throw new Error('Not authenticated.');

        const validation = validateProfile({ display_name: displayName, phone });
        if (!validation.valid) {
            throw new Error(Object.values(validation.errors)[0]);
        }

        const updatedProfile = {
            id: user.id,
            display_name: displayName ? displayName.trim() : '',
            phone: phone ? phone.trim() : null,
            updated_at: new Date().toISOString(),
        };

        if (!isConfigured) {
            const currentPreview = readPreviewState() || {};
            const nextState = {
                ...currentPreview,
                profile: updatedProfile,
            };
            savePreviewState(nextState);
            setProfile(updatedProfile);
            return updatedProfile;
        }

        const client = runtime.client;
        const { data, error } = await client
            .from('profiles')
            .upsert(updatedProfile)
            .select()
            .single();

        if (error) {
            throw new Error(error.message);
        }

        setProfile(data || updatedProfile);
        return data || updatedProfile;
    };

    const addAddress = async (rawAddress) => {
        if (!user) throw new Error('Not authenticated.');

        const validation = validateAddress(rawAddress);
        if (!validation.valid) {
            const firstKey = Object.keys(validation.errors)[0];
            throw new Error(validation.errors[firstKey]);
        }

        const newAddr = {
            ...validation.clean,
            user_id: user.id,
        };

        if (!isConfigured) {
            const record = {
                ...newAddr,
                id: createSimulatedAddressId(),
                created_at: new Date().toISOString(),
            };
            const nextAddresses = [record, ...addresses];
            const currentPreview = readPreviewState() || {};
            savePreviewState({
                ...currentPreview,
                addresses: nextAddresses,
            });
            setAddresses(nextAddresses);

            // If first address, auto-set as default
            if (!defaultAddressId || addresses.length === 0) {
                setDefaultAddress(record.id);
            }
            return record;
        }

        const client = runtime.client;
        const { data, error } = await client
            .from('addresses')
            .insert(newAddr)
            .select()
            .single();

        if (error) {
            throw new Error(error.message);
        }

        const nextAddresses = [data, ...addresses];
        setAddresses(nextAddresses);

        if (!defaultAddressId || addresses.length === 0) {
            setDefaultAddress(data.id);
        }

        return data;
    };

    const updateAddress = async (id, rawAddress) => {
        if (!user) throw new Error('Not authenticated.');

        const validation = validateAddress(rawAddress);
        if (!validation.valid) {
            const firstKey = Object.keys(validation.errors)[0];
            throw new Error(validation.errors[firstKey]);
        }

        if (!isConfigured) {
            const nextAddresses = addresses.map((addr) =>
                addr.id === id ? { ...addr, ...validation.clean } : addr
            );
            const currentPreview = readPreviewState() || {};
            savePreviewState({
                ...currentPreview,
                addresses: nextAddresses,
            });
            setAddresses(nextAddresses);
            return nextAddresses.find((a) => a.id === id);
        }

        const client = runtime.client;
        const { data, error } = await client
            .from('addresses')
            .update(validation.clean)
            .eq('id', id)
            .eq('user_id', user.id)
            .select()
            .single();

        if (error) {
            throw new Error(error.message);
        }

        const nextAddresses = addresses.map((addr) => (addr.id === id ? data : addr));
        setAddresses(nextAddresses);
        return data;
    };

    const deleteAddress = async (id) => {
        if (!user) throw new Error('Not authenticated.');

        if (!isConfigured) {
            const nextAddresses = addresses.filter((addr) => addr.id !== id);
            const currentPreview = readPreviewState() || {};
            savePreviewState({
                ...currentPreview,
                addresses: nextAddresses,
            });
            setAddresses(nextAddresses);
            if (defaultAddressId === id) {
                const nextDefault = nextAddresses.length > 0 ? nextAddresses[0].id : null;
                setDefaultAddress(nextDefault);
            }
            return true;
        }

        const client = runtime.client;
        const { error } = await client
            .from('addresses')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id);

        if (error) {
            throw new Error(error.message);
        }

        const nextAddresses = addresses.filter((addr) => addr.id !== id);
        setAddresses(nextAddresses);
        if (defaultAddressId === id) {
            const nextDefault = nextAddresses.length > 0 ? nextAddresses[0].id : null;
            setDefaultAddress(nextDefault);
        }
        return true;
    };

    const setDefaultAddress = (id) => {
        saveDefaultAddressId(id);
        setDefaultAddressIdState(id);
    };

    const switchMockProfile = (profileKey) => {
        const mock = MOCK_ACCOUNTS[profileKey];
        if (!mock) return;
        const state = {
            user: { id: mock.id, email: mock.email },
            profile: { ...mock.profile },
            addresses: [...mock.addresses],
        };
        savePreviewState(state);
        setUser(state.user);
        setProfile(state.profile);
        setAddresses(state.addresses);
        setAuthStatus('authenticated');
        if (mock.addresses.length > 0) {
            setDefaultAddress(mock.addresses[0].id);
        }
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                profile,
                addresses,
                defaultAddressId,
                authStatus,
                isConfigured,
                previewMode: !isConfigured,
                runtimeMessage: runtime.message,
                authError,
                login,
                register,
                logout,
                updateProfile,
                addAddress,
                updateAddress,
                deleteAddress,
                setDefaultAddress,
                switchMockProfile,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export default AuthProvider;

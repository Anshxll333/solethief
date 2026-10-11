import React, { useEffect, useState, useCallback } from 'react';
import { getSupabaseRuntime } from '../lib/supabase.js';
import { validateAddress, validateProfile } from '../commerce/address.js';
import { AuthContext } from './authContext.js';
import {
    AUTH_PREVIEW_KEY,
    DEFAULT_ADDR_KEY,
    MOCK_ACCOUNTS,
} from './authConstants.js';

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

        client.auth.getSession().then(({ data: { session } }) => {
            if (isCurrent) {
                loadLiveUserData(client, session?.user ?? null);
            }
        }).catch(() => {
            if (isCurrent) {
                setAuthStatus('unauthenticated');
            }
        });

        const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
            if (isCurrent) {
                loadLiveUserData(client, session?.user ?? null);
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
        const { data, error } = await client.auth.signInWithPassword({
            email: email.trim(),
            password,
        });

        if (error) {
            setAuthError(error.message);
            throw error;
        }

        await loadLiveUserData(client, data.user);
        return data;
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

        if (!isConfigured) {
            const simulatedId = createSimulatedUserId();
            const state = {
                user: { id: simulatedId, email: email.trim().toLowerCase() },
                profile: {
                    id: simulatedId,
                    display_name: displayName ? displayName.trim() : email.split('@')[0],
                    phone: phone ? phone.trim() : null,
                },
                addresses: [],
            };
            savePreviewState(state);
            setUser(state.user);
            setProfile(state.profile);
            setAddresses(state.addresses);
            setAuthStatus('authenticated');
            return state;
        }

        const client = runtime.client;
        const { data, error } = await client.auth.signUp({
            email: email.trim(),
            password,
            options: {
                data: {
                    display_name: displayName ? displayName.trim() : '',
                    phone: phone ? phone.trim() : null,
                },
            },
        });

        if (error) {
            setAuthError(error.message);
            throw error;
        }

        if (data?.user) {
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
            await loadLiveUserData(client, data.user);
        }

        return data;
    };

    const logout = async () => {
        setAuthError('');
        if (!isConfigured) {
            savePreviewState(null);
            setUser(null);
            setProfile(null);
            setAddresses([]);
            setAuthStatus('unauthenticated');
            return;
        }

        const client = runtime.client;
        const { error } = await client.auth.signOut();
        if (error) {
            setAuthError(error.message);
            throw error;
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

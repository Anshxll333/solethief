import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './authContext.js';
import { isConfiguredAdminUser } from './adminAccess.js';

export default function AdminRoute({ children }) {
    const { user, authStatus } = useAuth();

    if (authStatus === 'loading') {
        return null;
    }

    if (authStatus !== 'authenticated' || !isConfiguredAdminUser(user)) {
        return <Navigate to="/" replace />;
    }

    return children;
}

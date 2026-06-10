import React, { createContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { AuthUser, UserRole } from '../api/types';

/**
 * Auth context.
 *
 * Current implementation: SKIP_AUTH mode.
 * Reads tenant ID, user ID, and role from VITE_ env vars or localStorage.
 *
 * --- MSAL.js swap guide ---
 * 1. npm install @azure/msal-browser @azure/msal-react
 * 2. Create msalConfig with:
 *      auth.clientId = B2C_B2B_CLIENT_ID
 *      auth.authority = https://{B2C_TENANT_NAME}.b2clogin.com/{B2C_TENANT_NAME}.onmicrosoft.com/B2C_1A_SignUpOrSignin
 *      auth.knownAuthorities = ['{B2C_TENANT_NAME}.b2clogin.com']
 * 3. Wrap <App /> with <MsalProvider instance={msalInstance}>
 * 4. In this AuthProvider, use useMsal() + useAccount() to get the token
 * 5. Decode JWT claims: tenantId, sub (userId), roles, name, email
 * 6. Pass token to AdminApiClient constructor
 * 7. Remove SKIP_AUTH env vars
 */

export interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
  authMode: 'skip' | 'b2c';
}

export const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const authMode = (import.meta.env.VITE_AUTH_MODE || 'skip') as 'skip' | 'b2c';

  const [user, setUser] = useState<AuthUser | null>(() => {
    if (authMode === 'skip') {
      // Dev mode: hardcoded tenant + user
      const tenantId = import.meta.env.VITE_TENANT_ID || localStorage.getItem('admin_tenant_id') || '11111111-1111-1111-1111-111111111111';
      const userId = import.meta.env.VITE_USER_ID || localStorage.getItem('admin_user_id') || 'dev-admin';
      const role = (import.meta.env.VITE_USER_ROLE || localStorage.getItem('admin_user_role') || 'owner') as UserRole;
      return {
        userId,
        tenantId,
        roles: [role],
        displayName: 'Dev Admin',
        email: 'admin@localhost',
      };
    }
    return null;
  });

  const login = useCallback(() => {
    if (authMode === 'b2c') {
      // Future: msalInstance.loginRedirect({ scopes: ['api://loyalty-b2b/admin'] });
      console.warn('B2C login not yet configured. Set VITE_AUTH_MODE=skip for dev mode.');
    }
  }, [authMode]);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('admin_tenant_id');
    localStorage.removeItem('admin_user_id');
    localStorage.removeItem('admin_user_role');
    if (authMode === 'b2c') {
      // Future: msalInstance.logoutRedirect();
    }
  }, [authMode]);

  useEffect(() => {
    if (authMode === 'b2c' && !user) {
      // Future: check for silent SSO / cached token
      // const accounts = msalInstance.getAllAccounts();
      // if (accounts.length) { ... }
    }
  }, [authMode, user]);

  const value: AuthContextValue = {
    user,
    isAuthenticated: user !== null,
    login,
    logout,
    authMode,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

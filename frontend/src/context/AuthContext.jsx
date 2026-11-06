import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getCurrentUser, loginRequest, logoutRequest } from '../services/authApi.js';
import { setUnauthorizedHandler } from '../services/api.js';

const AuthContext = createContext(null);

// status: 'loading' (checking the session on startup) | 'authenticated' | 'unauthenticated'
// endReason: why the user is signed out - null (never signed in), 'logout' or 'expired'.
// The user profile (id, name, email, role) lives only in memory; nothing is written to browser storage.
export function AuthProvider({ children }) {
  const [auth, setAuth] = useState({ status: 'loading', user: null, endReason: null });

  // One /auth/me call on startup. The cancelled flag keeps React StrictMode's double-mount harmless.
  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then((user) => {
        if (!cancelled) setAuth({ status: 'authenticated', user, endReason: null });
      })
      .catch(() => {
        // 401 (no/invalid session) and network errors both mean "not signed in" for the UI.
        if (!cancelled) setAuth({ status: 'unauthenticated', user: null, endReason: null });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // A 401 from any other API call while signed in means the session expired or was revoked.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAuth((current) =>
        current.status === 'authenticated' ? { status: 'unauthenticated', user: null, endReason: 'expired' } : current
      );
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (email, password) => {
    const user = await loginRequest(email, password);
    setAuth({ status: 'authenticated', user, endReason: null });
    return user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      // Even if the request fails (offline, expired), end the session in the UI.
    }
    setAuth({ status: 'unauthenticated', user: null, endReason: 'logout' });
  }, []);

  const refreshUser = useCallback(async () => {
    const user = await getCurrentUser();
    setAuth(current => current.status === 'authenticated' ? {...current,user} : current);
    return user;
  }, []);

  const value = useMemo(
    () => ({
      user: auth.user,
      status: auth.status,
      endReason: auth.endReason,
      isAuthenticated: auth.status === 'authenticated',
      isLoading: auth.status === 'loading',
      login,
      logout,
      refreshUser,
    }),
    [auth, login, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return context;
}

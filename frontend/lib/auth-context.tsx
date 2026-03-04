'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { setApiAuthToken } from './api-client';

interface AuthState {
  jwt: string | null;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (token: string) => void;
  logout: () => void;
}

const AUTH_STORAGE_KEY = 'billing-platform.jwt';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [jwt, setJwt] = useState<string | null>(null);

  useEffect(() => {
    const existing = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (existing) {
      setJwt(existing);
      setApiAuthToken(existing);
    }
  }, []);

  const login = useCallback((token: string) => {
    setJwt(token);
    setApiAuthToken(token);
    window.localStorage.setItem(AUTH_STORAGE_KEY, token);
  }, []);

  const logout = useCallback(() => {
    setJwt(null);
    setApiAuthToken(null);
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      jwt,
      isAuthenticated: Boolean(jwt),
      login,
      logout,
    }),
    [jwt, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
};

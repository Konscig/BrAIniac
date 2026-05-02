import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

import { AUTH_EXPIRED_EVENT, AUTH_EXPIRED_MESSAGE, type AuthExpiredDetail } from "../lib/api";

export type AuthTokens = {
  accessToken: string;
  refreshToken?: string;
};

const normalizeTokens = (input: unknown): AuthTokens | null => {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as Record<string, unknown>;
  const access = candidate.accessToken ?? candidate.access_token;
  const refresh = candidate.refreshToken ?? candidate.refresh_token;

  if (typeof access === "string") {
    return {
      accessToken: access,
      refreshToken: typeof refresh === "string" ? refresh : undefined
    };
  }

  return null;
};

type AuthContextValue = {
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  authNotice: string | null;
  setSession: (tokens: AuthTokens) => void;
  clearSession: () => void;
  clearAuthNotice: () => void;
};

const STORAGE_KEY = "brainiac.tokens";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const readStoredTokens = (): AuthTokens | null => {
  if (typeof localStorage === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return normalizeTokens(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tokens, setTokens] = useState<AuthTokens | null>(() => readStoredTokens());
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const persistTokens = useCallback(
    (next: AuthTokens | null) => {
      setTokens(next);
      try {
        if (next) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        /* noop */
      }
    },
    [setTokens]
  );

  const setSession = useCallback(
    (nextTokens: AuthTokens) => {
      setAuthNotice(null);
      persistTokens(nextTokens);
    },
    [persistTokens]
  );

  const clearSession = useCallback(() => {
    setAuthNotice(null);
    persistTokens(null);
  }, [persistTokens]);

  const clearAuthNotice = useCallback(() => {
    setAuthNotice(null);
  }, []);

  React.useEffect(() => {
    const handleAuthExpired = (event: Event) => {
      const detail = (event as CustomEvent<AuthExpiredDetail>).detail;
      setAuthNotice(detail?.message || AUTH_EXPIRED_MESSAGE);
      persistTokens(null);
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
  }, [persistTokens]);

  const value = useMemo(
    () => ({
      tokens,
      isAuthenticated: Boolean(tokens?.accessToken),
      authNotice,
      setSession,
      clearSession,
      clearAuthNotice
    }),
    [tokens, authNotice, setSession, clearSession, clearAuthNotice]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
};

export const normalizeAuthTokens = (input: unknown): AuthTokens | null => normalizeTokens(input);

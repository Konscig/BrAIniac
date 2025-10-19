import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

const normalizeTokens = (input: unknown): AuthTokens | null => {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as Record<string, unknown>;
  const access = candidate.accessToken ?? candidate.access_token;
  const refresh = candidate.refreshToken ?? candidate.refresh_token;

  if (typeof access === "string" && typeof refresh === "string") {
    return { accessToken: access, refreshToken: refresh };
  }

  return null;
};

type AuthContextValue = {
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  setSession: (tokens: AuthTokens) => void;
  clearSession: () => void;
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
      persistTokens(nextTokens);
    },
    [persistTokens]
  );

  const clearSession = useCallback(() => {
    persistTokens(null);
  }, [persistTokens]);

  const value = useMemo(
    () => ({
      tokens,
      isAuthenticated: Boolean(tokens?.accessToken),
      setSession,
      clearSession
    }),
    [tokens, setSession, clearSession]
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

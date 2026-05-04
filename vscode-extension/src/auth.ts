import * as vscode from 'vscode';
import type { BrainiacAuthSession, BrainiacAuthSessionStore } from './mcpProvider.js';

const SESSION_SECRET_KEY = 'brainiacMcp.session';
const DEFAULT_SIGN_IN_TIMEOUT_MS = 30_000;
const REFRESH_SKEW_MS = 60_000;

function normalizeSession(input: unknown): BrainiacAuthSession | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const candidate = input as Record<string, unknown>;
  if (typeof candidate.accessToken !== 'string' || candidate.accessToken.trim().length === 0) {
    return null;
  }

  return {
    accessToken: candidate.accessToken.trim(),
    backendUrl: typeof candidate.backendUrl === 'string' ? candidate.backendUrl.trim() : undefined,
    expiresAt: typeof candidate.expiresAt === 'string' ? candidate.expiresAt : undefined,
    refreshToken: typeof candidate.refreshToken === 'string' ? candidate.refreshToken.trim() : undefined,
    refreshExpiresAt: typeof candidate.refreshExpiresAt === 'string' ? candidate.refreshExpiresAt : undefined,
    scope: typeof candidate.scope === 'string' ? candidate.scope : undefined,
    sessionId: typeof candidate.sessionId === 'string' ? candidate.sessionId : undefined,
    authMode: candidate.authMode === 'dev-token' ? 'dev-token' : 'oauth',
  };
}

export function isSessionExpired(session: BrainiacAuthSession | null): boolean {
  if (!session?.expiresAt) {
    return false;
  }

  const expiresAt = Date.parse(session.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function shouldRefreshSession(session: BrainiacAuthSession): boolean {
  if (!session.expiresAt) {
    return false;
  }

  const expiresAt = Date.parse(session.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now() + REFRESH_SKEW_MS;
}

export class BrainiacAuthManager implements BrainiacAuthSessionStore {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async readSession(): Promise<BrainiacAuthSession | null> {
    const raw = await this.secrets.get(SESSION_SECRET_KEY);
    if (!raw) {
      return null;
    }

    try {
      return normalizeSession(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async writeSession(session: BrainiacAuthSession): Promise<void> {
    await this.secrets.store(SESSION_SECRET_KEY, JSON.stringify(session));
  }

  async deleteSession(): Promise<void> {
    await this.secrets.delete(SESSION_SECRET_KEY);
  }

  async hasValidSession(): Promise<boolean> {
    const session = await this.getValidSession();
    return Boolean(session?.accessToken);
  }

  async getValidSession(backendUrl?: string): Promise<BrainiacAuthSession | null> {
    const session = await this.readSession();
    if (!session?.accessToken) {
      return null;
    }

    if (!shouldRefreshSession(session)) {
      return session;
    }

    if (session.authMode !== 'oauth' || !session.refreshToken) {
      return isSessionExpired(session) ? null : session;
    }

    try {
      return await this.refreshSession(session, backendUrl ?? session.backendUrl);
    } catch (error) {
      await this.deleteSession();
      vscode.window.showWarningMessage('BrAIniac MCP refresh failed; sign in again.');
      return null;
    }
  }

  async refreshSession(session: BrainiacAuthSession, backendUrl?: string): Promise<BrainiacAuthSession> {
    if (session.authMode !== 'oauth' || !session.refreshToken) {
      throw new Error('BrAIniac dev-token sessions are not refreshable.');
    }

    const resolvedBackendUrl = backendUrl ?? session.backendUrl;
    if (!resolvedBackendUrl) {
      throw new Error('Missing BrAIniac backend URL for refresh.');
    }

    const authBaseUrl = getAuthBaseUrl(resolvedBackendUrl);
    const refreshed = await postJson<OAuthRefreshResponse>(`${authBaseUrl}/auth/oauth/token`, {
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
    });

    const nextSession: BrainiacAuthSession = {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      backendUrl: resolvedBackendUrl,
      expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      refreshExpiresAt: refreshed.refresh_expires_at,
      scope: refreshed.scope,
      sessionId: refreshed.session_id,
      authMode: 'oauth',
    };

    await this.writeSession(nextSession);
    vscode.window.showInformationMessage('BrAIniac MCP token refreshed.');
    return nextSession;
  }

  async revokeSession(): Promise<void> {
    const session = await this.readSession();
    if (session?.authMode === 'oauth' && session.refreshToken && session.backendUrl) {
      const authBaseUrl = getAuthBaseUrl(session.backendUrl);
      await postJson(`${authBaseUrl}/auth/oauth/revoke`, {
        token: session.refreshToken,
      }).catch(() => undefined);
    }

    await this.deleteSession();
  }

  async signInWithBrowser(backendUrl: string): Promise<BrainiacAuthSession> {
    const authBaseUrl = getAuthBaseUrl(backendUrl);
    const started = await postJson<VscodeAuthStartResponse>(`${authBaseUrl}/auth/vscode/start`, {
      callback: 'polling',
      mcpBaseUrl: backendUrl,
    });

    await vscode.env.openExternal(vscode.Uri.parse(started.loginUrl));
    vscode.window.showInformationMessage('BrAIniac sign-in started in your browser.');

    const deadline = Date.now() + DEFAULT_SIGN_IN_TIMEOUT_MS;
    const pollIntervalMs = Math.max(250, started.pollIntervalMs || 1000);

    while (Date.now() < deadline) {
      const exchanged = await postJson<VscodeAuthExchangeResponse>(`${authBaseUrl}/auth/vscode/exchange`, {
        state: started.state,
      });

      if (exchanged.status === 'authorized') {
        const session: BrainiacAuthSession = {
          accessToken: exchanged.accessToken,
          refreshToken: exchanged.refreshToken,
          backendUrl,
          expiresAt: exchanged.expiresAt,
          refreshExpiresAt: exchanged.refreshExpiresAt,
          scope: exchanged.scope,
          sessionId: exchanged.sessionId,
          authMode: 'oauth',
        };
        await this.writeSession(session);
        vscode.window.showInformationMessage('BrAIniac MCP signed in.');
        return session;
      }

      await delay(pollIntervalMs);
    }

    throw new Error('BrAIniac sign-in timed out.');
  }

  async useDevToken(backendUrl: string): Promise<BrainiacAuthSession | null> {
    const token = await vscode.window.showInputBox({
      title: 'BrAIniac dev access token',
      prompt: 'Paste an existing BrAIniac access token for local development only.',
      password: true,
      ignoreFocusOut: true,
    });

    if (!token?.trim()) {
      return null;
    }

    const session: BrainiacAuthSession = {
      accessToken: token.trim(),
      backendUrl,
      authMode: 'dev-token',
    };
    await this.writeSession(session);
    vscode.window.showInformationMessage('BrAIniac MCP dev token stored in SecretStorage.');
    return session;
  }
}

export function createBrainiacAuthManager(context: vscode.ExtensionContext): BrainiacAuthManager {
  return new BrainiacAuthManager(context.secrets);
}

type VscodeAuthStartResponse = {
  state: string;
  loginUrl: string;
  expiresAt: string;
  pollIntervalMs: number;
};

type VscodeAuthExchangeResponse =
  | {
      status: 'pending';
      expiresAt: string;
    }
  | {
      status: 'authorized';
      accessToken: string;
      refreshToken: string;
      tokenType: 'Bearer';
      expiresAt?: string;
      refreshExpiresAt: string;
      scope: string;
      sessionId: string;
    };

type OAuthRefreshResponse = {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
  scope: string;
  session_id: string;
  refresh_expires_at: string;
};

function getAuthBaseUrl(backendUrl: string): string {
  const parsed = new URL(backendUrl);
  parsed.pathname = parsed.pathname.replace(/\/mcp\/?$/, '') || '/';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/+$/, '');
}

async function postJson<TResponse>(url: string, body: unknown): Promise<TResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `HTTP ${response.status}`);
  }

  return (await response.json()) as TResponse;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

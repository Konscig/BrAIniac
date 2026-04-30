import * as vscode from 'vscode';
import type { BrainiacAuthSession, BrainiacAuthSessionStore } from './mcpProvider.js';

const SESSION_SECRET_KEY = 'brainiacMcp.session';
const DEFAULT_SIGN_IN_TIMEOUT_MS = 30_000;

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
  };
}

export function isSessionExpired(session: BrainiacAuthSession | null): boolean {
  if (!session?.expiresAt) {
    return false;
  }

  const expiresAt = Date.parse(session.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
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
    const session = await this.readSession();
    return Boolean(session?.accessToken) && !isSessionExpired(session);
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
          backendUrl,
          expiresAt: exchanged.expiresAt,
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
      tokenType: 'Bearer';
      expiresAt?: string;
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

import * as vscode from 'vscode';
import type { BrainiacAuthSession, BrainiacAuthSessionStore } from './mcpProvider.js';

const SESSION_SECRET_KEY = 'brainiacMcp.session';

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
}

export function createBrainiacAuthManager(context: vscode.ExtensionContext): BrainiacAuthManager {
  return new BrainiacAuthManager(context.secrets);
}

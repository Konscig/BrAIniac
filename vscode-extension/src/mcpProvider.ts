import * as vscode from 'vscode';

export const PROVIDER_ID = 'brainiacMcp';
export const PROVIDER_LABEL = 'BrAIniac MCP';
export const DEFAULT_BACKEND_URL = 'http://localhost:8080/mcp';

export type BrainiacAuthSession = {
  accessToken: string;
  backendUrl?: string;
  expiresAt?: string;
};

export type BrainiacAuthSessionStore = {
  readSession(): Promise<BrainiacAuthSession | null>;
};

function normalizeBackendUrl(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return DEFAULT_BACKEND_URL;
  }
  return value.trim();
}

function readConfiguredBackendUrl(): string {
  const configured = vscode.workspace.getConfiguration('brainiacMcp').get<string>('backendUrl');
  return normalizeBackendUrl(configured);
}

function isExpired(session: BrainiacAuthSession): boolean {
  if (!session.expiresAt) {
    return false;
  }

  const expiresAt = Date.parse(session.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

export function createHttpServerDefinition(backendUrl: string, token: string) {
  return {
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    type: 'http',
    uri: backendUrl,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
}

export function createBrainiacMcpProvider(sessionStore: BrainiacAuthSessionStore) {
  return {
    async provideMcpServerDefinitions() {
      const configuredBackendUrl = readConfiguredBackendUrl();
      const session = await sessionStore.readSession();

      if (!session?.accessToken) {
        vscode.window.showWarningMessage('BrAIniac MCP authentication required. Run BrAIniac: Sign in.');
        return [];
      }

      if (isExpired(session)) {
        vscode.window.showWarningMessage('BrAIniac MCP token expired; sign in again.');
        return [];
      }

      return [
        createHttpServerDefinition(
          normalizeBackendUrl(session.backendUrl ?? configuredBackendUrl),
          session.accessToken,
        ),
      ];
    },
    async resolveMcpServerDefinition(definition: unknown) {
      return definition;
    },
  };
}

export function registerBrainiacMcpProvider(
  context: vscode.ExtensionContext,
  sessionStore: BrainiacAuthSessionStore,
): void {
  const lmApi = (vscode as unknown as { lm?: Record<string, unknown> }).lm;
  const registerProvider = lmApi?.registerMcpServerDefinitionProvider;

  if (typeof registerProvider !== 'function') {
    vscode.window.showWarningMessage('BrAIniac MCP requires VS Code MCP server definition provider support.');
    return;
  }

  const disposable = registerProvider.call(lmApi, PROVIDER_ID, createBrainiacMcpProvider(sessionStore));
  if (disposable && typeof disposable === 'object' && 'dispose' in disposable) {
    context.subscriptions.push(disposable as vscode.Disposable);
  }
}

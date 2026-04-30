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

const providerChangeEmitter = new vscode.EventEmitter<void>();
const output = vscode.window.createOutputChannel('BrAIniac MCP');

function normalizeBackendUrl(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return DEFAULT_BACKEND_URL;
  }
  return value.trim();
}

export function readConfiguredBackendUrl(): string {
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

export function createHttpServerDefinition(backendUrl: string, token?: string): vscode.McpHttpServerDefinition {
  const headers: Record<string, string> = token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};

  return new vscode.McpHttpServerDefinition(
    PROVIDER_LABEL,
    vscode.Uri.parse(backendUrl),
    headers,
    '0.1.0',
  );
}

export function createBrainiacMcpProvider(sessionStore: BrainiacAuthSessionStore) {
  return {
    onDidChangeMcpServerDefinitions: providerChangeEmitter.event,
    async provideMcpServerDefinitions() {
      const configuredBackendUrl = readConfiguredBackendUrl();
      const session = await sessionStore.readSession();
      const hasValidSession = session ? Boolean(session.accessToken) && !isExpired(session) : false;

      output.appendLine(
        `[provider] provide definitions url=${normalizeBackendUrl(session?.backendUrl ?? configuredBackendUrl)} hasSession=${Boolean(session?.accessToken)} valid=${hasValidSession}`,
      );

      return [
        createHttpServerDefinition(
          normalizeBackendUrl(session?.backendUrl ?? configuredBackendUrl),
          hasValidSession && session ? session.accessToken : undefined,
        ),
      ];
    },
    async resolveMcpServerDefinition(definition: vscode.McpServerDefinition) {
      if (!(definition instanceof vscode.McpHttpServerDefinition)) {
        return definition;
      }

      const configuredBackendUrl = readConfiguredBackendUrl();
      const session = await sessionStore.readSession();

      output.appendLine(
        `[provider] resolve definition label=${definition.label} hasSession=${Boolean(session?.accessToken)} expired=${session ? isExpired(session) : false}`,
      );

      if (!session?.accessToken) {
        output.appendLine('[provider] resolve failed: no stored session');
        vscode.window.showWarningMessage('BrAIniac MCP authentication required. Run BrAIniac: Sign in.');
        return undefined;
      }

      if (isExpired(session)) {
        output.appendLine('[provider] resolve failed: stored token expired');
        vscode.window.showWarningMessage('BrAIniac MCP token expired; sign in again.');
        return undefined;
      }

      definition.uri = vscode.Uri.parse(normalizeBackendUrl(session.backendUrl ?? configuredBackendUrl));
      definition.headers = {
        ...definition.headers,
        Authorization: `Bearer ${session.accessToken}`,
      };

      output.appendLine(`[provider] resolved ${definition.uri.toString()} with Authorization header`);

      return definition;
    },
  };
}

export function refreshBrainiacMcpDefinitions(): void {
  providerChangeEmitter.fire();
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
  output.appendLine(`[provider] registered ${PROVIDER_ID}`);
  if (disposable && typeof disposable === 'object' && 'dispose' in disposable) {
    context.subscriptions.push(disposable as vscode.Disposable);
  }
  context.subscriptions.push(output);
}

import * as vscode from 'vscode';

const PROVIDER_ID = 'brainiacMcp';
const PROVIDER_LABEL = 'BrAIniac MCP';
const DEFAULT_BACKEND_URL = 'http://localhost:8080/mcp';

function normalizeBackendUrl(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return DEFAULT_BACKEND_URL;
  }
  return value.trim();
}

async function resolveBackendUrl(): Promise<string | undefined> {
  const configured = vscode.workspace.getConfiguration('brainiacMcp').get<string>('backendUrl');
  const value = normalizeBackendUrl(configured);
  return vscode.window.showInputBox({
    title: 'BrAIniac MCP backend URL',
    value,
    prompt: 'Enter the BrAIniac MCP HTTP endpoint.',
    ignoreFocusOut: true,
    validateInput: (input) => {
      try {
        const parsed = new URL(input);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? undefined : 'Use an HTTP or HTTPS URL.';
      } catch {
        return 'Enter a valid URL.';
      }
    },
  });
}

async function resolveAccessToken(): Promise<string | undefined> {
  const configured = vscode.workspace.getConfiguration('brainiacMcp').get<string>('accessToken');
  if (configured && configured.trim().length > 0) {
    return configured.trim();
  }

  return vscode.window.showInputBox({
    title: 'BrAIniac access token',
    prompt: 'Enter an existing BrAIniac access token.',
    password: true,
    ignoreFocusOut: true,
  });
}

function createHttpServerDefinition(backendUrl: string, token: string) {
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

export function activate(context: vscode.ExtensionContext) {
  const lmApi = (vscode as unknown as { lm?: Record<string, unknown> }).lm;
  const registerProvider = lmApi?.registerMcpServerDefinitionProvider;

  if (typeof registerProvider !== 'function') {
    vscode.window.showWarningMessage('BrAIniac MCP requires VS Code MCP server definition provider support.');
    return;
  }

  const provider = {
    async provideMcpServerDefinitions() {
      const backendUrl = await resolveBackendUrl();
      if (!backendUrl) {
        return [];
      }

      const token = await resolveAccessToken();
      if (!token) {
        vscode.window.showWarningMessage('BrAIniac MCP authentication required.');
        return [];
      }

      return [createHttpServerDefinition(backendUrl, token)];
    },
    async resolveMcpServerDefinition(definition: unknown) {
      return definition;
    },
  };

  const disposable = registerProvider.call(lmApi, PROVIDER_ID, provider);
  if (disposable && typeof disposable === 'object' && 'dispose' in disposable) {
    context.subscriptions.push(disposable as vscode.Disposable);
  }
}

export function deactivate() {}

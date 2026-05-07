import * as vscode from 'vscode';
import { createBrainiacAuthManager } from './auth.js';
import {
  readConfiguredBackendUrl,
  refreshBrainiacMcpDefinitions,
  registerBrainiacMcpProvider,
} from './mcpProvider.js';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function activate(context: vscode.ExtensionContext) {
  const authManager = createBrainiacAuthManager(context);
  registerBrainiacMcpProvider(context, authManager);

  context.subscriptions.push(
    vscode.commands.registerCommand('brainiacMcp.signIn', async () => {
      try {
        await authManager.signInWithBrowser(readConfiguredBackendUrl());
        refreshBrainiacMcpDefinitions();
      } catch (error) {
        vscode.window.showErrorMessage(`BrAIniac sign-in failed: ${getErrorMessage(error)}`);
      }
    }),
    vscode.commands.registerCommand('brainiacMcp.signOut', async () => {
      await authManager.revokeSession();
      refreshBrainiacMcpDefinitions();
      vscode.window.showInformationMessage('BrAIniac MCP signed out.');
    }),
    vscode.commands.registerCommand('brainiacMcp.reconnect', async () => {
      refreshBrainiacMcpDefinitions();
      vscode.window.showInformationMessage('BrAIniac MCP reconnect requested.');
    }),
    vscode.commands.registerCommand('brainiacMcp.useDevToken', async () => {
      const session = await authManager.useDevToken(readConfiguredBackendUrl());
      if (session) {
        refreshBrainiacMcpDefinitions();
      }
    }),
  );
}

export function deactivate() {}

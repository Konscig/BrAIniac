import * as vscode from 'vscode';
import { createBrainiacAuthManager } from './auth.js';
import { readConfiguredBackendUrl, registerBrainiacMcpProvider } from './mcpProvider.js';

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
      } catch (error) {
        vscode.window.showErrorMessage(`BrAIniac sign-in failed: ${getErrorMessage(error)}`);
      }
    }),
  );
}

export function deactivate() {}

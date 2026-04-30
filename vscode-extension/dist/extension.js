"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const auth_js_1 = require("./auth.js");
const mcpProvider_js_1 = require("./mcpProvider.js");
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function activate(context) {
    const authManager = (0, auth_js_1.createBrainiacAuthManager)(context);
    (0, mcpProvider_js_1.registerBrainiacMcpProvider)(context, authManager);
    context.subscriptions.push(vscode.commands.registerCommand('brainiacMcp.signIn', async () => {
        try {
            await authManager.signInWithBrowser((0, mcpProvider_js_1.readConfiguredBackendUrl)());
            (0, mcpProvider_js_1.refreshBrainiacMcpDefinitions)();
        }
        catch (error) {
            vscode.window.showErrorMessage(`BrAIniac sign-in failed: ${getErrorMessage(error)}`);
        }
    }), vscode.commands.registerCommand('brainiacMcp.signOut', async () => {
        await authManager.deleteSession();
        (0, mcpProvider_js_1.refreshBrainiacMcpDefinitions)();
        vscode.window.showInformationMessage('BrAIniac MCP signed out.');
    }), vscode.commands.registerCommand('brainiacMcp.reconnect', async () => {
        (0, mcpProvider_js_1.refreshBrainiacMcpDefinitions)();
        vscode.window.showInformationMessage('BrAIniac MCP reconnect requested.');
    }), vscode.commands.registerCommand('brainiacMcp.useDevToken', async () => {
        const session = await authManager.useDevToken((0, mcpProvider_js_1.readConfiguredBackendUrl)());
        if (session) {
            (0, mcpProvider_js_1.refreshBrainiacMcpDefinitions)();
        }
    }));
}
function deactivate() { }

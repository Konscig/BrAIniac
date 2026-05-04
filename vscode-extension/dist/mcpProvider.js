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
exports.DEFAULT_BACKEND_URL = exports.PROVIDER_LABEL = exports.PROVIDER_ID = void 0;
exports.readConfiguredBackendUrl = readConfiguredBackendUrl;
exports.createHttpServerDefinition = createHttpServerDefinition;
exports.createBrainiacMcpProvider = createBrainiacMcpProvider;
exports.refreshBrainiacMcpDefinitions = refreshBrainiacMcpDefinitions;
exports.registerBrainiacMcpProvider = registerBrainiacMcpProvider;
const vscode = __importStar(require("vscode"));
exports.PROVIDER_ID = 'brainiacMcp';
exports.PROVIDER_LABEL = 'BrAIniac MCP';
exports.DEFAULT_BACKEND_URL = 'http://localhost:8080/mcp';
const providerChangeEmitter = new vscode.EventEmitter();
const output = vscode.window.createOutputChannel('BrAIniac MCP');
function normalizeBackendUrl(value) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        return exports.DEFAULT_BACKEND_URL;
    }
    return value.trim();
}
function readConfiguredBackendUrl() {
    const configured = vscode.workspace.getConfiguration('brainiacMcp').get('backendUrl');
    return normalizeBackendUrl(configured);
}
function isExpired(session) {
    if (!session.expiresAt) {
        return false;
    }
    const expiresAt = Date.parse(session.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}
function createHttpServerDefinition(backendUrl, token) {
    const headers = token
        ? {
            Authorization: `Bearer ${token}`,
        }
        : {};
    return new vscode.McpHttpServerDefinition(exports.PROVIDER_LABEL, vscode.Uri.parse(backendUrl), headers, '0.1.0');
}
function createBrainiacMcpProvider(sessionStore) {
    return {
        onDidChangeMcpServerDefinitions: providerChangeEmitter.event,
        async provideMcpServerDefinitions() {
            const configuredBackendUrl = readConfiguredBackendUrl();
            const session = sessionStore.getValidSession
                ? await sessionStore.getValidSession(configuredBackendUrl)
                : await sessionStore.readSession();
            const hasValidSession = session ? Boolean(session.accessToken) && !isExpired(session) : false;
            output.appendLine(`[provider] provide definitions url=${normalizeBackendUrl(session?.backendUrl ?? configuredBackendUrl)} hasSession=${Boolean(session?.accessToken)} valid=${hasValidSession}`);
            return [
                createHttpServerDefinition(normalizeBackendUrl(session?.backendUrl ?? configuredBackendUrl), hasValidSession && session ? session.accessToken : undefined),
            ];
        },
        async resolveMcpServerDefinition(definition) {
            if (!(definition instanceof vscode.McpHttpServerDefinition)) {
                return definition;
            }
            const configuredBackendUrl = readConfiguredBackendUrl();
            const session = sessionStore.getValidSession
                ? await sessionStore.getValidSession(configuredBackendUrl)
                : await sessionStore.readSession();
            output.appendLine(`[provider] resolve definition label=${definition.label} hasSession=${Boolean(session?.accessToken)} expired=${session ? isExpired(session) : false} refresh-before-use=${Boolean(sessionStore.getValidSession)}`);
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
function refreshBrainiacMcpDefinitions() {
    providerChangeEmitter.fire();
}
function registerBrainiacMcpProvider(context, sessionStore) {
    const lmApi = vscode.lm;
    const registerProvider = lmApi?.registerMcpServerDefinitionProvider;
    if (typeof registerProvider !== 'function') {
        vscode.window.showWarningMessage('BrAIniac MCP requires VS Code MCP server definition provider support.');
        return;
    }
    const disposable = registerProvider.call(lmApi, exports.PROVIDER_ID, createBrainiacMcpProvider(sessionStore));
    output.appendLine(`[provider] registered ${exports.PROVIDER_ID}`);
    if (disposable && typeof disposable === 'object' && 'dispose' in disposable) {
        context.subscriptions.push(disposable);
    }
    context.subscriptions.push(output);
}

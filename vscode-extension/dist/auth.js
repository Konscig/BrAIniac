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
exports.BrainiacAuthManager = void 0;
exports.isSessionExpired = isSessionExpired;
exports.createBrainiacAuthManager = createBrainiacAuthManager;
const vscode = __importStar(require("vscode"));
const SESSION_SECRET_KEY = 'brainiacMcp.session';
const DEFAULT_SIGN_IN_TIMEOUT_MS = 30_000;
function normalizeSession(input) {
    if (!input || typeof input !== 'object') {
        return null;
    }
    const candidate = input;
    if (typeof candidate.accessToken !== 'string' || candidate.accessToken.trim().length === 0) {
        return null;
    }
    return {
        accessToken: candidate.accessToken.trim(),
        backendUrl: typeof candidate.backendUrl === 'string' ? candidate.backendUrl.trim() : undefined,
        expiresAt: typeof candidate.expiresAt === 'string' ? candidate.expiresAt : undefined,
    };
}
function isSessionExpired(session) {
    if (!session?.expiresAt) {
        return false;
    }
    const expiresAt = Date.parse(session.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}
class BrainiacAuthManager {
    secrets;
    constructor(secrets) {
        this.secrets = secrets;
    }
    async readSession() {
        const raw = await this.secrets.get(SESSION_SECRET_KEY);
        if (!raw) {
            return null;
        }
        try {
            return normalizeSession(JSON.parse(raw));
        }
        catch {
            return null;
        }
    }
    async writeSession(session) {
        await this.secrets.store(SESSION_SECRET_KEY, JSON.stringify(session));
    }
    async deleteSession() {
        await this.secrets.delete(SESSION_SECRET_KEY);
    }
    async hasValidSession() {
        const session = await this.readSession();
        return Boolean(session?.accessToken) && !isSessionExpired(session);
    }
    async signInWithBrowser(backendUrl) {
        const authBaseUrl = getAuthBaseUrl(backendUrl);
        const started = await postJson(`${authBaseUrl}/auth/vscode/start`, {
            callback: 'polling',
            mcpBaseUrl: backendUrl,
        });
        await vscode.env.openExternal(vscode.Uri.parse(started.loginUrl));
        vscode.window.showInformationMessage('BrAIniac sign-in started in your browser.');
        const deadline = Date.now() + DEFAULT_SIGN_IN_TIMEOUT_MS;
        const pollIntervalMs = Math.max(250, started.pollIntervalMs || 1000);
        while (Date.now() < deadline) {
            const exchanged = await postJson(`${authBaseUrl}/auth/vscode/exchange`, {
                state: started.state,
            });
            if (exchanged.status === 'authorized') {
                const session = {
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
    async useDevToken(backendUrl) {
        const token = await vscode.window.showInputBox({
            title: 'BrAIniac dev access token',
            prompt: 'Paste an existing BrAIniac access token for local development only.',
            password: true,
            ignoreFocusOut: true,
        });
        if (!token?.trim()) {
            return null;
        }
        const session = {
            accessToken: token.trim(),
            backendUrl,
        };
        await this.writeSession(session);
        vscode.window.showInformationMessage('BrAIniac MCP dev token stored in SecretStorage.');
        return session;
    }
}
exports.BrainiacAuthManager = BrainiacAuthManager;
function createBrainiacAuthManager(context) {
    return new BrainiacAuthManager(context.secrets);
}
function getAuthBaseUrl(backendUrl) {
    const parsed = new URL(backendUrl);
    parsed.pathname = parsed.pathname.replace(/\/mcp\/?$/, '') || '/';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
}
async function postJson(url, body) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || `HTTP ${response.status}`);
    }
    return (await response.json());
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

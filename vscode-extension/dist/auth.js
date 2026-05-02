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
const REFRESH_SKEW_MS = 60_000;
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
        refreshToken: typeof candidate.refreshToken === 'string' ? candidate.refreshToken.trim() : undefined,
        refreshExpiresAt: typeof candidate.refreshExpiresAt === 'string' ? candidate.refreshExpiresAt : undefined,
        scope: typeof candidate.scope === 'string' ? candidate.scope : undefined,
        sessionId: typeof candidate.sessionId === 'string' ? candidate.sessionId : undefined,
        authMode: candidate.authMode === 'dev-token' ? 'dev-token' : 'oauth',
    };
}
function isSessionExpired(session) {
    if (!session?.expiresAt) {
        return false;
    }
    const expiresAt = Date.parse(session.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}
function shouldRefreshSession(session) {
    if (!session.expiresAt) {
        return false;
    }
    const expiresAt = Date.parse(session.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt <= Date.now() + REFRESH_SKEW_MS;
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
        const session = await this.getValidSession();
        return Boolean(session?.accessToken);
    }
    async getValidSession(backendUrl) {
        const session = await this.readSession();
        if (!session?.accessToken) {
            return null;
        }
        if (!shouldRefreshSession(session)) {
            return session;
        }
        if (session.authMode !== 'oauth' || !session.refreshToken) {
            return isSessionExpired(session) ? null : session;
        }
        try {
            return await this.refreshSession(session, backendUrl ?? session.backendUrl);
        }
        catch (error) {
            await this.deleteSession();
            vscode.window.showWarningMessage('BrAIniac MCP refresh failed; sign in again.');
            return null;
        }
    }
    async refreshSession(session, backendUrl) {
        if (session.authMode !== 'oauth' || !session.refreshToken) {
            throw new Error('BrAIniac dev-token sessions are not refreshable.');
        }
        const resolvedBackendUrl = backendUrl ?? session.backendUrl;
        if (!resolvedBackendUrl) {
            throw new Error('Missing BrAIniac backend URL for refresh.');
        }
        const authBaseUrl = getAuthBaseUrl(resolvedBackendUrl);
        const refreshed = await postJson(`${authBaseUrl}/auth/oauth/token`, {
            grant_type: 'refresh_token',
            refresh_token: session.refreshToken,
        });
        const nextSession = {
            accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token,
            backendUrl: resolvedBackendUrl,
            expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
            refreshExpiresAt: refreshed.refresh_expires_at,
            scope: refreshed.scope,
            sessionId: refreshed.session_id,
            authMode: 'oauth',
        };
        await this.writeSession(nextSession);
        vscode.window.showInformationMessage('BrAIniac MCP token refreshed.');
        return nextSession;
    }
    async revokeSession() {
        const session = await this.readSession();
        if (session?.authMode === 'oauth' && session.refreshToken && session.backendUrl) {
            const authBaseUrl = getAuthBaseUrl(session.backendUrl);
            await postJson(`${authBaseUrl}/auth/oauth/revoke`, {
                token: session.refreshToken,
            }).catch(() => undefined);
        }
        await this.deleteSession();
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
                    refreshToken: exchanged.refreshToken,
                    backendUrl,
                    expiresAt: exchanged.expiresAt,
                    refreshExpiresAt: exchanged.refreshExpiresAt,
                    scope: exchanged.scope,
                    sessionId: exchanged.sessionId,
                    authMode: 'oauth',
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
            authMode: 'dev-token',
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

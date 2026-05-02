import { randomBytes } from 'node:crypto';
import { HttpError } from '../../../common/http-error.js';
import {
  issueVscodeOAuthSession,
  type VscodeOAuthSessionResult,
} from './oauth-token.application.service.js';

export type VscodeAuthStatus = 'pending' | 'authorized' | 'failed' | 'expired' | 'consumed';

export type VscodeAuthRequest = {
  state: string;
  mode: 'polling';
  loginUrl: string;
  createdAt: Date;
  expiresAt: Date;
  status: VscodeAuthStatus;
  userId?: number;
  accessToken?: string;
  completedAt?: Date;
};

export type StartVscodeAuthInput = {
  callback?: unknown;
  mcpBaseUrl?: unknown;
  now?: Date;
};

export type StartVscodeAuthResult = {
  state: string;
  loginUrl: string;
  expiresAt: string;
  pollIntervalMs: number;
};

export type CompleteVscodeAuthInput = {
  state: unknown;
  userId: number;
  accessToken: string;
  now?: Date;
};

export type CompleteVscodeAuthResult = {
  status: 'authorized';
  expiresAt: string;
};

export type ExchangeVscodeAuthResult =
  | {
      status: 'pending';
      expiresAt: string;
    }
  | ({
      status: 'authorized';
    } & VscodeOAuthSessionResult);

const DEFAULT_FRONTEND_BASE_URL = 'http://localhost:3000';
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 1000;
const MIN_STATE_LENGTH = 32;
const requests = new Map<string, VscodeAuthRequest>();

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getFrontendBaseUrl(): string {
  return (process.env.FRONTEND_BASE_URL || DEFAULT_FRONTEND_BASE_URL).replace(/\/+$/, '');
}

function createState(): string {
  return randomBytes(32).toString('base64url');
}

function toIso(date: Date): string {
  return date.toISOString();
}

function parseState(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < MIN_STATE_LENGTH) {
    throw invalidStateError();
  }

  return value.trim();
}

function invalidStateError(): HttpError {
  return new HttpError(400, {
    ok: false,
    code: 'INVALID_STATE',
    message: 'invalid or expired VS Code auth state',
  });
}

function isExpired(request: VscodeAuthRequest, now: Date): boolean {
  return request.expiresAt.getTime() <= now.getTime();
}

function getActiveRequest(state: unknown, now: Date): VscodeAuthRequest {
  const parsedState = parseState(state);
  const request = requests.get(parsedState);
  if (!request) {
    throw invalidStateError();
  }

  if (isExpired(request, now)) {
    request.status = 'expired';
    requests.delete(parsedState);
    throw invalidStateError();
  }

  if (request.status === 'failed' || request.status === 'expired' || request.status === 'consumed') {
    throw invalidStateError();
  }

  return request;
}

function buildLoginUrl(state: string): string {
  const url = new URL('/auth', getFrontendBaseUrl());
  url.searchParams.set('vscode_state', state);
  return url.toString();
}

export function startVscodeAuthRequest(input: StartVscodeAuthInput = {}): StartVscodeAuthResult {
  if (input.callback !== undefined && input.callback !== 'polling') {
    throw new HttpError(400, {
      ok: false,
      code: 'INVALID_CALLBACK',
      message: 'VS Code auth callback must be polling',
    });
  }

  if (input.mcpBaseUrl !== undefined && typeof input.mcpBaseUrl !== 'string') {
    throw new HttpError(400, {
      ok: false,
      code: 'INVALID_MCP_BASE_URL',
      message: 'mcpBaseUrl must be a string',
    });
  }

  const now = input.now ?? new Date();
  const state = createState();
  const ttlMs = readPositiveIntEnv('VSCODE_AUTH_REQUEST_TTL_MS', DEFAULT_TTL_MS);
  const pollIntervalMs = readPositiveIntEnv('VSCODE_AUTH_POLL_INTERVAL_MS', DEFAULT_POLL_INTERVAL_MS);
  const expiresAt = new Date(now.getTime() + ttlMs);
  const loginUrl = buildLoginUrl(state);

  requests.set(state, {
    state,
    mode: 'polling',
    loginUrl,
    createdAt: now,
    expiresAt,
    status: 'pending',
  });

  return {
    state,
    loginUrl,
    expiresAt: toIso(expiresAt),
    pollIntervalMs,
  };
}

export function completeVscodeAuthRequest(input: CompleteVscodeAuthInput): CompleteVscodeAuthResult {
  if (!Number.isInteger(input.userId) || input.userId <= 0 || input.accessToken.trim().length === 0) {
    throw new HttpError(401, {
      ok: false,
      code: 'UNAUTHORIZED',
      message: 'authentication required',
    });
  }

  const now = input.now ?? new Date();
  const request = getActiveRequest(input.state, now);
  if (request.status !== 'pending') {
    throw invalidStateError();
  }

  request.status = 'authorized';
  request.userId = input.userId;
  request.accessToken = input.accessToken;
  request.completedAt = now;

  return {
    status: 'authorized',
    expiresAt: toIso(request.expiresAt),
  };
}

export function exchangeVscodeAuthRequest(state: unknown, now = new Date()): ExchangeVscodeAuthResult {
  const request = getActiveRequest(state, now);

  if (request.status === 'pending') {
    return {
      status: 'pending',
      expiresAt: toIso(request.expiresAt),
    };
  }

  if (request.status !== 'authorized' || !request.accessToken) {
    throw invalidStateError();
  }

  request.status = 'consumed';
  requests.delete(request.state);

  return {
    status: 'authorized',
    ...issueVscodeOAuthSession({
      userId: request.userId ?? 0,
      accessToken: request.accessToken,
    }),
  };
}

export function failVscodeAuthRequest(state: unknown, now = new Date()): void {
  const request = getActiveRequest(state, now);
  request.status = 'failed';
}

export function clearVscodeAuthRequestsForTests(): void {
  requests.clear();
}

import { HttpError, isHttpError } from '../common/http-error.js';

export type McpErrorCode = 'UNAUTHORIZED' | 'FORBIDDEN' | 'VALIDATION' | 'NOT_FOUND' | 'RUNTIME';

export type McpVisibleError = {
  ok: false;
  code: McpErrorCode;
  message: string;
  details: Record<string, unknown>;
};

function codeFromStatus(status: number): McpErrorCode {
  if (status === 401) {
    return 'UNAUTHORIZED';
  }
  if (status === 403) {
    return 'FORBIDDEN';
  }
  if (status === 404) {
    return 'NOT_FOUND';
  }
  if (status === 400 || status === 422) {
    return 'VALIDATION';
  }
  return 'RUNTIME';
}

function objectDetails(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function mapMcpError(error: unknown): McpVisibleError {
  if (isHttpError(error)) {
    return {
      ok: false,
      code: codeFromStatus(error.status),
      message: error.message,
      details: objectDetails(error.body),
    };
  }

  if (error instanceof HttpError) {
    return {
      ok: false,
      code: codeFromStatus(error.status),
      message: error.message,
      details: objectDetails(error.body),
    };
  }

  if (error instanceof Error) {
    return {
      ok: false,
      code: 'RUNTIME',
      message: error.message,
      details: {},
    };
  }

  return {
    ok: false,
    code: 'RUNTIME',
    message: 'runtime error',
    details: {},
  };
}

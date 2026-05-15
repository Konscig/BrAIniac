import { HttpError } from '../common/http-error.js';

export const RUNTIME_REDIS_UNAVAILABLE = 'RUNTIME_REDIS_UNAVAILABLE';

export class RuntimeRedisUnavailableError extends HttpError {
  constructor(message = 'runtime coordination unavailable') {
    super(503, {
      ok: false,
      code: RUNTIME_REDIS_UNAVAILABLE,
      error: message,
      retryable: true,
    });
  }
}

export function isRuntimeRedisUnavailableError(value: unknown): value is RuntimeRedisUnavailableError {
  return value instanceof RuntimeRedisUnavailableError;
}

export function runtimeRedisUnavailable(message?: string): never {
  throw new RuntimeRedisUnavailableError(message);
}


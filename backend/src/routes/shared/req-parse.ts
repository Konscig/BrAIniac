import { HttpError } from '../../common/http-error.js';
import { parseId } from './id.utils.js';

export function requiredId(raw: unknown, errorMessage: string): number {
  const value = parseId(raw);
  if (!value) {
    throw new HttpError(400, { error: errorMessage });
  }
  return value;
}

export function optionalId(raw: unknown, errorMessage: string): number | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const value = parseId(raw);
  if (!value) {
    throw new HttpError(400, { error: errorMessage });
  }
  return value;
}

export function requiredFiniteNumber(raw: unknown, errorMessage: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new HttpError(400, { error: errorMessage });
  }
  return value;
}

export function optionalFiniteNumber(raw: unknown, errorMessage: string): number | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new HttpError(400, { error: errorMessage });
  }
  return value;
}

export function requiredNonEmptyString(raw: unknown, errorMessage: string): string {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new HttpError(400, { error: errorMessage });
  }
  return raw.trim();
}

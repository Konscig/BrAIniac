const DEFAULT_WRAPPER_KEYS = ['value', 'data', 'payload', 'output', 'contract_output'] as const;

export function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

export function normalizeMultilineText(raw: string): string {
  return raw.replace(/\r\n/g, '\n').trim();
}

export function readNonEmptyText(raw: unknown): string | undefined {
  if (typeof raw === 'string') {
    const value = normalizeText(raw);
    return value.length > 0 ? value : undefined;
  }

  if (typeof raw === 'number' || typeof raw === 'boolean') {
    const value = normalizeText(String(raw));
    return value.length > 0 ? value : undefined;
  }

  return undefined;
}

export function readStringAlias(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = readNonEmptyText(record[key]);
    if (value) return value;
  }
  return undefined;
}

export function coerceOptionalPositiveInt(raw: unknown): number | undefined {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return undefined;
  return value;
}

export function coerceOptionalFiniteNumber(raw: unknown): number | undefined {
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  return value;
}

export function clampInt(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function unwrapPayload(value: unknown, wrapperKeys: readonly string[] = DEFAULT_WRAPPER_KEYS): unknown {
  if (!value || typeof value !== 'object') return value;

  const record = value as Record<string, unknown>;
  for (const key of wrapperKeys) {
    if (!(key in record)) continue;

    const nested = unwrapPayload(record[key], wrapperKeys);
    if (nested !== undefined && nested !== null) {
      return nested;
    }
  }

  return value;
}

export function collectArrayValues(record: Record<string, unknown>, keys: string[]): unknown[] {
  const out: unknown[] = [];
  for (const key of keys) {
    const candidate = record[key];
    if (!Array.isArray(candidate)) continue;
    out.push(...candidate);
  }
  return out;
}

export function countApproxTokens(text: string): number {
  const normalized = normalizeText(text);
  if (!normalized) return 0;
  return normalized.split(' ').filter((part) => part.length > 0).length;
}

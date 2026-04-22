import { HttpError } from '../../../common/http-error.js';

export function readPositiveInteger(raw: string | undefined, fallback: number, min = 1): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min) return fallback;
  return parsed;
}

export function readBoundedInteger(raw: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

export function nowIso() {
  return new Date().toISOString();
}

export function getRange(configJson: any, key: 'input' | 'output'): { min: number; max: number } {
  if (!configJson || typeof configJson !== 'object') {
    return { min: 0, max: 10 };
  }

  const section = (configJson as any)[key];
  if (!section || typeof section !== 'object') {
    return { min: 0, max: 10 };
  }

  const min = Number((section as any).min);
  const max = Number((section as any).max);

  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min) {
    return { min: 0, max: 10 };
  }

  return { min, max };
}

export function getLoopMaxRuns(configJson: any): number {
  if (!configJson || typeof configJson !== 'object') return 1;
  const loop = (configJson as any).loop;
  if (!loop || typeof loop !== 'object') return 1;

  const maxIterations = Number((loop as any).maxIterations);
  if (!Number.isInteger(maxIterations) || maxIterations <= 0) return 1;

  return maxIterations;
}

export function toText(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (typeof value === 'object') {
    const text = (value as any).text;
    if (typeof text === 'string') return text;
    const prompt = (value as any).prompt;
    if (typeof prompt === 'string') return prompt;
    const content = (value as any).content;
    if (typeof content === 'string') return content;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

export function tryParseJsonFromText(text: string): any | null {
  if (!text || !text.trim()) return null;

  try {
    return JSON.parse(text);
  } catch {
    // Continue with fenced-json extraction fallback.
  }

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (!fencedMatch || typeof fencedMatch[1] !== 'string') return null;

  try {
    return JSON.parse(fencedMatch[1].trim());
  } catch {
    return null;
  }
}

export function buildPrompt(inputs: any[], inputJson: any): string {
  const chunks = inputs.map((item) => toText(item)).filter((item) => item.length > 0);
  if (chunks.length === 0 && inputJson !== undefined) {
    const fallback = toText(inputJson);
    if (fallback.length > 0) chunks.push(fallback);
  }
  return chunks.join('\n\n');
}

export function normalizeUnknownError(error: unknown): { code: string; message: string; details?: Record<string, any> } {
  if (error instanceof HttpError) {
    return {
      code: typeof error.body.code === 'string' ? error.body.code : `HTTP_${error.status}`,
      message: typeof error.body.error === 'string' ? error.body.error : `HTTP ${error.status}`,
      ...(error.body && typeof error.body === 'object' ? { details: { ...error.body } } : {}),
    };
  }

  if (error instanceof Error) {
    return {
      code: 'EXECUTOR_RUNTIME_ERROR',
      message: error.message,
    };
  }

  return {
    code: 'EXECUTOR_RUNTIME_ERROR',
    message: 'executor failed',
  };
}

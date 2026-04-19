import { HttpError } from '../../../common/http-error.js';
import { getOpenRouterConfig, type OpenRouterConfig } from './openrouter.config.js';

export type OpenRouterRole = 'system' | 'user' | 'assistant' | 'tool';

export interface OpenRouterChatMessage {
  role: OpenRouterRole;
  content: string;
}

export interface OpenRouterChatRequest {
  model?: string;
  messages: OpenRouterChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface OpenRouterChatResult {
  model: string;
  text: string;
  responseId?: string;
  usage?: Record<string, any>;
  raw?: any;
}

export interface OpenRouterEmbeddingRequest {
  model?: string;
  input: string | string[];
}

export interface OpenRouterEmbeddingResult {
  model: string;
  embeddings: number[][];
  raw?: any;
}

class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly maxConcurrent: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active += 1;
      return;
    }

    await new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
    this.active += 1;
  }

  release(): void {
    if (this.active > 0) {
      this.active -= 1;
    }

    const next = this.waiters.shift();
    if (next) {
      next();
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function getRetryDelayMs(baseDelay: number, attempt: number): number {
  const jitter = Math.floor(Math.random() * 150);
  return Math.min(5_000, baseDelay * 2 ** attempt + jitter);
}

function normalizeTextContent(content: any): string {
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    const chunks = content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (!part || typeof part !== 'object') return '';
        const text = (part as any).text;
        return typeof text === 'string' ? text : '';
      })
      .filter((chunk) => chunk.length > 0);
    return chunks.join('\n');
  }

  return '';
}

function toProviderMessage(payload: any): string {
  if (payload && typeof payload === 'object') {
    const nested = (payload as any).error;
    if (nested && typeof nested === 'object' && typeof (nested as any).message === 'string') {
      return (nested as any).message;
    }
    if (typeof (payload as any).message === 'string') {
      return (payload as any).message;
    }
  }
  return 'openrouter request failed';
}

export class OpenRouterAdapter {
  private readonly semaphore: Semaphore;

  constructor(private readonly config: OpenRouterConfig) {
    this.semaphore = new Semaphore(config.maxConcurrent);
  }

  private ensureConfigured() {
    if (!this.config.enabled || !this.config.apiKey) {
      throw new HttpError(500, {
        ok: false,
        code: 'OPENROUTER_NOT_CONFIGURED',
        error: 'OPENROUTER_API_KEY is not configured',
      });
    }
  }

  private async withConcurrency<T>(run: () => Promise<T>): Promise<T> {
    await this.semaphore.acquire();
    try {
      return await run();
    } finally {
      this.semaphore.release();
    }
  }

  private async postJson(path: string, payload: Record<string, any>): Promise<any> {
    this.ensureConfigured();

    return this.withConcurrency(async () => {
      for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

        try {
          const response = await fetch(`${this.config.baseUrl}${path}`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.config.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });

          const raw = await response.text();
          let parsed: any = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            parsed = null;
          }

          if (response.ok) {
            return parsed ?? {};
          }

          if (isRetryableStatus(response.status) && attempt < this.config.maxRetries) {
            await sleep(getRetryDelayMs(this.config.retryBaseDelayMs, attempt));
            continue;
          }

          throw new HttpError(502, {
            ok: false,
            code: 'OPENROUTER_UPSTREAM_ERROR',
            error: toProviderMessage(parsed),
            details: {
              status: response.status,
            },
          });
        } catch (error) {
          const aborted = error instanceof Error && error.name === 'AbortError';
          const retryable = aborted || !(error instanceof HttpError);

          if (retryable && attempt < this.config.maxRetries) {
            await sleep(getRetryDelayMs(this.config.retryBaseDelayMs, attempt));
            continue;
          }

          if (error instanceof HttpError) throw error;

          throw new HttpError(503, {
            ok: false,
            code: 'OPENROUTER_UNAVAILABLE',
            error: aborted ? 'openrouter request timeout' : 'openrouter request failed',
          });
        } finally {
          clearTimeout(timeout);
        }
      }

      throw new HttpError(503, {
        ok: false,
        code: 'OPENROUTER_UNAVAILABLE',
        error: 'openrouter request failed after retries',
      });
    });
  }

  async chatCompletion(request: OpenRouterChatRequest): Promise<OpenRouterChatResult> {
    const model = request.model ?? this.config.defaultChatModel;

    const payload = await this.postJson('/chat/completions', {
      model,
      messages: request.messages,
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
    });

    const text = normalizeTextContent(payload?.choices?.[0]?.message?.content);

    return {
      model: typeof payload?.model === 'string' ? payload.model : model,
      text,
      ...(typeof payload?.id === 'string' && payload.id.trim().length > 0 ? { responseId: payload.id.trim() } : {}),
      usage: payload?.usage,
      raw: payload,
    };
  }

  async embeddings(request: OpenRouterEmbeddingRequest): Promise<OpenRouterEmbeddingResult> {
    const model = request.model ?? this.config.defaultEmbeddingModel;
    const input = Array.isArray(request.input) ? request.input : [request.input];

    const payload = await this.postJson('/embeddings', {
      model,
      input,
    });

    const embeddings = Array.isArray(payload?.data)
      ? payload.data
          .map((item: any) => (Array.isArray(item?.embedding) ? item.embedding : null))
          .filter((item: number[] | null): item is number[] => item !== null)
      : [];

    return {
      model: typeof payload?.model === 'string' ? payload.model : model,
      embeddings,
      raw: payload,
    };
  }
}

let singleton: OpenRouterAdapter | null = null;

export function getOpenRouterAdapter(): OpenRouterAdapter {
  if (!singleton) {
    singleton = new OpenRouterAdapter(getOpenRouterConfig());
  }
  return singleton;
}

export function resetOpenRouterAdapterForTests() {
  singleton = null;
}

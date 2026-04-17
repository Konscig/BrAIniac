export interface OpenRouterConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string | null;
  defaultChatModel: string;
  defaultEmbeddingModel: string;
  timeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  maxConcurrent: number;
}

function readPositiveInteger(raw: string | undefined, fallback: number, min = 1): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min) return fallback;
  return parsed;
}

function readTrimmed(raw: string | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  return value.length > 0 ? value : undefined;
}

let cachedConfig: OpenRouterConfig | null = null;

export function getOpenRouterConfig(): OpenRouterConfig {
  if (cachedConfig) return cachedConfig;

  const apiKey = readTrimmed(process.env.OPENROUTER_API_KEY) ?? null;
  const baseUrl = readTrimmed(process.env.OPENROUTER_BASE_URL) ?? 'https://openrouter.ai/api/v1';

  cachedConfig = {
    enabled: apiKey !== null,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    defaultChatModel: readTrimmed(process.env.OPENROUTER_LLM_MODEL) ?? 'openrouter/elephant-alpha',
    defaultEmbeddingModel: readTrimmed(process.env.OPENROUTER_EMBEDDING_MODEL) ?? 'nvidia/llama-nemotron-embed-vl-1b-v2:free',
    timeoutMs: readPositiveInteger(process.env.OPENROUTER_TIMEOUT_MS, 20_000),
    maxRetries: readPositiveInteger(process.env.OPENROUTER_MAX_RETRIES, 2, 0),
    retryBaseDelayMs: readPositiveInteger(process.env.OPENROUTER_RETRY_BASE_DELAY_MS, 500),
    maxConcurrent: readPositiveInteger(process.env.OPENROUTER_MAX_CONCURRENT, 4),
  };

  return cachedConfig;
}

export function resetOpenRouterConfigCache() {
  cachedConfig = null;
}

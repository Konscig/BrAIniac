export interface EvalWorkerResponse {
  value: number;
  details?: Record<string, any>;
  warnings?: string[];
}

export interface EvalWorkerErrorDetail {
  code: string;
  message?: string;
  reason?: string;
  details?: Record<string, any>;
}

export class EvalWorkerError extends Error {
  constructor(
    readonly status: number,
    readonly detail: EvalWorkerErrorDetail,
  ) {
    super(`eval-worker ${status} ${detail.code}`);
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 2;
const BACKOFF_MS = 500;

function baseUrl(): string {
  return (process.env.JUDGE_EVAL_WORKER_URL ?? 'http://judge-eval-worker:8001').replace(/\/+$/, '');
}

function timeoutMs(): number {
  const raw = Number(process.env.JUDGE_EVAL_WORKER_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

async function doFetch(url: string, init: RequestInit, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const handle = setTimeout(() => controller.abort(new Error('eval-worker request timed out')), timeout);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(handle);
  }
}

export const isSidecarAvailable = healthCheck;

export async function computeSidecarMetric(code: string, item: any): Promise<number> {
  const res = await computeMetric(code, {
    agent_output: { text: item.agent_output?.text ?? '' },
    reference: item.reference ?? {},
    input: item.input ?? {},
  });
  return res.value;
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await doFetch(`${baseUrl()}/health`, { method: 'GET' }, 5_000);
    return res.ok;
  } catch {
    return false;
  }
}

function assertShape(payload: any): EvalWorkerResponse {
  if (!payload || typeof payload !== 'object') {
    throw new EvalWorkerError(500, { code: 'EVAL_WORKER_INVALID_RESPONSE', message: 'non-object response' });
  }
  const value = Number(payload.value);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new EvalWorkerError(500, { code: 'EVAL_WORKER_INVALID_RESPONSE', message: `value out of [0,1]: ${payload.value}` });
  }
  return {
    value,
    details: payload.details ?? undefined,
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
  };
}

export async function computeMetric(
  code: string,
  payload: Record<string, any>,
): Promise<EvalWorkerResponse> {
  const url = `${baseUrl()}/metrics/${encodeURIComponent(code)}`;
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };

  let lastError: unknown;
  for (let attempt = 0; attempt <= DEFAULT_RETRIES; attempt += 1) {
    try {
      const res = await doFetch(url, init, timeoutMs());
      if (res.ok) {
        const json = await res.json();
        return assertShape(json);
      }

      const body: any = await res.json().catch(() => ({}));
      const detailCandidate = body && typeof body === 'object' ? (body.detail ?? body) : {};
      const detail: EvalWorkerErrorDetail = typeof detailCandidate === 'object' && detailCandidate
        ? {
            code: typeof detailCandidate.code === 'string' ? detailCandidate.code : `EVAL_WORKER_HTTP_${res.status}`,
            message: detailCandidate.message,
            reason: detailCandidate.reason,
            details: detailCandidate.details,
          }
        : { code: `EVAL_WORKER_HTTP_${res.status}` };

      if (res.status === 400 || res.status === 404 || res.status === 422) {
        throw new EvalWorkerError(res.status, detail);
      }
      lastError = new EvalWorkerError(res.status, detail);
    } catch (err) {
      if (err instanceof EvalWorkerError && (err.status === 400 || err.status === 404 || err.status === 422)) {
        throw err;
      }
      lastError = err;
    }
    if (attempt < DEFAULT_RETRIES) await sleep(BACKOFF_MS);
  }
  if (lastError instanceof EvalWorkerError) throw lastError;
  throw new EvalWorkerError(503, {
    code: 'EVAL_WORKER_UNREACHABLE',
    message: lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown'),
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

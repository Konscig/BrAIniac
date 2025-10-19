export const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL?.replace(/\/+$/, "") || "http://localhost:8080";

type ApiOptions = RequestInit & { skipAuthHeaders?: boolean };

export type ApiError = Error & { status?: number; details?: unknown };

const buildHeaders = (init?: HeadersInit): HeadersInit => {
  const base: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (init instanceof Headers) {
    init.forEach((value, key) => {
      base[key] = value;
    });
    return base;
  }

  if (Array.isArray(init)) {
    for (const [key, value] of init) {
      base[key] = value;
    }
    return base;
  }

  return { ...base, ...(init ?? {}) };
};

export async function apiRequest<TResponse = unknown>(
  path: string,
  options: ApiOptions = {}
): Promise<TResponse> {
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const requestInit: RequestInit = {
    method: options.method ?? "GET",
    headers: buildHeaders(options.headers),
    body: options.body,
    credentials: options.credentials ?? "same-origin"
  };

  const response = await fetch(url, requestInit);

  if (!response.ok) {
    const error: ApiError = new Error("Не удалось выполнить запрос");
    error.status = response.status;
    try {
      error.details = await response.json();
    } catch {
      error.details = await response.text();
    }
    throw error;
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
}

export async function postJson<TResponse = unknown, TPayload = unknown>(
  path: string,
  payload: TPayload,
  options: ApiOptions = {}
): Promise<TResponse> {
  const body = JSON.stringify(payload);
  return apiRequest<TResponse>(path, { ...options, method: "POST", body });
}

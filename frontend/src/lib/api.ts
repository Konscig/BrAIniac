export const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL?.replace(/\/+$/, "") || "http://localhost:8080";

type ApiOptions = RequestInit & { skipAuthHeaders?: boolean };

export type ApiError = Error & { status?: number; details?: unknown };

// Auth token storage key used by AuthProvider
const TOKENS_STORAGE_KEY = "brainiac.tokens";

type StoredTokens = { accessToken?: string; refreshToken?: string } | null;

const getStoredTokens = (): StoredTokens => {
  try {
    const raw = localStorage.getItem(TOKENS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as any;
    const accessToken = parsed?.accessToken ?? parsed?.access_token;
    const refreshToken = parsed?.refreshToken ?? parsed?.refresh_token;
    if (typeof accessToken === "string") {
      return { accessToken, refreshToken };
    }
  } catch {
    /* ignore */
  }
  return null;
};

const buildHeaders = (init?: HeadersInit, includeAuth = true): HeadersInit => {
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

  const merged = { ...base, ...(init ?? {}) } as Record<string, string>;
  if (includeAuth) {
    const tokens = getStoredTokens();
    const token = tokens?.accessToken;
    if (token && !("Authorization" in merged)) {
      merged["Authorization"] = `Bearer ${token}`;
    }
  }
  return merged;
};

export async function apiRequest<TResponse = unknown>(
  path: string,
  options: ApiOptions = {}
): Promise<TResponse> {
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const requestInit: RequestInit = {
    method: options.method ?? "GET",
    headers: buildHeaders(options.headers, !options.skipAuthHeaders),
    body: options.body,
    credentials: options.credentials ?? "same-origin"
  };

  const response = await fetch(url, requestInit);

  if (!response.ok) {
    const error: ApiError = new Error("Не удалось выполнить запрос");
    error.status = response.status;

    const raw = await response.text().catch(() => "");
    try {
      error.details = raw ? JSON.parse(raw) : undefined;
    } catch {
      error.details = raw;
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

export async function patchJson<TResponse = unknown, TPayload = unknown>(
  path: string,
  payload: TPayload,
  options: ApiOptions = {}
): Promise<TResponse> {
  const body = JSON.stringify(payload);
  return apiRequest<TResponse>(path, { ...options, method: "PATCH", body });
}

export async function putJson<TResponse = unknown, TPayload = unknown>(
  path: string,
  payload: TPayload,
  options: ApiOptions = {}
): Promise<TResponse> {
  const body = JSON.stringify(payload);
  return apiRequest<TResponse>(path, { ...options, method: "PUT", body });
}

export async function deleteRequest(path: string, options: ApiOptions = {}): Promise<void> {
  await apiRequest(path, { ...options, method: "DELETE" });
}

export type EnvironmentModeApi =
  | "ENVIRONMENT_MODE_TEST"
  | "ENVIRONMENT_MODE_HYBRID"
  | "ENVIRONMENT_MODE_REAL";

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
}

export interface PipelineSummary {
  id: string;
  name: string;
  description: string;
  version?: number;
}

export type PipelineNodeCategory = "LLM" | "Data" | "Services" | "Utility";

export interface PipelineNodeDto {
  id: string;
  key: string;
  label: string;
  category: PipelineNodeCategory;
  status: string;
  type: string;
  positionX: number;
  positionY: number;
  configJson: string;
}

export interface PipelineEdgeDto {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface PipelineGraphResponse {
  nodes: PipelineNodeDto[];
  edges: PipelineEdgeDto[];
}

export interface NodeExecutionResultDto {
  nodeId: string;
  status: string;
  output: string;
}

export interface ExecutePipelineResponse {
  results: NodeExecutionResultDto[];
  finalOutput?: string;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const payload = await apiRequest<ProjectSummary[]>("/projects");
  return payload ?? [];
}

export async function createProject(name: string, description: string): Promise<ProjectSummary> {
  return postJson<ProjectSummary>("/projects", { name, description });
}

export async function listPipelines(projectId: string): Promise<PipelineSummary[]> {
  const payload = await apiRequest<PipelineSummary[]>(
    `/pipelines?projectId=${encodeURIComponent(projectId)}`
  );
  return payload ?? [];
}

export async function createPipeline(
  projectId: string,
  name: string,
  description: string
): Promise<PipelineSummary> {
  return postJson<PipelineSummary>(`/pipelines`, { projectId, name, description });
}

export async function deleteProject(projectId: string): Promise<void> {
  return deleteRequest(`/projects/${projectId}`);
}

export async function updateProject(projectId: string, name: string, description?: string) {
  return putJson(`/projects/${projectId}`, { name, description });
}

// Backend types
type Pipeline = { id: string; projectId: string; name: string; description: string; lastPublishedVersionId?: string | null };
type PipelineVersion = { id: string; pipelineId: string; number: number; authorId?: string | null; state: string };

const versionCache = new Map<string, string>(); // key: `${pipelineId}|${mode}` -> versionId

async function resolveVersionId(pipelineId: string, mode: EnvironmentModeApi): Promise<string | null> {
  const cacheKey = `${pipelineId}|${mode}`;
  const cached = versionCache.get(cacheKey);
  if (cached) return cached;

  const pipeline = await apiRequest<Pipeline>(`/pipelines/${pipelineId}`);
  const versions = await apiRequest<PipelineVersion[]>(`/pipeline-versions?pipelineId=${encodeURIComponent(pipelineId)}`);

  // helper to find latest by state
  const byState = (state: string) => versions.filter(v => (v.state || '').toLowerCase() === state.toLowerCase()).sort((a,b)=>b.number - a.number);

  if (mode === "ENVIRONMENT_MODE_REAL") {
    // Prefer lastPublishedVersionId
    if (pipeline.lastPublishedVersionId) {
      versionCache.set(cacheKey, pipeline.lastPublishedVersionId);
      return pipeline.lastPublishedVersionId;
    }
    const published = byState('published')[0];
    if (published) {
      versionCache.set(cacheKey, published.id);
      return published.id;
    }
    // fallback to draft
    const draft = byState('draft')[0];
    if (draft) {
      versionCache.set(cacheKey, draft.id);
      return draft.id;
    }
    // No published, no draft -> create draft
    const number = (versions.map(v => v.number).sort((a,b)=>b-a)[0] ?? 0) + 1;
    const created = await postJson<PipelineVersion>(`/pipeline-versions`, { pipelineId, number, state: 'draft' });
    versionCache.set(cacheKey, created.id);
    return created.id;
  }

  // TEST or HYBRID -> use latest draft
  const draft = byState('draft')[0];
  if (draft) {
    versionCache.set(cacheKey, draft.id);
    return draft.id;
  }
  // Create first draft when none exists
  const number = (versions.map(v => v.number).sort((a,b)=>b-a)[0] ?? 0) + 1;
  const created = await postJson<PipelineVersion>(`/pipeline-versions`, { pipelineId, number, state: 'draft' });
  versionCache.set(cacheKey, created.id);
  return created.id;
}

export async function getPipelineGraph(
  projectId: string,
  pipelineId: string,
  mode: EnvironmentModeApi
): Promise<PipelineGraphResponse> {
  // Resolve versionId based on mode
  const versionId = await resolveVersionId(pipelineId, mode);
  if (!versionId) {
    return { nodes: [], edges: [] };
  }
  // Fetch nodes and edges by version
  const [nodes, edges] = await Promise.all([
    apiRequest<any[]>(`/nodes?versionId=${encodeURIComponent(versionId)}`),
    apiRequest<any[]>(`/edges?versionId=${encodeURIComponent(versionId)}`)
  ]);

  // Map backend shapes to frontend DTOs
  const mappedNodes: PipelineNodeDto[] = (nodes || []).map((n: any) => ({
    id: n.id,
    key: n.key,
    label: n.label,
    category: n.category,
    status: n.status ?? "idle",
    type: n.type,
    positionX: Number.isFinite(n.positionX) ? n.positionX : 0,
    positionY: Number.isFinite(n.positionY) ? n.positionY : 0,
    configJson: typeof n.configJson === 'string' ? n.configJson : JSON.stringify(n.configJson ?? {})
  }));

  const mappedEdges: PipelineEdgeDto[] = (edges || []).map((e: any) => ({
    id: e.id,
    source: e.fromNode,
    target: e.toNode,
    label: e.label ?? ''
  }));

  return { nodes: mappedNodes, edges: mappedEdges };
}

export interface CreatePipelineNodePayload {
  label: string;
  type: string;
  category: PipelineNodeCategory;
  status?: string;
  positionX: number;
  positionY: number;
  configJson?: string;
}

export async function createPipelineNode(
  projectId: string,
  pipelineId: string,
  payload: CreatePipelineNodePayload
): Promise<PipelineNodeDto> {
  // Ensure versionId
  const versionId = await resolveVersionId(pipelineId, "ENVIRONMENT_MODE_TEST");
  if (!versionId) throw new Error("Не найден черновик версии пайплайна");
  const key = (payload.label || "node").toLowerCase().replace(/[^a-z0-9]+/gi, "-") + "-" + Math.random().toString(36).slice(2, 8);
  const body = {
    versionId,
    key,
    label: payload.label,
    category: payload.category,
    type: payload.type,
    status: payload.status ?? 'idle',
    positionX: payload.positionX,
    positionY: payload.positionY,
    configJson: payload.configJson ? JSON.parse(payload.configJson) : {}
  };
  const n = await postJson<any>(`/nodes`, body);
  return {
    id: n.id,
    key: n.key,
    label: n.label,
    category: n.category,
    status: n.status ?? 'idle',
    type: n.type,
    positionX: Number.isFinite(n.positionX) ? n.positionX : 0,
    positionY: Number.isFinite(n.positionY) ? n.positionY : 0,
    configJson: typeof n.configJson === 'string' ? n.configJson : JSON.stringify(n.configJson ?? {})
  };
}

export interface UpdatePipelineNodePayload extends CreatePipelineNodePayload {
  nodeId: string;
}

export async function updatePipelineNode(
  projectId: string,
  pipelineId: string,
  payload: UpdatePipelineNodePayload
): Promise<PipelineNodeDto> {
  const { nodeId, ...rest } = payload;
  const body: any = {
    label: rest.label,
    category: rest.category,
    type: rest.type,
    status: rest.status,
    positionX: rest.positionX,
    positionY: rest.positionY,
    configJson: rest.configJson ? JSON.parse(rest.configJson) : undefined
  };
  const n = await putJson<any>(`/nodes/${nodeId}`, body); // <-- был patchJson
  return {
    id: n.id,
    key: n.key,
    label: n.label,
    category: n.category,
    status: n.status ?? 'idle',
    type: n.type,
    positionX: Number.isFinite(n.positionX) ? n.positionX : 0,
    positionY: Number.isFinite(n.positionY) ? n.positionY : 0,
    configJson: typeof n.configJson === 'string' ? n.configJson : JSON.stringify(n.configJson ?? {})
  };
}

export async function deletePipelineNode(
  projectId: string,
  pipelineId: string,
  nodeId: string
): Promise<void> {
  await deleteRequest(`/nodes/${nodeId}`);
}

export interface CreatePipelineEdgePayload {
  source: string;
  target: string;
  label?: string;
}

export async function createPipelineEdge(
  projectId: string,
  pipelineId: string,
  payload: CreatePipelineEdgePayload
): Promise<PipelineEdgeDto> {
  const versionId = await resolveVersionId(pipelineId, "ENVIRONMENT_MODE_TEST");
  if (!versionId) throw new Error("Не найдена версия пайплайна для создания связи");
  const body = { versionId, fromNode: payload.source, toNode: payload.target, label: payload.label ?? '' };
  const e = await postJson<any>(`/edges`, body);
  return { id: e.id, source: e.fromNode, target: e.toNode, label: e.label ?? '' };
}

export async function deletePipelineEdge(
  projectId: string,
  pipelineId: string,
  edgeId: string
): Promise<void> {
  await deleteRequest(`/edges/${edgeId}`);
}

export async function publishPipelineVersion(
  projectId: string,
  pipelineId: string,
  notes?: string
): Promise<{ versionId: string; versionNumber: number }> {
  // Placeholder: not supported by current backend routes. Returning draft version if exists.
  const versionId = await resolveVersionId(pipelineId, "ENVIRONMENT_MODE_TEST");
  if (!versionId) throw new Error("Публикация не поддерживается: нет черновика");
  return { versionId, versionNumber: 0 };
}

export async function executePipeline(
  projectId: string,
  pipelineId: string,
  mode: EnvironmentModeApi,
  triggerInput?: string
): Promise<ExecutePipelineResponse> {
  // Not implemented on backend; stubbed for now
  return { results: [], finalOutput: undefined };
}

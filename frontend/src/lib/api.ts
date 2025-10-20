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

export async function patchJson<TResponse = unknown, TPayload = unknown>(
  path: string,
  payload: TPayload,
  options: ApiOptions = {}
): Promise<TResponse> {
  const body = JSON.stringify(payload);
  return apiRequest<TResponse>(path, { ...options, method: "PATCH", body });
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
  version: number;
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
  const payload = await apiRequest<{ projects: ProjectSummary[] }>("/v1/projects");
  return payload.projects ?? [];
}

export async function createProject(name: string, description: string): Promise<ProjectSummary> {
  return postJson<ProjectSummary>("/v1/projects", { name, description });
}

export async function listPipelines(projectId: string): Promise<PipelineSummary[]> {
  const payload = await apiRequest<{ pipelines: PipelineSummary[] }>(
    `/v1/projects/${projectId}/pipelines`
  );
  return payload.pipelines ?? [];
}

export async function createPipeline(
  projectId: string,
  name: string,
  description: string
): Promise<PipelineSummary> {
  return postJson<PipelineSummary>(`/v1/projects/${projectId}/pipelines`, {
    projectId,
    name,
    description
  });
}

export async function getPipelineGraph(
  projectId: string,
  pipelineId: string,
  mode: EnvironmentModeApi
): Promise<PipelineGraphResponse> {
  const params = new URLSearchParams({ mode });
  return apiRequest<PipelineGraphResponse>(
    `/v1/projects/${projectId}/pipelines/${pipelineId}/graph?${params.toString()}`
  );
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
  return postJson<PipelineNodeDto>(
    `/v1/projects/${projectId}/pipelines/${pipelineId}/nodes`,
    payload
  );
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
  return patchJson<PipelineNodeDto>(
    `/v1/projects/${projectId}/pipelines/${pipelineId}/nodes/${nodeId}`,
    rest
  );
}

export async function deletePipelineNode(
  projectId: string,
  pipelineId: string,
  nodeId: string
): Promise<void> {
  await deleteRequest(`/v1/projects/${projectId}/pipelines/${pipelineId}/nodes/${nodeId}`);
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
  return postJson<PipelineEdgeDto>(
    `/v1/projects/${projectId}/pipelines/${pipelineId}/edges`,
    payload
  );
}

export async function deletePipelineEdge(
  projectId: string,
  pipelineId: string,
  edgeId: string
): Promise<void> {
  await deleteRequest(`/v1/projects/${projectId}/pipelines/${pipelineId}/edges/${edgeId}`);
}

export async function publishPipelineVersion(
  projectId: string,
  pipelineId: string,
  notes?: string
): Promise<{ versionId: string; versionNumber: number }> {
  return postJson<{ versionId: string; versionNumber: number }>(
    `/v1/projects/${projectId}/pipelines/${pipelineId}/versions:publish`,
    { notes }
  );
}

export async function executePipeline(
  projectId: string,
  pipelineId: string,
  mode: EnvironmentModeApi,
  triggerInput?: string
): Promise<ExecutePipelineResponse> {
  return postJson<ExecutePipelineResponse>(
    `/v1/projects/${projectId}/pipelines/${pipelineId}:execute`,
    { mode, triggerInput }
  );
}

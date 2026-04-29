export const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL?.replace(/\/+$/, "") || "http://localhost:3000";

type ApiOptions = RequestInit & { skipAuthHeaders?: boolean };

export type ApiError = Error & { status?: number; details?: unknown };

const TOKENS_STORAGE_KEY = "brainiac.tokens";
const DEFAULT_PIPELINE_LIMITS = {
  max_time: 120,
  max_cost: 100,
  max_reject: 0.15
} as const;

type StoredTokens = { accessToken?: string; refreshToken?: string } | null;

const getStoredTokens = (): StoredTokens => {
  try {
    const raw = localStorage.getItem(TOKENS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const accessToken = parsed.accessToken ?? parsed.access_token;
    const refreshToken = parsed.refreshToken ?? parsed.refresh_token;
    if (typeof accessToken === "string") {
      return {
        accessToken,
        refreshToken: typeof refreshToken === "string" ? refreshToken : undefined
      };
    }
  } catch {
    /* ignore malformed storage */
  }

  return null;
};

const buildHeaders = (init?: HeadersInit, includeAuth = true): HeadersInit => {
  const headers: Record<string, string> = {};

  if (init instanceof Headers) {
    init.forEach((value, key) => {
      headers[key] = value;
    });
  } else if (Array.isArray(init)) {
    for (const [key, value] of init) {
      headers[key] = value;
    }
  } else if (init) {
    Object.assign(headers, init);
  }

  if (includeAuth) {
    const accessToken = getStoredTokens()?.accessToken;
    if (accessToken && !headers.Authorization) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
  }

  return headers;
};

const withJsonContentType = (headers: HeadersInit): HeadersInit => {
  if (headers instanceof Headers) {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return headers;
  }

  if (Array.isArray(headers)) {
    const hasContentType = headers.some(([key]) => key.toLowerCase() === "content-type");
    return hasContentType ? headers : [...headers, ["Content-Type", "application/json"]];
  }

  if ("Content-Type" in (headers as Record<string, string>) || "content-type" in (headers as Record<string, string>)) {
    return headers;
  }

  return {
    ...(headers as Record<string, string>),
    "Content-Type": "application/json"
  };
};

const extractApiErrorMessage = (details: unknown): string | null => {
  if (!details || typeof details !== "object") return null;

  const record = details as Record<string, unknown>;
  const candidates = [record.message, record.error];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
};

export async function apiRequest<TResponse = unknown>(
  path: string,
  options: ApiOptions = {}
): Promise<TResponse> {
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: buildHeaders(options.headers, !options.skipAuthHeaders),
    body: options.body,
    credentials: options.credentials ?? "same-origin"
  });

  if (!response.ok) {
    const error: ApiError = new Error("Не удалось выполнить запрос");
    error.status = response.status;

    const raw = await response.text().catch(() => "");
    try {
      error.details = raw ? JSON.parse(raw) : undefined;
    } catch {
      error.details = raw;
    }

    const message = extractApiErrorMessage(error.details);
    if (message) {
      error.message = message;
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
  return apiRequest<TResponse>(path, {
    ...options,
    method: "POST",
    headers: withJsonContentType(buildHeaders(options.headers, !options.skipAuthHeaders)),
    body: JSON.stringify(payload)
  });
}

export async function putJson<TResponse = unknown, TPayload = unknown>(
  path: string,
  payload: TPayload,
  options: ApiOptions = {}
): Promise<TResponse> {
  return apiRequest<TResponse>(path, {
    ...options,
    method: "PUT",
    headers: withJsonContentType(buildHeaders(options.headers, !options.skipAuthHeaders)),
    body: JSON.stringify(payload)
  });
}

export async function deleteRequest(path: string, options: ApiOptions = {}): Promise<void> {
  await apiRequest(path, {
    ...options,
    method: "DELETE"
  });
}

export type JsonRecord = Record<string, unknown>;

export interface ProjectRecord {
  project_id: number;
  fk_user_id: number;
  name: string;
}

export interface PipelineRecord {
  pipeline_id: number;
  fk_project_id: number;
  name: string;
  max_time: number;
  max_cost: number;
  max_reject: number;
  score?: number | null;
  report_json?: unknown;
}

export interface NodeRecord {
  node_id: number;
  fk_pipeline_id: number;
  fk_type_id: number;
  fk_sub_pipeline: number | null;
  top_k: number;
  ui_json: JsonRecord;
  output_json?: unknown;
}

export interface EdgeRecord {
  edge_id: number;
  fk_from_node: number;
  fk_to_node: number;
}

export interface ToolRecord {
  tool_id: number;
  name: string;
  config_json: JsonRecord;
}

export interface NodeTypeRecord {
  type_id: number;
  fk_tool_id: number;
  name: string;
  desc: string;
  config_json?: JsonRecord | null;
}

export interface DatasetRecord {
  dataset_id: number;
  fk_pipeline_id: number;
  uri: string;
  desc: string | null;
}

export interface GraphDiagnostic {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface GraphValidationMetrics {
  nodeCount: number;
  edgeCount: number;
  maxInDegree: number;
  maxOutDegree: number;
  cycleCount: number;
  guardedCycleCount: number;
  unguardedCycleCount: number;
  estimatedMaxSteps: number;
  startNodeCount: number;
  endNodeCount: number;
}

export interface GraphValidationResult {
  valid: boolean;
  errors: GraphDiagnostic[];
  warnings: GraphDiagnostic[];
  metrics: GraphValidationMetrics;
}

export type ExecutionStatus = "queued" | "running" | "succeeded" | "failed";

export interface ExecutionSummary {
  status: "succeeded" | "failed";
  steps_used: number;
  cost_units_used: number;
  duration_ms: number;
  node_total: number;
  node_completed: number;
  node_failed: number;
  node_skipped: number;
}

export interface ExecutionFinalResult {
  node_id: number;
  node_type: string;
  status: "completed" | "failed" | "skipped";
  text?: string;
  output_preview?: string;
}

export interface ExecutionSnapshot {
  execution_id: string;
  pipeline_id: number;
  status: ExecutionStatus;
  created_at: string;
  updated_at: string;
  started_at?: string;
  finished_at?: string;
  idempotency_key?: string;
  request: {
    preset?: "default" | "dev" | "production";
    dataset_id?: number;
    input_json?: unknown;
  };
  preflight?: GraphValidationResult;
  summary?: ExecutionSummary;
  final_result?: ExecutionFinalResult;
  warnings?: string[];
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface UploadDatasetPayload {
  fk_pipeline_id: number;
  filename: string;
  content_base64: string;
  mime_type?: string;
  desc?: string;
}

export interface CreateProjectPayload {
  name: string;
}

export interface CreatePipelinePayload {
  fk_project_id: number;
  name: string;
  max_time?: number;
  max_cost?: number;
  max_reject?: number;
}

export interface CreateNodePayload {
  fk_pipeline_id: number;
  fk_type_id: number;
  top_k?: number;
  ui_json: JsonRecord;
  fk_sub_pipeline?: number;
}

export interface UpdateNodePayload {
  fk_type_id?: number;
  top_k?: number;
  ui_json?: JsonRecord;
  fk_sub_pipeline?: number | null;
}

export interface CreateEdgePayload {
  fk_from_node: number;
  fk_to_node: number;
}

export interface StartExecutionPayload {
  preset?: "default" | "dev" | "production";
  dataset_id?: number;
  input_json?: unknown;
}

export function listProjects(): Promise<ProjectRecord[]> {
  return apiRequest<ProjectRecord[]>("/projects");
}

export function createProject(payload: CreateProjectPayload): Promise<ProjectRecord> {
  return postJson<ProjectRecord>("/projects", payload);
}

export function updateProject(projectId: number, payload: CreateProjectPayload): Promise<ProjectRecord> {
  return putJson<ProjectRecord>(`/projects/${projectId}`, payload);
}

export function deleteProject(projectId: number): Promise<void> {
  return deleteRequest(`/projects/${projectId}`);
}

export function listPipelines(projectId: number): Promise<PipelineRecord[]> {
  return apiRequest<PipelineRecord[]>(`/pipelines?fk_project_id=${encodeURIComponent(String(projectId))}`);
}

export function getPipeline(pipelineId: number): Promise<PipelineRecord> {
  return apiRequest<PipelineRecord>(`/pipelines/${pipelineId}`);
}

export function createPipeline(payload: CreatePipelinePayload): Promise<PipelineRecord> {
  return postJson<PipelineRecord>("/pipelines", {
    fk_project_id: payload.fk_project_id,
    name: payload.name,
    max_time: payload.max_time ?? DEFAULT_PIPELINE_LIMITS.max_time,
    max_cost: payload.max_cost ?? DEFAULT_PIPELINE_LIMITS.max_cost,
    max_reject: payload.max_reject ?? DEFAULT_PIPELINE_LIMITS.max_reject
  });
}

export function updatePipeline(
  pipelineId: number,
  payload: Partial<CreatePipelinePayload>
): Promise<PipelineRecord> {
  return putJson<PipelineRecord>(`/pipelines/${pipelineId}`, payload);
}

export function deletePipeline(pipelineId: number): Promise<void> {
  return deleteRequest(`/pipelines/${pipelineId}`);
}

export function listNodeTypes(): Promise<NodeTypeRecord[]> {
  return apiRequest<NodeTypeRecord[]>("/node-types");
}

export function listTools(): Promise<ToolRecord[]> {
  return apiRequest<ToolRecord[]>("/tools");
}

export function listNodes(pipelineId: number): Promise<NodeRecord[]> {
  return apiRequest<NodeRecord[]>(`/nodes?fk_pipeline_id=${encodeURIComponent(String(pipelineId))}`);
}

export function createNode(payload: CreateNodePayload): Promise<NodeRecord> {
  return postJson<NodeRecord>("/nodes", {
    fk_pipeline_id: payload.fk_pipeline_id,
    fk_type_id: payload.fk_type_id,
    top_k: payload.top_k ?? 1,
    ui_json: payload.ui_json,
    ...(payload.fk_sub_pipeline !== undefined ? { fk_sub_pipeline: payload.fk_sub_pipeline } : {})
  });
}

export function updateNode(nodeId: number, payload: UpdateNodePayload): Promise<NodeRecord> {
  return putJson<NodeRecord>(`/nodes/${nodeId}`, payload);
}

export function deleteNode(nodeId: number): Promise<void> {
  return deleteRequest(`/nodes/${nodeId}`);
}

export function listEdges(pipelineId: number): Promise<EdgeRecord[]> {
  return apiRequest<EdgeRecord[]>(`/edges?fk_pipeline_id=${encodeURIComponent(String(pipelineId))}`);
}

export function createEdge(payload: CreateEdgePayload): Promise<EdgeRecord> {
  return postJson<EdgeRecord>("/edges", payload);
}

export function deleteEdge(edgeId: number): Promise<void> {
  return deleteRequest(`/edges/${edgeId}`);
}

export function listDatasets(pipelineId: number): Promise<DatasetRecord[]> {
  return apiRequest<DatasetRecord[]>(`/datasets?fk_pipeline_id=${encodeURIComponent(String(pipelineId))}`);
}

export function uploadDataset(payload: UploadDatasetPayload): Promise<DatasetRecord> {
  return postJson<DatasetRecord>("/datasets/upload", payload);
}

export function deleteDataset(datasetId: number): Promise<void> {
  return deleteRequest(`/datasets/${datasetId}`);
}

export function validatePipelineGraph(
  pipelineId: number,
  preset: "default" | "dev" | "production" = "default"
): Promise<GraphValidationResult> {
  return postJson<GraphValidationResult>(`/pipelines/${pipelineId}/validate-graph`, {
    preset
  });
}

export function startPipelineExecution(
  pipelineId: number,
  payload: StartExecutionPayload,
  idempotencyKey?: string
): Promise<ExecutionSnapshot> {
  const headers = idempotencyKey ? { "x-idempotency-key": idempotencyKey } : undefined;
  return postJson<ExecutionSnapshot>(`/pipelines/${pipelineId}/execute`, payload, { headers });
}

export function getPipelineExecution(
  pipelineId: number,
  executionId: string
): Promise<ExecutionSnapshot> {
  return apiRequest<ExecutionSnapshot>(`/pipelines/${pipelineId}/executions/${executionId}`);
}

export function buildQuestionInput(question: string): { question: string; user_query: string } {
  return {
    question,
    user_query: question
  };
}

export function isExecutionTerminal(status: ExecutionStatus): boolean {
  return status === "succeeded" || status === "failed";
}

export function readNodeLabel(node: NodeRecord): string {
  const raw = node.ui_json?.label;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : `Узел ${node.node_id}`;
}

export function readNodePosition(node: NodeRecord): { x: number; y: number } {
  const x = Number(node.ui_json?.x);
  const y = Number(node.ui_json?.y);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0
  };
}

export type ProjectSummary = ProjectRecord;
export type PipelineSummary = PipelineRecord;
export type PipelineNodeDto = NodeRecord;
export type PipelineEdgeDto = EdgeRecord;
export type PipelineGraphResponse = { nodes: NodeRecord[]; edges: EdgeRecord[] };
export type NodeExecutionResultDto = { nodeId: string; status: string; output: string };
export type ExecutePipelineResponse = ExecutionSnapshot;
export type PipelineNodeCategory = "Source" | "Transform" | "Control" | "Sink";

// --- Judge Chat ---

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface JudgeChatRequest {
  pipeline_id: number;
  message: string;
  history?: ChatMessage[];
  focused_node_id?: number;
}

export interface JudgeChatResponse {
  reply: string;
  tool_calls_used: string[];
}

export function judgeChat(req: JudgeChatRequest): Promise<JudgeChatResponse> {
  return postJson<JudgeChatResponse>("/judge/chat", req);
}

export interface AssessmentReport {
  pipeline_id: number;
  final_score: number;
  verdict: "pass" | "improvement" | "fail";
  weight_profile: string;
  weights_used: Record<string, number>;
  metric_scores: Array<{
    metric_code: string;
    axis: string;
    value: number;
    sample_size: number;
    executor: string;
  }>;
  per_node: Array<{
    node_id: number;
    node_type: string;
    metrics: Array<{ metric_code: string; axis: string; value: number; sample_size: number; executor: string }>;
  }>;
  skipped_metrics: string[];
  item_count: number;
}

export interface AssessmentItem {
  item_key: string;
  input: Record<string, unknown>;
  agent_output: { text: string; structured_output?: unknown; tool_call_trace?: unknown[] };
  reference?: { answer?: string; rubric?: string; claims?: string[]; relevant_docs?: string[] };
}

export interface AssessmentRequest {
  pipeline_id: number;
  items: AssessmentItem[];
  weight_profile?: string;
}

export function runAssessment(req: AssessmentRequest): Promise<AssessmentReport> {
  return postJson<AssessmentReport>("/judge/assessments", req);
}

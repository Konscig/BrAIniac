const envBaseUrl = process.env.BASE_URL;
const strictOpenRouter = process.env.RAG_E2E_STRICT_OPENROUTER !== '0';
const requestTimeoutMs = Number(process.env.RAG_E2E_HTTP_TIMEOUT_MS || 30000);
const questionTimeoutMs = Number(process.env.RAG_E2E_QUESTION_TIMEOUT_MS || 240000);
const defaultExecutionPolls = Math.ceil(questionTimeoutMs / 1000) + 10;
const maxExecutionPolls = Math.max(10, Number(process.env.RAG_E2E_MAX_POLLS || defaultExecutionPolls));
const strictQuestionRetries = Math.max(1, Number(process.env.RAG_E2E_STRICT_RETRIES || 3));
const strictRetryDelayMs = Math.max(0, Number(process.env.RAG_E2E_STRICT_RETRY_DELAY_MS || 2000));
const ragAgentModel = String(process.env.RAG_E2E_AGENT_MODEL || process.env.OPENROUTER_LLM_MODEL || 'openrouter/auto').trim();
const headers = { 'Content-Type': 'application/json' };

function parseEnvBool(raw, fallback) {
  if (raw === undefined) return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

const profileRaw = String(process.env.RAG_E2E_PROFILE || 'realistic').trim().toLowerCase();
const e2eProfile = profileRaw === 'contract' ? 'contract' : 'realistic';
const overrideToolExecutors = parseEnvBool(process.env.RAG_E2E_FORCE_HEALTH_EXECUTOR, false);

const requiredContractTools = [
  'DocumentLoader',
  'QueryBuilder',
  'Chunker',
  'Embedder',
  'VectorUpsert',
  'HybridRetriever',
  'ContextAssembler',
  'LLMAnswer',
  'CitationFormatter',
];

const questions = [
  'What is the main purpose of Artemis II before future lunar landing missions?',
  'List two high-priority mission risks for long-duration lunar operations.',
  'What is 17 * 23?',
  'Suggest a quick 20-minute dinner idea.',
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(raw) {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function excerpt(raw, max = 220) {
  const text = normalizeText(raw);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function tokenize(raw) {
  return normalizeText(raw)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1);
}

function trimName(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function usageHasPositiveTokens(usage) {
  if (!usage || typeof usage !== 'object') return false;

  const keys = ['total_tokens', 'prompt_tokens', 'completion_tokens', 'input_tokens', 'output_tokens'];
  return keys.some((key) => {
    const value = Number(usage[key]);
    return Number.isFinite(value) && value > 0;
  });
}

function isHealthExecutorConfig(config) {
  const executor = config?.executor && typeof config.executor === 'object' ? config.executor : {};
  const kind = trimName(executor.kind).toLowerCase();
  const url = trimName(executor.url).toLowerCase();

  if (kind !== 'http-json') return false;
  if (!url) return false;
  return /(^|\/)health($|[/?#])/.test(url);
}

function resolveExecutorKind(config) {
  const executor = config?.executor && typeof config.executor === 'object' ? config.executor : {};
  return trimName(executor.kind).toLowerCase();
}

function buildStrictToolConfig(base, toolName, currentConfig) {
  const executor = currentConfig?.executor && typeof currentConfig.executor === 'object' ? currentConfig.executor : {};
  if (toolName === 'Embedder') {
    return {
      ...currentConfig,
      executor: {
        ...executor,
        kind: 'openrouter-embeddings',
      },
    };
  }

  return {
    ...currentConfig,
    executor: {
      ...executor,
      kind: 'http-json',
      method: 'POST',
      url: `${base}/tool-executor/contracts`,
    },
  };
}

function isOk(status) {
  return status >= 200 && status < 300;
}

async function req(base, path, opts = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(base + path, { ...opts, signal: controller.signal });
    const text = await response.text();
    let body = text;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }

    return { status: response.status, body };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`request timeout after ${requestTimeoutMs}ms: ${path}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function mustOk(label, response) {
  if (!isOk(response.status)) {
    throw new Error(`${label} failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body;
}

function toObjectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function ensureAgentCallNodeTypeProfile(base, authHeaders, nodeType, requiredInputMax = 20) {
  if (!nodeType || typeof nodeType !== 'object') return nodeType;

  const config = toObjectRecord(nodeType.config_json);
  const input = toObjectRecord(config.input);
  const output = toObjectRecord(config.output);

  const currentInputMin = Number(input.min);
  const currentInputMax = Number(input.max);
  const currentOutputMin = Number(output.min);
  const currentOutputMax = Number(output.max);

  const nextInputMin = Number.isInteger(currentInputMin) && currentInputMin > 0 ? currentInputMin : 1;
  const nextInputMax = Number.isInteger(currentInputMax) && currentInputMax > 0 ? Math.max(currentInputMax, requiredInputMax) : requiredInputMax;
  const nextOutputMin = 0;
  const nextOutputMax = Number.isInteger(currentOutputMax) && currentOutputMax >= nextOutputMin ? Math.max(currentOutputMax, 1) : 2;

  const shouldUpdate =
    currentInputMin !== nextInputMin ||
    currentInputMax !== nextInputMax ||
    currentOutputMin !== nextOutputMin ||
    currentOutputMax !== nextOutputMax;

  if (!shouldUpdate) return nodeType;

  const updatedConfig = {
    ...config,
    input: {
      ...input,
      min: nextInputMin,
      max: nextInputMax,
    },
    output: {
      ...output,
      min: nextOutputMin,
      max: nextOutputMax,
    },
  };

  const updateResponse = await req(base, `/node-types/${nodeType.type_id}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ config_json: updatedConfig }),
  });

  return mustOk('update AgentCall node type profile', updateResponse);
}

async function withTimeout(url, ms = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveBaseUrl() {
  if (envBaseUrl) {
    const health = await req(envBaseUrl, '/health', { method: 'GET' });
    if (!isOk(health.status)) {
      throw new Error(`BASE_URL is set but unhealthy: ${envBaseUrl}, status=${health.status}`);
    }
    return envBaseUrl;
  }

  const candidates = ['http://localhost:3000', 'http://localhost:8080'];
  for (const candidate of candidates) {
    try {
      const health = await req(candidate, '/health', { method: 'GET' });
      if (isOk(health.status)) return candidate;
    } catch {
      // ignore candidate and try next
    }
  }

  throw new Error('could not resolve BASE_URL automatically; set BASE_URL env var');
}

async function downloadDatasetDocs() {
  const pages = ['Artemis_program', 'Artemis_2', 'Lunar_Gateway', 'Space_radiation'];
  const docs = [];

  for (const page of pages) {
    const apiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page)}`;
    try {
      const response = await withTimeout(apiUrl, 12000);
      if (!response.ok) {
        console.log(`[dataset] skip ${page}: HTTP ${response.status}`);
        continue;
      }

      const json = await response.json();
      const extract = normalizeText(json?.extract ?? '');
      if (!extract) {
        console.log(`[dataset] skip ${page}: empty extract`);
        continue;
      }

      const uri =
        normalizeText(json?.content_urls?.desktop?.page) ||
        normalizeText(json?.content_urls?.mobile?.page) ||
        `https://en.wikipedia.org/wiki/${encodeURIComponent(page)}`;

      const title = normalizeText(json?.title || page.replace(/_/g, ' '));
      docs.push({
        document_id: `wiki_${page.toLowerCase()}`,
        uri,
        text: normalizeText(`${title}. ${extract}`),
      });
      console.log(`[dataset] downloaded ${title}`);
    } catch (error) {
      console.log(`[dataset] skip ${page}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (docs.length > 0) {
    return docs;
  }

  console.log('[dataset] external download failed, using built-in fallback corpus');
  return [
    {
      document_id: 'fallback_artemis_overview',
      uri: 'https://www.nasa.gov/humans-in-space/artemis/',
      text:
        'NASA Artemis is a long-term lunar exploration program. Artemis II is planned as the first crewed Orion mission around the Moon, validating life support, navigation, and deep-space operations before later landing missions.',
    },
    {
      document_id: 'fallback_artemis_risks',
      uri: 'https://www.nasa.gov/humans-in-space/',
      text:
        'Long-duration lunar missions face radiation exposure, communication delays, logistics constraints, and psychological stress. Mitigation includes shielding, redundancy, crew training, and robust mission procedures.',
    },
    {
      document_id: 'fallback_crew_training',
      uri: 'https://www.nasa.gov/missions/artemis/artemis-ii/',
      text:
        'Artemis crew training includes emergency simulations, autonomy drills, and cross-disciplinary mission rehearsal under uncertain and time-constrained conditions.',
    },
  ];
}

function buildChunks(documents, wordsPerChunk = 26) {
  const chunks = [];

  for (const doc of documents) {
    const words = normalizeText(doc.text)
      .split(' ')
      .filter(Boolean);

    let cursor = 0;
    let order = 1;
    while (cursor < words.length) {
      const window = words.slice(cursor, cursor + wordsPerChunk);
      if (window.length === 0) break;

      chunks.push({
        chunk_id: `${doc.document_id}_chunk_${order}`,
        document_id: doc.document_id,
        text: window.join(' '),
      });

      order += 1;
      cursor += Math.max(8, Math.floor(wordsPerChunk * 0.7));
      if (chunks.length >= 120) break;
    }

    if (chunks.length >= 120) break;
  }

  return chunks;
}

function makeVector(text, size = 8) {
  const vector = new Array(size).fill(0);
  const source = normalizeText(text);
  if (!source) return vector;

  for (let i = 0; i < source.length; i += 1) {
    const slot = i % size;
    vector[slot] += ((source.charCodeAt(i) % 97) + 1) / 97;
  }

  return vector.map((value) => Number((value / source.length).toFixed(6)));
}

function scoreCandidate(question, chunkText) {
  const q = new Set(tokenize(question));
  if (q.size === 0) return 0.01;

  const c = new Set(tokenize(chunkText));
  let overlap = 0;
  for (const token of q) {
    if (c.has(token)) overlap += 1;
  }

  return overlap / q.size;
}

function selectCandidates(question, chunks, topK = 6) {
  return chunks
    .map((chunk) => ({
      document_id: chunk.document_id,
      chunk_id: chunk.chunk_id,
      snippet: excerpt(chunk.text, 180),
      score: Number(scoreCandidate(question, chunk.text).toFixed(3)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((candidate, index) => ({
      ...candidate,
      score: Number((Math.max(candidate.score, 0.05) + (topK - index) * 0.01).toFixed(3)),
    }));
}

function toNodeOutput(node) {
  return node?.output_json?.data ?? node?.output_json ?? null;
}

function getNodeErrorCode(reportNode) {
  if (!reportNode) return '';
  if (typeof reportNode?.error?.code === 'string') return reportNode.error.code;
  if (typeof reportNode?.error?.details?.code === 'string') return reportNode.error.details.code;
  return '';
}

function getNodeErrorHttpStatus(reportNode) {
  const candidates = [
    reportNode?.error?.status,
    reportNode?.error?.details?.status,
    reportNode?.error?.details?.details?.status,
    reportNode?.error?.details?.details?.http_status,
  ];

  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }

  return null;
}

function isSoftOpenRouterFailure(reportNode) {
  const code = getNodeErrorCode(reportNode);
  if (code === 'OPENROUTER_UNAVAILABLE') {
    return true;
  }

  if (code === 'OPENROUTER_UPSTREAM_ERROR') {
    const status = getNodeErrorHttpStatus(reportNode);
    if (status === 429) {
      return true;
    }
  }

  return false;
}

function fail(msg, details) {
  console.error('[rag-e2e] FAIL:', msg);
  if (details !== undefined) {
    console.error(typeof details === 'string' ? details : JSON.stringify(details, null, 2));
  }
  process.exit(2);
}

function withQuestionTimeout(promise, questionIndex, questionText) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`question timeout after ${questionTimeoutMs}ms on Q${questionIndex + 1}: ${questionText}`));
    }, questionTimeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timer);
  });
}

function isRetryableStrictProviderError(error) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const markers = [
    'strict mode requires non-empty AgentCall provider model',
    'strict mode requires AgentCall provider_response_id evidence',
    'strict mode requires positive AgentCall usage token evidence',
    'strict mode does not allow AgentCall provider_soft_failure',
    'strict mode requires AgentCall provider_calls_attempted > 0',
  ];

  return markers.some((marker) => message.includes(marker));
}

async function loadExecutionReportNodes(base, authHeaders, pipelineId, executionId, questionLabel) {
  let lastExecutionSnapshot = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const executionResponse = await req(base, `/pipelines/${pipelineId}/executions/${executionId}`, {
      method: 'GET',
      headers: authHeaders,
    });
    lastExecutionSnapshot = mustOk(`poll execution report ${questionLabel}`, executionResponse);

    const reportNodes = Array.isArray(lastExecutionSnapshot?.report_json?.nodes) ? lastExecutionSnapshot.report_json.nodes : [];
    if (reportNodes.length > 0) {
      return { reportNodes, reportSource: 'execution', executionSnapshot: lastExecutionSnapshot };
    }

    await sleep(500);
  }

  const pipelineResponse = await req(base, `/pipelines/${pipelineId}`, { method: 'GET', headers: authHeaders });
  const pipelineBody = mustOk(`get pipeline report ${questionLabel}`, pipelineResponse);
  const fallbackNodes = Array.isArray(pipelineBody?.report_json?.nodes) ? pipelineBody.report_json.nodes : [];

  return {
    reportNodes: fallbackNodes,
    reportSource: 'pipeline-fallback',
    executionSnapshot: lastExecutionSnapshot,
  };
}

function assertStrictToolOutput(toolName, output) {
  if (!output || typeof output !== 'object') {
    throw new Error(`strict mode requires non-empty output for ${toolName}`);
  }

  const executor = trimName(output.executor).toLowerCase();
  if (toolName === 'Embedder') {
    if (executor !== 'openrouter-embeddings') {
      throw new Error(`strict mode requires openrouter-embeddings executor for ${toolName}`);
    }

    const embedderModel = trimName(output.model);
    if (!embedderModel) {
      throw new Error(`strict mode requires non-empty model for ${toolName}`);
    }

    const embeddings = Array.isArray(output.embeddings) ? output.embeddings : [];
    if (embeddings.length <= 0) {
      throw new Error(`strict mode requires non-empty embeddings for ${toolName}`);
    }

    return;
  }

  if (executor !== 'http-json') {
    throw new Error(`strict mode requires http-json executor for ${toolName}`);
  }

  const status = Number(output.status);
  if (!isOk(status)) {
    throw new Error(`strict mode requires successful HTTP status for ${toolName}, got ${output.status}`);
  }

  const response = output.response && typeof output.response === 'object' ? output.response : null;
  if (!response) {
    throw new Error(`strict mode requires response payload for ${toolName}`);
  }

  if (trimName(response.executor) !== 'backend-contract-http-json') {
    throw new Error(`strict mode requires backend-contract-http-json provenance for ${toolName}`);
  }

  if (trimName(response.contract_name) !== toolName) {
    throw new Error(`strict mode requires matching contract_name for ${toolName}`);
  }

  const responseContractOutput = response.contract_output && typeof response.contract_output === 'object' ? response.contract_output : null;
  if (!responseContractOutput) {
    throw new Error(`strict mode requires response.contract_output provenance for ${toolName}`);
  }
}

async function createAuth(base) {
  const suffix = Date.now();
  const email = `rag-e2e-${suffix}@local`;
  const password = 'pwd';

  let response = await req(base, '/auth/signup', {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password }),
  });
  mustOk('signup', response);

  response = await req(base, '/auth/login', {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password }),
  });
  const login = mustOk('login', response);

  return {
    authHeaders: { ...headers, Authorization: `Bearer ${login.accessToken}` },
    email,
  };
}

async function ensureContractToolExecutors(base, authHeaders) {
  const response = await req(base, '/tools', { method: 'GET', headers: authHeaders });
  const tools = mustOk('list tools', response);

  const byName = new Map(tools.map((tool) => [trimName(tool.name), tool]));
  for (const name of requiredContractTools) {
    const tool = byName.get(name);
    if (!tool) {
      throw new Error(`required contract tool missing: ${name}`);
    }

    const currentConfig = tool.config_json && typeof tool.config_json === 'object' ? tool.config_json : {};

    if (!overrideToolExecutors) {
      if (!strictOpenRouter) continue;

      const strictConfig = buildStrictToolConfig(base, name, currentConfig);
      const strictKind = resolveExecutorKind(strictConfig);
      const currentKind = resolveExecutorKind(currentConfig);
      const requiresUpdate =
        isHealthExecutorConfig(currentConfig) ||
        (name === 'Embedder' ? strictKind !== currentKind : true);

      if (requiresUpdate) {
        const updateResponse = await req(base, `/tools/${tool.tool_id}`, {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify({ config_json: strictConfig }),
        });
        mustOk(`strict tool config ${name}`, updateResponse);
      }

      continue;
    }

    if (overrideToolExecutors) {
      const updatedConfig = {
        ...currentConfig,
        executor: {
          ...(currentConfig.executor && typeof currentConfig.executor === 'object' ? currentConfig.executor : {}),
          kind: 'http-json',
          method: 'GET',
          url: `${base}/health`,
        },
      };

      const updateResponse = await req(base, `/tools/${tool.tool_id}`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ config_json: updatedConfig }),
      });
      mustOk(`update tool ${name}`, updateResponse);
    }
  }

  return byName;
}

async function createProjectPipelineDataset(base, authHeaders, docs) {
  const suffix = Date.now();

  let response = await req(base, '/projects', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: `rag-e2e-project-${suffix}` }),
  });
  const project = mustOk('create project', response);

  response = await req(base, '/pipelines', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_project_id: project.project_id,
      name: `rag-e2e-pipeline-${suffix}`,
      max_time: 300,
      max_cost: 600,
      max_reject: 0.2,
      report_json: {},
    }),
  });
  const pipeline = mustOk('create pipeline', response);

  response = await req(base, '/datasets', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: pipeline.pipeline_id,
      uri: `memory://rag-e2e-dataset-${suffix}`,
      desc: 'RAG e2e dataset loaded from remote source with fallback corpus',
    }),
  });
  const dataset = mustOk('create dataset', response);

  return { project, pipeline, dataset };
}

async function resolveNodeTypes(base, authHeaders) {
  const response = await req(base, '/node-types?fk_tool_id=3', { method: 'GET', headers: authHeaders });
  const nodeTypes = mustOk('list node types', response);
  const byName = new Map(nodeTypes.map((row) => [trimName(row.name), row]));

  const required = ['ManualInput', 'PromptBuilder', 'ToolNode', 'AgentCall'];
  for (const name of required) {
    if (!byName.get(name)) {
      throw new Error(`required node type missing: ${name}`);
    }
  }

  if (strictOpenRouter) {
    const requiredAgentInputMax = requiredContractTools.length + 4;
    const normalizedAgentType = await ensureAgentCallNodeTypeProfile(
      base,
      authHeaders,
      byName.get('AgentCall'),
      requiredAgentInputMax,
    );
    byName.set('AgentCall', normalizedAgentType);
  }

  return byName;
}

async function createGraph(base, authHeaders, pipelineId, nodeTypesByName, toolsByName) {
  async function createNode(payload) {
    const response = await req(base, '/nodes', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(payload),
    });
    return mustOk('create node', response);
  }

  async function createEdge(fromNodeId, toNodeId) {
    const response = await req(base, '/edges', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ fk_from_node: fromNodeId, fk_to_node: toNodeId }),
    });
    return mustOk('create edge', response);
  }

  const manualType = nodeTypesByName.get('ManualInput');
  const promptType = nodeTypesByName.get('PromptBuilder');
  const toolNodeType = nodeTypesByName.get('ToolNode');
  const agentType = nodeTypesByName.get('AgentCall');

  const nDocument = await createNode({
    fk_pipeline_id: pipelineId,
    fk_type_id: manualType.type_id,
    top_k: 1,
    ui_json: { x: 40, y: 20, label: 'DocumentInput' },
  });

  const nQuestion = await createNode({
    fk_pipeline_id: pipelineId,
    fk_type_id: manualType.type_id,
    top_k: 1,
    ui_json: { x: 40, y: 140, label: 'QuestionInput' },
  });

  const nPrompt = await createNode({
    fk_pipeline_id: pipelineId,
    fk_type_id: promptType.type_id,
    top_k: 1,
    ui_json: { x: 240, y: 80, label: 'PromptBuilder' },
  });

  const nAgent = await createNode({
    fk_pipeline_id: pipelineId,
    fk_type_id: agentType.type_id,
    top_k: 1,
    ui_json: {
      x: 820,
      y: 80,
      label: 'AgentCall',
      agent: {
        ...(ragAgentModel ? { modelId: ragAgentModel } : {}),
        maxToolCalls: 2,
        maxAttempts: 2,
        softRetryDelayMs: 1200,
      },
    },
  });

  await createEdge(nDocument.node_id, nPrompt.node_id);
  await createEdge(nQuestion.node_id, nPrompt.node_id);

  const nodeByLabel = {
    DocumentInput: nDocument,
    QuestionInput: nQuestion,
    PromptBuilder: nPrompt,
    AgentCall: nAgent,
  };

  let x = 420;
  let previousNodeId = nPrompt.node_id;
  for (const toolName of requiredContractTools) {
    const tool = toolsByName.get(toolName);
    if (!tool) throw new Error(`tool not found while creating graph: ${toolName}`);

    const node = await createNode({
      fk_pipeline_id: pipelineId,
      fk_type_id: toolNodeType.type_id,
      top_k: 1,
      ui_json: { x, y: 80, label: toolName, tool_id: tool.tool_id },
    });

    nodeByLabel[toolName] = node;
    await createEdge(previousNodeId, node.node_id);
    await createEdge(node.node_id, nAgent.node_id);
    previousNodeId = node.node_id;
    x += 180;
  }

  return nodeByLabel;
}

async function executeQuestion(base, authHeaders, ids, datasetDocs, chunks, vectors, question, index) {
  const contractMode = e2eProfile === 'contract';
  const candidates = contractMode ? selectCandidates(question, chunks, 6) : [];
  const contextText = contractMode ? candidates.map((row, i) => `[${i + 1}] ${row.snippet}`).join('\n') : '';

  const inputJson = {
    locale: 'en',
    question,
    user_query: question,
    retrieval_query: question,
    instruction: 'Answer briefly and stay grounded in provided context whenever possible.',
    uris: datasetDocs.map((doc) => doc.uri),
    documents: datasetDocs.map((doc) => ({ document_id: doc.document_id, text: doc.text })),
    prompt_template: 'Ground answer for question {{query}} using context below.\n\n{{context}}',
    max_context_tokens: 320,
    top_k: 6,
    mode: 'hybrid',
    alpha: 0.5,
    model: 'openai/gpt-oss-120b:free',
    temperature: 0.2,
    max_output_tokens: 220,
  };

  if (contractMode) {
    inputJson.chunks = chunks;
    inputJson.vectors = vectors;
    inputJson.candidates = candidates;
    inputJson.context_bundle = {
      text: contextText,
      token_estimate: contextText.split(/\s+/).filter(Boolean).length,
      sources: candidates.map((candidate, i) => ({
        rank: i + 1,
        document_id: candidate.document_id,
        chunk_id: candidate.chunk_id,
        score: candidate.score,
      })),
    };
    inputJson.answer = `Draft answer for question: ${question}`;
  }

  const startResponse = await req(base, `/pipelines/${ids.pipelineId}/execute`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      preset: 'production',
      dataset_id: ids.datasetId,
      input_json: inputJson,
    }),
  });
  const started = mustOk(`start execution q${index + 1}`, startResponse);

  let snapshot = null;
  for (let poll = 0; poll < maxExecutionPolls; poll += 1) {
    const statusResponse = await req(base, `/pipelines/${ids.pipelineId}/executions/${started.execution_id}`, {
      method: 'GET',
      headers: authHeaders,
    });
    snapshot = mustOk(`poll execution q${index + 1}`, statusResponse);
    if (snapshot.status === 'succeeded' || snapshot.status === 'failed') break;
    await sleep(1000);
  }

  if (!snapshot || snapshot.status !== 'succeeded') {
    throw new Error(
      `execution failed: ${JSON.stringify({
        execution_id: started.execution_id,
        status: snapshot?.status ?? 'unknown',
        error: snapshot?.error ?? null,
        preflight_errors: snapshot?.preflight?.errors ?? [],
      })}`,
    );
  }

  const nodesResponse = await req(base, `/nodes?fk_pipeline_id=${ids.pipelineId}`, { method: 'GET', headers: authHeaders });
  const nodes = mustOk(`list nodes q${index + 1}`, nodesResponse);
  const nodeById = new Map(nodes.map((row) => [row.node_id, row]));

  const reportBundle = await loadExecutionReportNodes(
    base,
    authHeaders,
    ids.pipelineId,
    started.execution_id,
    `q${index + 1}`,
  );
  const reportNodes = reportBundle.reportNodes;
  const reportSource = reportBundle.reportSource;
  const reportById = new Map(reportNodes.map((row) => [row.node_id, row]));

  const statusByLabel = Object.fromEntries(
    Object.entries(ids.nodeIdByLabel).map(([label, nodeId]) => [label, reportById.get(nodeId)?.status ?? 'unknown']),
  );

  const requiredCompleted = ['DocumentInput', 'QuestionInput', 'PromptBuilder', ...requiredContractTools];
  for (const label of requiredCompleted) {
    if (statusByLabel[label] !== 'completed') {
      const reportNode = reportById.get(ids.nodeIdByLabel[label]);
      throw new Error(
        `critical node ${label} is not completed: ${JSON.stringify({
          report_source: reportSource,
          status: statusByLabel[label],
          report_node: reportNode ?? null,
          report_nodes_count: reportNodes.length,
          execution_status: reportBundle.executionSnapshot?.status ?? null,
        })}`,
      );
    }
  }

  const agentStatus = statusByLabel.AgentCall;
  const agentReport = reportById.get(ids.nodeIdByLabel.AgentCall);

  const agentErrorCode = getNodeErrorCode(agentReport);
  const agentErrorHttpStatus = getNodeErrorHttpStatus(agentReport);

  const agentSoftOpenRouterFailure = !strictOpenRouter && isSoftOpenRouterFailure(agentReport);
  const softOpenRouterFailure = agentSoftOpenRouterFailure;

  if (!softOpenRouterFailure) {
    if (agentStatus !== 'completed') {
      throw new Error(`AgentCall is not completed: ${JSON.stringify(agentReport ?? null)}`);
    }
  }

  const outCitation = toNodeOutput(nodeById.get(ids.nodeIdByLabel.CitationFormatter));
  const outAgent = toNodeOutput(nodeById.get(ids.nodeIdByLabel.AgentCall));

  const citedAnswer = outCitation?.contract_output?.cited_answer ?? outCitation?.cited_answer ?? JSON.stringify(outCitation ?? null);
  const agentText = outAgent?.text ?? JSON.stringify(outAgent ?? null);

  if (strictOpenRouter) {
    for (const toolName of requiredContractTools) {
      const toolOutput = toNodeOutput(nodeById.get(ids.nodeIdByLabel[toolName]));
      assertStrictToolOutput(toolName, toolOutput);
    }

    const providerModel = trimName(outAgent?.model);
    const providerResponseId = trimName(outAgent?.provider_response_id);
    const providerUsage = outAgent?.usage && typeof outAgent.usage === 'object' ? outAgent.usage : null;
    const providerSoftFailure = Boolean(outAgent?.provider_soft_failure);
    const providerCallsAttempted = Number(outAgent?.provider_calls_attempted ?? 0);
    const unresolvedTools = Array.isArray(outAgent?.unresolved_tools) ? outAgent.unresolved_tools : [];

    if (!providerModel) {
      throw new Error('strict mode requires non-empty AgentCall provider model');
    }
    if (!providerResponseId) {
      throw new Error('strict mode requires AgentCall provider_response_id evidence');
    }
    if (!usageHasPositiveTokens(providerUsage)) {
      throw new Error('strict mode requires positive AgentCall usage token evidence');
    }
    if (providerSoftFailure) {
      throw new Error('strict mode does not allow AgentCall provider_soft_failure');
    }
    if (!Number.isFinite(providerCallsAttempted) || providerCallsAttempted <= 0) {
      throw new Error('strict mode requires AgentCall provider_calls_attempted > 0');
    }
    if (unresolvedTools.length > 0) {
      throw new Error(`strict mode requires all AgentCall tools resolved, unresolved=${JSON.stringify(unresolvedTools)}`);
    }
  }

  return {
    question,
    execution_id: started.execution_id,
    execution_status: snapshot?.status,
    statusByLabel,
    agentErrorCode,
    agentErrorHttpStatus,
    agentSoftOpenRouterFailure,
    softOpenRouterFailure,
    citedAnswer,
    agentText,
  };
}

async function run() {
  console.log('[rag-e2e] starting...');
  console.log(`[rag-e2e] profile: ${e2eProfile}`);
  console.log(`[rag-e2e] force health executor: ${overrideToolExecutors}`);

  if (strictOpenRouter && e2eProfile !== 'realistic') {
    fail('strict mode requires RAG_E2E_PROFILE=realistic');
  }

  if (strictOpenRouter && overrideToolExecutors) {
    fail('strict mode cannot run with RAG_E2E_FORCE_HEALTH_EXECUTOR=1');
  }

  const maxQuestionsRequested = Number(process.env.RAG_E2E_MAX_QUESTIONS || questions.length);
  const safeQuestionCount = Number.isInteger(maxQuestionsRequested) && maxQuestionsRequested > 0
    ? Math.min(maxQuestionsRequested, questions.length)
    : questions.length;
  const questionsToRun = questions.slice(0, safeQuestionCount);

  const base = await resolveBaseUrl();
  console.log(`[rag-e2e] base url: ${base}`);

  const docs = await downloadDatasetDocs();
  console.log(`[rag-e2e] dataset docs: ${docs.length}`);

  const chunks = e2eProfile === 'contract' ? buildChunks(docs, 26) : [];
  const vectors =
    e2eProfile === 'contract'
      ? chunks.slice(0, 40).map((chunk, index) => ({
          vector_id: `vec_${index + 1}`,
          chunk_id: chunk.chunk_id,
          document_id: chunk.document_id,
          vector: makeVector(chunk.text, 8),
        }))
      : [];

  if (e2eProfile === 'contract') {
    console.log(`[rag-e2e] chunks prepared: ${chunks.length}`);
    console.log(`[rag-e2e] vectors prepared: ${vectors.length}`);
  } else {
    console.log('[rag-e2e] realistic mode: intermediate artifacts are produced by ToolNode chain at runtime');
  }

  const auth = await createAuth(base);
  console.log(`[rag-e2e] auth created for ${auth.email}`);

  const toolsByName = await ensureContractToolExecutors(base, auth.authHeaders);
  if (overrideToolExecutors) {
    console.log('[rag-e2e] contract tools configured to http-json /health');
  } else {
    console.log('[rag-e2e] contract tools left as-is (no executor override)');
  }

  const { project, pipeline, dataset } = await createProjectPipelineDataset(base, auth.authHeaders, docs);
  console.log(`[rag-e2e] project=${project.project_id}, pipeline=${pipeline.pipeline_id}, dataset=${dataset.dataset_id}`);

  const nodeTypesByName = await resolveNodeTypes(base, auth.authHeaders);
  const nodeByLabel = await createGraph(base, auth.authHeaders, pipeline.pipeline_id, nodeTypesByName, toolsByName);
  const nodeIdByLabel = Object.fromEntries(Object.entries(nodeByLabel).map(([label, node]) => [label, node.node_id]));
  console.log('[rag-e2e] graph created (DocumentInput + QuestionInput + PromptBuilder + ToolNodes -> AgentCall)');

  const results = [];
  for (let index = 0; index < questionsToRun.length; index += 1) {
    const question = questionsToRun[index];
    console.log(`\n[rag-e2e] Q${index + 1}: ${question}`);

    let result;
    for (let strictAttempt = 1; strictAttempt <= strictQuestionRetries; strictAttempt += 1) {
      try {
        result = await withQuestionTimeout(
          executeQuestion(
            base,
            auth.authHeaders,
            {
              pipelineId: pipeline.pipeline_id,
              datasetId: dataset.dataset_id,
              nodeIdByLabel,
            },
            docs,
            chunks,
            vectors,
            question,
            index,
          ),
          index,
          question,
        );
        break;
      } catch (error) {
        const retryableStrict = strictOpenRouter && isRetryableStrictProviderError(error);
        if (retryableStrict && strictAttempt < strictQuestionRetries) {
          const message = error instanceof Error ? error.message : String(error);
          console.log(
            `[rag-e2e] strict provider checks failed on Q${index + 1} attempt ${strictAttempt}/${strictQuestionRetries}, retrying: ${message}`,
          );
          if (strictRetryDelayMs > 0) {
            await sleep(strictRetryDelayMs);
          }
          continue;
        }

        throw error;
      }
    }

    if (!result) {
      throw new Error(`question execution returned no result for Q${index + 1}`);
    }

    results.push(result);

    console.log(`[rag-e2e] execution_id=${result.execution_id}, status=${result.execution_status}`);
    console.log(`[rag-e2e] node statuses: ${Object.entries(result.statusByLabel).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    console.log(`[rag-e2e] citation excerpt: ${excerpt(result.citedAnswer, 240)}`);
    console.log(`[rag-e2e] agent excerpt: ${excerpt(result.agentText, 240)}`);

    if (result.softOpenRouterFailure) {
      const warningParts = [];
      if (result.agentSoftOpenRouterFailure) {
        warningParts.push(`AgentCall:${result.agentErrorCode || 'unknown'}${result.agentErrorHttpStatus ? `/${result.agentErrorHttpStatus}` : ''}`);
      }

      console.log(`[rag-e2e] warning: soft OpenRouter failure accepted (${warningParts.join(', ') || 'provider unavailable'})`);
    }
  }

  const openRouterWarnings = results.filter((row) => row.softOpenRouterFailure).length;
  console.log('\n[rag-e2e] summary');
  console.log(
    JSON.stringify(
      {
        base,
        profile: e2eProfile,
        force_health_executor: overrideToolExecutors,
        strict_openrouter: strictOpenRouter,
        project_id: project.project_id,
        pipeline_id: pipeline.pipeline_id,
        dataset_id: dataset.dataset_id,
        node_ids: nodeIdByLabel,
        tools_used: requiredContractTools,
        questions_count: questionsToRun.length,
        openrouter_soft_failures: openRouterWarnings,
      },
      null,
      2,
    ),
  );

  console.log('[rag-e2e] SUCCESS');
  process.exit(0);
}

run().catch((error) => {
  fail('unexpected error', error instanceof Error ? { message: error.message, stack: error.stack } : String(error));
});

const envBaseUrl = process.env.BASE_URL;
const requestTimeoutMs = Number(process.env.AGENT_E2E_HTTP_TIMEOUT_MS || 30000);
const forceHealthExecutor = process.env.AGENT_E2E_FORCE_HEALTH_EXECUTOR === '1';
const strictOpenRouter = process.env.AGENT_E2E_STRICT_OPENROUTER !== '0';
const strictExecutionRetries = Math.max(1, Number(process.env.AGENT_E2E_STRICT_RETRIES || 3));
const strictRetryDelayMs = Math.max(0, Number(process.env.AGENT_E2E_STRICT_RETRY_DELAY_MS || 2000));
const agentE2EModel = String(process.env.AGENT_E2E_MODEL || process.env.OPENROUTER_LLM_MODEL || 'openrouter/auto').trim();
const headers = { 'Content-Type': 'application/json' };

const autonomousAgentTools = [
  'DocumentLoader',
  'Chunker',
  'Embedder',
  'VectorUpsert',
  'QueryBuilder',
  'HybridRetriever',
  'ContextAssembler',
  'LLMAnswer',
];

const seedDocuments = [
  {
    document_id: 'doc_artemis_overview',
    uri: 'https://www.nasa.gov/humans-in-space/artemis/',
    text:
      'NASA Artemis is a long-term lunar exploration program. Artemis II is planned as the first crewed Orion mission around the Moon and validates systems before future landing campaigns.',
  },
  {
    document_id: 'doc_space_risks',
    uri: 'https://www.nasa.gov/humans-in-space/',
    text:
      'Long-duration lunar missions face radiation exposure, logistics constraints, communication delays and crew stress. Mitigation includes shielding, redundancy and mission rehearsal.',
  },
  {
    document_id: 'doc_training',
    uri: 'https://www.nasa.gov/missions/artemis/artemis-ii/',
    text:
      'Artemis II crew training includes autonomy drills, emergency simulations and cross-disciplinary operations in constrained conditions.',
  },
];

function isOk(status) {
  return status >= 200 && status < 300;
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

function toNodeOutput(node) {
  return node?.output_json?.data ?? node?.output_json ?? null;
}

function fail(msg, details) {
  console.error('[agent-e2e] FAIL:', msg);
  if (details !== undefined) {
    console.error(typeof details === 'string' ? details : JSON.stringify(details, null, 2));
  }
  process.exit(2);
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

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveBaseUrl() {
  if (envBaseUrl) {
    const health = await req(envBaseUrl, '/health', { method: 'GET' });
    if (!isOk(health.status)) {
      throw new Error(`BASE_URL is set but unhealthy: ${envBaseUrl}, status=${health.status}`);
    }
    return envBaseUrl;
  }

  const candidates = ['http://localhost:3000', 'http://localhost:8080', 'http://localhost:3010'];
  for (const candidate of candidates) {
    try {
      const health = await req(candidate, '/health', { method: 'GET' });
      if (isOk(health.status)) return candidate;
    } catch {
      // Try next candidate.
    }
  }

  throw new Error('could not resolve BASE_URL automatically; set BASE_URL env var');
}

async function createAuth(base) {
  const suffix = Date.now();
  const email = `agent-autonomous-e2e-${suffix}@local`;
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
    email,
    authHeaders: {
      ...headers,
      Authorization: `Bearer ${login.accessToken}`,
    },
  };
}

async function ensureAgentTools(base, authHeaders) {
  const response = await req(base, '/tools', { method: 'GET', headers: authHeaders });
  const tools = mustOk('list tools', response);

  const byName = new Map(tools.map((tool) => [trimName(tool.name), tool]));
  for (const toolName of autonomousAgentTools) {
    const tool = byName.get(toolName);
    if (!tool) {
      throw new Error(`required tool missing: ${toolName}`);
    }

    const currentConfig = tool.config_json && typeof tool.config_json === 'object' ? tool.config_json : {};

    if (!forceHealthExecutor) {
      if (!strictOpenRouter) continue;

      const strictConfig = buildStrictToolConfig(base, toolName, currentConfig);
      const strictKind = resolveExecutorKind(strictConfig);
      const currentKind = resolveExecutorKind(currentConfig);
      const requiresUpdate =
        isHealthExecutorConfig(currentConfig) ||
        (toolName === 'Embedder' ? strictKind !== currentKind : true);

      if (requiresUpdate) {
        const updateResponse = await req(base, `/tools/${tool.tool_id}`, {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify({ config_json: strictConfig }),
        });
        mustOk(`strict tool config ${toolName}`, updateResponse);
      }

      continue;
    }

    const mergedConfig = {
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
      body: JSON.stringify({ config_json: mergedConfig }),
    });
    mustOk(`update tool ${toolName}`, updateResponse);
  }

  return byName;
}

async function createProjectPipelineDataset(base, authHeaders) {
  const suffix = Date.now();

  let response = await req(base, '/projects', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: `agent-autonomous-project-${suffix}` }),
  });
  const project = mustOk('create project', response);

  response = await req(base, '/pipelines', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_project_id: project.project_id,
      name: `agent-autonomous-pipeline-${suffix}`,
      max_time: 300,
      max_cost: 500,
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
      uri: `memory://agent-autonomous-dataset-${suffix}`,
      desc: 'Dataset for autonomous AgentCall internal tool-calling e2e',
    }),
  });
  const dataset = mustOk('create dataset', response);

  return { project, pipeline, dataset };
}

async function resolveNodeTypes(base, authHeaders) {
  const response = await req(base, '/node-types?fk_tool_id=3', { method: 'GET', headers: authHeaders });
  const nodeTypes = mustOk('list node types', response);
  const byName = new Map(nodeTypes.map((row) => [trimName(row.name), row]));

  const required = ['ManualInput', 'ToolNode', 'AgentCall'];
  for (const name of required) {
    if (!byName.get(name)) {
      throw new Error(`required node type missing: ${name}`);
    }
  }

  if (strictOpenRouter) {
    const normalizedAgentType = await ensureAgentCallNodeTypeProfile(base, authHeaders, byName.get('AgentCall'), 20);
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
  const toolNodeType = nodeTypesByName.get('ToolNode');
  const agentType = nodeTypesByName.get('AgentCall');

  const nManual = await createNode({
    fk_pipeline_id: pipelineId,
    fk_type_id: manualType.type_id,
    top_k: 1,
    ui_json: { x: 120, y: 180, label: 'ManualInput' },
  });

  const nAgent = await createNode({
    fk_pipeline_id: pipelineId,
    fk_type_id: agentType.type_id,
    top_k: 1,
    ui_json: {
      x: 420,
      y: 180,
      label: 'AgentCall',
      agent: {
        maxToolCalls: 4,
        maxAttempts: 3,
        softRetryDelayMs: 1200,
        ...(agentE2EModel ? { modelId: agentE2EModel } : {}),
      },
    },
  });

  let previousNodeId = nManual.node_id;
  let x = 250;
  const toolNodeIds = [];

  for (const toolName of autonomousAgentTools) {
    const tool = toolsByName.get(toolName);
    if (!tool) {
      throw new Error(`tool not found while creating graph: ${toolName}`);
    }

    const toolNode = await createNode({
      fk_pipeline_id: pipelineId,
      fk_type_id: toolNodeType.type_id,
      top_k: 1,
      ui_json: {
        x,
        y: 180,
        label: toolName,
        tool_id: tool.tool_id,
      },
    });

    toolNodeIds.push(toolNode.node_id);
    await createEdge(previousNodeId, toolNode.node_id);
    await createEdge(toolNode.node_id, nAgent.node_id);
    previousNodeId = toolNode.node_id;
    x += 150;
  }

  return {
    ManualInput: nManual.node_id,
    AgentCall: nAgent.node_id,
    ToolNodes: toolNodeIds,
  };
}

async function executeAutonomousRun(base, authHeaders, pipelineId, datasetId) {
  const question = 'What is the main purpose of Artemis II before future lunar landing missions?';

  const startResponse = await req(base, `/pipelines/${pipelineId}/execute`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      preset: 'production',
      dataset_id: datasetId,
      input_json: {
        locale: 'en',
        question,
        user_query: question,
        retrieval_query: question,
        instruction: 'Answer briefly and stay grounded in the provided context.',
        uris: seedDocuments.map((doc) => doc.uri),
        documents: seedDocuments.map((doc) => ({ document_id: doc.document_id, text: doc.text })),
        prompt_template: 'Ground answer for query {{query}} using context below.\n\n{{context}}',
        max_context_tokens: 320,
        top_k: 6,
        mode: 'hybrid',
        alpha: 0.5,
        model: 'openai/gpt-oss-120b:free',
        temperature: 0.2,
        max_output_tokens: 220,
      },
    }),
  });
  const started = mustOk('start execution', startResponse);

  let snapshot = null;
  for (let poll = 0; poll < 150; poll += 1) {
    const statusResponse = await req(base, `/pipelines/${pipelineId}/executions/${started.execution_id}`, {
      method: 'GET',
      headers: authHeaders,
    });
    snapshot = mustOk('poll execution', statusResponse);
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

  return {
    execution_id: started.execution_id,
    status: snapshot?.status ?? 'unknown',
  };
}

async function loadExecutionReportNodes(base, authHeaders, pipelineId, executionId) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const executionResponse = await req(base, `/pipelines/${pipelineId}/executions/${executionId}`, {
      method: 'GET',
      headers: authHeaders,
    });
    const executionBody = mustOk('poll execution report', executionResponse);
    const reportNodes = Array.isArray(executionBody?.report_json?.nodes) ? executionBody.report_json.nodes : [];
    if (reportNodes.length > 0) {
      return {
        reportNodes,
        source: 'execution',
      };
    }
    await sleep(500);
  }

  const pipelineResponse = await req(base, `/pipelines/${pipelineId}`, {
    method: 'GET',
    headers: authHeaders,
  });
  const pipelineBody = mustOk('get pipeline', pipelineResponse);
  return {
    reportNodes: Array.isArray(pipelineBody?.report_json?.nodes) ? pipelineBody.report_json.nodes : [],
    source: 'pipeline-fallback',
  };
}

async function run() {
  console.log('[agent-e2e] starting...');

  if (strictOpenRouter && forceHealthExecutor) {
    fail('strict mode cannot run with AGENT_E2E_FORCE_HEALTH_EXECUTOR=1');
  }

  const base = await resolveBaseUrl();
  console.log(`[agent-e2e] base url: ${base}`);

  const auth = await createAuth(base);
  console.log(`[agent-e2e] auth created for ${auth.email}`);

  const toolsByName = await ensureAgentTools(base, auth.authHeaders);
  console.log(
    `[agent-e2e] tools prepared (${autonomousAgentTools.join(', ')})` +
      (forceHealthExecutor ? ' with forced /health executor' : ' with original executors'),
  );

  const { project, pipeline, dataset } = await createProjectPipelineDataset(base, auth.authHeaders);
  console.log(`[agent-e2e] project=${project.project_id}, pipeline=${pipeline.pipeline_id}, dataset=${dataset.dataset_id}`);

  const nodeTypesByName = await resolveNodeTypes(base, auth.authHeaders);
  const nodeIdByLabel = await createGraph(base, auth.authHeaders, pipeline.pipeline_id, nodeTypesByName, toolsByName);
  console.log('[agent-e2e] graph created (ManualInput -> ToolNode chain, each ToolNode -> AgentCall)');

  for (let strictAttempt = 1; strictAttempt <= strictExecutionRetries; strictAttempt += 1) {
    const execution = await executeAutonomousRun(base, auth.authHeaders, pipeline.pipeline_id, dataset.dataset_id);
    console.log(`[agent-e2e] execution_id=${execution.execution_id}, status=${execution.status}`);

    const nodesResponse = await req(base, `/nodes?fk_pipeline_id=${pipeline.pipeline_id}`, {
      method: 'GET',
      headers: auth.authHeaders,
    });
    const nodes = mustOk('list nodes', nodesResponse);
    const nodeById = new Map(nodes.map((row) => [row.node_id, row]));

    const reportBundle = await loadExecutionReportNodes(
      base,
      auth.authHeaders,
      pipeline.pipeline_id,
      execution.execution_id,
    );
    const reportNodes = reportBundle.reportNodes;
    const reportById = new Map(reportNodes.map((row) => [row.node_id, row]));

    const manualStatus = reportById.get(nodeIdByLabel.ManualInput)?.status ?? 'unknown';
    const agentStatus = reportById.get(nodeIdByLabel.AgentCall)?.status ?? 'unknown';

    if (manualStatus !== 'completed') {
      fail('ManualInput is not completed', {
        report_source: reportBundle.source,
        report_nodes_count: reportNodes.length,
        node: reportById.get(nodeIdByLabel.ManualInput) ?? null,
      });
    }
    if (agentStatus !== 'completed') {
      fail('AgentCall is not completed', {
        report_source: reportBundle.source,
        report_nodes_count: reportNodes.length,
        node: reportById.get(nodeIdByLabel.AgentCall) ?? null,
      });
    }

    const agentOutput = toNodeOutput(nodeById.get(nodeIdByLabel.AgentCall));
    if (!agentOutput || typeof agentOutput !== 'object') {
      fail('AgentCall output is empty', agentOutput);
    }

    const toolCallsExecuted = Number(agentOutput.tool_calls_executed ?? 0);
    const toolTrace = Array.isArray(agentOutput.tool_call_trace) ? agentOutput.tool_call_trace : [];
    const completedToolCalls = toolTrace.filter((row) => row && row.status === 'completed');

    if (toolCallsExecuted <= 0) {
      fail('AgentCall did not execute any internal tool calls', agentOutput);
    }
    if (completedToolCalls.length <= 0) {
      fail('AgentCall has no completed tool calls in trace', toolTrace);
    }

    const providerSoftFailure = Boolean(agentOutput.provider_soft_failure);
    const providerModel = trimName(agentOutput.model);
    const providerResponseId = trimName(agentOutput.provider_response_id);
    const providerUsage = agentOutput.usage && typeof agentOutput.usage === 'object' ? agentOutput.usage : null;
    const providerCallsAttempted = Number(agentOutput.provider_calls_attempted ?? 0);
    const unresolvedTools = Array.isArray(agentOutput.unresolved_tools) ? agentOutput.unresolved_tools : [];

    const strictIssues = [];
    if (strictOpenRouter) {
      if (providerSoftFailure) {
        strictIssues.push('provider_soft_failure');
      }
      if (!providerModel) {
        strictIssues.push('provider_model_empty');
      }
      if (!providerResponseId) {
        strictIssues.push('provider_response_id_missing');
      }
      if (!usageHasPositiveTokens(providerUsage)) {
        strictIssues.push('provider_usage_missing');
      }
      if (!Number.isFinite(providerCallsAttempted) || providerCallsAttempted <= 0) {
        strictIssues.push('provider_calls_attempted_invalid');
      }
      if (unresolvedTools.length > 0) {
        strictIssues.push('unresolved_tools');
      }
    }

    if (strictOpenRouter && strictIssues.length > 0) {
      if (strictAttempt < strictExecutionRetries) {
        console.log(
          `[agent-e2e] strict provider checks failed on attempt ${strictAttempt}/${strictExecutionRetries} (${strictIssues.join(', ')}), retrying...`,
        );
        if (strictRetryDelayMs > 0) {
          await sleep(strictRetryDelayMs);
        }
        continue;
      }

      fail('strict mode provider checks failed after retries', {
        attempts: strictExecutionRetries,
        strict_issues: strictIssues,
        agent_output: agentOutput,
      });
    }

    const finalText = normalizeText(agentOutput.text);
    if (!finalText) {
      fail('AgentCall final text is empty', agentOutput);
    }

    console.log(`[agent-e2e] final text excerpt: ${excerpt(finalText, 260)}`);
    console.log(
      `[agent-e2e] tool calls: executed=${toolCallsExecuted}, completed=${completedToolCalls.length}, soft_openrouter_failure=${providerSoftFailure}`,
    );

    console.log('[agent-e2e] summary');
    console.log(
      JSON.stringify(
        {
          base,
          strict_openrouter: strictOpenRouter,
          force_health_executor: forceHealthExecutor,
          project_id: project.project_id,
          pipeline_id: pipeline.pipeline_id,
          dataset_id: dataset.dataset_id,
          node_ids: nodeIdByLabel,
          tools_advertised: autonomousAgentTools,
          tools_resolved: autonomousAgentTools.filter((name) => toolsByName.has(name)),
          execution_id: execution.execution_id,
          execution_status: execution.status,
          agent_tool_calls_executed: toolCallsExecuted,
          agent_completed_tool_calls: completedToolCalls.length,
          provider_soft_failure: providerSoftFailure,
          provider_model: providerModel || null,
          provider_response_id: providerResponseId || null,
          provider_usage_complete: usageHasPositiveTokens(providerUsage),
          provider_calls_attempted: providerCallsAttempted,
          unresolved_tools: unresolvedTools,
        },
        null,
        2,
      ),
    );

    console.log('[agent-e2e] SUCCESS');
    return;
  }
}

run().catch((error) => {
  fail(
    'unexpected error',
    error instanceof Error
      ? {
          message: error.message,
          stack: error.stack,
        }
      : String(error),
  );
});

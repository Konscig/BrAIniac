const base = process.env.BASE_URL || 'http://localhost:8080';
const headers = { 'Content-Type': 'application/json' };
const llmContractModel = String(process.env.OPENROUTER_LLM_MODEL || process.env.RAG_E2E_AGENT_MODEL || '').trim();

async function req(path, opts) {
  const url = base + path;
  const res = await fetch(url, opts);
  const txt = await res.text();
  let body = txt;
  try { body = JSON.parse(txt); } catch (_) {}
  return { status: res.status, body };
}

function ok(status) { return status >= 200 && status < 300; }
function hasCode(body, code) { return !!body && typeof body === 'object' && body.code === code; }

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('Integration test started, base =', base);

  const suffix = Date.now();
  let r = await req('/auth/signup', { method: 'POST', headers, body: JSON.stringify({ email: `it+${suffix}@local`, password: 'pwd' }) });
  console.log('POST /auth/signup ->', r.status);
  if (!ok(r.status)) return fail('signup failed', r);

  r = await req('/auth/login', { method: 'POST', headers, body: JSON.stringify({ email: `it+${suffix}@local`, password: 'pwd' }) });
  console.log('POST /auth/login ->', r.status);
  if (!ok(r.status)) return fail('login failed', r);
  const { accessToken } = r.body;

  r = await req('/users/me', { method: 'GET', headers: { ...headers, Authorization: `Bearer ${accessToken}` } });
  console.log('GET /users/me ->', r.status);
  if (!ok(r.status)) return fail('get user info failed', r);
  const user = r.body;

  const authHeaders = { ...headers, Authorization: `Bearer ${accessToken}` };

  r = await req(`/users/${user.user_id}`, { method: 'GET', headers: authHeaders });
  console.log(`GET /users/${user.user_id} ->`, r.status);
  if (!ok(r.status)) return fail('get user failed', r);

  r = await req('/projects', { method: 'POST', headers: authHeaders, body: JSON.stringify({ name: `it-project-${suffix}` }) });
  console.log('POST /projects ->', r.status);
  if (!ok(r.status)) return fail('create project failed', r);
  const project = r.body;

  r = await req('/projects', { method: 'GET', headers: authHeaders });
  console.log('GET /projects ->', r.status);
  if (!ok(r.status)) return fail('list projects failed', r);

  r = await req(`/projects/${project.project_id}`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ name: `it-project-2-${suffix}` }) });
  console.log(`PUT /projects/${project.project_id} ->`, r.status);
  if (!ok(r.status)) return fail('update project failed', r);

  r = await req('/pipelines', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_project_id: project.project_id,
      name: `it-pipeline-${suffix}`,
      max_time: 30,
      max_cost: 100,
      max_reject: 0.15,
      report_json: {},
    }),
  });
  console.log('POST /pipelines ->', r.status);
  if (!ok(r.status)) return fail('create pipeline failed', r);
  const pipeline = r.body;

  r = await req('/tools', { method: 'POST', headers: authHeaders, body: JSON.stringify({ name: `it-tool-${suffix}`, config_json: { runtime: 'local' } }) });
  console.log('POST /tools ->', r.status);
  if (!ok(r.status)) return fail('create tool failed', r);
  const tool = r.body;

  r = await req('/node-types', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ fk_tool_id: tool.tool_id, name: `it-type-${suffix}`, desc: 'test type' }),
  });
  console.log('POST /node-types ->', r.status);
  if (!ok(r.status)) return fail('create node type failed', r);
  const nodeType = r.body;

  r = await req('/node-types', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ fk_tool_id: tool.tool_id, name: `it-type-no-profile-${suffix}`, desc: 'no profile type' }),
  });
  console.log('POST /node-types (no profile) ->', r.status);
  if (!ok(r.status)) return fail('create no-profile node type failed', r);
  const noProfileType = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: pipeline.pipeline_id,
      fk_type_id: nodeType.type_id,
      top_k: 5,
      ui_json: { x: 10, y: 20 },
    }),
  });
  console.log('POST /nodes #1 ->', r.status);
  if (!ok(r.status)) return fail('create first node failed', r);
  const nodeA = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: pipeline.pipeline_id,
      fk_type_id: nodeType.type_id,
      top_k: 3,
      ui_json: { x: 50, y: 60 },
    }),
  });
  console.log('POST /nodes #2 ->', r.status);
  if (!ok(r.status)) return fail('create second node failed', r);
  const nodeB = r.body;

  r = await req('/edges', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ fk_from_node: nodeA.node_id, fk_to_node: nodeB.node_id }),
  });
  console.log('POST /edges ->', r.status);
  if (!ok(r.status)) return fail('create edge failed', r);

  r = await req('/edges', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ fk_from_node: nodeB.node_id, fk_to_node: nodeA.node_id }),
  });
  console.log('POST /edges (unguarded cycle) ->', r.status);
  if (r.status !== 400 || !hasCode(r.body, 'GRAPH_LOOP_POLICY_REQUIRED')) {
    return fail('unguarded cycle should be rejected with GRAPH_LOOP_POLICY_REQUIRED', r);
  }

  r = await req(`/node-types/${nodeType.type_id}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ config_json: { loop: { maxIterations: 3 } } }),
  });
  console.log(`PUT /node-types/${nodeType.type_id} (set loop policy) ->`, r.status);
  if (!ok(r.status)) return fail('update node type with loop policy failed', r);

  r = await req('/edges', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ fk_from_node: nodeB.node_id, fk_to_node: nodeA.node_id }),
  });
  console.log('POST /edges (guarded cycle) ->', r.status);
  if (!ok(r.status)) return fail('guarded cycle edge should be allowed', r);

  r = await req('/node-types', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_tool_id: tool.tool_id,
      name: `it-type-invalid-loop-${suffix}`,
      desc: 'invalid loop policy',
      config_json: { loop: { maxIterations: 0 } },
    }),
  });
  console.log('POST /node-types (invalid loop policy type) ->', r.status);
  if (!ok(r.status)) return fail('create invalid loop node type failed', r);
  const invalidLoopType = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: pipeline.pipeline_id,
      fk_type_id: invalidLoopType.type_id,
      top_k: 1,
      ui_json: { x: 120, y: 140 },
    }),
  });
  console.log('POST /nodes #3 ->', r.status);
  if (!ok(r.status)) return fail('create third node failed', r);
  const nodeC = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: pipeline.pipeline_id,
      fk_type_id: noProfileType.type_id,
      top_k: 1,
      ui_json: { x: 220, y: 240 },
    }),
  });
  console.log('POST /nodes #4 (no-profile type) ->', r.status);
  if (!ok(r.status)) return fail('create fourth node failed', r);

  r = await req('/edges', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ fk_from_node: nodeC.node_id, fk_to_node: nodeC.node_id }),
  });
  console.log('POST /edges (self-loop with invalid maxIterations) ->', r.status);
  if (r.status !== 400 || !hasCode(r.body, 'GRAPH_LOOP_MAX_ITER_INVALID')) {
    return fail('invalid loop maxIterations should be rejected with GRAPH_LOOP_MAX_ITER_INVALID', r);
  }

  r = await req(`/pipelines/${pipeline.pipeline_id}/validate-graph`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({}),
  });
  console.log(`POST /pipelines/${pipeline.pipeline_id}/validate-graph ->`, r.status);
  if (!ok(r.status)) return fail('validate-graph failed', r);
  if (!r.body || r.body.valid !== true) return fail('validate-graph should return valid=true for guarded cycle', r);
  if (!r.body.metrics || Number(r.body.metrics.cycleCount) < 1 || Number(r.body.metrics.guardedCycleCount) < 1) {
    return fail('validate-graph metrics should report guarded cycle', r);
  }

  r = await req(`/pipelines/${pipeline.pipeline_id}/validate-graph?preset=production`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({}),
  });
  console.log(`POST /pipelines/${pipeline.pipeline_id}/validate-graph?preset=production ->`, r.status);
  if (!ok(r.status)) return fail('validate-graph with production preset failed', r);
  if (!r.body || r.body.valid !== false) {
    return fail('production preset should mark graph invalid for missing strict profile', r);
  }
  if (!Array.isArray(r.body?.errors) || !r.body.errors.some((e) => hasCode(e, 'GRAPH_NODETYPE_PROFILE_MISSING'))) {
    return fail('production preset should return GRAPH_NODETYPE_PROFILE_MISSING', r);
  }

  r = await req(`/pipelines/${pipeline.pipeline_id}/validate-graph`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ includeWarnings: false }),
  });
  console.log(`POST /pipelines/${pipeline.pipeline_id}/validate-graph (legacy override) ->`, r.status);
  if (r.status !== 400) {
    return fail('validate-graph should reject legacy override fields in preset-only contract', r);
  }

  r = await req(`/pipelines/${pipeline.pipeline_id}/execute`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ input_json: { prompt: 'health check' }, validation: { includeWarnings: false } }),
  });
  console.log(`POST /pipelines/${pipeline.pipeline_id}/execute (legacy validation override) ->`, r.status);
  if (r.status !== 400) {
    return fail('execute should reject legacy validation override fields in preset-only contract', r);
  }

  const executionKey = `it-execution-${suffix}`;
  r = await req(`/pipelines/${pipeline.pipeline_id}/execute`, {
    method: 'POST',
    headers: { ...authHeaders, 'x-idempotency-key': executionKey },
    body: JSON.stringify({ input_json: { prompt: 'health check' } }),
  });
  console.log(`POST /pipelines/${pipeline.pipeline_id}/execute ->`, r.status);
  if (r.status !== 202 || !r.body?.execution_id) {
    return fail('execute should return 202 with execution_id', r);
  }

  const firstExecutionId = r.body.execution_id;

  r = await req(`/pipelines/${pipeline.pipeline_id}/execute`, {
    method: 'POST',
    headers: { ...authHeaders, 'x-idempotency-key': executionKey },
    body: JSON.stringify({ input_json: { prompt: 'health check' } }),
  });
  console.log(`POST /pipelines/${pipeline.pipeline_id}/execute (idempotent replay) ->`, r.status);
  if (r.status !== 202 || r.body?.execution_id !== firstExecutionId) {
    return fail('execute with same idempotency key should return same execution_id', r);
  }

  let finalExecution = null;
  for (let i = 0; i < 30; i += 1) {
    r = await req(`/pipelines/${pipeline.pipeline_id}/executions/${firstExecutionId}`, {
      method: 'GET',
      headers: authHeaders,
    });

    if (!ok(r.status)) return fail('execution status check failed', r);

    if (r.body?.status === 'succeeded' || r.body?.status === 'failed') {
      finalExecution = r.body;
      break;
    }

    await wait(150);
  }

  if (!finalExecution) {
    return fail('execution did not finish in time', r);
  }
  if (finalExecution.status !== 'succeeded') {
    return fail('execution should succeed in integration flow', { status: 500, body: finalExecution });
  }

  r = await req('/pipelines', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_project_id: project.project_id,
      name: `it-filter-ranker-${suffix}`,
      max_time: 30,
      max_cost: 100,
      max_reject: 0.15,
      report_json: {},
    }),
  });
  console.log('POST /pipelines (filter/ranker) ->', r.status);
  if (!ok(r.status)) return fail('create filter/ranker pipeline failed', r);
  const filterRankerPipeline = r.body;

  r = await req('/node-types', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_tool_id: tool.tool_id,
      name: 'ManualInput',
      desc: 'manual input runtime for integration',
      config_json: {
        role: 'source',
        input: { min: 0, max: 0 },
        output: { min: 1, max: 2 },
      },
    }),
  });
  console.log('POST /node-types (ManualInput) ->', r.status);
  if (!ok(r.status)) return fail('create ManualInput node type failed', r);
  const manualInputType = r.body;

  r = await req('/node-types', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_tool_id: tool.tool_id,
      name: 'Filter',
      desc: 'filter runtime for integration',
      config_json: {
        role: 'transform',
        input: { min: 1, max: 3 },
        output: { min: 1, max: 2 },
        filter: {
          field: 'score',
          op: 'gte',
          value: 0.5,
        },
      },
    }),
  });
  console.log('POST /node-types (Filter) ->', r.status);
  if (!ok(r.status)) return fail('create Filter node type failed', r);
  const filterType = r.body;

  r = await req('/node-types', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_tool_id: tool.tool_id,
      name: 'Ranker',
      desc: 'ranker runtime for integration',
      config_json: {
        role: 'transform',
        input: { min: 1, max: 3 },
        output: { min: 1, max: 2 },
        ranker: {
          topK: 2,
          scoreField: 'score',
          order: 'desc',
        },
      },
    }),
  });
  console.log('POST /node-types (Ranker) ->', r.status);
  if (!ok(r.status)) return fail('create Ranker node type failed', r);
  const rankerType = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: filterRankerPipeline.pipeline_id,
      fk_type_id: manualInputType.type_id,
      top_k: 2,
      ui_json: { x: 20, y: 20 },
    }),
  });
  console.log('POST /nodes (ManualInput) ->', r.status);
  if (!ok(r.status)) return fail('create ManualInput node failed', r);
  const manualNode = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: filterRankerPipeline.pipeline_id,
      fk_type_id: filterType.type_id,
      top_k: 2,
      ui_json: { x: 160, y: 20 },
    }),
  });
  console.log('POST /nodes (Filter) ->', r.status);
  if (!ok(r.status)) return fail('create Filter node failed', r);
  const filterNode = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: filterRankerPipeline.pipeline_id,
      fk_type_id: rankerType.type_id,
      top_k: 2,
      ui_json: { x: 300, y: 20 },
    }),
  });
  console.log('POST /nodes (Ranker) ->', r.status);
  if (!ok(r.status)) return fail('create Ranker node failed', r);
  const rankerNode = r.body;

  r = await req('/edges', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ fk_from_node: manualNode.node_id, fk_to_node: filterNode.node_id }),
  });
  console.log('POST /edges (ManualInput -> Filter) ->', r.status);
  if (!ok(r.status)) return fail('create edge ManualInput -> Filter failed', r);

  r = await req('/edges', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ fk_from_node: filterNode.node_id, fk_to_node: rankerNode.node_id }),
  });
  console.log('POST /edges (Filter -> Ranker) ->', r.status);
  if (!ok(r.status)) return fail('create edge Filter -> Ranker failed', r);

  r = await req(`/pipelines/${filterRankerPipeline.pipeline_id}/execute`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      input_json: {
        items: [
          { id: 'a', score: 0.2, text: 'low candidate' },
          { id: 'b', score: 0.9, text: 'best candidate' },
          { id: 'c', score: 0.6, text: 'mid candidate' },
        ],
      },
    }),
  });
  console.log('POST /pipelines/:id/execute (filter/ranker) ->', r.status);
  if (r.status !== 202 || !r.body?.execution_id) {
    return fail('filter/ranker execution should return 202 with execution_id', r);
  }

  const filterRankerExecutionId = r.body.execution_id;
  let filterRankerExecution = null;
  for (let i = 0; i < 30; i += 1) {
    r = await req(`/pipelines/${filterRankerPipeline.pipeline_id}/executions/${filterRankerExecutionId}`, {
      method: 'GET',
      headers: authHeaders,
    });

    if (!ok(r.status)) return fail('filter/ranker execution status check failed', r);

    if (r.body?.status === 'succeeded' || r.body?.status === 'failed') {
      filterRankerExecution = r.body;
      break;
    }

    await wait(150);
  }

  if (!filterRankerExecution) {
    return fail('filter/ranker execution did not finish in time', r);
  }
  if (filterRankerExecution.status !== 'succeeded') {
    return fail('filter/ranker execution should succeed', { status: 500, body: filterRankerExecution });
  }

  r = await req(`/pipelines/${filterRankerPipeline.pipeline_id}`, {
    method: 'GET',
    headers: authHeaders,
  });
  console.log('GET /pipelines/:id (filter/ranker report) ->', r.status);
  if (!ok(r.status)) return fail('get filter/ranker pipeline failed', r);

  const reportNodes = r.body?.report_json?.nodes;
  if (!Array.isArray(reportNodes)) {
    return fail('filter/ranker report must contain nodes array', r);
  }

  const filterState = reportNodes.find((node) => node?.node_id === filterNode.node_id);
  const rankerState = reportNodes.find((node) => node?.node_id === rankerNode.node_id);

  if (filterState?.output_json?.kind !== 'filter') {
    return fail('Filter node should produce filter output', { status: 500, body: filterState });
  }

  const filterItems = filterState?.output_json?.items;
  if (!Array.isArray(filterItems) || filterItems.length !== 2 || filterItems.some((item) => Number(item?.score) < 0.5)) {
    return fail('Filter node should keep only score >= 0.5 candidates', { status: 500, body: filterState });
  }

  if (rankerState?.output_json?.kind !== 'ranker') {
    return fail('Ranker node should produce ranker output', { status: 500, body: rankerState });
  }

  const rankedItems = rankerState?.output_json?.items;
  if (!Array.isArray(rankedItems) || rankedItems.length !== 2) {
    return fail('Ranker node should return top 2 items', { status: 500, body: rankerState });
  }

  const rankedIds = rankedItems.map((item) => item?.id);
  if (rankedIds[0] !== 'b' || rankedIds[1] !== 'c') {
    return fail('Ranker output order should be deterministic by descending score', { status: 500, body: rankerState });
  }

  r = await req('/pipelines', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_project_id: project.project_id,
      name: `it-toolnode-strict-${suffix}`,
      max_time: 30,
      max_cost: 100,
      max_reject: 0.15,
      report_json: {},
    }),
  });
  console.log('POST /pipelines (toolnode strict) ->', r.status);
  if (!ok(r.status)) return fail('create toolnode strict pipeline failed', r);
  const toolNodeStrictPipeline = r.body;

  r = await req('/node-types', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_tool_id: tool.tool_id,
      name: 'ToolNode',
      desc: 'tool node strict contract integration check',
      config_json: {
        role: 'transform',
        input: { min: 1, max: 3 },
        output: { min: 1, max: 2 },
      },
    }),
  });
  console.log('POST /node-types (ToolNode strict) ->', r.status);
  if (!ok(r.status)) return fail('create ToolNode node type failed', r);
  const strictToolNodeType = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: toolNodeStrictPipeline.pipeline_id,
      fk_type_id: manualInputType.type_id,
      top_k: 1,
      ui_json: { x: 20, y: 140 },
    }),
  });
  console.log('POST /nodes (ToolNode strict ManualInput) ->', r.status);
  if (!ok(r.status)) return fail('create strict ManualInput node failed', r);
  const strictManualNode = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: toolNodeStrictPipeline.pipeline_id,
      fk_type_id: strictToolNodeType.type_id,
      top_k: 1,
      ui_json: { x: 180, y: 140 },
    }),
  });
  console.log('POST /nodes (ToolNode strict target) ->', r.status);
  if (!ok(r.status)) return fail('create strict ToolNode node failed', r);
  const strictToolNode = r.body;

  r = await req('/edges', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ fk_from_node: strictManualNode.node_id, fk_to_node: strictToolNode.node_id }),
  });
  console.log('POST /edges (ToolNode strict flow) ->', r.status);
  if (!ok(r.status)) return fail('create strict flow edge failed', r);

  r = await req(`/pipelines/${toolNodeStrictPipeline.pipeline_id}/execute`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      input_json: {
        prompt: 'strict toolnode check',
      },
    }),
  });
  console.log('POST /pipelines/:id/execute (toolnode strict) ->', r.status);
  if (r.status !== 202 || !r.body?.execution_id) {
    return fail('toolnode strict execution should return 202 with execution_id', r);
  }

  const strictExecutionId = r.body.execution_id;
  let strictExecution = null;
  for (let i = 0; i < 30; i += 1) {
    r = await req(`/pipelines/${toolNodeStrictPipeline.pipeline_id}/executions/${strictExecutionId}`, {
      method: 'GET',
      headers: authHeaders,
    });

    if (!ok(r.status)) return fail('toolnode strict execution status check failed', r);

    if (r.body?.status === 'succeeded' || r.body?.status === 'failed') {
      strictExecution = r.body;
      break;
    }

    await wait(150);
  }

  if (!strictExecution) {
    return fail('toolnode strict execution did not finish in time', r);
  }
  if (strictExecution.status !== 'failed') {
    return fail('toolnode strict execution should fail without explicit binding', { status: 500, body: strictExecution });
  }

  r = await req(`/pipelines/${toolNodeStrictPipeline.pipeline_id}`, {
    method: 'GET',
    headers: authHeaders,
  });
  console.log('GET /pipelines/:id (toolnode strict report) ->', r.status);
  if (!ok(r.status)) return fail('get toolnode strict pipeline failed', r);

  const strictReportNodes = r.body?.report_json?.nodes;
  if (!Array.isArray(strictReportNodes)) {
    return fail('toolnode strict report must contain nodes array', r);
  }

  const strictToolNodeState = strictReportNodes.find((node) => node?.node_id === strictToolNode.node_id);
  if (strictToolNodeState?.status !== 'failed') {
    return fail('ToolNode strict target should fail without explicit binding', { status: 500, body: strictToolNodeState });
  }

  const strictToolNodeErrorCode = strictToolNodeState?.error?.code;
  if (strictToolNodeErrorCode !== 'EXECUTOR_TOOLNODE_TOOL_REQUIRED') {
    return fail('ToolNode strict target should fail with EXECUTOR_TOOLNODE_TOOL_REQUIRED', {
      status: 500,
      body: strictToolNodeState,
    });
  }

  r = await req('/pipelines', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_project_id: project.project_id,
      name: `it-toolnode-chat-unsupported-${suffix}`,
      max_time: 30,
      max_cost: 100,
      max_reject: 0.15,
      report_json: {},
    }),
  });
  console.log('POST /pipelines (toolnode chat unsupported) ->', r.status);
  if (!ok(r.status)) return fail('create toolnode chat unsupported pipeline failed', r);
  const toolNodeChatUnsupportedPipeline = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: toolNodeChatUnsupportedPipeline.pipeline_id,
      fk_type_id: manualInputType.type_id,
      top_k: 1,
      ui_json: { x: 20, y: 220 },
    }),
  });
  console.log('POST /nodes (ToolNode chat unsupported ManualInput) ->', r.status);
  if (!ok(r.status)) return fail('create chat unsupported ManualInput node failed', r);
  const chatUnsupportedManualNode = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: toolNodeChatUnsupportedPipeline.pipeline_id,
      fk_type_id: strictToolNodeType.type_id,
      top_k: 1,
      ui_json: {
        x: 180,
        y: 220,
        tool: {
          name: 'chat-not-allowed-in-toolnode-mvp',
          config_json: {
            executor: 'openrouter-chat',
          },
        },
      },
    }),
  });
  console.log('POST /nodes (ToolNode chat unsupported target) ->', r.status);
  if (!ok(r.status)) return fail('create chat unsupported ToolNode node failed', r);
  const chatUnsupportedToolNode = r.body;

  r = await req('/edges', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ fk_from_node: chatUnsupportedManualNode.node_id, fk_to_node: chatUnsupportedToolNode.node_id }),
  });
  console.log('POST /edges (ToolNode chat unsupported flow) ->', r.status);
  if (!ok(r.status)) return fail('create chat unsupported flow edge failed', r);

  r = await req(`/pipelines/${toolNodeChatUnsupportedPipeline.pipeline_id}/execute`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      input_json: {
        prompt: 'toolnode chat unsupported check',
      },
    }),
  });
  console.log('POST /pipelines/:id/execute (toolnode chat unsupported) ->', r.status);
  if (r.status !== 202 || !r.body?.execution_id) {
    return fail('toolnode chat unsupported execution should return 202 with execution_id', r);
  }

  const chatUnsupportedExecutionId = r.body.execution_id;
  let chatUnsupportedExecution = null;
  for (let i = 0; i < 30; i += 1) {
    r = await req(`/pipelines/${toolNodeChatUnsupportedPipeline.pipeline_id}/executions/${chatUnsupportedExecutionId}`, {
      method: 'GET',
      headers: authHeaders,
    });

    if (!ok(r.status)) return fail('toolnode chat unsupported execution status check failed', r);

    if (r.body?.status === 'succeeded' || r.body?.status === 'failed') {
      chatUnsupportedExecution = r.body;
      break;
    }

    await wait(150);
  }

  if (!chatUnsupportedExecution) {
    return fail('toolnode chat unsupported execution did not finish in time', r);
  }
  if (chatUnsupportedExecution.status !== 'failed') {
    return fail('toolnode chat unsupported execution should fail in MVP scope', {
      status: 500,
      body: chatUnsupportedExecution,
    });
  }

  r = await req(`/pipelines/${toolNodeChatUnsupportedPipeline.pipeline_id}`, {
    method: 'GET',
    headers: authHeaders,
  });
  console.log('GET /pipelines/:id (toolnode chat unsupported report) ->', r.status);
  if (!ok(r.status)) return fail('get toolnode chat unsupported pipeline failed', r);

  const chatUnsupportedReportNodes = r.body?.report_json?.nodes;
  if (!Array.isArray(chatUnsupportedReportNodes)) {
    return fail('toolnode chat unsupported report must contain nodes array', r);
  }

  const chatUnsupportedToolNodeState = chatUnsupportedReportNodes.find((node) => node?.node_id === chatUnsupportedToolNode.node_id);
  if (chatUnsupportedToolNodeState?.status !== 'failed') {
    return fail('ToolNode chat unsupported target should fail', { status: 500, body: chatUnsupportedToolNodeState });
  }

  const chatUnsupportedErrorCode = chatUnsupportedToolNodeState?.error?.code;
  if (chatUnsupportedErrorCode !== 'EXECUTOR_TOOLNODE_EXECUTOR_UNSUPPORTED') {
    return fail('ToolNode chat unsupported target should fail with EXECUTOR_TOOLNODE_EXECUTOR_UNSUPPORTED', {
      status: 500,
      body: chatUnsupportedToolNodeState,
    });
  }

  r = await req('/pipelines', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_project_id: project.project_id,
      name: `it-toolnode-querybuilder-contract-${suffix}`,
      max_time: 30,
      max_cost: 100,
      max_reject: 0.15,
      report_json: {},
    }),
  });
  console.log('POST /pipelines (toolnode querybuilder contract) ->', r.status);
  if (!ok(r.status)) return fail('create toolnode querybuilder contract pipeline failed', r);
  const queryBuilderContractPipeline = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: queryBuilderContractPipeline.pipeline_id,
      fk_type_id: manualInputType.type_id,
      top_k: 1,
      ui_json: { x: 20, y: 300 },
    }),
  });
  console.log('POST /nodes (QueryBuilder contract ManualInput) ->', r.status);
  if (!ok(r.status)) return fail('create QueryBuilder contract ManualInput node failed', r);
  const queryBuilderContractManualNode = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: queryBuilderContractPipeline.pipeline_id,
      fk_type_id: strictToolNodeType.type_id,
      top_k: 1,
      ui_json: {
        x: 180,
        y: 300,
        tool: {
          name: 'QueryBuilder',
          config_json: {
            executor: 'http-json',
            url: `${base}/health`,
            contract: {
              name: 'QueryBuilder',
            },
          },
        },
      },
    }),
  });
  console.log('POST /nodes (QueryBuilder contract ToolNode target) ->', r.status);
  if (!ok(r.status)) return fail('create QueryBuilder contract ToolNode node failed', r);
  const queryBuilderContractToolNode = r.body;

  r = await req('/edges', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ fk_from_node: queryBuilderContractManualNode.node_id, fk_to_node: queryBuilderContractToolNode.node_id }),
  });
  console.log('POST /edges (QueryBuilder contract flow) ->', r.status);
  if (!ok(r.status)) return fail('create QueryBuilder contract flow edge failed', r);

  r = await req(`/pipelines/${queryBuilderContractPipeline.pipeline_id}/execute`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      input_json: {},
    }),
  });
  console.log('POST /pipelines/:id/execute (QueryBuilder contract invalid input) ->', r.status);
  if (r.status !== 202 || !r.body?.execution_id) {
    return fail('QueryBuilder contract invalid execution should return 202 with execution_id', r);
  }

  const queryBuilderContractExecutionId = r.body.execution_id;
  let queryBuilderContractExecution = null;
  for (let i = 0; i < 30; i += 1) {
    r = await req(`/pipelines/${queryBuilderContractPipeline.pipeline_id}/executions/${queryBuilderContractExecutionId}`, {
      method: 'GET',
      headers: authHeaders,
    });

    if (!ok(r.status)) return fail('querybuilder contract execution status check failed', r);

    if (r.body?.status === 'succeeded' || r.body?.status === 'failed') {
      queryBuilderContractExecution = r.body;
      break;
    }

    await wait(150);
  }

  if (!queryBuilderContractExecution) {
    return fail('querybuilder contract execution did not finish in time', r);
  }
  if (queryBuilderContractExecution.status !== 'failed') {
    return fail('querybuilder contract execution should fail on missing user_query', {
      status: 500,
      body: queryBuilderContractExecution,
    });
  }

  r = await req(`/pipelines/${queryBuilderContractPipeline.pipeline_id}`, {
    method: 'GET',
    headers: authHeaders,
  });
  console.log('GET /pipelines/:id (querybuilder contract report) ->', r.status);
  if (!ok(r.status)) return fail('get querybuilder contract pipeline failed', r);

  const queryBuilderContractReportNodes = r.body?.report_json?.nodes;
  if (!Array.isArray(queryBuilderContractReportNodes)) {
    return fail('querybuilder contract report must contain nodes array', r);
  }

  const queryBuilderContractToolNodeState = queryBuilderContractReportNodes.find(
    (node) => node?.node_id === queryBuilderContractToolNode.node_id,
  );
  if (queryBuilderContractToolNodeState?.status !== 'failed') {
    return fail('QueryBuilder contract ToolNode target should fail', { status: 500, body: queryBuilderContractToolNodeState });
  }

  const queryBuilderContractErrorCode = queryBuilderContractToolNodeState?.error?.code;
  if (queryBuilderContractErrorCode !== 'EXECUTOR_TOOLNODE_CONTRACT_INPUT_INVALID') {
    return fail('QueryBuilder contract ToolNode target should fail with EXECUTOR_TOOLNODE_CONTRACT_INPUT_INVALID', {
      status: 500,
      body: queryBuilderContractToolNodeState,
    });
  }

  r = await req('/pipelines', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_project_id: project.project_id,
      name: `it-toolnode-documentloader-contract-${suffix}`,
      max_time: 30,
      max_cost: 100,
      max_reject: 0.15,
      report_json: {},
    }),
  });
  console.log('POST /pipelines (toolnode documentloader contract) ->', r.status);
  if (!ok(r.status)) return fail('create toolnode documentloader contract pipeline failed', r);
  const documentLoaderContractPipeline = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: documentLoaderContractPipeline.pipeline_id,
      fk_type_id: manualInputType.type_id,
      top_k: 1,
      ui_json: { x: 20, y: 380 },
    }),
  });
  console.log('POST /nodes (DocumentLoader contract ManualInput) ->', r.status);
  if (!ok(r.status)) return fail('create DocumentLoader contract ManualInput node failed', r);
  const documentLoaderContractManualNode = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: documentLoaderContractPipeline.pipeline_id,
      fk_type_id: strictToolNodeType.type_id,
      top_k: 1,
      ui_json: {
        x: 180,
        y: 380,
        tool: {
          name: 'DocumentLoader',
          config_json: {
            executor: 'http-json',
            url: `${base}/health`,
            contract: {
              name: 'DocumentLoader',
            },
          },
        },
      },
    }),
  });
  console.log('POST /nodes (DocumentLoader contract ToolNode target) ->', r.status);
  if (!ok(r.status)) return fail('create DocumentLoader contract ToolNode node failed', r);
  const documentLoaderContractToolNode = r.body;

  r = await req('/edges', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ fk_from_node: documentLoaderContractManualNode.node_id, fk_to_node: documentLoaderContractToolNode.node_id }),
  });
  console.log('POST /edges (DocumentLoader contract flow) ->', r.status);
  if (!ok(r.status)) return fail('create DocumentLoader contract flow edge failed', r);

  r = await req(`/pipelines/${documentLoaderContractPipeline.pipeline_id}/execute`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      input_json: {},
    }),
  });
  console.log('POST /pipelines/:id/execute (DocumentLoader contract invalid input) ->', r.status);
  if (r.status !== 202 || !r.body?.execution_id) {
    return fail('DocumentLoader contract invalid execution should return 202 with execution_id', r);
  }

  const documentLoaderContractExecutionId = r.body.execution_id;
  let documentLoaderContractExecution = null;
  for (let i = 0; i < 30; i += 1) {
    r = await req(`/pipelines/${documentLoaderContractPipeline.pipeline_id}/executions/${documentLoaderContractExecutionId}`, {
      method: 'GET',
      headers: authHeaders,
    });

    if (!ok(r.status)) return fail('documentloader contract execution status check failed', r);

    if (r.body?.status === 'succeeded' || r.body?.status === 'failed') {
      documentLoaderContractExecution = r.body;
      break;
    }

    await wait(150);
  }

  if (!documentLoaderContractExecution) {
    return fail('documentloader contract execution did not finish in time', r);
  }
  if (documentLoaderContractExecution.status !== 'failed') {
    return fail('documentloader contract execution should fail on missing dataset_id and uris', {
      status: 500,
      body: documentLoaderContractExecution,
    });
  }

  r = await req(`/pipelines/${documentLoaderContractPipeline.pipeline_id}`, {
    method: 'GET',
    headers: authHeaders,
  });
  console.log('GET /pipelines/:id (documentloader contract report) ->', r.status);
  if (!ok(r.status)) return fail('get documentloader contract pipeline failed', r);

  const documentLoaderContractReportNodes = r.body?.report_json?.nodes;
  if (!Array.isArray(documentLoaderContractReportNodes)) {
    return fail('documentloader contract report must contain nodes array', r);
  }

  const documentLoaderContractToolNodeState = documentLoaderContractReportNodes.find(
    (node) => node?.node_id === documentLoaderContractToolNode.node_id,
  );
  if (documentLoaderContractToolNodeState?.status !== 'failed') {
    return fail('DocumentLoader contract ToolNode target should fail', {
      status: 500,
      body: documentLoaderContractToolNodeState,
    });
  }

  const documentLoaderContractErrorCode = documentLoaderContractToolNodeState?.error?.code;
  if (documentLoaderContractErrorCode !== 'EXECUTOR_TOOLNODE_CONTRACT_INPUT_INVALID') {
    return fail('DocumentLoader contract ToolNode target should fail with EXECUTOR_TOOLNODE_CONTRACT_INPUT_INVALID', {
      status: 500,
      body: documentLoaderContractToolNodeState,
    });
  }

  r = await req('/pipelines', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_project_id: project.project_id,
      name: `it-toolnode-querybuilder-contract-happy-${suffix}`,
      max_time: 30,
      max_cost: 100,
      max_reject: 0.15,
      report_json: {},
    }),
  });
  console.log('POST /pipelines (toolnode querybuilder contract happy) ->', r.status);
  if (!ok(r.status)) return fail('create toolnode querybuilder contract happy pipeline failed', r);
  const queryBuilderHappyPipeline = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: queryBuilderHappyPipeline.pipeline_id,
      fk_type_id: manualInputType.type_id,
      top_k: 1,
      ui_json: { x: 20, y: 460 },
    }),
  });
  console.log('POST /nodes (QueryBuilder contract happy ManualInput) ->', r.status);
  if (!ok(r.status)) return fail('create QueryBuilder contract happy ManualInput node failed', r);
  const queryBuilderHappyManualNode = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: queryBuilderHappyPipeline.pipeline_id,
      fk_type_id: strictToolNodeType.type_id,
      top_k: 1,
      ui_json: {
        x: 180,
        y: 460,
        tool: {
          name: 'QueryBuilder',
          config_json: {
            executor: 'http-json',
            method: 'POST',
            url: `${base}/tool-executor/contracts`,
            contract: {
              name: 'QueryBuilder',
            },
          },
        },
      },
    }),
  });
  console.log('POST /nodes (QueryBuilder contract happy ToolNode target) ->', r.status);
  if (!ok(r.status)) return fail('create QueryBuilder contract happy ToolNode node failed', r);
  const queryBuilderHappyToolNode = r.body;

  r = await req('/edges', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ fk_from_node: queryBuilderHappyManualNode.node_id, fk_to_node: queryBuilderHappyToolNode.node_id }),
  });
  console.log('POST /edges (QueryBuilder contract happy flow) ->', r.status);
  if (!ok(r.status)) return fail('create QueryBuilder contract happy flow edge failed', r);

  r = await req(`/pipelines/${queryBuilderHappyPipeline.pipeline_id}/execute`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      input_json: {
        user_query: 'How to build a RAG retrieval pipeline with citations',
        max_terms: 4,
      },
    }),
  });
  console.log('POST /pipelines/:id/execute (QueryBuilder contract happy) ->', r.status);
  if (r.status !== 202 || !r.body?.execution_id) {
    return fail('QueryBuilder contract happy execution should return 202 with execution_id', r);
  }

  const queryBuilderHappyExecutionId = r.body.execution_id;
  let queryBuilderHappyExecution = null;
  for (let i = 0; i < 30; i += 1) {
    r = await req(`/pipelines/${queryBuilderHappyPipeline.pipeline_id}/executions/${queryBuilderHappyExecutionId}`, {
      method: 'GET',
      headers: authHeaders,
    });

    if (!ok(r.status)) return fail('querybuilder contract happy execution status check failed', r);

    if (r.body?.status === 'succeeded' || r.body?.status === 'failed') {
      queryBuilderHappyExecution = r.body;
      break;
    }

    await wait(150);
  }

  if (!queryBuilderHappyExecution) {
    return fail('querybuilder contract happy execution did not finish in time', r);
  }
  if (queryBuilderHappyExecution.status !== 'succeeded') {
    return fail('querybuilder contract happy execution should succeed', {
      status: 500,
      body: queryBuilderHappyExecution,
    });
  }

  r = await req(`/pipelines/${queryBuilderHappyPipeline.pipeline_id}`, {
    method: 'GET',
    headers: authHeaders,
  });
  console.log('GET /pipelines/:id (querybuilder contract happy report) ->', r.status);
  if (!ok(r.status)) return fail('get querybuilder contract happy pipeline failed', r);

  const queryBuilderHappyReportNodes = r.body?.report_json?.nodes;
  if (!Array.isArray(queryBuilderHappyReportNodes)) {
    return fail('querybuilder contract happy report must contain nodes array', r);
  }

  const queryBuilderHappyToolNodeState = queryBuilderHappyReportNodes.find((node) => node?.node_id === queryBuilderHappyToolNode.node_id);
  if (queryBuilderHappyToolNodeState?.status !== 'completed') {
    return fail('QueryBuilder contract happy ToolNode target should be completed', {
      status: 500,
      body: queryBuilderHappyToolNodeState,
    });
  }

  const queryBuilderHappyOutput = queryBuilderHappyToolNodeState?.output_json;
  if (queryBuilderHappyOutput?.kind !== 'tool_node' || queryBuilderHappyOutput?.contract_name !== 'QueryBuilder') {
    return fail('QueryBuilder contract happy ToolNode output should include contract_name', {
      status: 500,
      body: queryBuilderHappyOutput,
    });
  }

  const queryBuilderContractOutput = queryBuilderHappyOutput?.contract_output;
  const queryBuilderKeywords = queryBuilderContractOutput?.keywords;
  if (
    !queryBuilderContractOutput ||
    queryBuilderContractOutput?.query_mode !== 'keyword' ||
    !Array.isArray(queryBuilderKeywords) ||
    queryBuilderKeywords.length < 1 ||
    queryBuilderKeywords.length > 4
  ) {
    return fail('QueryBuilder contract happy output should include keywords in expected range', {
      status: 500,
      body: queryBuilderHappyOutput,
    });
  }

  const normalizedQuery = String(queryBuilderContractOutput?.normalized_query ?? '').toLowerCase();
  if (!normalizedQuery.includes('rag')) {
    return fail('QueryBuilder contract happy output should preserve normalized query text', {
      status: 500,
      body: queryBuilderHappyOutput,
    });
  }

  r = await req('/pipelines', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_project_id: project.project_id,
      name: `it-toolnode-documentloader-contract-happy-${suffix}`,
      max_time: 30,
      max_cost: 100,
      max_reject: 0.15,
      report_json: {},
    }),
  });
  console.log('POST /pipelines (toolnode documentloader contract happy) ->', r.status);
  if (!ok(r.status)) return fail('create toolnode documentloader contract happy pipeline failed', r);
  const documentLoaderHappyPipeline = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: documentLoaderHappyPipeline.pipeline_id,
      fk_type_id: manualInputType.type_id,
      top_k: 1,
      ui_json: { x: 20, y: 540 },
    }),
  });
  console.log('POST /nodes (DocumentLoader contract happy ManualInput) ->', r.status);
  if (!ok(r.status)) return fail('create DocumentLoader contract happy ManualInput node failed', r);
  const documentLoaderHappyManualNode = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: documentLoaderHappyPipeline.pipeline_id,
      fk_type_id: strictToolNodeType.type_id,
      top_k: 1,
      ui_json: {
        x: 180,
        y: 540,
        tool: {
          name: 'DocumentLoader',
          config_json: {
            executor: 'http-json',
            method: 'POST',
            url: `${base}/tool-executor/contracts`,
            contract: {
              name: 'DocumentLoader',
            },
          },
        },
      },
    }),
  });
  console.log('POST /nodes (DocumentLoader contract happy ToolNode target) ->', r.status);
  if (!ok(r.status)) return fail('create DocumentLoader contract happy ToolNode node failed', r);
  const documentLoaderHappyToolNode = r.body;

  r = await req('/edges', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ fk_from_node: documentLoaderHappyManualNode.node_id, fk_to_node: documentLoaderHappyToolNode.node_id }),
  });
  console.log('POST /edges (DocumentLoader contract happy flow) ->', r.status);
  if (!ok(r.status)) return fail('create DocumentLoader contract happy flow edge failed', r);

  const happyDocUris = [`s3://docs/${suffix}/a.md`, `s3://docs/${suffix}/b.md`];
  r = await req(`/pipelines/${documentLoaderHappyPipeline.pipeline_id}/execute`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      input_json: {
        dataset_id: 4242,
        uris: happyDocUris,
      },
    }),
  });
  console.log('POST /pipelines/:id/execute (DocumentLoader contract happy) ->', r.status);
  if (r.status !== 202 || !r.body?.execution_id) {
    return fail('DocumentLoader contract happy execution should return 202 with execution_id', r);
  }

  const documentLoaderHappyExecutionId = r.body.execution_id;
  let documentLoaderHappyExecution = null;
  for (let i = 0; i < 30; i += 1) {
    r = await req(`/pipelines/${documentLoaderHappyPipeline.pipeline_id}/executions/${documentLoaderHappyExecutionId}`, {
      method: 'GET',
      headers: authHeaders,
    });

    if (!ok(r.status)) return fail('documentloader contract happy execution status check failed', r);

    if (r.body?.status === 'succeeded' || r.body?.status === 'failed') {
      documentLoaderHappyExecution = r.body;
      break;
    }

    await wait(150);
  }

  if (!documentLoaderHappyExecution) {
    return fail('documentloader contract happy execution did not finish in time', r);
  }
  if (documentLoaderHappyExecution.status !== 'succeeded') {
    return fail('documentloader contract happy execution should succeed', {
      status: 500,
      body: documentLoaderHappyExecution,
    });
  }

  r = await req(`/pipelines/${documentLoaderHappyPipeline.pipeline_id}`, {
    method: 'GET',
    headers: authHeaders,
  });
  console.log('GET /pipelines/:id (documentloader contract happy report) ->', r.status);
  if (!ok(r.status)) return fail('get documentloader contract happy pipeline failed', r);

  const documentLoaderHappyReportNodes = r.body?.report_json?.nodes;
  if (!Array.isArray(documentLoaderHappyReportNodes)) {
    return fail('documentloader contract happy report must contain nodes array', r);
  }

  const documentLoaderHappyToolNodeState = documentLoaderHappyReportNodes.find(
    (node) => node?.node_id === documentLoaderHappyToolNode.node_id,
  );
  if (documentLoaderHappyToolNodeState?.status !== 'completed') {
    return fail('DocumentLoader contract happy ToolNode target should be completed', {
      status: 500,
      body: documentLoaderHappyToolNodeState,
    });
  }

  const documentLoaderHappyOutput = documentLoaderHappyToolNodeState?.output_json;
  if (documentLoaderHappyOutput?.kind !== 'tool_node' || documentLoaderHappyOutput?.contract_name !== 'DocumentLoader') {
    return fail('DocumentLoader contract happy ToolNode output should include contract_name', {
      status: 500,
      body: documentLoaderHappyOutput,
    });
  }

  const documentLoaderContractOutput = documentLoaderHappyOutput?.contract_output;
  const loadedDocuments = documentLoaderContractOutput?.documents;
  if (
    !documentLoaderContractOutput ||
    Number(documentLoaderContractOutput?.document_count) !== 2 ||
    !Array.isArray(loadedDocuments) ||
    loadedDocuments.length !== 2
  ) {
    return fail('DocumentLoader contract happy output should include expected documents list', {
      status: 500,
      body: documentLoaderHappyOutput,
    });
  }

  const loadedUris = loadedDocuments.map((doc) => doc?.uri);
  if (loadedUris[0] !== happyDocUris[0] || loadedUris[1] !== happyDocUris[1]) {
    return fail('DocumentLoader contract happy output should preserve input uri order', {
      status: 500,
      body: documentLoaderHappyOutput,
    });
  }

  if (Number(loadedDocuments[0]?.dataset_id) !== 4242 || Number(loadedDocuments[1]?.dataset_id) !== 4242) {
    return fail('DocumentLoader contract happy output should propagate dataset_id', {
      status: 500,
      body: documentLoaderHappyOutput,
    });
  }

  r = await req('/pipelines', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_project_id: project.project_id,
      name: `it-toolnode-chunker-contract-happy-${suffix}`,
      max_time: 30,
      max_cost: 100,
      max_reject: 0.15,
      report_json: {},
    }),
  });
  console.log('POST /pipelines (toolnode chunker contract happy) ->', r.status);
  if (!ok(r.status)) return fail('create toolnode chunker contract happy pipeline failed', r);
  const chunkerHappyPipeline = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: chunkerHappyPipeline.pipeline_id,
      fk_type_id: manualInputType.type_id,
      top_k: 1,
      ui_json: { x: 20, y: 620 },
    }),
  });
  console.log('POST /nodes (Chunker contract happy ManualInput) ->', r.status);
  if (!ok(r.status)) return fail('create Chunker contract happy ManualInput node failed', r);
  const chunkerHappyManualNode = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: chunkerHappyPipeline.pipeline_id,
      fk_type_id: strictToolNodeType.type_id,
      top_k: 1,
      ui_json: {
        x: 180,
        y: 620,
        tool: {
          name: 'Chunker',
          config_json: {
            executor: 'http-json',
            method: 'POST',
            url: `${base}/tool-executor/contracts`,
            contract: {
              name: 'Chunker',
            },
          },
        },
      },
    }),
  });
  console.log('POST /nodes (Chunker contract happy ToolNode target) ->', r.status);
  if (!ok(r.status)) return fail('create Chunker contract happy ToolNode node failed', r);
  const chunkerHappyToolNode = r.body;

  r = await req('/edges', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ fk_from_node: chunkerHappyManualNode.node_id, fk_to_node: chunkerHappyToolNode.node_id }),
  });
  console.log('POST /edges (Chunker contract happy flow) ->', r.status);
  if (!ok(r.status)) return fail('create Chunker contract happy flow edge failed', r);

  r = await req(`/pipelines/${chunkerHappyPipeline.pipeline_id}/execute`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      input_json: {
        documents: [
          {
            document_id: 'doc_alpha',
            text: 'alpha beta gamma delta epsilon zeta',
          },
        ],
        chunk_size: 3,
        overlap: 1,
      },
    }),
  });
  console.log('POST /pipelines/:id/execute (Chunker contract happy) ->', r.status);
  if (r.status !== 202 || !r.body?.execution_id) {
    return fail('Chunker contract happy execution should return 202 with execution_id', r);
  }

  const chunkerHappyExecutionId = r.body.execution_id;
  let chunkerHappyExecution = null;
  for (let i = 0; i < 30; i += 1) {
    r = await req(`/pipelines/${chunkerHappyPipeline.pipeline_id}/executions/${chunkerHappyExecutionId}`, {
      method: 'GET',
      headers: authHeaders,
    });

    if (!ok(r.status)) return fail('chunker contract happy execution status check failed', r);

    if (r.body?.status === 'succeeded' || r.body?.status === 'failed') {
      chunkerHappyExecution = r.body;
      break;
    }

    await wait(150);
  }

  if (!chunkerHappyExecution) {
    return fail('chunker contract happy execution did not finish in time', r);
  }
  if (chunkerHappyExecution.status !== 'succeeded') {
    return fail('chunker contract happy execution should succeed', {
      status: 500,
      body: chunkerHappyExecution,
    });
  }

  r = await req(`/pipelines/${chunkerHappyPipeline.pipeline_id}`, {
    method: 'GET',
    headers: authHeaders,
  });
  console.log('GET /pipelines/:id (chunker contract happy report) ->', r.status);
  if (!ok(r.status)) return fail('get chunker contract happy pipeline failed', r);

  const chunkerHappyReportNodes = r.body?.report_json?.nodes;
  if (!Array.isArray(chunkerHappyReportNodes)) {
    return fail('chunker contract happy report must contain nodes array', r);
  }

  const chunkerHappyToolNodeState = chunkerHappyReportNodes.find((node) => node?.node_id === chunkerHappyToolNode.node_id);
  if (chunkerHappyToolNodeState?.status !== 'completed') {
    return fail('Chunker contract happy ToolNode target should be completed', {
      status: 500,
      body: chunkerHappyToolNodeState,
    });
  }

  const chunkerHappyOutput = chunkerHappyToolNodeState?.output_json;
  if (chunkerHappyOutput?.kind !== 'tool_node' || chunkerHappyOutput?.contract_name !== 'Chunker') {
    return fail('Chunker contract happy ToolNode output should include contract_name', {
      status: 500,
      body: chunkerHappyOutput,
    });
  }

  const chunkerContractOutput = chunkerHappyOutput?.contract_output;
  const chunkerChunks = chunkerContractOutput?.chunks;
  if (
    !chunkerContractOutput ||
    Number(chunkerContractOutput?.chunk_count) !== 3 ||
    !Array.isArray(chunkerChunks) ||
    chunkerChunks.length !== 3
  ) {
    return fail('Chunker contract happy output should include expected chunks list', {
      status: 500,
      body: chunkerHappyOutput,
    });
  }

  if (chunkerChunks[0]?.text !== 'alpha beta gamma' || chunkerChunks[1]?.text !== 'gamma delta epsilon') {
    return fail('Chunker contract happy output should preserve expected chunk overlap', {
      status: 500,
      body: chunkerHappyOutput,
    });
  }

  r = await req('/pipelines', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_project_id: project.project_id,
      name: `it-toolnode-embedder-contract-happy-${suffix}`,
      max_time: 30,
      max_cost: 100,
      max_reject: 0.15,
      report_json: {},
    }),
  });
  console.log('POST /pipelines (toolnode embedder contract happy) ->', r.status);
  if (!ok(r.status)) return fail('create toolnode embedder contract happy pipeline failed', r);
  const embedderHappyPipeline = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: embedderHappyPipeline.pipeline_id,
      fk_type_id: manualInputType.type_id,
      top_k: 1,
      ui_json: { x: 20, y: 700 },
    }),
  });
  console.log('POST /nodes (Embedder contract happy ManualInput) ->', r.status);
  if (!ok(r.status)) return fail('create Embedder contract happy ManualInput node failed', r);
  const embedderHappyManualNode = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: embedderHappyPipeline.pipeline_id,
      fk_type_id: strictToolNodeType.type_id,
      top_k: 1,
      ui_json: {
        x: 180,
        y: 700,
        tool: {
          name: 'Embedder',
          config_json: {
            executor: 'http-json',
            method: 'POST',
            url: `${base}/tool-executor/contracts`,
            contract: {
              name: 'Embedder',
            },
          },
        },
      },
    }),
  });
  console.log('POST /nodes (Embedder contract happy ToolNode target) ->', r.status);
  if (!ok(r.status)) return fail('create Embedder contract happy ToolNode node failed', r);
  const embedderHappyToolNode = r.body;

  r = await req('/edges', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ fk_from_node: embedderHappyManualNode.node_id, fk_to_node: embedderHappyToolNode.node_id }),
  });
  console.log('POST /edges (Embedder contract happy flow) ->', r.status);
  if (!ok(r.status)) return fail('create Embedder contract happy flow edge failed', r);

  r = await req(`/pipelines/${embedderHappyPipeline.pipeline_id}/execute`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      input_json: {
        chunks: [
          { chunk_id: 'chunk_a', text: 'alpha beta gamma' },
          { chunk_id: 'chunk_b', text: 'delta epsilon zeta' },
        ],
        vector_size: 6,
      },
    }),
  });
  console.log('POST /pipelines/:id/execute (Embedder contract happy) ->', r.status);
  if (r.status !== 202 || !r.body?.execution_id) {
    return fail('Embedder contract happy execution should return 202 with execution_id', r);
  }

  const embedderHappyExecutionId = r.body.execution_id;
  let embedderHappyExecution = null;
  for (let i = 0; i < 30; i += 1) {
    r = await req(`/pipelines/${embedderHappyPipeline.pipeline_id}/executions/${embedderHappyExecutionId}`, {
      method: 'GET',
      headers: authHeaders,
    });

    if (!ok(r.status)) return fail('embedder contract happy execution status check failed', r);

    if (r.body?.status === 'succeeded' || r.body?.status === 'failed') {
      embedderHappyExecution = r.body;
      break;
    }

    await wait(150);
  }

  if (!embedderHappyExecution) {
    return fail('embedder contract happy execution did not finish in time', r);
  }
  if (embedderHappyExecution.status !== 'succeeded') {
    return fail('embedder contract happy execution should succeed', {
      status: 500,
      body: embedderHappyExecution,
    });
  }

  r = await req(`/pipelines/${embedderHappyPipeline.pipeline_id}`, {
    method: 'GET',
    headers: authHeaders,
  });
  console.log('GET /pipelines/:id (embedder contract happy report) ->', r.status);
  if (!ok(r.status)) return fail('get embedder contract happy pipeline failed', r);

  const embedderHappyReportNodes = r.body?.report_json?.nodes;
  if (!Array.isArray(embedderHappyReportNodes)) {
    return fail('embedder contract happy report must contain nodes array', r);
  }

  const embedderHappyToolNodeState = embedderHappyReportNodes.find((node) => node?.node_id === embedderHappyToolNode.node_id);
  if (embedderHappyToolNodeState?.status !== 'completed') {
    return fail('Embedder contract happy ToolNode target should be completed', {
      status: 500,
      body: embedderHappyToolNodeState,
    });
  }

  const embedderHappyOutput = embedderHappyToolNodeState?.output_json;
  if (embedderHappyOutput?.kind !== 'tool_node' || embedderHappyOutput?.contract_name !== 'Embedder') {
    return fail('Embedder contract happy ToolNode output should include contract_name', {
      status: 500,
      body: embedderHappyOutput,
    });
  }

  const embedderContractOutput = embedderHappyOutput?.contract_output;
  const embedderVectors = embedderContractOutput?.vectors;
  if (
    !embedderContractOutput ||
    Number(embedderContractOutput?.vector_count) !== 2 ||
    !Array.isArray(embedderVectors) ||
    embedderVectors.length !== 2
  ) {
    return fail('Embedder contract happy output should include expected vectors list', {
      status: 500,
      body: embedderHappyOutput,
    });
  }

  if (
    !Array.isArray(embedderVectors[0]?.vector) ||
    embedderVectors[0].vector.length !== 6 ||
    !embedderVectors[0].vector.every((value) => Number.isFinite(value))
  ) {
    return fail('Embedder contract happy output should include finite vector values of expected size', {
      status: 500,
      body: embedderHappyOutput,
    });
  }

  r = await req('/pipelines', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_project_id: project.project_id,
      name: `it-toolnode-vectorupsert-contract-happy-${suffix}`,
      max_time: 30,
      max_cost: 100,
      max_reject: 0.15,
      report_json: {},
    }),
  });
  console.log('POST /pipelines (toolnode vectorupsert contract happy) ->', r.status);
  if (!ok(r.status)) return fail('create toolnode vectorupsert contract happy pipeline failed', r);
  const vectorUpsertHappyPipeline = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: vectorUpsertHappyPipeline.pipeline_id,
      fk_type_id: manualInputType.type_id,
      top_k: 1,
      ui_json: { x: 20, y: 780 },
    }),
  });
  console.log('POST /nodes (VectorUpsert contract happy ManualInput) ->', r.status);
  if (!ok(r.status)) return fail('create VectorUpsert contract happy ManualInput node failed', r);
  const vectorUpsertHappyManualNode = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: vectorUpsertHappyPipeline.pipeline_id,
      fk_type_id: strictToolNodeType.type_id,
      top_k: 1,
      ui_json: {
        x: 180,
        y: 780,
        tool: {
          name: 'VectorUpsert',
          config_json: {
            executor: 'http-json',
            method: 'POST',
            url: `${base}/tool-executor/contracts`,
            contract: {
              name: 'VectorUpsert',
            },
          },
        },
      },
    }),
  });
  console.log('POST /nodes (VectorUpsert contract happy ToolNode target) ->', r.status);
  if (!ok(r.status)) return fail('create VectorUpsert contract happy ToolNode node failed', r);
  const vectorUpsertHappyToolNode = r.body;

  r = await req('/edges', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ fk_from_node: vectorUpsertHappyManualNode.node_id, fk_to_node: vectorUpsertHappyToolNode.node_id }),
  });
  console.log('POST /edges (VectorUpsert contract happy flow) ->', r.status);
  if (!ok(r.status)) return fail('create VectorUpsert contract happy flow edge failed', r);

  r = await req(`/pipelines/${vectorUpsertHappyPipeline.pipeline_id}/execute`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      input_json: {
        index_name: 'knowledge_idx',
        namespace: 'tenant_a',
        vectors: [
          { chunk_id: 'chunk_a', vector: [0.1, 0.2, 0.3] },
          { chunk_id: 'chunk_b', vector: [0.3, 0.2, 0.1] },
        ],
      },
    }),
  });
  console.log('POST /pipelines/:id/execute (VectorUpsert contract happy) ->', r.status);
  if (r.status !== 202 || !r.body?.execution_id) {
    return fail('VectorUpsert contract happy execution should return 202 with execution_id', r);
  }

  const vectorUpsertHappyExecutionId = r.body.execution_id;
  let vectorUpsertHappyExecution = null;
  for (let i = 0; i < 30; i += 1) {
    r = await req(`/pipelines/${vectorUpsertHappyPipeline.pipeline_id}/executions/${vectorUpsertHappyExecutionId}`, {
      method: 'GET',
      headers: authHeaders,
    });

    if (!ok(r.status)) return fail('vectorupsert contract happy execution status check failed', r);

    if (r.body?.status === 'succeeded' || r.body?.status === 'failed') {
      vectorUpsertHappyExecution = r.body;
      break;
    }

    await wait(150);
  }

  if (!vectorUpsertHappyExecution) {
    return fail('vectorupsert contract happy execution did not finish in time', r);
  }
  if (vectorUpsertHappyExecution.status !== 'succeeded') {
    return fail('vectorupsert contract happy execution should succeed', {
      status: 500,
      body: vectorUpsertHappyExecution,
    });
  }

  r = await req(`/pipelines/${vectorUpsertHappyPipeline.pipeline_id}`, {
    method: 'GET',
    headers: authHeaders,
  });
  console.log('GET /pipelines/:id (vectorupsert contract happy report) ->', r.status);
  if (!ok(r.status)) return fail('get vectorupsert contract happy pipeline failed', r);

  const vectorUpsertHappyReportNodes = r.body?.report_json?.nodes;
  if (!Array.isArray(vectorUpsertHappyReportNodes)) {
    return fail('vectorupsert contract happy report must contain nodes array', r);
  }

  const vectorUpsertHappyToolNodeState = vectorUpsertHappyReportNodes.find(
    (node) => node?.node_id === vectorUpsertHappyToolNode.node_id,
  );
  if (vectorUpsertHappyToolNodeState?.status !== 'completed') {
    return fail('VectorUpsert contract happy ToolNode target should be completed', {
      status: 500,
      body: vectorUpsertHappyToolNodeState,
    });
  }

  const vectorUpsertHappyOutput = vectorUpsertHappyToolNodeState?.output_json;
  if (vectorUpsertHappyOutput?.kind !== 'tool_node' || vectorUpsertHappyOutput?.contract_name !== 'VectorUpsert') {
    return fail('VectorUpsert contract happy ToolNode output should include contract_name', {
      status: 500,
      body: vectorUpsertHappyOutput,
    });
  }

  const vectorUpsertContractOutput = vectorUpsertHappyOutput?.contract_output;
  const vectorUpsertIds = vectorUpsertContractOutput?.upsert_ids;
  if (
    !vectorUpsertContractOutput ||
    Number(vectorUpsertContractOutput?.upserted_count) !== 2 ||
    !Array.isArray(vectorUpsertIds) ||
    vectorUpsertIds.length !== 2
  ) {
    return fail('VectorUpsert contract happy output should include expected upsert report', {
      status: 500,
      body: vectorUpsertHappyOutput,
    });
  }

  if (
    vectorUpsertContractOutput?.index_name !== 'knowledge_idx' ||
    vectorUpsertContractOutput?.namespace !== 'tenant_a' ||
    vectorUpsertIds[0] !== 'chunk_a' ||
    vectorUpsertIds[1] !== 'chunk_b'
  ) {
    return fail('VectorUpsert contract happy output should preserve index/namespace/upsert order', {
      status: 500,
      body: vectorUpsertHappyOutput,
    });
  }

  r = await req('/pipelines', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_project_id: project.project_id,
      name: `it-toolnode-hybridretriever-contract-happy-${suffix}`,
      max_time: 30,
      max_cost: 100,
      max_reject: 0.15,
      report_json: {},
    }),
  });
  console.log('POST /pipelines (toolnode hybridretriever contract happy) ->', r.status);
  if (!ok(r.status)) return fail('create toolnode hybridretriever contract happy pipeline failed', r);
  const hybridRetrieverHappyPipeline = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: hybridRetrieverHappyPipeline.pipeline_id,
      fk_type_id: manualInputType.type_id,
      top_k: 1,
      ui_json: { x: 20, y: 860 },
    }),
  });
  console.log('POST /nodes (HybridRetriever contract happy ManualInput) ->', r.status);
  if (!ok(r.status)) return fail('create HybridRetriever contract happy ManualInput node failed', r);
  const hybridRetrieverHappyManualNode = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: hybridRetrieverHappyPipeline.pipeline_id,
      fk_type_id: strictToolNodeType.type_id,
      top_k: 1,
      ui_json: {
        x: 180,
        y: 860,
        tool: {
          name: 'HybridRetriever',
          config_json: {
            executor: 'http-json',
            method: 'POST',
            url: `${base}/tool-executor/contracts`,
            contract: {
              name: 'HybridRetriever',
            },
          },
        },
      },
    }),
  });
  console.log('POST /nodes (HybridRetriever contract happy ToolNode target) ->', r.status);
  if (!ok(r.status)) return fail('create HybridRetriever contract happy ToolNode node failed', r);
  const hybridRetrieverHappyToolNode = r.body;

  r = await req('/edges', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ fk_from_node: hybridRetrieverHappyManualNode.node_id, fk_to_node: hybridRetrieverHappyToolNode.node_id }),
  });
  console.log('POST /edges (HybridRetriever contract happy flow) ->', r.status);
  if (!ok(r.status)) return fail('create HybridRetriever contract happy flow edge failed', r);

  r = await req(`/pipelines/${hybridRetrieverHappyPipeline.pipeline_id}/execute`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      input_json: {
        retrieval_query: 'rag retrieval citations quality',
        top_k: 3,
        mode: 'hybrid',
        alpha: 0.35,
      },
    }),
  });
  console.log('POST /pipelines/:id/execute (HybridRetriever contract happy) ->', r.status);
  if (r.status !== 202 || !r.body?.execution_id) {
    return fail('HybridRetriever contract happy execution should return 202 with execution_id', r);
  }

  const hybridRetrieverHappyExecutionId = r.body.execution_id;
  let hybridRetrieverHappyExecution = null;
  for (let i = 0; i < 30; i += 1) {
    r = await req(`/pipelines/${hybridRetrieverHappyPipeline.pipeline_id}/executions/${hybridRetrieverHappyExecutionId}`, {
      method: 'GET',
      headers: authHeaders,
    });

    if (!ok(r.status)) return fail('hybridretriever contract happy execution status check failed', r);

    if (r.body?.status === 'succeeded' || r.body?.status === 'failed') {
      hybridRetrieverHappyExecution = r.body;
      break;
    }

    await wait(150);
  }

  if (!hybridRetrieverHappyExecution) {
    return fail('hybridretriever contract happy execution did not finish in time', r);
  }
  if (hybridRetrieverHappyExecution.status !== 'succeeded') {
    return fail('hybridretriever contract happy execution should succeed', {
      status: 500,
      body: hybridRetrieverHappyExecution,
    });
  }

  r = await req(`/pipelines/${hybridRetrieverHappyPipeline.pipeline_id}`, {
    method: 'GET',
    headers: authHeaders,
  });
  console.log('GET /pipelines/:id (hybridretriever contract happy report) ->', r.status);
  if (!ok(r.status)) return fail('get hybridretriever contract happy pipeline failed', r);

  const hybridRetrieverHappyReportNodes = r.body?.report_json?.nodes;
  if (!Array.isArray(hybridRetrieverHappyReportNodes)) {
    return fail('hybridretriever contract happy report must contain nodes array', r);
  }

  const hybridRetrieverHappyToolNodeState = hybridRetrieverHappyReportNodes.find(
    (node) => node?.node_id === hybridRetrieverHappyToolNode.node_id,
  );
  if (hybridRetrieverHappyToolNodeState?.status !== 'completed') {
    return fail('HybridRetriever contract happy ToolNode target should be completed', {
      status: 500,
      body: hybridRetrieverHappyToolNodeState,
    });
  }

  const hybridRetrieverHappyOutput = hybridRetrieverHappyToolNodeState?.output_json;
  if (hybridRetrieverHappyOutput?.kind !== 'tool_node' || hybridRetrieverHappyOutput?.contract_name !== 'HybridRetriever') {
    return fail('HybridRetriever contract happy ToolNode output should include contract_name', {
      status: 500,
      body: hybridRetrieverHappyOutput,
    });
  }

  const hybridRetrieverContractOutput = hybridRetrieverHappyOutput?.contract_output;
  const hybridCandidates = hybridRetrieverContractOutput?.candidates;
  if (
    !hybridRetrieverContractOutput ||
    Number(hybridRetrieverContractOutput?.candidate_count) !== 3 ||
    !Array.isArray(hybridCandidates) ||
    hybridCandidates.length !== 3
  ) {
    return fail('HybridRetriever contract happy output should include expected candidates list', {
      status: 500,
      body: hybridRetrieverHappyOutput,
    });
  }

  if (
    hybridRetrieverContractOutput?.mode !== 'hybrid' ||
    !String(hybridCandidates[0]?.snippet ?? '').toLowerCase().includes('rag')
  ) {
    return fail('HybridRetriever contract happy output should preserve mode and retrieval context', {
      status: 500,
      body: hybridRetrieverHappyOutput,
    });
  }

  r = await req('/pipelines', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_project_id: project.project_id,
      name: `it-toolnode-contextassembler-contract-happy-${suffix}`,
      max_time: 30,
      max_cost: 100,
      max_reject: 0.15,
      report_json: {},
    }),
  });
  console.log('POST /pipelines (toolnode contextassembler contract happy) ->', r.status);
  if (!ok(r.status)) return fail('create toolnode contextassembler contract happy pipeline failed', r);
  const contextAssemblerHappyPipeline = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: contextAssemblerHappyPipeline.pipeline_id,
      fk_type_id: manualInputType.type_id,
      top_k: 1,
      ui_json: { x: 20, y: 940 },
    }),
  });
  console.log('POST /nodes (ContextAssembler contract happy ManualInput) ->', r.status);
  if (!ok(r.status)) return fail('create ContextAssembler contract happy ManualInput node failed', r);
  const contextAssemblerHappyManualNode = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: contextAssemblerHappyPipeline.pipeline_id,
      fk_type_id: strictToolNodeType.type_id,
      top_k: 1,
      ui_json: {
        x: 180,
        y: 940,
        tool: {
          name: 'ContextAssembler',
          config_json: {
            executor: 'http-json',
            method: 'POST',
            url: `${base}/tool-executor/contracts`,
            contract: {
              name: 'ContextAssembler',
            },
          },
        },
      },
    }),
  });
  console.log('POST /nodes (ContextAssembler contract happy ToolNode target) ->', r.status);
  if (!ok(r.status)) return fail('create ContextAssembler contract happy ToolNode node failed', r);
  const contextAssemblerHappyToolNode = r.body;

  r = await req('/edges', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_from_node: contextAssemblerHappyManualNode.node_id,
      fk_to_node: contextAssemblerHappyToolNode.node_id,
    }),
  });
  console.log('POST /edges (ContextAssembler contract happy flow) ->', r.status);
  if (!ok(r.status)) return fail('create ContextAssembler contract happy flow edge failed', r);

  r = await req(`/pipelines/${contextAssemblerHappyPipeline.pipeline_id}/execute`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      input_json: {
        candidates: [
          { document_id: 'doc_1', chunk_id: 'chunk_1', snippet: 'rag uses retrieval context', score: 0.93 },
          { document_id: 'doc_2', chunk_id: 'chunk_2', snippet: 'citations improve trustworthiness', score: 0.88 },
          { document_id: 'doc_3', chunk_id: 'chunk_3', snippet: 'assemble compact context bundles', score: 0.83 },
        ],
        max_context_tokens: 7,
        strategy: 'topk-pack',
      },
    }),
  });
  console.log('POST /pipelines/:id/execute (ContextAssembler contract happy) ->', r.status);
  if (r.status !== 202 || !r.body?.execution_id) {
    return fail('ContextAssembler contract happy execution should return 202 with execution_id', r);
  }

  const contextAssemblerHappyExecutionId = r.body.execution_id;
  let contextAssemblerHappyExecution = null;
  for (let i = 0; i < 30; i += 1) {
    r = await req(`/pipelines/${contextAssemblerHappyPipeline.pipeline_id}/executions/${contextAssemblerHappyExecutionId}`, {
      method: 'GET',
      headers: authHeaders,
    });

    if (!ok(r.status)) return fail('contextassembler contract happy execution status check failed', r);

    if (r.body?.status === 'succeeded' || r.body?.status === 'failed') {
      contextAssemblerHappyExecution = r.body;
      break;
    }

    await wait(150);
  }

  if (!contextAssemblerHappyExecution) {
    return fail('contextassembler contract happy execution did not finish in time', r);
  }
  if (contextAssemblerHappyExecution.status !== 'succeeded') {
    return fail('contextassembler contract happy execution should succeed', {
      status: 500,
      body: contextAssemblerHappyExecution,
    });
  }

  r = await req(`/pipelines/${contextAssemblerHappyPipeline.pipeline_id}`, {
    method: 'GET',
    headers: authHeaders,
  });
  console.log('GET /pipelines/:id (contextassembler contract happy report) ->', r.status);
  if (!ok(r.status)) return fail('get contextassembler contract happy pipeline failed', r);

  const contextAssemblerHappyReportNodes = r.body?.report_json?.nodes;
  if (!Array.isArray(contextAssemblerHappyReportNodes)) {
    return fail('contextassembler contract happy report must contain nodes array', r);
  }

  const contextAssemblerHappyToolNodeState = contextAssemblerHappyReportNodes.find(
    (node) => node?.node_id === contextAssemblerHappyToolNode.node_id,
  );
  if (contextAssemblerHappyToolNodeState?.status !== 'completed') {
    return fail('ContextAssembler contract happy ToolNode target should be completed', {
      status: 500,
      body: contextAssemblerHappyToolNodeState,
    });
  }

  const contextAssemblerHappyOutput = contextAssemblerHappyToolNodeState?.output_json;
  if (contextAssemblerHappyOutput?.kind !== 'tool_node' || contextAssemblerHappyOutput?.contract_name !== 'ContextAssembler') {
    return fail('ContextAssembler contract happy ToolNode output should include contract_name', {
      status: 500,
      body: contextAssemblerHappyOutput,
    });
  }

  const contextAssemblerContractOutput = contextAssemblerHappyOutput?.contract_output;
  const contextBundle = contextAssemblerContractOutput?.context_bundle;
  if (
    !contextAssemblerContractOutput ||
    Number(contextAssemblerContractOutput?.candidate_count) !== 3 ||
    Number(contextAssemblerContractOutput?.selected_count) !== 2 ||
    contextAssemblerContractOutput?.truncated !== true ||
    !contextBundle
  ) {
    return fail('ContextAssembler contract happy output should include expected context bundle summary', {
      status: 500,
      body: contextAssemblerHappyOutput,
    });
  }

  if (Number(contextBundle?.token_estimate) !== 7 || !String(contextBundle?.text ?? '').includes('[1] rag uses retrieval context')) {
    return fail('ContextAssembler contract happy output should preserve deterministic assembled context', {
      status: 500,
      body: contextAssemblerHappyOutput,
    });
  }

  r = await req('/pipelines', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_project_id: project.project_id,
      name: `it-toolnode-llmanswer-contract-happy-${suffix}`,
      max_time: 30,
      max_cost: 100,
      max_reject: 0.15,
      report_json: {},
    }),
  });
  console.log('POST /pipelines (toolnode llmanswer contract happy) ->', r.status);
  if (!ok(r.status)) return fail('create toolnode llmanswer contract happy pipeline failed', r);
  const llmAnswerHappyPipeline = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: llmAnswerHappyPipeline.pipeline_id,
      fk_type_id: manualInputType.type_id,
      top_k: 1,
      ui_json: { x: 20, y: 980 },
    }),
  });
  console.log('POST /nodes (LLMAnswer contract happy ManualInput) ->', r.status);
  if (!ok(r.status)) return fail('create LLMAnswer contract happy ManualInput node failed', r);
  const llmAnswerHappyManualNode = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: llmAnswerHappyPipeline.pipeline_id,
      fk_type_id: strictToolNodeType.type_id,
      top_k: 1,
      ui_json: {
        x: 180,
        y: 980,
        tool: {
          name: 'LLMAnswer',
          config_json: {
            executor: 'http-json',
            method: 'POST',
            url: `${base}/tool-executor/contracts`,
            contract: {
              name: 'LLMAnswer',
            },
          },
        },
      },
    }),
  });
  console.log('POST /nodes (LLMAnswer contract happy ToolNode target) ->', r.status);
  if (!ok(r.status)) return fail('create LLMAnswer contract happy ToolNode node failed', r);
  const llmAnswerHappyToolNode = r.body;

  r = await req('/edges', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_from_node: llmAnswerHappyManualNode.node_id,
      fk_to_node: llmAnswerHappyToolNode.node_id,
    }),
  });
  console.log('POST /edges (LLMAnswer contract happy flow) ->', r.status);
  if (!ok(r.status)) return fail('create LLMAnswer contract happy flow edge failed', r);

  if (!llmContractModel) {
    return fail('LLMAnswer contract happy test requires OPENROUTER_LLM_MODEL or RAG_E2E_AGENT_MODEL env', {
      status: 500,
      body: { llmContractModel },
    });
  }

  r = await req(`/pipelines/${llmAnswerHappyPipeline.pipeline_id}/execute`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      input_json: {
        context_bundle: {
          text: '[1] RAG combines retrieval with generation to ground model responses.',
        },
        user_query: 'What is RAG?',
        prompt_template: 'Answer the query using context only.\nQuery: {{query}}\nContext: {{context}}',
        ...(llmContractModel ? { model: llmContractModel } : {}),
        temperature: 0.2,
        max_output_tokens: 64,
      },
    }),
  });
  console.log('POST /pipelines/:id/execute (LLMAnswer contract happy) ->', r.status);
  if (r.status !== 202 || !r.body?.execution_id) {
    return fail('LLMAnswer contract happy execution should return 202 with execution_id', r);
  }

  const llmAnswerHappyExecutionId = r.body.execution_id;
  let llmAnswerHappyExecution = null;
  for (let i = 0; i < 30; i += 1) {
    r = await req(`/pipelines/${llmAnswerHappyPipeline.pipeline_id}/executions/${llmAnswerHappyExecutionId}`, {
      method: 'GET',
      headers: authHeaders,
    });

    if (!ok(r.status)) return fail('llmanswer contract happy execution status check failed', r);

    if (r.body?.status === 'succeeded' || r.body?.status === 'failed') {
      llmAnswerHappyExecution = r.body;
      break;
    }

    await wait(150);
  }

  if (!llmAnswerHappyExecution) {
    return fail('llmanswer contract happy execution did not finish in time', r);
  }
  if (llmAnswerHappyExecution.status !== 'succeeded') {
    return fail('llmanswer contract happy execution should succeed', {
      status: 500,
      body: llmAnswerHappyExecution,
    });
  }

  r = await req(`/pipelines/${llmAnswerHappyPipeline.pipeline_id}`, {
    method: 'GET',
    headers: authHeaders,
  });
  console.log('GET /pipelines/:id (llmanswer contract happy report) ->', r.status);
  if (!ok(r.status)) return fail('get llmanswer contract happy pipeline failed', r);

  const llmAnswerHappyReportNodes = r.body?.report_json?.nodes;
  if (!Array.isArray(llmAnswerHappyReportNodes)) {
    return fail('llmanswer contract happy report must contain nodes array', r);
  }

  const llmAnswerHappyToolNodeState = llmAnswerHappyReportNodes.find(
    (node) => node?.node_id === llmAnswerHappyToolNode.node_id,
  );
  if (llmAnswerHappyToolNodeState?.status !== 'completed') {
    return fail('LLMAnswer contract happy ToolNode target should be completed', {
      status: 500,
      body: llmAnswerHappyToolNodeState,
    });
  }

  const llmAnswerHappyOutput = llmAnswerHappyToolNodeState?.output_json;
  if (llmAnswerHappyOutput?.kind !== 'tool_node' || llmAnswerHappyOutput?.contract_name !== 'LLMAnswer') {
    return fail('LLMAnswer contract happy ToolNode output should include contract_name', {
      status: 500,
      body: llmAnswerHappyOutput,
    });
  }

  const llmAnswerContractOutput = llmAnswerHappyOutput?.contract_output;
  if (
    !llmAnswerContractOutput ||
    !String(llmAnswerContractOutput?.answer ?? '').toLowerCase().includes('rag') ||
    llmAnswerContractOutput?.grounded !== true
  ) {
    return fail('LLMAnswer contract happy output should include grounded deterministic answer', {
      status: 500,
      body: llmAnswerHappyOutput,
    });
  }

  if (
    llmAnswerContractOutput?.model !== llmContractModel ||
    Number(llmAnswerContractOutput?.max_output_tokens) !== 64 ||
    !String(llmAnswerContractOutput?.prompt ?? '').includes('What is RAG?')
  ) {
    return fail('LLMAnswer contract happy output should preserve model and rendered prompt details', {
      status: 500,
      body: llmAnswerHappyOutput,
    });
  }

  r = await req('/pipelines', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_project_id: project.project_id,
      name: `it-toolnode-citationformatter-contract-happy-${suffix}`,
      max_time: 30,
      max_cost: 100,
      max_reject: 0.15,
      report_json: {},
    }),
  });
  console.log('POST /pipelines (toolnode citationformatter contract happy) ->', r.status);
  if (!ok(r.status)) return fail('create toolnode citationformatter contract happy pipeline failed', r);
  const citationFormatterHappyPipeline = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: citationFormatterHappyPipeline.pipeline_id,
      fk_type_id: manualInputType.type_id,
      top_k: 1,
      ui_json: { x: 20, y: 1020 },
    }),
  });
  console.log('POST /nodes (CitationFormatter contract happy ManualInput) ->', r.status);
  if (!ok(r.status)) return fail('create CitationFormatter contract happy ManualInput node failed', r);
  const citationFormatterHappyManualNode = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: citationFormatterHappyPipeline.pipeline_id,
      fk_type_id: strictToolNodeType.type_id,
      top_k: 1,
      ui_json: {
        x: 180,
        y: 1020,
        tool: {
          name: 'CitationFormatter',
          config_json: {
            executor: 'http-json',
            method: 'POST',
            url: `${base}/tool-executor/contracts`,
            contract: {
              name: 'CitationFormatter',
            },
          },
        },
      },
    }),
  });
  console.log('POST /nodes (CitationFormatter contract happy ToolNode target) ->', r.status);
  if (!ok(r.status)) return fail('create CitationFormatter contract happy ToolNode node failed', r);
  const citationFormatterHappyToolNode = r.body;

  r = await req('/edges', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_from_node: citationFormatterHappyManualNode.node_id,
      fk_to_node: citationFormatterHappyToolNode.node_id,
    }),
  });
  console.log('POST /edges (CitationFormatter contract happy flow) ->', r.status);
  if (!ok(r.status)) return fail('create CitationFormatter contract happy flow edge failed', r);

  r = await req(`/pipelines/${citationFormatterHappyPipeline.pipeline_id}/execute`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      input_json: {
        answer: 'RAG combines retrieval with generation.',
        candidates: [
          { document_id: 'doc_1', chunk_id: 'chunk_1', snippet: 'retrieval augments answer grounding' },
          { document_id: 'doc_2', chunk_id: 'chunk_2', snippet: 'citations help users verify source evidence' },
        ],
      },
    }),
  });
  console.log('POST /pipelines/:id/execute (CitationFormatter contract happy) ->', r.status);
  if (r.status !== 202 || !r.body?.execution_id) {
    return fail('CitationFormatter contract happy execution should return 202 with execution_id', r);
  }

  const citationFormatterHappyExecutionId = r.body.execution_id;
  let citationFormatterHappyExecution = null;
  for (let i = 0; i < 30; i += 1) {
    r = await req(`/pipelines/${citationFormatterHappyPipeline.pipeline_id}/executions/${citationFormatterHappyExecutionId}`, {
      method: 'GET',
      headers: authHeaders,
    });

    if (!ok(r.status)) return fail('citationformatter contract happy execution status check failed', r);

    if (r.body?.status === 'succeeded' || r.body?.status === 'failed') {
      citationFormatterHappyExecution = r.body;
      break;
    }

    await wait(150);
  }

  if (!citationFormatterHappyExecution) {
    return fail('citationformatter contract happy execution did not finish in time', r);
  }
  if (citationFormatterHappyExecution.status !== 'succeeded') {
    return fail('citationformatter contract happy execution should succeed', {
      status: 500,
      body: citationFormatterHappyExecution,
    });
  }

  r = await req(`/pipelines/${citationFormatterHappyPipeline.pipeline_id}`, {
    method: 'GET',
    headers: authHeaders,
  });
  console.log('GET /pipelines/:id (citationformatter contract happy report) ->', r.status);
  if (!ok(r.status)) return fail('get citationformatter contract happy pipeline failed', r);

  const citationFormatterHappyReportNodes = r.body?.report_json?.nodes;
  if (!Array.isArray(citationFormatterHappyReportNodes)) {
    return fail('citationformatter contract happy report must contain nodes array', r);
  }

  const citationFormatterHappyToolNodeState = citationFormatterHappyReportNodes.find(
    (node) => node?.node_id === citationFormatterHappyToolNode.node_id,
  );
  if (citationFormatterHappyToolNodeState?.status !== 'completed') {
    return fail('CitationFormatter contract happy ToolNode target should be completed', {
      status: 500,
      body: citationFormatterHappyToolNodeState,
    });
  }

  const citationFormatterHappyOutput = citationFormatterHappyToolNodeState?.output_json;
  if (citationFormatterHappyOutput?.kind !== 'tool_node' || citationFormatterHappyOutput?.contract_name !== 'CitationFormatter') {
    return fail('CitationFormatter contract happy ToolNode output should include contract_name', {
      status: 500,
      body: citationFormatterHappyOutput,
    });
  }

  const citationFormatterContractOutput = citationFormatterHappyOutput?.contract_output;
  const citations = citationFormatterContractOutput?.citations;
  if (
    !citationFormatterContractOutput ||
    Number(citationFormatterContractOutput?.citation_count) !== 2 ||
    !Array.isArray(citations) ||
    citations.length !== 2
  ) {
    return fail('CitationFormatter contract happy output should include expected citations', {
      status: 500,
      body: citationFormatterHappyOutput,
    });
  }

  if (
    !String(citationFormatterContractOutput?.cited_answer ?? '').includes('Sources:') ||
    !String(citationFormatterContractOutput?.cited_answer ?? '').includes('[1] doc_1/chunk_1')
  ) {
    return fail('CitationFormatter contract happy output should include formatted source markers', {
      status: 500,
      body: citationFormatterHappyOutput,
    });
  }

  r = await req('/datasets', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ fk_pipeline_id: pipeline.pipeline_id, uri: `s3://dataset/${suffix}`, desc: 'dataset desc' }),
  });
  console.log('POST /datasets ->', r.status);
  if (!ok(r.status)) return fail('create dataset failed', r);
  const dataset = r.body;

  r = await req(`/datasets/${dataset.dataset_id}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ desc: 'updated desc' }),
  });
  console.log(`PUT /datasets/${dataset.dataset_id} ->`, r.status);
  if (!ok(r.status)) return fail('update dataset failed', r);

  r = await req(`/projects/${project.project_id}`, { method: 'DELETE', headers: authHeaders });
  console.log(`DELETE /projects/${project.project_id} ->`, r.status);
  if (!(r.status === 200 || r.status === 204)) return fail('delete project failed', r);

  console.log('\nExpanded integration checks passed.');
  process.exit(0);
}

function fail(msg, res) {
  console.error(msg, res && res.status, res && JSON.stringify(res.body));
  process.exit(2);
}

run().catch(e => { console.error('Test error', e); process.exit(3); });

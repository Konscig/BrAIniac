const base = process.env.BASE_URL || 'http://localhost:8080';
const headers = { 'Content-Type': 'application/json' };

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
            method: 'GET',
            url: `${base}/health`,
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
            method: 'GET',
            url: `${base}/health`,
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

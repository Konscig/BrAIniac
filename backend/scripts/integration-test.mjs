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
  console.log(`POST /pipelines/${pipeline.pipeline_id}/validate-graph (includeWarnings=false) ->`, r.status);
  if (!ok(r.status)) return fail('validate-graph (includeWarnings=false) failed', r);
  if (!Array.isArray(r.body?.warnings) || r.body.warnings.length !== 0) {
    return fail('validate-graph should suppress warnings when includeWarnings=false', r);
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

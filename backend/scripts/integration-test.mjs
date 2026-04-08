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

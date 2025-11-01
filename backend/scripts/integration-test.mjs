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

  // Create user (use unique suffix so script is idempotent)
  const suffix = Date.now();
  let r = await req('/users', { method: 'POST', headers, body: JSON.stringify({ email: `it+${suffix}@local`, username: `it-user-${suffix}`, password: 'pwd' }) });
  console.log('POST /users ->', r.status);
  if (!ok(r.status)) return fail('create user failed', r);
  const user = r.body;

  // GET user
  r = await req(`/users/${user.id}`, { method: 'GET', headers });
  console.log(`GET /users/${user.id} ->`, r.status);
  if (!ok(r.status)) return fail('get user failed', r);

  // Create project
  r = await req('/projects', { method: 'POST', headers, body: JSON.stringify({ ownerId: user.id, name: `it-project-${suffix}`, description: 'desc' }) });
  console.log('POST /projects ->', r.status);
  if (!ok(r.status)) return fail('create project failed', r);
  const project = r.body;

  // GET project list for owner
  r = await req(`/projects?ownerId=${user.id}`, { method: 'GET', headers });
  console.log('GET /projects?ownerId= ->', r.status);
  if (!ok(r.status)) return fail('list projects failed', r);

  // Update project (PATCH/PUT)
  r = await req(`/projects/${project.id}`, { method: 'PUT', headers, body: JSON.stringify({ name: `it-project-2-${suffix}` }) });
  console.log(`PUT /projects/${project.id} ->`, r.status);
  if (!ok(r.status)) return fail('update project failed', r);

  // Create agent
  r = await req('/agents', { method: 'POST', headers, body: JSON.stringify({ projectId: project.id, name: `it-agent-${suffix}`, image: 'python:3.11' }) });
  console.log('POST /agents ->', r.status);
  if (!ok(r.status)) return fail('create agent failed', r);
  const agent = r.body;

  // GET agent
  r = await req(`/agents/${agent.id}`, { method: 'GET', headers });
  console.log(`GET /agents/${agent.id} ->`, r.status);
  if (!ok(r.status)) return fail('get agent failed', r);

  // Update agent
  r = await req(`/agents/${agent.id}`, { method: 'PUT', headers, body: JSON.stringify({ name: `it-agent-2-${suffix}` }) });
  console.log(`PUT /agents/${agent.id} ->`, r.status);
  if (!ok(r.status)) return fail('update agent failed', r);

  // Create dataset
  r = await req('/datasets', { method: 'POST', headers, body: JSON.stringify({ projectId: project.id, name: `it-ds-${suffix}`, uri: 's3://bucket/file' }) });
  console.log('POST /datasets ->', r.status);
  if (!ok(r.status)) return fail('create dataset failed', r);
  const dataset = r.body;

  // Create document
  r = await req('/documents', { method: 'POST', headers, body: JSON.stringify({ projectId: project.id, datasetId: dataset.id, content: 'hello world' }) });
  console.log('POST /documents ->', r.status);
  if (!ok(r.status)) return fail('create document failed', r);
  const document = r.body;

  // Verify document GET (no PUT endpoint exists)
  r = await req(`/documents/${document.id}`, { method: 'GET', headers });
  console.log(`GET /documents/${document.id} ->`, r.status);
  if (!ok(r.status)) return fail('get document failed', r);

  // Create tool
  r = await req('/tools', { method: 'POST', headers, body: JSON.stringify({ kind: 'script', name: `it-tool-${suffix}`, version: '1.0.0' }) });
  console.log('POST /tools ->', r.status);
  if (!ok(r.status)) return fail('create tool failed', r);
  const tool = r.body;

  // Negative case: create tool with missing required field
  r = await req('/tools', { method: 'POST', headers, body: JSON.stringify({ name: 'bad-tool' }) });
  console.log('POST /tools (bad) ->', r.status);
  if (r.status < 400 || r.status >= 500) return fail('expected client error for bad tool payload', r);

  // Create metric
  r = await req('/metrics', { method: 'POST', headers, body: JSON.stringify({ name: 'it-metric', value: 1.23 }) });
  console.log('POST /metrics ->', r.status);
  if (!ok(r.status)) return fail('create metric failed', r);

  // Create export
  r = await req('/exports', { method: 'POST', headers, body: JSON.stringify({ projectId: project.id, type: 'json', uri: 's3://export', configJson: {} }) });
  console.log('POST /exports ->', r.status);
  if (!ok(r.status)) return fail('create export failed', r);

  // Create refresh token
  r = await req('/refresh-tokens', { method: 'POST', headers, body: JSON.stringify({ userId: user.id, tokenHash: 'hash-it' }) });
  console.log('POST /refresh-tokens ->', r.status);
  if (!ok(r.status)) return fail('create refresh token failed', r);

  // Delete document
  r = await req(`/documents/${document.id}`, { method: 'DELETE', headers });
  console.log(`DELETE /documents/${document.id} ->`, r.status);
  if (!(r.status === 200 || r.status === 204)) return fail('delete document failed', r);

  // Delete project should cascade or fail depending on impl; try delete project
  r = await req(`/projects/${project.id}`, { method: 'DELETE', headers });
  console.log(`DELETE /projects/${project.id} ->`, r.status);

  console.log('\nExpanded integration checks passed.');
  process.exit(0);
}

function fail(msg, res) {
  console.error(msg, res && res.status, res && JSON.stringify(res.body));
  process.exit(2);
}

run().catch(e => { console.error('Test error', e); process.exit(3); });

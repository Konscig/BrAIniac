const base = process.env.BASE_URL || 'http://localhost:8080';
const headers = { 'Content-Type': 'application/json' };

async function req(path, opts = {}) {
  const url = base + path;
  const res = await fetch(url, opts);
  const txt = await res.text();
  let body = txt;
  try { body = JSON.parse(txt); } catch (_) {}
  return { status: res.status, body };
}

function ok(status) { return status >= 200 && status < 300; }

async function run() {
  const s = Date.now();
  console.log('Ownership test started, base =', base);

  const u1 = { email: `owner+${s}@local`, password: 'pwd' };
  let r = await req('/auth/signup', { method: 'POST', headers, body: JSON.stringify(u1) });
  console.log('signup owner ->', r.status);
  if (!ok(r.status)) return fail('owner signup failed', r);

  r = await req('/auth/login', { method: 'POST', headers, body: JSON.stringify({ email: u1.email, password: u1.password }) });
  console.log('login owner ->', r.status);
  if (!ok(r.status)) return fail('owner login failed', r);
  const tokenOwner = r.body.accessToken;
  const ownerHeaders = { ...headers, Authorization: `Bearer ${tokenOwner}` };

  r = await req('/projects', { method: 'POST', headers: ownerHeaders, body: JSON.stringify({ name: `p-${s}` }) });
  console.log('create project ->', r.status);
  if (!ok(r.status)) return fail('create project failed', r);
  const project = r.body;

  r = await req('/pipelines', {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({
      fk_project_id: project.project_id,
      name: `pl-${s}`,
      max_time: 20,
      max_cost: 40,
      max_reject: 0.1,
    }),
  });
  console.log('create pipeline ->', r.status);
  if (!ok(r.status)) return fail('create pipeline failed', r);
  const pipeline = r.body;

  r = await req('/tools', {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({ name: `tool-${s}`, config_json: {} }),
  });
  console.log('create tool ->', r.status);
  if (!ok(r.status)) return fail('create tool failed', r);
  const tool = r.body;

  r = await req('/node-types', {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({ fk_tool_id: tool.tool_id, name: `type-${s}`, desc: 'desc' }),
  });
  console.log('create node type ->', r.status);
  if (!ok(r.status)) return fail('create node type failed', r);
  const nodeType = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({
      fk_pipeline_id: pipeline.pipeline_id,
      fk_type_id: nodeType.type_id,
      top_k: 1,
      ui_json: {},
    }),
  });
  console.log('create node A ->', r.status);
  if (!ok(r.status)) return fail('create node A failed', r);
  const nodeA = r.body;

  r = await req('/nodes', {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({
      fk_pipeline_id: pipeline.pipeline_id,
      fk_type_id: nodeType.type_id,
      top_k: 1,
      ui_json: {},
    }),
  });
  console.log('create node B ->', r.status);
  if (!ok(r.status)) return fail('create node B failed', r);
  const nodeB = r.body;

  const u2 = { email: `attacker+${s}@local`, password: 'pwd' };
  r = await req('/auth/signup', { method: 'POST', headers, body: JSON.stringify(u2) });
  console.log('signup attacker ->', r.status);
  if (!ok(r.status)) return fail('attacker signup failed', r);
  r = await req('/auth/login', { method: 'POST', headers, body: JSON.stringify({ email: u2.email, password: u2.password }) });
  console.log('login attacker ->', r.status);
  if (!ok(r.status)) return fail('attacker login failed', r);
  const tokenAtt = r.body.accessToken;
  const attackerHeaders = { ...headers, Authorization: `Bearer ${tokenAtt}` };

  r = await req('/projects/' + project.project_id, { method: 'GET', headers: attackerHeaders });
  console.log('attacker get project ->', r.status);
  if (r.status !== 403) return fail('expected 403 when reading other project', r);

  r = await req('/pipelines', {
    method: 'POST',
    headers: attackerHeaders,
    body: JSON.stringify({ fk_project_id: project.project_id, name: `bad-${s}`, max_time: 1, max_cost: 1, max_reject: 0.1 }),
  });
  console.log('attacker create pipeline ->', r.status);
  if (r.status !== 403) return fail('expected 403 when creating pipeline on other project', r);

  r = await req('/datasets', {
    method: 'POST',
    headers: attackerHeaders,
    body: JSON.stringify({ fk_pipeline_id: pipeline.pipeline_id, uri: `s3://bad/${s}` }),
  });
  console.log('attacker create dataset ->', r.status);
  if (r.status !== 403) return fail('expected 403 when creating dataset on other project', r);

  r = await req('/nodes', {
    method: 'POST',
    headers: attackerHeaders,
    body: JSON.stringify({ fk_pipeline_id: pipeline.pipeline_id, fk_type_id: nodeType.type_id, top_k: 1, ui_json: {} }),
  });
  console.log('attacker create node ->', r.status);
  if (r.status !== 403) return fail('expected 403 when creating node on other project', r);

  r = await req('/edges', {
    method: 'POST',
    headers: attackerHeaders,
    body: JSON.stringify({ fk_from_node: nodeA.node_id, fk_to_node: nodeB.node_id }),
  });
  console.log('attacker create edge ->', r.status);
  if (r.status !== 403) return fail('expected 403 when creating edge on other project', r);

  r = await req(`/pipelines/${pipeline.pipeline_id}/validate-graph`, {
    method: 'POST',
    headers: attackerHeaders,
    body: JSON.stringify({}),
  });
  console.log('attacker validate graph ->', r.status);
  if (r.status !== 403) return fail('expected 403 when validating graph on other project', r);

  console.log('Ownership protections OK');
  process.exit(0);
}

function fail(msg, res) {
  console.error(msg, res && res.status, res && JSON.stringify(res.body));
  process.exit(2);
}

run().catch(e => { console.error('Test error', e); process.exit(3); });

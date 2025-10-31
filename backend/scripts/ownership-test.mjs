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

  // user1 signup & login
  const u1 = { email: `owner+${s}@local`, username: `owner-${s}`, password: 'pwd' };
  let r = await req('/auth/signup', { method: 'POST', headers, body: JSON.stringify(u1) });
  console.log('signup owner ->', r.status);
  if (!ok(r.status)) return fail('owner signup failed', r);

  r = await req('/auth/login', { method: 'POST', headers, body: JSON.stringify({ email: u1.email, password: u1.password }) });
  console.log('login owner ->', r.status);
  if (!ok(r.status)) return fail('owner login failed', r);
  const tokenOwner = r.body.accessToken;

  // create project as owner
  r = await req('/projects', { method: 'POST', headers: { ...headers, Authorization: `Bearer ${tokenOwner}` }, body: JSON.stringify({ name: `p-${s}` }) });
  console.log('create project ->', r.status);
  if (!ok(r.status)) return fail('create project failed', r);
  const project = r.body;

  // create pipeline as owner
  r = await req('/pipelines', { method: 'POST', headers: { ...headers, Authorization: `Bearer ${tokenOwner}` }, body: JSON.stringify({ projectId: project.id, name: `pl-${s}` }) });
  console.log('create pipeline ->', r.status);
  if (!ok(r.status)) return fail('create pipeline failed', r);
  const pipeline = r.body;

  // create pipeline version (public endpoint)
  r = await req('/pipeline-versions', { method: 'POST', headers, body: JSON.stringify({ pipelineId: pipeline.id, number: 1 }) });
  console.log('create pipeline version ->', r.status);
  if (!ok(r.status)) return fail('create pipeline version failed', r);
  const version = r.body;

  // signup/login second user
  const u2 = { email: `attacker+${s}@local`, username: `att-${s}`, password: 'pwd' };
  r = await req('/auth/signup', { method: 'POST', headers, body: JSON.stringify(u2) });
  console.log('signup attacker ->', r.status);
  if (!ok(r.status)) return fail('attacker signup failed', r);
  r = await req('/auth/login', { method: 'POST', headers, body: JSON.stringify({ email: u2.email, password: u2.password }) });
  console.log('login attacker ->', r.status);
  if (!ok(r.status)) return fail('attacker login failed', r);
  const tokenAtt = r.body.accessToken;

  // attacker tries to create pipeline on someone else's project
  r = await req('/pipelines', { method: 'POST', headers: { ...headers, Authorization: `Bearer ${tokenAtt}` }, body: JSON.stringify({ projectId: project.id, name: `bad-${s}` }) });
  console.log('attacker create pipeline ->', r.status);
  if (r.status !== 403) return fail('expected 403 when creating pipeline on other project', r);

  // attacker tries to create node in owner's version
  r = await req('/nodes', { method: 'POST', headers: { ...headers, Authorization: `Bearer ${tokenAtt}` }, body: JSON.stringify({ versionId: version.id, key: 'n1', label: 'N1', category: 'op', type: 'task' }) });
  console.log('attacker create node ->', r.status);
  if (r.status !== 403) return fail('expected 403 when creating node on other project', r);

  // attacker tries to create edge in owner's version
  r = await req('/edges', { method: 'POST', headers: { ...headers, Authorization: `Bearer ${tokenAtt}` }, body: JSON.stringify({ versionId: version.id, fromNode: 'x', toNode: 'y' }) });
  console.log('attacker create edge ->', r.status);
  if (r.status !== 403) return fail('expected 403 when creating edge on other project', r);

  console.log('Ownership protections OK');
  process.exit(0);
}

function fail(msg, res) {
  console.error(msg, res && res.status, res && JSON.stringify(res.body));
  process.exit(2);
}

run().catch(e => { console.error('Test error', e); process.exit(3); });

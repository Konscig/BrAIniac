const base = process.env.BASE_URL || 'http://localhost:8080';
const headers = { 'Content-Type': 'application/json' };

async function auditRateLimitContract() {
  const { readFile } = await import('node:fs/promises');
  const routes = await readFile(new URL('../src/routes/resources/auth/auth.routes.ts', import.meta.url), 'utf8');
  if (!/enforceAuthRateLimit\(req, 'signup'\)/.test(routes) || !/enforceAuthRateLimit\(req, 'login'\)/.test(routes)) {
    throw new Error('auth login/signup routes must enforce Redis-backed rate limits');
  }
}

async function req(path, opts) {
  const res = await fetch(base + path, opts);
  const txt = await res.text();
  let body = txt;
  try { body = JSON.parse(txt); } catch (_) {}
  return { status: res.status, body };
}

async function run(){
  await auditRateLimitContract();
  const suffix = Date.now();
  const email = `auth+${suffix}@local`;
  const password = 'pass123';

  console.log('signup...');
  let r = await req('/auth/signup', { method: 'POST', headers, body: JSON.stringify({ email, password }) });
  console.log('signup', r.status);
  if (r.status !== 201) return fail('signup failed', r);

  console.log('login...');
  r = await req('/auth/login', { method: 'POST', headers, body: JSON.stringify({ email, password }) });
  console.log('login', r.status, r.body && Object.keys(r.body));
  if (r.status !== 200) return fail('login failed', r);
  const { accessToken } = r.body;

  console.log('call /users/me with access token');
  r = await req('/users/me', { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } });
  console.log('/users/me', r.status);
  if (r.status !== 200) return fail('/users/me failed', r);

  console.log('auth flow OK');
  process.exit(0);
}

function fail(msg, res){
  console.error(msg, res && res.status, res && res.body);
  process.exit(2);
}

run().catch(e=>{console.error(e); process.exit(3)});

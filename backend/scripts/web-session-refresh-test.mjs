import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const base = process.env.BASE_URL || 'http://localhost:8080';
const jsonHeaders = { 'Content-Type': 'application/json' };

async function req(path, opts = {}) {
  const res = await fetch(base + path, opts);
  const text = await res.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    // Keep raw response text for diagnostics.
  }
  return {
    status: res.status,
    body,
    setCookie: res.headers.get('set-cookie') || '',
  };
}

function fail(message, response) {
  console.error(message, response?.status, response?.body);
  process.exit(2);
}

function cookieValue(setCookie) {
  const [pair] = setCookie.split(';');
  const [, value] = pair.split('=');
  return value;
}

function assertCookie(setCookie, label) {
  assert.match(setCookie, /brainiac_web_refresh=/, `${label}: missing refresh cookie`);
  assert.match(setCookie, /HttpOnly/i, `${label}: missing HttpOnly`);
  assert.match(setCookie, /SameSite=Lax/i, `${label}: missing SameSite=Lax`);
  assert.match(setCookie, /Path=\/auth\/web/i, `${label}: missing Path=/auth/web`);
  if ((process.env.WEB_REFRESH_COOKIE_SECURE || '').toLowerCase() !== 'false') {
    assert.match(setCookie, /Secure/i, `${label}: missing Secure`);
  }
}

async function assertStaticContract() {
  const contract = await readFile(new URL('../specs/001-mcp-backend-vscode/contracts/web-session.md', import.meta.url), 'utf8').catch(
    async () => readFile(new URL('../../specs/001-mcp-backend-vscode/contracts/web-session.md', import.meta.url), 'utf8'),
  );
  const service = await readFile(new URL('../src/services/application/auth/web-session.application.service.ts', import.meta.url), 'utf8');
  const routes = await readFile(new URL('../src/routes/resources/auth/web-session.routes.ts', import.meta.url), 'utf8');
  const authRoutes = await readFile(new URL('../src/routes/resources/auth/auth.routes.ts', import.meta.url), 'utf8');

  assert.match(contract, /POST \/auth\/web\/refresh/, 'contract must name refresh endpoint');
  assert.match(contract, /POST \/auth\/web\/revoke/, 'contract must name revoke endpoint');
  assert.match(contract, /HttpOnly/, 'contract must require HttpOnly');
  assert.match(contract, /Secure/, 'contract must document Secure');
  assert.match(contract, /SameSite=Lax/, 'contract must document SameSite');
  assert.match(service, /sessions = new Map/, 'web sessions are intentionally in-memory for local/dev');
  assert.doesNotMatch(service, /localStorage|sessionStorage/, 'backend service must not mention browser storage');
  assert.doesNotMatch(routes, /req\.body\?\.refresh|refreshToken: req\.body/, 'refresh route must not accept refresh token body input');
  assert.match(authRoutes, /webSessionRouter/, 'auth router must mount web session routes');
}

async function run() {
  await assertStaticContract();

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `web-session+${suffix}@local`;
  const password = 'pass123';

  const signup = await req('/auth/signup', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ email, password }),
  });
  if (signup.status !== 201 || typeof signup.body?.accessToken !== 'string') {
    fail('signup did not return access token', signup);
  }
  assertCookie(signup.setCookie, 'signup');
  assert.equal(signup.body.refreshToken, undefined, 'signup must not return browser refresh token in JSON');
  const firstCookie = cookieValue(signup.setCookie);

  const refresh = await req('/auth/web/refresh', {
    method: 'POST',
    headers: { ...jsonHeaders, Cookie: `brainiac_web_refresh=${firstCookie}` },
    body: '{}',
  });
  if (refresh.status !== 200 || typeof refresh.body?.accessToken !== 'string') {
    fail('web refresh failed', refresh);
  }
  assertCookie(refresh.setCookie, 'refresh');
  assert.equal(refresh.body.refreshToken, undefined, 'refresh must not return browser refresh token in JSON');
  assert.notEqual(cookieValue(refresh.setCookie), firstCookie, 'web refresh must rotate cookie value');

  const replay = await req('/auth/web/refresh', {
    method: 'POST',
    headers: { ...jsonHeaders, Cookie: `brainiac_web_refresh=${firstCookie}` },
    body: '{}',
  });
  assert.equal(replay.status, 401, 'replayed refresh cookie must fail');
  assert.equal(replay.body?.code, 'WEB_REFRESH_INVALID');
  assert.match(replay.setCookie, /Max-Age=0/, 'failed refresh must clear cookie');

  const rotatedCookie = cookieValue(refresh.setCookie);
  const revoke = await req('/auth/web/revoke', {
    method: 'POST',
    headers: { ...jsonHeaders, Cookie: `brainiac_web_refresh=${rotatedCookie}` },
    body: '{}',
  });
  if (revoke.status !== 200) {
    fail('web revoke failed', revoke);
  }
  assert.equal(revoke.body?.revoked, true);
  assert.match(revoke.setCookie, /Max-Age=0/, 'revoke must clear cookie');

  const revokedRefresh = await req('/auth/web/refresh', {
    method: 'POST',
    headers: { ...jsonHeaders, Cookie: `brainiac_web_refresh=${rotatedCookie}` },
    body: '{}',
  });
  assert.equal(revokedRefresh.status, 401, 'revoked refresh cookie must fail');

  console.log('Browser web-session refresh contract checks OK');
}

run().catch((error) => {
  console.error(error);
  process.exit(3);
});

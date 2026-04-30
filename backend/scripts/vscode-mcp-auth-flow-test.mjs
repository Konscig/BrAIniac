import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const base = process.env.BASE_URL || 'http://localhost:8080';
const jsonHeaders = { 'Content-Type': 'application/json' };

const serviceSource = await readFile(
  new URL('../src/services/application/auth/vscode-auth.application.service.ts', import.meta.url),
  'utf8',
);
const routeSource = await readFile(
  new URL('../src/routes/resources/auth/vscode-auth.routes.ts', import.meta.url),
  'utf8',
);

assert.doesNotMatch(serviceSource, /signAccessToken|jwt\.service|jsonwebtoken/);
assert.doesNotMatch(routeSource, /signAccessToken|jsonwebtoken/);
assert.match(routeSource, /resolveMcpAuthContext/);
assert.match(routeSource, /completeVscodeAuthRequest/);

async function req(path, opts = {}) {
  const res = await fetch(base + path, opts);
  const text = await res.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    // Keep the raw response for easier diagnostics.
  }
  return { status: res.status, body };
}

function fail(message, response) {
  console.error(message, response?.status, response?.body);
  process.exit(2);
}

function assertIsoFuture(value, label) {
  assert.equal(typeof value, 'string', `${label} must be an ISO timestamp string`);
  const time = Date.parse(value);
  assert.ok(Number.isFinite(time), `${label} must be parseable`);
  assert.ok(time > Date.now(), `${label} must be in the future`);
}

function assertErrorShape(response, expectedCode, label) {
  assert.ok(response.status >= 400, `${label}: expected HTTP error status`);
  assert.equal(response.body?.ok, false, `${label}: expected ok=false`);
  assert.equal(response.body?.code, expectedCode, `${label}: unexpected error code`);
  assert.equal(typeof response.body?.message, 'string', `${label}: missing message`);
  assert.ok(response.body.message.length > 0, `${label}: empty message`);
}

async function createUserToken() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `vscode-mcp-auth+${suffix}@local`;
  const password = 'pass123';

  const signup = await req('/auth/signup', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ email, password }),
  });
  if (signup.status !== 201) {
    fail('signup failed', signup);
  }

  const login = await req('/auth/login', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ email, password }),
  });
  if (login.status !== 200 || typeof login.body?.accessToken !== 'string') {
    fail('login did not return accessToken', login);
  }

  return login.body.accessToken;
}

async function run() {
  const accessToken = await createUserToken();

  const start = await req('/auth/vscode/start', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      callback: 'polling',
      mcpBaseUrl: 'http://localhost:8080/mcp',
    }),
  });

  if (start.status !== 200) {
    fail('start failed', start);
  }

  assert.equal(typeof start.body?.state, 'string', 'start must return state');
  assert.ok(start.body.state.length >= 32, 'state must be high entropy');
  assert.equal(typeof start.body?.loginUrl, 'string', 'start must return loginUrl');
  assert.match(start.body.loginUrl, /\/auth\?vscode_state=/, 'loginUrl must target frontend auth');
  assert.ok(
    start.body.loginUrl.includes(encodeURIComponent(start.body.state)),
    'loginUrl must include encoded state',
  );
  assertIsoFuture(start.body.expiresAt, 'start.expiresAt');
  assert.equal(typeof start.body.pollIntervalMs, 'number', 'start must return pollIntervalMs');
  assert.ok(start.body.pollIntervalMs >= 250, 'pollIntervalMs must avoid hot polling');
  assert.equal(start.body.accessToken, undefined, 'start must not return accessToken');

  const pending = await req('/auth/vscode/exchange', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ state: start.body.state }),
  });

  if (pending.status !== 200) {
    fail('pending exchange failed', pending);
  }
  assert.equal(pending.body?.status, 'pending', 'exchange before completion must be pending');
  assert.equal(pending.body?.accessToken, undefined, 'pending exchange must not return token');
  assertIsoFuture(pending.body?.expiresAt, 'pending.expiresAt');

  const unauthenticatedComplete = await req('/auth/vscode/complete', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ state: start.body.state }),
  });
  assertErrorShape(unauthenticatedComplete, 'UNAUTHORIZED', 'unauthenticated complete');

  const complete = await req('/auth/vscode/complete', {
    method: 'POST',
    headers: {
      ...jsonHeaders,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ state: start.body.state }),
  });

  if (complete.status !== 200) {
    fail('complete failed', complete);
  }
  assert.equal(complete.body?.status, 'authorized', 'complete must authorize state');
  assertIsoFuture(complete.body?.expiresAt, 'complete.expiresAt');
  assert.equal(complete.body?.accessToken, undefined, 'complete must not return token');

  const authorized = await req('/auth/vscode/exchange', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ state: start.body.state }),
  });

  if (authorized.status !== 200) {
    fail('authorized exchange failed', authorized);
  }
  assert.equal(authorized.body?.status, 'authorized', 'exchange must return authorized');
  assert.equal(authorized.body?.tokenType, 'Bearer', 'exchange token type must be Bearer');
  assert.equal(authorized.body?.accessToken, accessToken, 'exchange must return existing BrAIniac token');
  if (authorized.body?.expiresAt !== undefined) {
    assertIsoFuture(authorized.body.expiresAt, 'authorized.expiresAt');
  }

  const replay = await req('/auth/vscode/exchange', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ state: start.body.state }),
  });
  assertErrorShape(replay, 'INVALID_STATE', 'replay exchange');

  const invalidExchange = await req('/auth/vscode/exchange', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ state: 'not-a-known-state' }),
  });
  assertErrorShape(invalidExchange, 'INVALID_STATE', 'invalid exchange');

  const invalidComplete = await req('/auth/vscode/complete', {
    method: 'POST',
    headers: {
      ...jsonHeaders,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ state: 'not-a-known-state' }),
  });
  assertErrorShape(invalidComplete, 'INVALID_STATE', 'invalid complete');

  console.log('VS Code MCP browser auth flow contract checks OK');
}

run().catch((error) => {
  console.error(error);
  process.exit(3);
});

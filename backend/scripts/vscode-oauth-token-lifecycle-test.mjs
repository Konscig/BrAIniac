import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const base = process.env.BASE_URL || 'http://localhost:8080';
const jsonHeaders = { 'Content-Type': 'application/json' };
const requiredScopes = ['mcp:read', 'mcp:execute', 'mcp:export'];

async function req(path, opts = {}) {
  const res = await fetch(base + path, opts);
  const text = await res.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    // Keep raw response text for diagnostics.
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

function assertOAuthError(response, expectedCode, label) {
  assert.ok(response.status >= 400, `${label}: expected HTTP error status`);
  assert.equal(response.body?.ok, false, `${label}: expected ok=false`);
  assert.equal(response.body?.code, expectedCode, `${label}: unexpected code`);
  assert.equal(typeof response.body?.message, 'string', `${label}: missing message`);
}

function assertScope(scope, label) {
  assert.equal(typeof scope, 'string', `${label}: scope must be a string`);
  for (const expected of requiredScopes) {
    assert.match(scope, new RegExp(`(^|\\s)${expected}(\\s|$)`), `${label}: missing ${expected}`);
  }
}

async function createUserToken() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `vscode-oauth+${suffix}@local`;
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

async function exchangeBrowserSession(accessToken) {
  const start = await req('/auth/vscode/start', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ callback: 'polling', mcpBaseUrl: 'http://localhost:8080/mcp' }),
  });
  if (start.status !== 200) {
    fail('start failed', start);
  }

  const complete = await req('/auth/vscode/complete', {
    method: 'POST',
    headers: { ...jsonHeaders, Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ state: start.body.state }),
  });
  if (complete.status !== 200) {
    fail('complete failed', complete);
  }

  const exchange = await req('/auth/vscode/exchange', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ state: start.body.state }),
  });
  if (exchange.status !== 200) {
    fail('exchange failed', exchange);
  }

  return exchange.body;
}

async function assertStaticContract() {
  const authRoutes = await readFile(new URL('../src/routes/resources/auth/auth.routes.ts', import.meta.url), 'utf8');
  const indexSource = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
  const oauthRoutes = await readFile(new URL('../src/routes/resources/auth/oauth.routes.ts', import.meta.url), 'utf8');
  const oauthService = await readFile(
    new URL('../src/services/application/auth/oauth-token.application.service.ts', import.meta.url),
    'utf8',
  );

  assert.match(authRoutes, /oauthAuthRouter|oauthRouter|oauth\.routes/, 'auth routes must mount OAuth routes');
  assert.match(oauthRoutes, /authorization-server/, 'OAuth routes must expose authorization metadata');
  assert.match(oauthRoutes, /protected-resource/, 'OAuth routes must expose protected resource metadata');
  assert.match(oauthRoutes, /grant_type/, 'OAuth token route must inspect grant type');
  assert.match(oauthRoutes, /refresh_token/, 'OAuth token route must support refresh_token grant');
  assert.match(oauthRoutes, /revoke/, 'OAuth route must expose revoke behavior');
  assert.doesNotMatch(oauthRoutes, /jsonwebtoken|jwt\.sign|signAccessToken/, 'routes must not mint tokens directly');
  assert.doesNotMatch(indexSource, /\.well-known/, 'local app must not mount standard OAuth discovery endpoints');
  assert.doesNotMatch(authRoutes, /\.well-known/, 'auth router must not mount standard OAuth discovery endpoints');
  assert.doesNotMatch(oauthRoutes, /\.well-known/, 'OAuth routes must stay off standard discovery paths unless DCR exists');
  assert.match(oauthService, /issueVscodeOAuthSession/, 'OAuth service must issue VS Code OAuth sessions');
  assert.match(oauthService, /refreshVscodeOAuthSession/, 'OAuth service must refresh VS Code OAuth sessions');
  assert.match(oauthService, /revokeVscodeOAuthSession/, 'OAuth service must revoke VS Code OAuth sessions');
}

async function run() {
  await assertStaticContract();

  const standardAuthMetadata = await req('/.well-known/oauth-authorization-server');
  assert.equal(standardAuthMetadata.status, 404, 'local flow must not expose standard OAuth authorization discovery');

  const standardResourceMetadata = await req('/.well-known/oauth-protected-resource');
  assert.equal(standardResourceMetadata.status, 404, 'local flow must not expose standard OAuth protected-resource discovery');

  const authMetadata = await req('/auth/oauth/authorization-server');
  if (authMetadata.status !== 200) {
    fail('authorization metadata failed', authMetadata);
  }
  assert.equal(authMetadata.body?.token_endpoint, `${base}/auth/oauth/token`);
  assert.equal(authMetadata.body?.revocation_endpoint, `${base}/auth/oauth/revoke`);
  assert.equal(authMetadata.body?.code_challenge_methods_supported?.includes('S256'), true);

  const resourceMetadata = await req('/auth/oauth/protected-resource');
  if (resourceMetadata.status !== 200) {
    fail('protected resource metadata failed', resourceMetadata);
  }
  assert.equal(resourceMetadata.body?.resource, `${base}/mcp`);
  assert.ok(Array.isArray(resourceMetadata.body?.scopes_supported), 'scopes_supported must be an array');

  const accessToken = await createUserToken();
  const session = await exchangeBrowserSession(accessToken);
  assert.equal(session.status, 'authorized');
  assert.equal(session.tokenType, 'Bearer');
  assert.equal(typeof session.accessToken, 'string');
  assert.equal(typeof session.refreshToken, 'string');
  assert.equal(typeof session.sessionId, 'string');
  assertIsoFuture(session.expiresAt, 'session.expiresAt');
  assertIsoFuture(session.refreshExpiresAt, 'session.refreshExpiresAt');
  assertScope(session.scope, 'session.scope');

  const refreshed = await req('/auth/oauth/token', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: session.refreshToken }),
  });
  if (refreshed.status !== 200) {
    fail('refresh failed', refreshed);
  }
  assert.equal(refreshed.body?.token_type, 'Bearer');
  assert.equal(typeof refreshed.body?.access_token, 'string');
  assert.equal(typeof refreshed.body?.refresh_token, 'string');
  assert.notEqual(refreshed.body.refresh_token, session.refreshToken, 'refresh should rotate refresh token');
  assert.equal(typeof refreshed.body?.expires_in, 'number');
  assert.ok(refreshed.body.expires_in > 0, 'expires_in must be positive');
  assertScope(refreshed.body?.scope, 'refreshed.scope');

  const replayRefresh = await req('/auth/oauth/token', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: session.refreshToken }),
  });
  assertOAuthError(replayRefresh, 'INVALID_REFRESH_TOKEN', 'replayed refresh');

  const malformedRefresh = await req('/auth/oauth/token', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: 'not-a-refresh-token' }),
  });
  assertOAuthError(malformedRefresh, 'INVALID_REFRESH_TOKEN', 'malformed refresh');

  const unsupportedGrant = await req('/auth/oauth/token', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ grant_type: 'authorization_code', code: 'not-implemented' }),
  });
  assertOAuthError(unsupportedGrant, 'UNSUPPORTED_GRANT_TYPE', 'unsupported grant');

  const revoke = await req('/auth/oauth/revoke', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ token: refreshed.body.refresh_token }),
  });
  if (revoke.status !== 200) {
    fail('revoke failed', revoke);
  }
  assert.equal(revoke.body?.revoked, true);

  const revokedRefresh = await req('/auth/oauth/token', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: refreshed.body.refresh_token }),
  });
  assertOAuthError(revokedRefresh, 'INVALID_REFRESH_TOKEN', 'revoked refresh');

  console.log('VS Code OAuth token lifecycle contract checks OK');
}

run().catch((error) => {
  console.error(error);
  process.exit(3);
});

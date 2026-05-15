import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const service = await readFile(new URL('../src/services/application/auth/web-session.application.service.ts', import.meta.url), 'utf8');
const authRoutes = await readFile(new URL('../src/routes/resources/auth/auth.routes.ts', import.meta.url), 'utf8');
const webRoutes = await readFile(new URL('../src/routes/resources/auth/web-session.routes.ts', import.meta.url), 'utf8');
const api = await readFile(new URL('../../frontend/src/lib/api.ts', import.meta.url), 'utf8');

assert.match(service, /requireRedisClient/, 'web session service must fail closed through Redis');
assert.doesNotMatch(service, /new Map<string,\s*WebRefreshSession>/, 'web refresh sessions must not be process-local');
assert.match(service, /createHash\('sha256'\)/, 'refresh tokens must be hashed before Redis keying');
assert.match(service, /redisKey\('auth', 'web-refresh'/, 'refresh sessions must use auth:web-refresh key domain');
assert.match(service, /getDel/, 'refresh rotation must consume the old token in Redis');
assert.match(service, /redis\.del\(refreshSessionKey/, 'revoke must delete the Redis session key');
assert.match(authRoutes, /await setBrowserRefreshCookie/, 'login/signup must await Redis session creation before response');
assert.match(webRoutes, /await revokeBrowserWebSession/, 'revoke route must await Redis deletion');
assert.match(api, /RUNTIME_UNAVAILABLE_MESSAGE/, 'frontend API must surface runtime unavailable state');

console.log('[redis-web-session-contract-test] ok');


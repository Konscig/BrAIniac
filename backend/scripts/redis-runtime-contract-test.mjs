import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const keysSource = await readFile(new URL('../src/runtime/redis.keys.ts', import.meta.url), 'utf8');
const clientSource = await readFile(new URL('../src/runtime/redis.client.ts', import.meta.url), 'utf8');
const healthSource = await readFile(new URL('../src/runtime/redis.health.ts', import.meta.url), 'utf8');
const routeSource = await readFile(new URL('../src/routes/runtime/runtime-health.routes.ts', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');

assert.match(keysSource, /REDIS_KEY_PREFIX/, 'Redis keys must use REDIS_KEY_PREFIX');
assert.match(keysSource, /brainiac:dev/, 'Redis keys must have a safe default prefix');
assert.match(clientSource, /REDIS_URL/, 'Redis client must read REDIS_URL');
assert.match(clientSource, /REDIS_CONNECT_TIMEOUT_MS/, 'Redis client must expose bounded connect timeout');
assert.match(clientSource, /requireRedisClient/, 'Runtime must expose fail-closed Redis accessor');
assert.match(healthSource, /fail_closed/, 'Health response must name fail-closed domains');
assert.match(healthSource, /degraded/, 'Health response must name degraded domains');
assert.match(routeSource, /router\.get\('\/health'/, 'Runtime health route must expose GET /runtime/health');
assert.match(indexSource, /app\.use\('\/runtime', runtimeHealthRouter\)/, 'Express app must mount runtime health router');

console.log('[redis-runtime-contract-test] ok');


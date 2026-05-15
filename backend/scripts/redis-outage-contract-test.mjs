import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const errorsSource = await readFile(new URL('../src/runtime/runtime-errors.ts', import.meta.url), 'utf8');
const clientSource = await readFile(new URL('../src/runtime/redis.client.ts', import.meta.url), 'utf8');
const healthSource = await readFile(new URL('../src/runtime/redis.health.ts', import.meta.url), 'utf8');
const snapshotStoreSource = await readFile(new URL('../src/services/application/pipeline/pipeline.executor.snapshot-store.ts', import.meta.url), 'utf8');
const spec = await readFile(new URL('../../specs/006-redis/spec.md', import.meta.url), 'utf8');

assert.match(errorsSource, /RUNTIME_REDIS_UNAVAILABLE/, 'Outage error code must be stable');
assert.match(errorsSource, /retryable:\s*true/, 'Outage errors must be retryable');
assert.match(errorsSource, /503/, 'Outage errors must use 503');
assert.match(clientSource, /REDIS_REQUIRED/, 'Redis required mode must be configurable');
assert.match(clientSource, /runtimeRedisUnavailable/, 'Critical Redis access must fail closed');
assert.match(healthSource, /auth-refresh/, 'Auth refresh must be listed as fail-closed');
assert.match(healthSource, /rate-limit/, 'Rate limit must be listed as fail-closed');
assert.match(healthSource, /execution/, 'Execution coordination must be listed as fail-closed');
assert.match(healthSource, /queue/, 'Queue must be listed as fail-closed');
assert.match(healthSource, /provider/, 'Provider resilience must be listed as fail-closed');
assert.match(snapshotStoreSource, /requireRedisClient\('execution coordination store unavailable'\)/, 'Execution coordination must fail closed through Redis');
assert.match(snapshotStoreSource, /getRedisClient\(\)/, 'Execution snapshot cache may degrade to artifacts');
assert.match(snapshotStoreSource, /readJsonFile<PipelineExecutionSnapshot>/, 'Execution polling must preserve durable artifact fallback');
assert.match(healthSource, /cache/, 'Cache must be listed as degraded');
assert.match(healthSource, /progress/, 'Progress must be listed as degraded');
assert.match(spec, /REDIS_REQUIRED=false.*local-development startup allowance/s, 'Spec must constrain REDIS_REQUIRED=false');

console.log('[redis-outage-contract-test] ok');

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const storeSource = await readFile(new URL('../src/services/application/pipeline/pipeline.executor.snapshot-store.ts', import.meta.url), 'utf8');
  assert.match(storeSource, /requireRedisClient\('execution coordination store unavailable'\)/, 'execution coordination must fail closed through Redis');
  assert.match(storeSource, /NX:\s*true/, 'execution coordination claims must use Redis NX semantics');
  assert.match(storeSource, /getExecutionSnapshotRedisKey/, 'execution snapshots must use a Redis cache key');

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'brainiac-executor-coordination-'));
  process.env.EXECUTOR_ARTIFACT_STORE_DIR = tempRoot;
  process.env.EXECUTOR_COORDINATION_STALE_MS = '40';
  process.env.REDIS_KEY_PREFIX = `brainiac:test:executor:${Date.now()}`;

  const {
    claimIdempotencyExecutionRecord,
    claimInFlightExecutionRecord,
    deleteIdempotencyExecutionRecord,
    deleteInFlightExecutionRecord,
    readIdempotencyExecutionRecord,
    readInFlightExecutionRecord,
  } = await import('../src/services/application/pipeline/pipeline.executor.snapshot-store.ts');
  const { clearRedisPrefixForTests, pingRedis } = await import('../src/runtime/redis.client.ts');
  const redisHealth = await pingRedis();
  if (!redisHealth.ok) {
    console.log('[executor-coordination] SKIP - Redis is not available for live coordination checks');
    return;
  }

  try {
    await clearRedisPrefixForTests();
    const firstInFlight = await claimInFlightExecutionRecord(101, 'exec-1');
    assert.equal(firstInFlight.claimed, true);
    assert.equal(firstInFlight.record.execution_id, 'exec-1');

    const secondInFlight = await claimInFlightExecutionRecord(101, 'exec-2');
    assert.equal(secondInFlight.claimed, false);
    assert.equal(secondInFlight.record.execution_id, 'exec-1');

    await sleep(60);

    const reclaimedInFlight = await claimInFlightExecutionRecord(101, 'exec-3');
    assert.equal(reclaimedInFlight.claimed, true);
    assert.equal(reclaimedInFlight.record.execution_id, 'exec-3');

    const persistedInFlight = await readInFlightExecutionRecord(101);
    assert.equal(persistedInFlight?.execution_id, 'exec-3');

    const firstIdempotency = await claimIdempotencyExecutionRecord(11, 101, 'idem-key', 'exec-a');
    assert.equal(firstIdempotency.claimed, true);
    assert.equal(firstIdempotency.record.execution_id, 'exec-a');

    const secondIdempotency = await claimIdempotencyExecutionRecord(11, 101, 'idem-key', 'exec-b');
    assert.equal(secondIdempotency.claimed, false);
    assert.equal(secondIdempotency.record.execution_id, 'exec-a');

    const persistedIdempotency = await readIdempotencyExecutionRecord(11, 101, 'idem-key');
    assert.equal(persistedIdempotency?.execution_id, 'exec-a');

    await deleteInFlightExecutionRecord(101, 'exec-3');
    await deleteIdempotencyExecutionRecord(11, 101, 'idem-key');

    console.log('[executor-coordination] SUCCESS');
  } finally {
    await clearRedisPrefixForTests().catch(() => {});
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('[executor-coordination] FAIL');
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtimeQueue = await readFile(new URL('../src/runtime/queue/runtime-queue.ts', import.meta.url), 'utf8');
const heavyQueue = await readFile(new URL('../src/runtime/queue/heavy-tool.queue.ts', import.meta.url), 'utf8');
const judgeQueue = await readFile(new URL('../src/runtime/queue/judge.queue.ts', import.meta.url), 'utf8');
const index = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
const judgeService = await readFile(new URL('../src/services/application/judge/judge.service.ts', import.meta.url), 'utf8');
const judgeRoutes = await readFile(new URL('../src/routes/resources/judge/judge.routes.ts', import.meta.url), 'utf8');
const runPanel = await readFile(new URL('../../frontend/src/components/run-panel.tsx', import.meta.url), 'utf8');

assert.match(runtimeQueue, /from 'bullmq'/, 'runtime queue wrapper must use BullMQ');
assert.match(runtimeQueue, /requireRedisClient\('runtime queue unavailable'\)/, 'queue decisions must fail closed through Redis');
assert.match(runtimeQueue, /RUNTIME_QUEUE_BUSY/, 'queue backpressure must expose a stable code');
assert.match(heavyQueue, /heavy-tool/, 'heavy tool queue adapter must use a stable queue name');
assert.match(judgeQueue, /judge-assessment/, 'judge queue adapter must use a stable queue name');
assert.match(index, /acquireHeavyToolQueueSlot/, 'heavy contract route must use Redis queue slots');
assert.match(judgeService, /runQueuedAssessment/, 'judge service must expose queued assessment execution');
assert.match(judgeService, /ensurePipelineOwnedByUser/, 'queued judge work must re-check ownership before execution');
assert.match(judgeRoutes, /X-Brainiac-Queue/, 'judge routes must expose queue diagnostics');
assert.match(runPanel, /status:\s*"cancelled"/, 'run panel must handle cancelled execution state');

console.log('[redis-queue-contract-test] ok');

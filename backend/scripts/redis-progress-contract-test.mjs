import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const service = await readFile(new URL('../src/runtime/progress.service.ts', import.meta.url), 'utf8');
const executor = await readFile(new URL('../src/services/application/pipeline/pipeline.executor.application.service.ts', import.meta.url), 'utf8');
const judge = await readFile(new URL('../src/services/application/judge/judge.service.ts', import.meta.url), 'utf8');
const pipelineRoutes = await readFile(new URL('../src/routes/resources/pipeline/pipeline.routes.ts', import.meta.url), 'utf8');
const runPanel = await readFile(new URL('../../frontend/src/components/run-panel.tsx', import.meta.url), 'utf8');

assert.match(service, /xAdd/, 'progress service must publish Redis stream events');
assert.match(service, /getRedisClient\(\)/, 'progress service must degrade when Redis is unavailable');
assert.match(executor, /publishProgressEvent/, 'executor must publish lifecycle progress');
assert.match(judge, /publishProgressEvent/, 'judge must publish assessment progress');
assert.match(pipelineRoutes, /executions\/:executionId\/events/, 'pipeline route must expose authorized execution events');
assert.match(runPanel, /getPipelineExecution/, 'run panel must preserve polling fallback');
assert.match(runPanel, /status:\s*"cancelled"/, 'run panel must handle cancelled status');

console.log('[redis-progress-contract-test] ok');

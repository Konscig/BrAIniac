import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const service = await readFile(new URL('../src/runtime/rate-limit.service.ts', import.meta.url), 'utf8');
const authRoutes = await readFile(new URL('../src/routes/resources/auth/auth.routes.ts', import.meta.url), 'utf8');
const judgeRoutes = await readFile(new URL('../src/routes/resources/judge/judge.routes.ts', import.meta.url), 'utf8');
const pipelineRoutes = await readFile(new URL('../src/routes/resources/pipeline/pipeline.routes.ts', import.meta.url), 'utf8');
const mcpTransport = await readFile(new URL('../src/mcp/mcp.transport.ts', import.meta.url), 'utf8');
const openrouter = await readFile(new URL('../src/services/core/openrouter/openrouter.adapter.ts', import.meta.url), 'utf8');

assert.match(service, /requireRedisClient/, 'rate limits must fail closed through Redis');
assert.match(service, /redis\.eval/, 'rate limits must use an atomic Redis script');
assert.match(service, /RATE_LIMITED/, 'rate limits must return a stable throttling code');
assert.match(service, /retry_after_ms/, 'rate limits must expose retry metadata');
assert.match(authRoutes, /bucket:\s*`auth:\$\{action\}`/, 'auth login/signup must be rate limited');
assert.match(judgeRoutes, /judge:assessments/, 'judge assessments must be rate limited');
assert.match(judgeRoutes, /judge:chat/, 'judge chat must be rate limited');
assert.match(pipelineRoutes, /pipeline:execute/, 'pipeline execution starts must be rate limited');
assert.match(mcpTransport, /bucket:\s*'mcp:http'/, 'MCP HTTP requests must be rate limited');
assert.match(mcpTransport, /isHttpError/, 'MCP throttling must preserve HTTP status');
assert.match(openrouter, /provider:openrouter/, 'provider-bound OpenRouter calls must be rate limited');

console.log('[redis-rate-limit-test] ok');

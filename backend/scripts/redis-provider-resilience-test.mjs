import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const service = await readFile(new URL('../src/runtime/provider-resilience.service.ts', import.meta.url), 'utf8');
const openrouter = await readFile(new URL('../src/services/core/openrouter/openrouter.adapter.ts', import.meta.url), 'utf8');
const judgeOpenrouter = await readFile(new URL('../src/services/core/judge_provider/openrouter.adapter.ts', import.meta.url), 'utf8');
const judgeMistral = await readFile(new URL('../src/services/core/judge_provider/mistral.adapter.ts', import.meta.url), 'utf8');
const agentProvider = await readFile(new URL('../src/services/application/node/handlers/agent-provider-call.ts', import.meta.url), 'utf8');
const agentOutput = await readFile(new URL('../src/services/application/node/handlers/agent-call-output.ts', import.meta.url), 'utf8');
const llmJudge = await readFile(new URL('../src/services/application/judge/llm_judge.metric.ts', import.meta.url), 'utf8');

assert.match(service, /PROVIDER_COOLDOWN_ACTIVE/, 'provider cooldown code must be stable');
assert.match(service, /requireRedisClient\('provider resilience store unavailable'\)/, 'provider resilience must fail closed through Redis');
assert.match(openrouter, /assertProviderAvailable\('openrouter'/, 'OpenRouter adapter must check shared cooldown');
assert.match(openrouter, /recordProviderFailure\('openrouter'/, 'OpenRouter adapter must record upstream failures');
assert.match(judgeOpenrouter, /assertProviderAvailable\('openrouter-judge'/, 'OpenRouter judge provider must check shared cooldown');
assert.match(judgeMistral, /assertProviderAvailable\('mistral-judge'/, 'Mistral judge provider must check shared cooldown');
assert.match(agentProvider, /providerCooldownDiagnostics/, 'agent provider call must preserve cooldown diagnostics');
assert.match(agentOutput, /provider_cooldown_diagnostics/, 'agent output must expose cooldown diagnostics');
assert.match(llmJudge, /provider_cooldown_diagnostics/, 'judge metric must expose cooldown diagnostics in failures');

console.log('[redis-provider-resilience-test] ok');

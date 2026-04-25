import type { JudgeProvider } from './judge_provider.js';
import { MistralJudgeProviderAdapter } from './mistral.adapter.js';
import { OpenRouterJudgeProviderAdapter } from './openrouter.adapter.js';

export function resolveJudgeProvider(): JudgeProvider {
  const kind = (process.env.JUDGE_PROVIDER ?? 'mistral').toLowerCase();
  if (kind === 'openrouter') return new OpenRouterJudgeProviderAdapter();
  return new MistralJudgeProviderAdapter();
}

export type { JudgeProvider, JudgeMessage, JudgeToolSchema, JudgeToolCall, JudgeChatResult } from './judge_provider.js';

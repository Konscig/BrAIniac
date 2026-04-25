import { getOpenRouterConfig } from '../openrouter/openrouter.config.js';
import type {
  JudgeChatResult,
  JudgeMessage,
  JudgeProvider,
  JudgeToolSchema,
} from './judge_provider.js';

const DEFAULT_MODEL = 'openai/gpt-4o-mini';

export class OpenRouterJudgeProviderAdapter implements JudgeProvider {
  readonly modelId: string;
  readonly family = 'openrouter';
  readonly supportsToolCalls = true;

  private readonly apiKey: string;

  constructor(modelId?: string) {
    const cfg = getOpenRouterConfig();
    this.apiKey = cfg.apiKey ?? process.env.OPENROUTER_API_KEY ?? '';
    this.modelId = modelId ?? process.env.JUDGE_OPENROUTER_MODEL ?? DEFAULT_MODEL;
  }

  async chat(messages: JudgeMessage[], tools?: JudgeToolSchema[]): Promise<JudgeChatResult> {
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY is not set; OpenRouter judge provider cannot run');
    }

    const body: Record<string, any> = {
      model: this.modelId,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.tool_name ? { name: m.tool_name } : {}),
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
      })),
    };
    if (tools && tools.length > 0) {
      body.tools = tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`openrouter judge call failed: ${res.status} ${await res.text().catch(() => '')}`);
    }
    const payload: any = await res.json();
    const msg = payload?.choices?.[0]?.message ?? {};
    const toolCalls = Array.isArray(msg.tool_calls)
      ? msg.tool_calls.map((tc: any, idx: number) => ({
          id: tc.id ?? `tc_${idx}`,
          name: tc.function?.name ?? 'unknown',
          arguments: safeParse(tc.function?.arguments),
        }))
      : [];
    return {
      text: typeof msg.content === 'string' ? msg.content : '',
      tool_calls: toolCalls,
      raw: payload,
    };
  }
}

function safeParse(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, any>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, any>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

import { Mistral } from '@mistralai/mistralai';
import type {
  JudgeChatResult,
  JudgeMessage,
  JudgeProvider,
  JudgeToolCall,
  JudgeToolSchema,
} from './judge_provider.js';

const DEFAULT_MODEL = 'ministral-3b-2410';

export class MistralJudgeProviderAdapter implements JudgeProvider {
  readonly modelId: string;
  readonly family = 'mistral';
  readonly supportsToolCalls = true;

  private readonly client: Mistral;

  constructor(apiKey: string = process.env.JUDGE_MISTRAL_API_KEY ?? '', modelId?: string) {
    this.client = new Mistral({ apiKey });
    this.modelId = modelId ?? process.env.JUDGE_MISTRAL_MODEL ?? DEFAULT_MODEL;
  }

  async chat(messages: JudgeMessage[], tools?: JudgeToolSchema[]): Promise<JudgeChatResult> {
    const response: any = await this.client.chat.complete({
      model: this.modelId,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.tool_name ? { name: m.tool_name } : {}),
      })) as any,
      ...(tools && tools.length > 0
        ? {
            tools: tools.map((t) => ({
              type: 'function',
              function: { name: t.name, description: t.description, parameters: t.parameters },
            })) as any,
          }
        : {}),
    });

    const msg = response?.choices?.[0]?.message ?? {};
    const toolCalls: JudgeToolCall[] = Array.isArray(msg.toolCalls)
      ? msg.toolCalls.map((tc: any, idx: number) => ({
          id: tc.id ?? `tc_${idx}`,
          name: tc.function?.name ?? 'unknown',
          arguments: parseArgs(tc.function?.arguments),
        }))
      : [];

    return {
      text: typeof msg.content === 'string' ? msg.content : '',
      tool_calls: toolCalls,
      raw: response,
    };
  }
}

function parseArgs(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, any>) : {};
    } catch {
      return {};
    }
  }
  if (typeof value === 'object') return value as Record<string, any>;
  return {};
}

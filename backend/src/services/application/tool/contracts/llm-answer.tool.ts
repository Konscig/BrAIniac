import { HttpError } from '../../../../common/http-error.js';
import { getOpenRouterAdapter } from '../../../core/openrouter/openrouter.adapter.js';
import { resolveDefaultChatModelFromEnv } from '../../../core/openrouter/openrouter.config.js';
import type { NodeExecutionContext } from '../../pipeline/pipeline.executor.types.js';
import {
  clampInt,
  clampNumber,
  coerceOptionalFiniteNumber,
  coerceOptionalPositiveInt,
  countApproxTokens,
  readNonEmptyText,
  unwrapPayload,
} from './tool-contract.input.js';
import type { ToolContractDefinition } from './tool-contract.types.js';

const DEFAULT_PROMPT_TEMPLATE = 'Answer the user query. If grounding context is provided, use it.';
const DEFAULT_MAX_OUTPUT_TOKENS = 256;
const MAX_OUTPUT_TOKENS = 4096;

function resolveDefaultLlmAnswerModel(): string {
  const resolved = resolveDefaultChatModelFromEnv();
  if (resolved) return resolved;

  throw new HttpError(500, {
    code: 'EXECUTOR_TOOLNODE_CONTRACT_MODEL_REQUIRED',
    error: 'LLMAnswer requires model from input or OPENROUTER_LLM_MODEL env',
    details: { contract: 'LLMAnswer' },
  });
}

function extractCandidateSnippets(value: unknown): string[] {
  const unwrapped = unwrapPayload(value);
  if (!unwrapped || typeof unwrapped !== 'object') return [];

  const record = unwrapped as Record<string, unknown>;
  const listKeys = ['candidates', 'sources', 'items'];
  const snippets: string[] = [];

  for (const key of listKeys) {
    const list = record[key];
    if (!Array.isArray(list)) continue;

    for (const entry of list.slice(0, 16)) {
      if (!entry || typeof entry !== 'object') continue;
      const item = entry as Record<string, unknown>;
      const snippet =
        readNonEmptyText(item.snippet) ??
        readNonEmptyText(item.text) ??
        readNonEmptyText(item.content) ??
        readNonEmptyText(item.passage);
      if (!snippet) continue;

      if (!snippets.some((saved) => saved.toLowerCase() === snippet.toLowerCase())) {
        snippets.push(snippet);
      }
    }
  }

  return snippets;
}

function extractContextText(value: unknown): string | undefined {
  const unwrapped = unwrapPayload(value);
  const direct = readNonEmptyText(unwrapped);
  if (direct) return direct;

  if (!unwrapped || typeof unwrapped !== 'object') return undefined;

  const record = unwrapped as Record<string, unknown>;

  const contextBundleRaw = unwrapPayload(record.context_bundle ?? record.bundle);
  if (contextBundleRaw && typeof contextBundleRaw === 'object') {
    const contextBundle = contextBundleRaw as Record<string, unknown>;
    const contextBundleText =
      readNonEmptyText(contextBundle.text) ??
      readNonEmptyText(contextBundle.context) ??
      readNonEmptyText(contextBundle.content);
    if (contextBundleText) return contextBundleText;
  }

  const textKeys = ['context', 'context_text', 'content', 'text'];
  for (const key of textKeys) {
    const candidate = readNonEmptyText(record[key]);
    if (candidate) return candidate;
  }

  const snippets = extractCandidateSnippets(unwrapped);
  if (snippets.length > 0) {
    return snippets.map((snippet, index) => `[${index + 1}] ${snippet}`).join('\n');
  }

  return undefined;
}

function extractPromptTemplate(value: unknown): string | undefined {
  const unwrapped = unwrapPayload(value);
  if (!unwrapped || typeof unwrapped !== 'object') return undefined;

  const record = unwrapped as Record<string, unknown>;
  const keys = ['prompt_template', 'template'];
  for (const key of keys) {
    const resolved = readNonEmptyText(record[key]);
    if (resolved) return resolved;
  }

  return undefined;
}

function extractUserQuery(value: unknown): string | undefined {
  const unwrapped = unwrapPayload(value);
  const direct = readNonEmptyText(unwrapped);
  if (direct) return direct;

  if (!unwrapped || typeof unwrapped !== 'object') return undefined;

  const record = unwrapped as Record<string, unknown>;
  const keys = ['user_query', 'query', 'question'];
  for (const key of keys) {
    const resolved = readNonEmptyText(record[key]);
    if (resolved) return resolved;
  }

  return undefined;
}

function extractModel(value: unknown): string | undefined {
  const unwrapped = unwrapPayload(value);
  if (!unwrapped || typeof unwrapped !== 'object') return undefined;

  const record = unwrapped as Record<string, unknown>;
  const direct = readNonEmptyText(record.model) ?? readNonEmptyText(record.model_id);
  if (direct) return direct;

  if (record.llm && typeof record.llm === 'object') {
    const llmRecord = record.llm as Record<string, unknown>;
    const nested = readNonEmptyText(llmRecord.model) ?? readNonEmptyText(llmRecord.model_id);
    if (nested) return nested;
  }

  return undefined;
}

function extractTemperature(value: unknown): number | undefined {
  const unwrapped = unwrapPayload(value);
  if (!unwrapped || typeof unwrapped !== 'object') return undefined;

  const record = unwrapped as Record<string, unknown>;
  const direct = coerceOptionalFiniteNumber(record.temperature);
  if (direct !== undefined) return direct;

  if (record.llm && typeof record.llm === 'object') {
    const llmRecord = record.llm as Record<string, unknown>;
    const nested = coerceOptionalFiniteNumber(llmRecord.temperature);
    if (nested !== undefined) return nested;
  }

  return undefined;
}

function extractMaxOutputTokens(value: unknown): number | undefined {
  const unwrapped = unwrapPayload(value);
  if (!unwrapped || typeof unwrapped !== 'object') return undefined;

  const record = unwrapped as Record<string, unknown>;
  const direct = coerceOptionalPositiveInt(record.max_output_tokens);
  if (direct !== undefined) return direct;

  if (record.llm && typeof record.llm === 'object') {
    const llmRecord = record.llm as Record<string, unknown>;
    const nested = coerceOptionalPositiveInt(llmRecord.max_tokens);
    if (nested !== undefined) return nested;
  }

  return undefined;
}

function findFirstFromInputs<T>(inputs: any[], resolver: (value: unknown) => T | undefined): T | undefined {
  for (const input of inputs.slice(0, 16)) {
    const resolved = resolver(input);
    if (resolved !== undefined) return resolved;
  }

  return undefined;
}

function renderPrompt(promptTemplate: string, contextText: string, userQuery?: string): string {
  const hasContextPlaceholder = promptTemplate.includes('{{context}}');
  const hasQueryPlaceholder = promptTemplate.includes('{{query}}');

  let rendered = promptTemplate.split('{{context}}').join(contextText).split('{{query}}').join(userQuery ?? '');

  if (userQuery && !hasQueryPlaceholder) {
    rendered = `User query: ${userQuery}\n\n${rendered}`;
  }

  if (contextText && !hasContextPlaceholder) {
    rendered = `${rendered}\n\nContext:\n${contextText}`;
  }

  return rendered.trim();
}

async function buildLlmAnswerContractOutput(input: Record<string, any>): Promise<Record<string, any>> {
  const contextText = readNonEmptyText(input.context_text) ?? '';
  const promptTemplate = readNonEmptyText(input.prompt_template) ?? DEFAULT_PROMPT_TEMPLATE;
  const userQuery = readNonEmptyText(input.user_query);
  if (!userQuery) {
    throw new HttpError(400, {
      code: 'EXECUTOR_TOOLNODE_CONTRACT_INPUT_INVALID',
      error: 'LLMAnswer contract requires non-empty question',
      details: { contract: 'LLMAnswer' },
    });
  }

  const model = readNonEmptyText(input.model) ?? resolveDefaultLlmAnswerModel();
  const temperature = clampNumber(coerceOptionalFiniteNumber(input.temperature) ?? 0.2, 0, 2);
  const maxOutputTokens = clampInt(
    coerceOptionalPositiveInt(input.max_output_tokens) ?? DEFAULT_MAX_OUTPUT_TOKENS,
    16,
    MAX_OUTPUT_TOKENS,
  );

  const prompt = renderPrompt(promptTemplate, contextText, userQuery);
  const adapter = getOpenRouterAdapter();
  const completion = await adapter.chatCompletion({
    model,
    temperature,
    maxTokens: maxOutputTokens,
    messages: [
      {
        role: 'system',
        content:
          'You are the LLMAnswer tool. Answer the user question directly and concisely. Use provided grounding context when it is present; otherwise answer from general knowledge.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
  });
  const answer = readNonEmptyText(completion.text);
  if (!answer) {
    throw new HttpError(502, {
      code: 'EXECUTOR_TOOLNODE_EMPTY_PROVIDER_RESPONSE',
      error: 'LLMAnswer provider returned empty answer',
      details: { contract: 'LLMAnswer', model: completion.model },
    });
  }

  return {
    answer,
    provider: 'openrouter',
    prompt,
    model: completion.model,
    ...(completion.responseId ? { provider_response_id: completion.responseId } : {}),
    ...(completion.usage ? { usage: completion.usage } : {}),
    temperature,
    max_output_tokens: maxOutputTokens,
    context_token_estimate: countApproxTokens(contextText),
    answer_token_estimate: countApproxTokens(answer),
    grounded: countApproxTokens(contextText) > 0,
    context_used: countApproxTokens(contextText) > 0,
  };
}

export function resolveLlmAnswerContractInput(inputs: any[], context: NodeExecutionContext): Record<string, any> {
  const contextText = extractContextText(context.input_json) ?? findFirstFromInputs(inputs, extractContextText);
  const userQuery = extractUserQuery(context.input_json) ?? findFirstFromInputs(inputs, extractUserQuery);
  if (!userQuery) {
    throw new HttpError(400, {
      code: 'EXECUTOR_TOOLNODE_CONTRACT_INPUT_INVALID',
      error: 'LLMAnswer contract requires non-empty question',
      details: { contract: 'LLMAnswer' },
    });
  }

  const promptTemplate =
    extractPromptTemplate(context.input_json) ?? findFirstFromInputs(inputs, extractPromptTemplate) ?? DEFAULT_PROMPT_TEMPLATE;

  const model = extractModel(context.input_json);

  const temperature = extractTemperature(context.input_json) ?? findFirstFromInputs(inputs, extractTemperature);
  const maxOutputTokens = extractMaxOutputTokens(context.input_json) ?? findFirstFromInputs(inputs, extractMaxOutputTokens);

  return {
    prompt_template: promptTemplate,
    user_query: userQuery,
    ...(contextText ? { context_text: contextText } : {}),
    ...(model ? { model } : {}),
    ...(temperature !== undefined ? { temperature: clampNumber(temperature, 0, 2) } : {}),
    ...(maxOutputTokens !== undefined ? { max_output_tokens: clampInt(maxOutputTokens, 16, MAX_OUTPUT_TOKENS) } : {}),
  };
}

export const llmAnswerToolContractDefinition: ToolContractDefinition = {
  name: 'LLMAnswer',
  aliases: ['llmanswer', 'llm-answer', 'llm_answer'],
  allowedExecutors: ['http-json'],
  resolveInput: resolveLlmAnswerContractInput,
  buildHttpSuccessOutput: ({ input }) => buildLlmAnswerContractOutput(input),
};

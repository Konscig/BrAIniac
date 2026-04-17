import { HttpError } from '../../../../common/http-error.js';
import type { NodeExecutionContext } from '../../pipeline/pipeline.executor.types.js';
import type { ToolContractDefinition } from './tool-contract.types.js';

const DEFAULT_PROMPT_TEMPLATE = 'Answer the user query using only the provided context.';
const DEFAULT_MODEL = 'openai/gpt-oss-120b:free';
const DEFAULT_MAX_OUTPUT_TOKENS = 256;
const MAX_OUTPUT_TOKENS = 4096;

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function readNonEmptyText(raw: unknown): string | undefined {
  if (typeof raw === 'string') {
    const value = normalizeText(raw);
    return value.length > 0 ? value : undefined;
  }

  if (typeof raw === 'number' || typeof raw === 'boolean') {
    const value = normalizeText(String(raw));
    return value.length > 0 ? value : undefined;
  }

  return undefined;
}

function coerceOptionalPositiveInt(raw: unknown): number | undefined {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return undefined;
  return value;
}

function coerceOptionalFiniteNumber(raw: unknown): number | undefined {
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  return value;
}

function clampInt(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function clampNumber(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function countApproxTokens(text: string): number {
  const normalized = normalizeText(text);
  if (!normalized) return 0;
  return normalized.split(' ').filter((part) => part.length > 0).length;
}

function unwrapPayload(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;

  const record = value as Record<string, unknown>;
  const nestedKeys = ['value', 'data', 'payload', 'output'];
  for (const key of nestedKeys) {
    if (!(key in record)) continue;

    const nested = unwrapPayload(record[key]);
    if (nested !== undefined && nested !== null) {
      return nested;
    }
  }

  return value;
}

function extractCandidateSnippets(value: unknown): string[] {
  const unwrapped = unwrapPayload(value);
  if (!unwrapped || typeof unwrapped !== 'object') return [];

  const record = unwrapped as Record<string, unknown>;
  const listKeys = ['ranked_candidates', 'rankedCandidates', 'candidates', 'sources', 'items'];
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

  const contextBundleRaw = unwrapPayload(record.context_bundle ?? record.contextBundle ?? record.bundle);
  if (contextBundleRaw && typeof contextBundleRaw === 'object') {
    const contextBundle = contextBundleRaw as Record<string, unknown>;
    const contextBundleText =
      readNonEmptyText(contextBundle.text) ??
      readNonEmptyText(contextBundle.context) ??
      readNonEmptyText(contextBundle.content);
    if (contextBundleText) return contextBundleText;
  }

  const textKeys = ['context', 'context_text', 'contextText', 'content', 'text'];
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
  const keys = ['prompt_template', 'promptTemplate', 'template'];
  for (const key of keys) {
    const resolved = readNonEmptyText(record[key]);
    if (resolved) return resolved;
  }

  return undefined;
}

function extractUserQuery(value: unknown): string | undefined {
  const unwrapped = unwrapPayload(value);
  if (!unwrapped || typeof unwrapped !== 'object') return undefined;

  const record = unwrapped as Record<string, unknown>;
  const keys = ['user_query', 'userQuery', 'query', 'question'];
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
  const direct = readNonEmptyText(record.model) ?? readNonEmptyText(record.model_id) ?? readNonEmptyText(record.modelId);
  if (direct) return direct;

  if (record.llm && typeof record.llm === 'object') {
    const llmRecord = record.llm as Record<string, unknown>;
    const nested = readNonEmptyText(llmRecord.model) ?? readNonEmptyText(llmRecord.model_id) ?? readNonEmptyText(llmRecord.modelId);
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
  const direct = coerceOptionalPositiveInt(record.max_output_tokens ?? record.maxOutputTokens);
  if (direct !== undefined) return direct;

  if (record.llm && typeof record.llm === 'object') {
    const llmRecord = record.llm as Record<string, unknown>;
    const nested = coerceOptionalPositiveInt(llmRecord.maxTokens ?? llmRecord.max_tokens);
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

  if (!hasContextPlaceholder) {
    rendered = `${rendered}\n\nContext:\n${contextText}`;
  }

  return rendered.trim();
}

function stripCitationPrefix(line: string): string {
  return line.replace(/^\[\d+\]\s*/, '').trim();
}

function buildDeterministicAnswer(contextText: string, userQuery?: string): string {
  const firstLine =
    contextText
      .split(/\n+/)
      .map((line) => stripCitationPrefix(line))
      .find((line) => line.length > 0) ?? '';

  if (!firstLine) {
    return userQuery ? `No grounded answer found for "${userQuery}".` : 'No grounded answer found.';
  }

  const seed = firstLine.length > 240 ? `${firstLine.slice(0, 237)}...` : firstLine;
  return userQuery ? `Answer to "${userQuery}": ${seed}` : `Answer: ${seed}`;
}

/**
 * Формирует deterministic output для контракта LLMAnswer в ветке http-json.
 * Здесь собирается prompt, служебные метрики и предсказуемый grounded answer.
 *
 * @param input Нормализованный вход контракта.
 * @returns Детерминированный результат генерации ответа и метрики.
 */
function buildLlmAnswerContractOutput(input: Record<string, any>): Record<string, any> {
  const contextText = normalizeText(String(input.context_text ?? ''));
  const promptTemplate = readNonEmptyText(input.prompt_template) ?? DEFAULT_PROMPT_TEMPLATE;
  const userQuery = readNonEmptyText(input.user_query);

  const model = readNonEmptyText(input.model) ?? DEFAULT_MODEL;
  const temperature = clampNumber(coerceOptionalFiniteNumber(input.temperature) ?? 0.2, 0, 2);
  const maxOutputTokens = clampInt(
    coerceOptionalPositiveInt(input.max_output_tokens) ?? DEFAULT_MAX_OUTPUT_TOKENS,
    16,
    MAX_OUTPUT_TOKENS,
  );

  const prompt = renderPrompt(promptTemplate, contextText, userQuery);
  const answer = buildDeterministicAnswer(contextText, userQuery);

  return {
    answer,
    prompt,
    model,
    temperature,
    max_output_tokens: maxOutputTokens,
    context_token_estimate: countApproxTokens(contextText),
    answer_token_estimate: countApproxTokens(answer),
    grounded: countApproxTokens(contextText) > 0,
  };
}

/**
 * Нормализует вход LLMAnswer: извлекает контекст, шаблон промпта,
 * параметры модели и ограничения генерации.
 *
 * @param inputs Выходы предыдущих узлов пайплайна.
 * @param context Контекст выполнения текущего узла.
 * @returns Нормализованный вход для executor-а.
 * @throws {HttpError} Если контекст для ответа отсутствует.
 */
export function resolveLlmAnswerContractInput(inputs: any[], context: NodeExecutionContext): Record<string, any> {
  const contextText = extractContextText(context.input_json) ?? findFirstFromInputs(inputs, extractContextText);
  if (!contextText) {
    throw new HttpError(400, {
      code: 'EXECUTOR_TOOLNODE_CONTRACT_INPUT_INVALID',
      error: 'LLMAnswer contract requires non-empty context_bundle',
      details: { contract: 'LLMAnswer' },
    });
  }

  const promptTemplate =
    extractPromptTemplate(context.input_json) ?? findFirstFromInputs(inputs, extractPromptTemplate) ?? DEFAULT_PROMPT_TEMPLATE;

  const userQuery = extractUserQuery(context.input_json) ?? findFirstFromInputs(inputs, extractUserQuery);
  const model = extractModel(context.input_json) ?? findFirstFromInputs(inputs, extractModel);

  const temperature = extractTemperature(context.input_json) ?? findFirstFromInputs(inputs, extractTemperature);
  const maxOutputTokens = extractMaxOutputTokens(context.input_json) ?? findFirstFromInputs(inputs, extractMaxOutputTokens);

  return {
    context_text: contextText,
    prompt_template: promptTemplate,
    ...(userQuery ? { user_query: userQuery } : {}),
    ...(model ? { model } : {}),
    ...(temperature !== undefined ? { temperature: clampNumber(temperature, 0, 2) } : {}),
    ...(maxOutputTokens !== undefined ? { max_output_tokens: clampInt(maxOutputTokens, 16, MAX_OUTPUT_TOKENS) } : {}),
  };
}

/**
 * Определяет контракт LLMAnswer, его алиасы и допустимые executor-ы.
 */
export const llmAnswerToolContractDefinition: ToolContractDefinition = {
  name: 'LLMAnswer',
  aliases: ['llmanswer', 'llm-answer', 'llm_answer'],
  allowedExecutors: ['http-json'],
  resolveInput: resolveLlmAnswerContractInput,
  buildHttpSuccessOutput: ({ input }) => buildLlmAnswerContractOutput(input),
};
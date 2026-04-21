import { HttpError } from '../../../../common/http-error.js';
import type { NodeExecutionContext } from '../../pipeline/pipeline.executor.types.js';
import type { ToolContractDefinition } from './tool-contract.types.js';
import { normalizeText, readNonEmptyText, unwrapPayload } from './tool-contract.input.js';

const MAX_CITATIONS = 8;

type CitationCandidate = {
  document_id: string;
  chunk_id: string;
  snippet: string;
};

function extractAnswer(value: unknown): string | undefined {
  const unwrapped = unwrapPayload(value);

  const direct = readNonEmptyText(unwrapped);
  if (direct) return direct;

  if (!unwrapped || typeof unwrapped !== 'object') return undefined;

  const record = unwrapped as Record<string, unknown>;
  const keys = ['answer', 'text', 'content', 'response'];
  for (const key of keys) {
    const resolved = readNonEmptyText(record[key]);
    if (resolved) return resolved;
  }

  return undefined;
}

function toCandidate(raw: unknown, index: number): CitationCandidate | undefined {
  const unwrapped = unwrapPayload(raw);
  if (!unwrapped || typeof unwrapped !== 'object') return undefined;

  const record = unwrapped as Record<string, unknown>;
  const snippet =
    readNonEmptyText(record.snippet) ??
    readNonEmptyText(record.text) ??
    readNonEmptyText(record.content) ??
    readNonEmptyText(record.passage);
  if (!snippet) return undefined;

  const documentId = readNonEmptyText(record.document_id) ?? readNonEmptyText(record.doc_id) ?? `doc_${index + 1}`;
  const chunkId = readNonEmptyText(record.chunk_id) ?? readNonEmptyText(record.id) ?? `chunk_${index + 1}`;

  return {
    document_id: documentId,
    chunk_id: chunkId,
    snippet,
  };
}

function pushCandidate(out: CitationCandidate[], raw: unknown) {
  if (out.length >= MAX_CITATIONS) return;

  const candidate = toCandidate(raw, out.length);
  if (!candidate) return;

  const signature = `${candidate.document_id.toLowerCase()}::${candidate.chunk_id.toLowerCase()}`;
  const exists = out.some((entry) => `${entry.document_id.toLowerCase()}::${entry.chunk_id.toLowerCase()}` === signature);
  if (!exists) {
    out.push(candidate);
  }
}

function collectCandidates(value: unknown, out: CitationCandidate[]) {
  const unwrapped = unwrapPayload(value);

  if (Array.isArray(unwrapped)) {
    for (const entry of unwrapped) {
      if (out.length >= MAX_CITATIONS) break;
      pushCandidate(out, entry);
    }
    return;
  }

  if (!unwrapped || typeof unwrapped !== 'object') {
    pushCandidate(out, unwrapped);
    return;
  }

  const record = unwrapped as Record<string, unknown>;
  const listKeys = ['ranked_candidates', 'rankedCandidates', 'candidates', 'sources', 'items'];
  for (const key of listKeys) {
    const list = record[key];
    if (!Array.isArray(list)) continue;

    for (const entry of list) {
      if (out.length >= MAX_CITATIONS) break;
      pushCandidate(out, entry);
    }
  }
}

function normalizeInputCandidates(raw: unknown): CitationCandidate[] {
  if (!Array.isArray(raw)) return [];

  const out: CitationCandidate[] = [];
  for (const entry of raw.slice(0, MAX_CITATIONS)) {
    const candidate = toCandidate(entry, out.length);
    if (candidate) {
      out.push(candidate);
    }
  }

  return out;
}

/**
 * Формирует итог с цитированием: список ссылок на источники и cited_answer.
 *
 * @param input Нормализованный вход контракта.
 * @returns Детерминированный результат форматирования ответа с цитатами.
 */
function buildCitationFormatterContractOutput(input: Record<string, any>): Record<string, any> {
  const answer = normalizeText(String(input.answer ?? ''));
  const candidates = normalizeInputCandidates(input.candidates);
  const citations = candidates.slice(0, MAX_CITATIONS).map((candidate, index) => ({
    marker: `[${index + 1}]`,
    document_id: candidate.document_id,
    chunk_id: candidate.chunk_id,
    snippet: candidate.snippet,
  }));

  const citedAnswer =
    citations.length > 0
      ? `${answer}\n\nSources:\n${citations.map((entry) => `${entry.marker} ${entry.document_id}/${entry.chunk_id}`).join('\n')}`
      : answer;

  return {
    answer,
    citation_count: citations.length,
    citations,
    cited_answer: citedAnswer,
  };
}

/**
 * Нормализует вход CitationFormatter: требует непустой answer
 * и, при наличии, собирает кандидатов для блока источников.
 *
 * @param inputs Выходы предыдущих узлов пайплайна.
 * @param context Контекст выполнения текущего узла.
 * @returns Нормализованный вход для executor-а.
 * @throws {HttpError} Если answer отсутствует или пустой.
 */
export function resolveCitationFormatterContractInput(inputs: any[], context: NodeExecutionContext): Record<string, any> {
  const answerFromContext = extractAnswer(context.input_json);
  const answerFromInputs = answerFromContext
    ? undefined
    : inputs.map((entry) => extractAnswer(entry)).find((entry) => typeof entry === 'string' && entry.length > 0);

  const answer = answerFromContext ?? answerFromInputs;
  if (!answer) {
    throw new HttpError(400, {
      code: 'EXECUTOR_TOOLNODE_CONTRACT_INPUT_INVALID',
      error: 'CitationFormatter contract requires non-empty answer',
      details: { contract: 'CitationFormatter' },
    });
  }

  const candidates: CitationCandidate[] = [];
  collectCandidates(context.input_json, candidates);
  for (const source of inputs.slice(0, 16)) {
    if (candidates.length >= MAX_CITATIONS) break;
    collectCandidates(source, candidates);
  }

  return {
    answer,
    candidates,
  };
}

/**
 * Определяет контракт CitationFormatter, его алиасы и допустимые executor-ы.
 */
export const citationFormatterToolContractDefinition: ToolContractDefinition = {
  name: 'CitationFormatter',
  aliases: ['citationformatter', 'citation-formatter', 'citation_formatter'],
  allowedExecutors: ['http-json'],
  resolveInput: resolveCitationFormatterContractInput,
  buildHttpSuccessOutput: ({ input }) => buildCitationFormatterContractOutput(input),
};

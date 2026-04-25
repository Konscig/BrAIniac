import { HttpError } from '../../../../common/http-error.js';
import type { NodeExecutionContext } from '../../pipeline/pipeline.executor.types.js';
import { buildInlineArtifactManifest, listArtifactManifestItems } from './tool-artifact.manifest.js';
import { clampInt, coerceOptionalPositiveInt, countApproxTokens, readNonEmptyText, unwrapPayload } from './tool-contract.input.js';
import type { ToolContractDefinition } from './tool-contract.types.js';

const DEFAULT_MAX_CONTEXT_TOKENS = 256;
const MAX_CONTEXT_TOKENS = 4096;
const MAX_CANDIDATES = 64;

type RetrievalCandidate = {
  document_id: string;
  chunk_id: string;
  snippet: string;
  score: number | null;
};

function toCandidate(raw: unknown, index: number): RetrievalCandidate | undefined {
  const unwrapped = unwrapPayload(raw);
  if (!unwrapped || typeof unwrapped !== 'object') return undefined;

  const record = unwrapped as Record<string, unknown>;
  const snippet =
    readNonEmptyText(record.snippet) ??
    readNonEmptyText(record.text) ??
    readNonEmptyText(record.content) ??
    readNonEmptyText(record.passage);
  if (!snippet) return undefined;

  const documentId = readNonEmptyText(record.document_id) ?? `doc_${index + 1}`;
  const chunkId = readNonEmptyText(record.chunk_id) ?? readNonEmptyText(record.id) ?? `chunk_${index + 1}`;

  const scoreRaw = Number(record.score);
  const score = Number.isFinite(scoreRaw) ? Number(scoreRaw) : null;

  return {
    document_id: documentId,
    chunk_id: chunkId,
    snippet,
    score,
  };
}

function pushCandidate(out: RetrievalCandidate[], raw: unknown) {
  if (out.length >= MAX_CANDIDATES) return;

  const candidate = toCandidate(raw, out.length);
  if (!candidate) return;

  const signature = `${candidate.document_id.toLowerCase()}::${candidate.chunk_id.toLowerCase()}`;
  const exists = out.some((entry) => `${entry.document_id.toLowerCase()}::${entry.chunk_id.toLowerCase()}` === signature);
  if (!exists) {
    out.push(candidate);
  }
}

function collectCandidates(value: unknown, out: RetrievalCandidate[]) {
  const manifestItems = listArtifactManifestItems(value, ['retrieval_candidates']);
  for (const item of manifestItems) {
    if (out.length >= MAX_CANDIDATES) break;
    pushCandidate(out, item);
  }

  const unwrapped = unwrapPayload(value);

  if (Array.isArray(unwrapped)) {
    for (const entry of unwrapped) {
      if (out.length >= MAX_CANDIDATES) break;
      pushCandidate(out, entry);
    }
    return;
  }

  if (!unwrapped || typeof unwrapped !== 'object') {
    pushCandidate(out, unwrapped);
    return;
  }

  const record = unwrapped as Record<string, unknown>;
  const listKeys = ['candidates', 'items', 'records'];
  for (const key of listKeys) {
    const list = record[key];
    if (!Array.isArray(list)) continue;

    for (const entry of list) {
      if (out.length >= MAX_CANDIDATES) break;
      pushCandidate(out, entry);
    }
  }

  pushCandidate(out, record.candidate);
}

function hasNoResultsSignal(value: unknown, depth = 0): boolean {
  if (depth > 6 || value === undefined || value === null) return false;

  if (Array.isArray(value)) {
    return value.some((entry) => hasNoResultsSignal(entry, depth + 1));
  }

  const unwrapped = unwrapPayload(value);
  if (!unwrapped || typeof unwrapped !== 'object') return false;

  const record = unwrapped as Record<string, unknown>;
  if (record.no_results === true || record.retrieval_source === 'no-results') {
    return true;
  }

  const nestedKeys = ['value', 'data', 'payload', 'output', 'contract_output', 'response'];
  return nestedKeys.some((key) => key in record && hasNoResultsSignal(record[key], depth + 1));
}

function normalizeInputCandidates(raw: unknown): RetrievalCandidate[] {
  if (!Array.isArray(raw)) return [];

  const out: RetrievalCandidate[] = [];
  for (const entry of raw.slice(0, MAX_CANDIDATES)) {
    const candidate = toCandidate(entry, out.length);
    if (candidate) {
      out.push(candidate);
    }
  }

  return out;
}

function buildContextAssemblerContractOutput(input: Record<string, any>): Record<string, any> {
  const candidates = normalizeInputCandidates(input.candidates);
  const noResults = input.no_results === true;
  const maxTokens = clampInt(
    coerceOptionalPositiveInt(input.max_context_tokens) ?? DEFAULT_MAX_CONTEXT_TOKENS,
    8,
    MAX_CONTEXT_TOKENS,
  );

  const selected: RetrievalCandidate[] = [];
  let usedTokens = 0;

  for (const candidate of candidates) {
    const candidateTokens = countApproxTokens(candidate.snippet);
    if (candidateTokens <= 0) continue;

    if (selected.length > 0 && usedTokens + candidateTokens > maxTokens) {
      break;
    }

    selected.push(candidate);
    usedTokens += candidateTokens;

    if (usedTokens >= maxTokens) {
      break;
    }
  }

  const contextText = selected.map((entry, index) => `[${index + 1}] ${entry.snippet}`).join('\n');
  const sources = selected.map((entry, index) => ({
    rank: index + 1,
    document_id: entry.document_id,
    chunk_id: entry.chunk_id,
    ...(entry.score !== null ? { score: entry.score } : {}),
  }));
  const contextBundle = {
    text: contextText,
    token_estimate: usedTokens,
    sources,
    ...(noResults ? { no_results: true } : {}),
  };

  return {
    strategy: readNonEmptyText(input.strategy) ?? 'topk-pack',
    max_context_tokens: maxTokens,
    candidate_count: candidates.length,
    selected_count: selected.length,
    truncated: selected.length < candidates.length,
    ...(noResults ? { no_results: true } : {}),
    context_bundle: contextBundle,
    context_bundle_manifest: buildInlineArtifactManifest('context_bundle', [contextBundle], {
      strategy: readNonEmptyText(input.strategy) ?? 'topk-pack',
      max_context_tokens: maxTokens,
      selected_count: selected.length,
    }),
  };
}

export function resolveContextAssemblerContractInput(inputs: any[], context: NodeExecutionContext): Record<string, any> {
  const candidates: RetrievalCandidate[] = [];
  collectCandidates(context.input_json, candidates);
  for (const source of inputs.slice(0, 16)) {
    if (candidates.length >= MAX_CANDIDATES) break;
    collectCandidates(source, candidates);
  }

  const noResults = hasNoResultsSignal(context.input_json) || inputs.some((source) => hasNoResultsSignal(source));

  if (candidates.length === 0 && !noResults) {
    throw new HttpError(400, {
      code: 'EXECUTOR_TOOLNODE_CONTRACT_INPUT_INVALID',
      error: 'ContextAssembler contract requires non-empty candidates',
      details: { contract: 'ContextAssembler' },
    });
  }

  const inputRecord = context.input_json && typeof context.input_json === 'object' ? (context.input_json as Record<string, unknown>) : {};
  const maxContextTokens = clampInt(
    coerceOptionalPositiveInt(inputRecord.max_context_tokens) ?? DEFAULT_MAX_CONTEXT_TOKENS,
    8,
    MAX_CONTEXT_TOKENS,
  );

  return {
    candidates,
    max_context_tokens: maxContextTokens,
    strategy: readNonEmptyText(inputRecord.strategy) ?? 'topk-pack',
    ...(noResults ? { no_results: true } : {}),
  };
}

export const contextAssemblerToolContractDefinition: ToolContractDefinition = {
  name: 'ContextAssembler',
  aliases: ['contextassembler', 'context-assembler', 'context_assembler'],
  allowedExecutors: ['http-json'],
  resolveInput: resolveContextAssemblerContractInput,
  buildHttpSuccessOutput: ({ input }) => buildContextAssemblerContractOutput(input),
};

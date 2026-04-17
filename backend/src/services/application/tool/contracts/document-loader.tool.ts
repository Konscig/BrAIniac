import { HttpError } from '../../../../common/http-error.js';
import type { NodeExecutionContext } from '../../pipeline/pipeline.executor.types.js';
import type { ToolContractDefinition } from './tool-contract.types.js';

const MAX_DOCUMENT_LOADER_URIS = 64;

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

function pushDistinctString(out: string[], raw: unknown, maxItems = MAX_DOCUMENT_LOADER_URIS) {
  if (out.length >= maxItems) return;

  const text = readNonEmptyText(raw);
  if (!text) return;

  const normalized = text.toLowerCase();
  const exists = out.some((entry) => entry.toLowerCase() === normalized);
  if (!exists) {
    out.push(text);
  }
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

function collectUris(value: unknown, out: string[]) {
  const unwrapped = unwrapPayload(value);

  if (Array.isArray(unwrapped)) {
    for (const entry of unwrapped) {
      if (out.length >= MAX_DOCUMENT_LOADER_URIS) break;
      pushDistinctString(out, entry, MAX_DOCUMENT_LOADER_URIS);
    }
    return;
  }

  if (!unwrapped || typeof unwrapped !== 'object') {
    pushDistinctString(out, unwrapped, MAX_DOCUMENT_LOADER_URIS);
    return;
  }

  const record = unwrapped as Record<string, unknown>;
  const uriArray = record.uris;
  if (Array.isArray(uriArray)) {
    for (const entry of uriArray) {
      if (out.length >= MAX_DOCUMENT_LOADER_URIS) break;
      pushDistinctString(out, entry, MAX_DOCUMENT_LOADER_URIS);
    }
  }

  pushDistinctString(out, record.uri, MAX_DOCUMENT_LOADER_URIS);
}

function normalizeUriList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];

  const out: string[] = [];
  for (const entry of raw.slice(0, MAX_DOCUMENT_LOADER_URIS)) {
    pushDistinctString(out, entry, MAX_DOCUMENT_LOADER_URIS);
  }

  return out;
}

function buildDocumentLoaderContractOutput(input: Record<string, any>): Record<string, any> {
  const datasetId = coerceOptionalPositiveInt(input.dataset_id) ?? null;
  const uris = normalizeUriList(input.uris);

  const documents = uris.map((uri, index) => ({
    document_id: `doc_${index + 1}`,
    uri,
    dataset_id: datasetId,
  }));

  return {
    dataset_id: datasetId,
    document_count: documents.length,
    documents,
  };
}

export function resolveDocumentLoaderContractInput(inputs: any[], context: NodeExecutionContext): Record<string, any> {
  const inputRecord = context.input_json && typeof context.input_json === 'object' ? context.input_json : {};
  const datasetId =
    coerceOptionalPositiveInt((inputRecord as Record<string, unknown>).dataset_id) ??
    coerceOptionalPositiveInt((inputRecord as Record<string, unknown>).datasetId) ??
    context.dataset?.dataset_id;

  const uris: string[] = [];
  collectUris(context.input_json, uris);
  for (const source of inputs.slice(0, 16)) {
    if (uris.length >= MAX_DOCUMENT_LOADER_URIS) break;
    collectUris(source, uris);
  }
  pushDistinctString(uris, context.dataset?.uri, MAX_DOCUMENT_LOADER_URIS);

  if (!datasetId && uris.length === 0) {
    throw new HttpError(400, {
      code: 'EXECUTOR_TOOLNODE_CONTRACT_INPUT_INVALID',
      error: 'DocumentLoader contract requires dataset_id or at least one uri',
      details: { contract: 'DocumentLoader' },
    });
  }

  return {
    ...(datasetId ? { dataset_id: datasetId } : {}),
    ...(uris.length > 0 ? { uris } : {}),
  };
}

export const documentLoaderToolContractDefinition: ToolContractDefinition = {
  name: 'DocumentLoader',
  aliases: ['documentloader', 'document-loader', 'document_loader'],
  allowedExecutors: ['http-json'],
  resolveInput: resolveDocumentLoaderContractInput,
  buildHttpSuccessOutput: ({ input }) => buildDocumentLoaderContractOutput(input),
};

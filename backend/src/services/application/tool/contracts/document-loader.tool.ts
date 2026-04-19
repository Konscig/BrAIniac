import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from '../../../../common/http-error.js';
import type { NodeExecutionContext } from '../../pipeline/pipeline.executor.types.js';
import { buildInlineArtifactManifest } from './tool-artifact.manifest.js';
import type { ToolContractDefinition } from './tool-contract.types.js';

const MAX_DOCUMENT_LOADER_URIS = 64;
const MAX_DOCUMENT_LOADER_DOCUMENTS = 128;

type LoadedDocument = {
  document_id: string;
  uri: string;
  dataset_id: number | null;
  text?: string;
  title?: string;
  source: 'local-file' | 'synthetic-uri';
};

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function normalizeDocumentText(raw: string): string {
  return raw.replace(/\r\n/g, '\n').trim();
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
  const nestedKeys = ['value', 'data', 'payload', 'output', 'contract_output'];
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

function getDocumentLoaderRoot(): string {
  const configured = typeof process.env.EXECUTOR_DOCUMENT_LOADER_ROOT === 'string' ? process.env.EXECUTOR_DOCUMENT_LOADER_ROOT.trim() : '';
  if (configured) {
    return path.resolve(process.cwd(), configured);
  }

  const cwd = process.cwd();
  return path.basename(cwd).toLowerCase() === 'backend' ? path.resolve(cwd, '..') : cwd;
}

function ensurePathWithinRoot(absolutePath: string): string {
  const root = getDocumentLoaderRoot();
  const normalizedRoot = path.resolve(root);
  const normalizedPath = path.resolve(absolutePath);

  if (normalizedPath === normalizedRoot) {
    return normalizedPath;
  }

  if (!normalizedPath.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new HttpError(400, {
      code: 'EXECUTOR_TOOLNODE_CONTRACT_INPUT_INVALID',
      error: 'DocumentLoader local file path is outside allowed workspace root',
      details: {
        contract: 'DocumentLoader',
        path: normalizedPath,
      },
    });
  }

  return normalizedPath;
}

function hasUriScheme(uri: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(uri);
}

function resolveLocalFilePath(uri: string): string | null {
  const raw = uri.trim();
  if (!raw) return null;

  if (raw.startsWith('workspace://')) {
    const relativePath = decodeURIComponent(raw.slice('workspace://'.length));
    if (!relativePath) return null;
    return ensurePathWithinRoot(path.resolve(getDocumentLoaderRoot(), relativePath));
  }

  if (raw.startsWith('file://')) {
    return ensurePathWithinRoot(fileURLToPath(raw));
  }

  if (!hasUriScheme(raw)) {
    return ensurePathWithinRoot(path.resolve(getDocumentLoaderRoot(), raw));
  }

  return null;
}

function sanitizeDocumentId(raw: string): string {
  const compact = raw
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return compact.length > 0 ? compact.slice(0, 120) : 'doc';
}

function inferTitleFromPath(absolutePath: string): string {
  const parsed = path.parse(absolutePath);
  return parsed.name || parsed.base || 'document';
}

function buildFallbackDocuments(datasetId: number | null, uris: string[]): LoadedDocument[] {
  return uris.map((uri, index) => ({
    document_id: `doc_${index + 1}`,
    uri,
    dataset_id: datasetId,
    source: 'synthetic-uri',
  }));
}

function mapLoadedDocumentRecord(
  raw: unknown,
  sourceUri: string,
  datasetId: number | null,
  fallbackIdBase: string,
  index: number,
): LoadedDocument | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const record = raw as Record<string, unknown>;
  const text =
    typeof record.text === 'string'
      ? normalizeDocumentText(record.text)
      : typeof record.content === 'string'
      ? normalizeDocumentText(record.content)
      : typeof record.body === 'string'
      ? normalizeDocumentText(record.body)
      : '';

  if (!text) return null;

  const explicitId =
    readNonEmptyText(record.document_id) ??
    readNonEmptyText(record.doc_id) ??
    readNonEmptyText(record.id) ??
    `${fallbackIdBase}_${index + 1}`;
  const explicitUri = readNonEmptyText(record.uri) ?? sourceUri;
  const title = readNonEmptyText(record.title) ?? readNonEmptyText(record.name);

  return {
    document_id: sanitizeDocumentId(explicitId),
    uri: explicitUri,
    dataset_id: datasetId,
    text,
    ...(title ? { title } : {}),
    source: 'local-file',
  };
}

async function readDocumentsFromLocalFile(uri: string, datasetId: number | null): Promise<LoadedDocument[] | null> {
  const absolutePath = resolveLocalFilePath(uri);
  if (!absolutePath) return null;

  let fileText = '';
  try {
    fileText = await readFile(absolutePath, 'utf8');
  } catch (error) {
    throw new HttpError(400, {
      code: 'EXECUTOR_TOOLNODE_CONTRACT_INPUT_INVALID',
      error: 'DocumentLoader could not read local file',
      details: {
        contract: 'DocumentLoader',
        uri,
        path: absolutePath,
        reason: error instanceof Error ? error.message : 'read failed',
      },
    });
  }

  const normalizedText = normalizeDocumentText(fileText);
  const fallbackIdBase = sanitizeDocumentId(inferTitleFromPath(absolutePath));
  const extension = path.extname(absolutePath).toLowerCase();

  if (extension === '.json') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(fileText);
    } catch (error) {
      throw new HttpError(400, {
        code: 'EXECUTOR_TOOLNODE_CONTRACT_INPUT_INVALID',
        error: 'DocumentLoader JSON file is invalid',
        details: {
          contract: 'DocumentLoader',
          uri,
          path: absolutePath,
          reason: error instanceof Error ? error.message : 'json parse failed',
        },
      });
    }

    const sourceArray =
      Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).documents)
        ? ((parsed as Record<string, unknown>).documents as unknown[])
        : parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).items)
        ? ((parsed as Record<string, unknown>).items as unknown[])
        : null;

    if (sourceArray) {
      const documents = sourceArray
        .slice(0, MAX_DOCUMENT_LOADER_DOCUMENTS)
        .map((entry, index) => mapLoadedDocumentRecord(entry, uri, datasetId, fallbackIdBase, index))
        .filter((entry): entry is LoadedDocument => entry !== null);

      if (documents.length > 0) {
        return documents;
      }
    }

    if (parsed && typeof parsed === 'object') {
      const singleDocument = mapLoadedDocumentRecord(parsed, uri, datasetId, fallbackIdBase, 0);
      if (singleDocument) {
        return [singleDocument];
      }
    }
  }

  if (!normalizedText) {
    throw new HttpError(400, {
      code: 'EXECUTOR_TOOLNODE_CONTRACT_INPUT_INVALID',
      error: 'DocumentLoader local file is empty',
      details: {
        contract: 'DocumentLoader',
        uri,
        path: absolutePath,
      },
    });
  }

  return [
    {
      document_id: fallbackIdBase,
      uri,
      dataset_id: datasetId,
      title: inferTitleFromPath(absolutePath),
      text: normalizedText,
      source: 'local-file',
    },
  ];
}

async function buildDocumentLoaderContractOutput(input: Record<string, any>): Promise<Record<string, any>> {
  const datasetId = coerceOptionalPositiveInt(input.dataset_id) ?? null;
  const uris = normalizeUriList(input.uris);
  const documents: LoadedDocument[] = [];

  for (const uri of uris) {
    if (documents.length >= MAX_DOCUMENT_LOADER_DOCUMENTS) break;

    const loaded = await readDocumentsFromLocalFile(uri, datasetId);
    if (loaded && loaded.length > 0) {
      for (const document of loaded) {
        if (documents.length >= MAX_DOCUMENT_LOADER_DOCUMENTS) break;
        documents.push(document);
      }
      continue;
    }

    documents.push({
      document_id: `doc_${documents.length + 1}`,
      uri,
      dataset_id: datasetId,
      source: 'synthetic-uri',
    });
  }

  return {
    dataset_id: datasetId,
    document_count: documents.length,
    documents,
    documents_manifest: buildInlineArtifactManifest('documents', documents, {
      dataset_id: datasetId,
      source: documents.some((entry) => entry.source === 'local-file') ? 'document-loader-local-file' : 'document-loader-contract',
    }),
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

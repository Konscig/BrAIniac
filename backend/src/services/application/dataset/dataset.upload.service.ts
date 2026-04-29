import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { HttpError } from '../../../common/http-error.js';
import { isValidUtf8 } from '../../../common/text/utf8-detector.js';
import {
  RAG_DATASET_ALLOWED_EXTENSIONS,
  RAG_DATASET_ERROR_CODES,
  RAG_DATASET_ERROR_MESSAGES,
  RAG_DATASET_MAX_FILE_BYTES,
} from '../tool/contracts/rag-dataset.constants.js';
import { getRagCorpusRoot, ragCorpusAbsolutePathToUri } from './rag-corpus-path.service.js';

const DEFAULT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.txt', '.text', '.md', '.json']);
const MANAGED_DATASET_PREFIX = 'workspace://backend/.artifacts/datasets/';

function normalizeText(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

function readPositiveInt(raw: unknown, fallback: number): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return fallback;
  return value;
}

function sanitizeFilename(raw: string): string {
  const trimmed = raw.trim();
  const parsed = path.parse(trimmed);
  const baseName = (parsed.name || 'upload')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'upload';
  const extension = parsed.ext.toLowerCase();
  return `${baseName}${extension}`;
}

function getAllowedExtension(filename: string, mimeType: string): string {
  const extension = path.extname(filename).toLowerCase();
  if (ALLOWED_EXTENSIONS.has(extension)) return extension;

  const normalizedMimeType = mimeType.trim().toLowerCase();
  if (normalizedMimeType === 'text/plain') return '.txt';
  if (normalizedMimeType === 'application/json' || normalizedMimeType === 'text/json') return '.json';
  if (normalizedMimeType === 'text/markdown') return '.md';

  throw new HttpError(400, {
    code: 'DATASET_UPLOAD_FILETYPE_UNSUPPORTED',
    error: 'dataset upload supports only text and json files',
    details: {
      filename,
      mime_type: mimeType || null,
    },
  });
}

function decodeBase64Content(contentBase64: string): Buffer {
  const normalized = contentBase64.replace(/\s+/g, '');
  try {
    return Buffer.from(normalized, 'base64');
  } catch {
    throw new HttpError(400, {
      code: 'DATASET_UPLOAD_CONTENT_INVALID',
      error: 'dataset upload content_base64 is invalid',
    });
  }
}

function getRepoRoot(): string {
  const cwd = process.cwd();
  return path.basename(cwd).toLowerCase() === 'backend' ? path.resolve(cwd, '..') : cwd;
}

function getManagedDatasetRoot(): string {
  return path.join(getRepoRoot(), 'backend', '.artifacts', 'datasets');
}

function toWorkspaceUri(absolutePath: string): string {
  const repoRoot = getRepoRoot();
  const relativePath = path.relative(repoRoot, absolutePath).replace(/\\/g, '/');
  return `workspace://${relativePath}`;
}

export function isManagedDatasetUri(uri: string): boolean {
  return normalizeText(uri).startsWith(MANAGED_DATASET_PREFIX);
}

export function resolveManagedDatasetAbsolutePath(uri: string): string | null {
  if (!isManagedDatasetUri(uri)) return null;
  const repoRoot = getRepoRoot();
  const relativePath = uri.slice('workspace://'.length);
  return path.resolve(repoRoot, relativePath);
}

export type PersistDatasetUploadInput = {
  filename: string;
  mimeType?: string;
  contentBase64: string;
};

export type PersistedDatasetUpload = {
  uri: string;
  sizeBytes: number;
  filename: string;
  mimeType: string | null;
};

export async function persistDatasetUpload(input: PersistDatasetUploadInput): Promise<PersistedDatasetUpload> {
  const rawFilename = normalizeText(input.filename);
  if (!rawFilename) {
    throw new HttpError(400, {
      code: 'DATASET_UPLOAD_FILENAME_REQUIRED',
      error: 'dataset upload requires filename',
    });
  }

  const mimeType = normalizeText(input.mimeType);
  const normalizedFilename = sanitizeFilename(rawFilename);
  const extension = getAllowedExtension(normalizedFilename, mimeType);
  const finalFilename = normalizedFilename.endsWith(extension) ? normalizedFilename : `${normalizedFilename}${extension}`;

  const contentBase64 = normalizeText(input.contentBase64);
  if (!contentBase64) {
    throw new HttpError(400, {
      code: 'DATASET_UPLOAD_CONTENT_REQUIRED',
      error: 'dataset upload requires content_base64',
    });
  }

  const bytes = decodeBase64Content(contentBase64);
  if (bytes.length === 0) {
    throw new HttpError(400, {
      code: 'DATASET_UPLOAD_EMPTY',
      error: 'dataset upload file is empty',
    });
  }

  const maxBytes = readPositiveInt(process.env.DATASET_UPLOAD_MAX_BYTES, DEFAULT_MAX_UPLOAD_BYTES);
  if (bytes.length > maxBytes) {
    throw new HttpError(413, {
      code: 'DATASET_UPLOAD_TOO_LARGE',
      error: 'dataset upload exceeds size limit',
      details: {
        max_bytes: maxBytes,
        received_bytes: bytes.length,
      },
    });
  }

  const now = new Date();
  const dateSegment = now.toISOString().slice(0, 10);
  const storageDir = path.join(getManagedDatasetRoot(), dateSegment);
  await mkdir(storageDir, { recursive: true });

  const storedName = `${Date.now()}-${randomUUID().slice(0, 8)}-${finalFilename}`;
  const absolutePath = path.join(storageDir, storedName);
  await writeFile(absolutePath, bytes);

  return {
    uri: toWorkspaceUri(absolutePath),
    sizeBytes: bytes.length,
    filename: finalFilename,
    mimeType: mimeType || null,
  };
}

export async function deleteManagedDatasetSourceIfOwned(uri: string | null | undefined): Promise<void> {
  const resolved = uri ? resolveManagedDatasetAbsolutePath(uri) : null;
  if (!resolved) return;

  try {
    await rm(resolved, { force: true });
  } catch {
    // Best effort cleanup only.
  }
}

// ============================================================================
// RAG Corpus upload (kind=rag-corpus)
// ============================================================================

const RAG_CORPUS_ALLOWED_EXTENSIONS_SET = new Set<string>(RAG_DATASET_ALLOWED_EXTENSIONS);

function sanitizeRagCorpusFilename(raw: string): string {
  const trimmed = (raw ?? '').toString().trim();
  if (!trimmed) {
    throw httpError(
      400,
      RAG_DATASET_ERROR_CODES.FILENAME_INVALID,
      { reason: 'empty' },
    );
  }

  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('\0') || trimmed.includes('..')) {
    throw httpError(400, RAG_DATASET_ERROR_CODES.FILENAME_INVALID, { filename: trimmed });
  }

  const parsed = path.parse(trimmed);
  const baseName = (parsed.name || 'corpus')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'corpus';
  const extension = parsed.ext.toLowerCase();

  if (!RAG_CORPUS_ALLOWED_EXTENSIONS_SET.has(extension)) {
    throw httpError(400, RAG_DATASET_ERROR_CODES.FORMAT_INVALID, {
      filename: trimmed,
      extension: extension || null,
      allowed: [...RAG_DATASET_ALLOWED_EXTENSIONS],
    });
  }

  return `${baseName}${extension}`;
}

function decodeRagCorpusContent(contentBase64: string): Buffer {
  const normalized = (contentBase64 ?? '').toString().replace(/\s+/g, '');
  if (!normalized) {
    throw httpError(400, RAG_DATASET_ERROR_CODES.CONTENT_INVALID, { reason: 'empty' });
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(normalized, 'base64');
  } catch {
    throw httpError(400, RAG_DATASET_ERROR_CODES.CONTENT_INVALID, { reason: 'base64 parse failed' });
  }
  if (buffer.length === 0) {
    throw httpError(400, RAG_DATASET_ERROR_CODES.CONTENT_INVALID, { reason: 'decoded empty' });
  }
  return buffer;
}

function httpError(status: number, code: string, details: Record<string, unknown>): HttpError {
  return new HttpError(status, {
    code,
    error:
      RAG_DATASET_ERROR_MESSAGES[code as keyof typeof RAG_DATASET_ERROR_MESSAGES] ??
      'rag corpus upload error',
    details,
  });
}

export type PersistRagCorpusUploadInput = {
  filename: string;
  contentBase64: string;
  ownerToken: string;
};

export type PersistedRagCorpusUpload = {
  uri: string;
  filename: string;
  size_bytes: number;
  kind: 'rag-corpus';
};

/**
 * Сохраняет файл корпуса в `backend/.artifacts/rag-corpus/<owner_token>/<sanitized>`.
 * Валидирует filename, размер ≤1 МБ, кодировку UTF-8. См. контракт
 * specs/002-rag-dataset-tool/contracts/rag-corpus-upload-endpoint.md.
 */
export async function persistRagCorpusUpload(input: PersistRagCorpusUploadInput): Promise<PersistedRagCorpusUpload> {
  const filename = sanitizeRagCorpusFilename(input.filename);
  const buffer = decodeRagCorpusContent(input.contentBase64);

  if (buffer.length > RAG_DATASET_MAX_FILE_BYTES) {
    throw new HttpError(413, {
      code: RAG_DATASET_ERROR_CODES.SIZE_EXCEEDED,
      error: RAG_DATASET_ERROR_MESSAGES[RAG_DATASET_ERROR_CODES.SIZE_EXCEEDED],
      details: {
        filename,
        size_bytes: buffer.length,
        limit_bytes: RAG_DATASET_MAX_FILE_BYTES,
      },
    });
  }

  if (!isValidUtf8(buffer)) {
    throw httpError(400, RAG_DATASET_ERROR_CODES.ENCODING_INVALID, { filename });
  }

  const ownerToken = sanitizeOwnerToken(input.ownerToken);
  const storageDir = path.join(getRagCorpusRoot(), ownerToken);
  await mkdir(storageDir, { recursive: true });

  const finalPath = path.join(storageDir, filename);
  const tempPath = `${finalPath}.tmp-${randomUUID().slice(0, 8)}`;

  await writeFile(tempPath, buffer);
  try {
    await rename(tempPath, finalPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw new HttpError(500, {
      code: 'RAG_CORPUS_STORE_FAILED',
      error: 'Не удалось сохранить файл RAG-корпуса.',
      details: { filename, reason: error instanceof Error ? error.message : 'rename failed' },
    });
  }

  return {
    uri: ragCorpusAbsolutePathToUri(finalPath),
    filename,
    size_bytes: buffer.length,
    kind: 'rag-corpus',
  };
}

function sanitizeOwnerToken(raw: string): string {
  const cleaned = (raw ?? '').toString().trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned.length > 0 ? cleaned.slice(0, 64) : 'anonymous';
}

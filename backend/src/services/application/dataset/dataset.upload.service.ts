import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { HttpError } from '../../../common/http-error.js';

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

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { HttpError } from '../../../../common/http-error.js';

const MAX_ARTIFACT_MANIFEST_ITEMS = 1024;
const DEFAULT_ARTIFACT_STORE_DIR = '.artifacts';

function toObjectRecord(raw: unknown): Record<string, any> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, any>;
}

function normalizeArtifactKind(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function getArtifactStoreRoot(): string {
  const configured = typeof process.env.EXECUTOR_ARTIFACT_STORE_DIR === 'string' ? process.env.EXECUTOR_ARTIFACT_STORE_DIR.trim() : '';
  const relative = configured.length > 0 ? configured : DEFAULT_ARTIFACT_STORE_DIR;
  return path.resolve(process.cwd(), relative);
}

function ensurePointerPathWithinArtifactStore(rawPath: string): string {
  const artifactStoreRoot = getArtifactStoreRoot();
  const resolvedPath = path.resolve(process.cwd(), rawPath);

  if (resolvedPath === artifactStoreRoot) {
    return resolvedPath;
  }

  if (!resolvedPath.startsWith(`${artifactStoreRoot}${path.sep}`)) {
    throw new HttpError(400, {
      code: 'EXECUTOR_TOOLNODE_CONTRACT_INPUT_INVALID',
      error: 'artifact manifest pointer is outside allowed artifact store',
      details: {
        pointer_path: rawPath,
        artifact_store_root: artifactStoreRoot,
      },
    });
  }

  return resolvedPath;
}

function readExternalArtifactItems(record: Record<string, any>, expectedKinds: Set<string>): unknown[] {
  const storageMode = typeof record.storage_mode === 'string' ? record.storage_mode.trim().toLowerCase() : 'inline-json';
  if (storageMode !== 'external-blob') return [];

  const artifactKind = normalizeArtifactKind(record.artifact_kind ?? record.artifactKind);
  const kindMatches = expectedKinds.size === 0 || expectedKinds.has(artifactKind);
  if (!kindMatches) return [];

  const pointer = toObjectRecord(record.pointer);
  const pointerKind = typeof pointer?.kind === 'string' ? pointer.kind.trim().toLowerCase() : '';
  const pointerPath = typeof pointer?.path === 'string' ? pointer.path.trim() : '';

  if (pointerKind !== 'local-file' || !pointerPath) {
    throw new HttpError(400, {
      code: 'EXECUTOR_TOOLNODE_CONTRACT_INPUT_INVALID',
      error: 'artifact manifest pointer is invalid',
      details: {
        pointer_kind: pointerKind || null,
        pointer_path: pointerPath || null,
      },
    });
  }

  const absolutePath = ensurePointerPathWithinArtifactStore(pointerPath);

  let payloadText = '';
  try {
    payloadText = readFileSync(absolutePath, 'utf8');
  } catch (error) {
    throw new HttpError(400, {
      code: 'EXECUTOR_TOOLNODE_CONTRACT_INPUT_INVALID',
      error: 'artifact manifest pointer could not be read',
      details: {
        pointer_path: pointerPath,
        reason: error instanceof Error ? error.message : 'read failed',
      },
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadText);
  } catch (error) {
    throw new HttpError(400, {
      code: 'EXECUTOR_TOOLNODE_CONTRACT_INPUT_INVALID',
      error: 'artifact manifest pointer contains invalid JSON',
      details: {
        pointer_path: pointerPath,
        reason: error instanceof Error ? error.message : 'json parse failed',
      },
    });
  }

  const payloadRecord = toObjectRecord(parsed);
  if (!payloadRecord) {
    throw new HttpError(400, {
      code: 'EXECUTOR_TOOLNODE_CONTRACT_INPUT_INVALID',
      error: 'artifact manifest pointer payload must be an object',
      details: {
        pointer_path: pointerPath,
      },
    });
  }

  const payloadKind = normalizeArtifactKind(payloadRecord.artifact_kind ?? payloadRecord.artifactKind);
  if (payloadKind && payloadKind !== artifactKind) {
    throw new HttpError(400, {
      code: 'EXECUTOR_TOOLNODE_CONTRACT_INPUT_INVALID',
      error: 'artifact manifest pointer kind mismatch',
      details: {
        pointer_path: pointerPath,
        expected_artifact_kind: artifactKind,
        actual_artifact_kind: payloadKind,
      },
    });
  }

  return Array.isArray(payloadRecord.items) ? payloadRecord.items.slice(0, MAX_ARTIFACT_MANIFEST_ITEMS) : [];
}

function collectArtifactManifestItems(
  value: unknown,
  expectedKinds: Set<string>,
  out: unknown[],
  depth = 0,
): void {
  if (depth > 6 || value === undefined || value === null || out.length >= MAX_ARTIFACT_MANIFEST_ITEMS) return;

  if (Array.isArray(value)) {
    for (const entry of value.slice(0, MAX_ARTIFACT_MANIFEST_ITEMS - out.length)) {
      collectArtifactManifestItems(entry, expectedKinds, out, depth + 1);
      if (out.length >= MAX_ARTIFACT_MANIFEST_ITEMS) break;
    }
    return;
  }

  const record = toObjectRecord(value);
  if (!record) return;

  const kind = normalizeArtifactKind(record.kind);
  if (kind === 'artifactmanifest') {
    const artifactKind = normalizeArtifactKind(record.artifact_kind ?? record.artifactKind);
    const kindMatches = expectedKinds.size === 0 || expectedKinds.has(artifactKind);
    if (kindMatches && Array.isArray(record.items)) {
      for (const item of record.items.slice(0, MAX_ARTIFACT_MANIFEST_ITEMS - out.length)) {
        out.push(item);
        if (out.length >= MAX_ARTIFACT_MANIFEST_ITEMS) break;
      }
    }

    const externalItems = readExternalArtifactItems(record, expectedKinds);
    for (const item of externalItems.slice(0, MAX_ARTIFACT_MANIFEST_ITEMS - out.length)) {
      out.push(item);
      if (out.length >= MAX_ARTIFACT_MANIFEST_ITEMS) break;
    }
  }

  const wrapperKeys = ['value', 'data', 'payload', 'output', 'contract_output'];
  for (const key of wrapperKeys) {
    if (!(key in record)) continue;
    collectArtifactManifestItems(record[key], expectedKinds, out, depth + 1);
    if (out.length >= MAX_ARTIFACT_MANIFEST_ITEMS) break;
  }

  if (out.length >= MAX_ARTIFACT_MANIFEST_ITEMS) return;

  for (const [key, nested] of Object.entries(record)) {
    if (wrapperKeys.includes(key)) continue;
    collectArtifactManifestItems(nested, expectedKinds, out, depth + 1);
    if (out.length >= MAX_ARTIFACT_MANIFEST_ITEMS) break;
  }
}

export function buildInlineArtifactManifest(
  artifactKind: string,
  items: unknown[],
  meta: Record<string, any> = {},
): Record<string, any> {
  return {
    kind: 'artifact_manifest',
    artifact_kind: artifactKind,
    storage_mode: 'inline-json',
    item_count: Array.isArray(items) ? items.length : 0,
    items: Array.isArray(items) ? items : [],
    ...(Object.keys(meta).length > 0 ? { meta } : {}),
  };
}

export function listArtifactManifestItems(value: unknown, expectedKinds: string[] = []): unknown[] {
  const out: unknown[] = [];
  const normalizedKinds = new Set(expectedKinds.map((entry) => normalizeArtifactKind(entry)).filter((entry) => entry.length > 0));
  collectArtifactManifestItems(value, normalizedKinds, out);
  return out;
}

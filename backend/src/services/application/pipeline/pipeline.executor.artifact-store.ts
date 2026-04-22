import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_ARTIFACT_STORE_DIR = '.artifacts';
const DEFAULT_INLINE_MAX_ITEMS = 96;
const DEFAULT_INLINE_MAX_BYTES = 32 * 1024;
const DEFAULT_PREVIEW_ITEMS = 3;

type ExternalizeScope = {
  executionId: string;
  nodeId?: number;
  section?: string;
};

function readPositiveInteger(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return fallback;
  return value;
}

function toObjectRecord(raw: unknown): Record<string, any> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, any>;
}

function normalizeManifestKind(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function getArtifactStoreRoot(): string {
  const configured = (process.env.EXECUTOR_ARTIFACT_STORE_DIR ?? DEFAULT_ARTIFACT_STORE_DIR).trim();
  const relative = configured.length > 0 ? configured : DEFAULT_ARTIFACT_STORE_DIR;
  return path.resolve(process.cwd(), relative);
}

function shouldExternalizeManifest(record: Record<string, any>, items: unknown[]): boolean {
  const inlineMaxItems = readPositiveInteger(process.env.EXECUTOR_ARTIFACT_INLINE_MAX_ITEMS, DEFAULT_INLINE_MAX_ITEMS);
  const inlineMaxBytes = readPositiveInteger(process.env.EXECUTOR_ARTIFACT_INLINE_MAX_BYTES, DEFAULT_INLINE_MAX_BYTES);

  if (items.length > inlineMaxItems) return true;

  let serialized = '';
  try {
    serialized = JSON.stringify({
      artifact_kind: record.artifact_kind,
      item_count: record.item_count,
      items,
      meta: record.meta ?? null,
    });
  } catch {
    return true;
  }

  return Buffer.byteLength(serialized, 'utf8') > inlineMaxBytes;
}

async function writeArtifactBlob(scope: ExternalizeScope, payload: Record<string, any>): Promise<string> {
  const root = getArtifactStoreRoot();
  const section = scope.section ? scope.section.trim() : 'generic';
  const nodeSegment = scope.nodeId ? `node-${scope.nodeId}` : 'pipeline';
  const directory = path.join(root, 'executions', scope.executionId, section, nodeSegment);
  await mkdir(directory, { recursive: true });

  const filename = `${randomUUID()}.json`;
  const absolutePath = path.join(directory, filename);
  await writeFile(absolutePath, JSON.stringify(payload, null, 2), 'utf8');

  const relativePath = path.relative(process.cwd(), absolutePath);
  return relativePath.replace(/\\/g, '/');
}

async function externalizeArtifactManifest(record: Record<string, any>, scope: ExternalizeScope): Promise<Record<string, any>> {
  if (normalizeManifestKind(record.kind) !== 'artifactmanifest') {
    return record;
  }

  const storageMode = typeof record.storage_mode === 'string' ? record.storage_mode.trim().toLowerCase() : 'inline-json';
  if (storageMode !== 'inline-json') {
    return record;
  }

  const items = Array.isArray(record.items) ? record.items : [];
  if (items.length === 0) {
    return record;
  }

  if (!shouldExternalizeManifest(record, items)) {
    return record;
  }

  const payload = {
    kind: 'artifact_blob',
    artifact_kind: record.artifact_kind ?? null,
    item_count: items.length,
    items,
    meta: record.meta ?? null,
  };

  const pointerPath = await writeArtifactBlob(scope, payload);
  const previewCount = readPositiveInteger(process.env.EXECUTOR_ARTIFACT_PREVIEW_ITEMS, DEFAULT_PREVIEW_ITEMS);
  const previewItems = items.slice(0, previewCount);

  return {
    kind: 'artifact_manifest',
    artifact_kind: record.artifact_kind ?? null,
    storage_mode: 'external-blob',
    item_count: items.length,
    pointer: {
      kind: 'local-file',
      path: pointerPath,
    },
    ...(record.meta !== undefined ? { meta: record.meta } : {}),
    ...(previewItems.length > 0 ? { preview_items: previewItems } : {}),
  };
}

async function externalizeValue(value: unknown, scope: ExternalizeScope): Promise<unknown> {
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const entry of value) {
      out.push(await externalizeValue(entry, scope));
    }
    return out;
  }

  const record = toObjectRecord(value);
  if (!record) return value;

  const manifestCandidate = await externalizeArtifactManifest(record, scope);
  if (manifestCandidate !== record) {
    return manifestCandidate;
  }

  const out: Record<string, any> = {};
  for (const [key, entry] of Object.entries(record)) {
    out[key] = await externalizeValue(entry, scope);
  }
  return out;
}

export async function externalizeNodeStateArtifacts<T>(value: T, scope: ExternalizeScope): Promise<T> {
  return (await externalizeValue(value, scope)) as T;
}

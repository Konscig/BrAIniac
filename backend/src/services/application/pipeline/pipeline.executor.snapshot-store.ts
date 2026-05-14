import { createHash } from 'node:crypto';
import { mkdir, open, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PipelineExecutionSnapshot } from './pipeline.executor.types.js';

const DEFAULT_ARTIFACT_STORE_DIR = '.artifacts';
const SNAPSHOT_FILENAME = 'execution-snapshot.json';
const RUNTIME_COORDINATION_DIR = 'runtime';
const DEFAULT_COORDINATION_STALE_MS = 15 * 60_000;
const DEFAULT_EXECUTION_RETENTION_DAYS = 7;
const DEFAULT_EXECUTION_RETENTION_MAX = 200;

type InFlightExecutionRecord = {
  pipeline_id: number;
  execution_id: string;
  updated_at: string;
};

type IdempotencyExecutionRecord = {
  user_id: number;
  pipeline_id: number;
  idempotency_key: string;
  execution_id: string;
  updated_at: string;
};

export type CoordinationClaimResult<T> =
  | {
      claimed: true;
      record: T;
    }
  | {
      claimed: false;
      record: T;
    };

function getArtifactStoreRoot(): string {
  const configured = (process.env.EXECUTOR_ARTIFACT_STORE_DIR ?? DEFAULT_ARTIFACT_STORE_DIR).trim();
  const relative = configured.length > 0 ? configured : DEFAULT_ARTIFACT_STORE_DIR;
  return path.resolve(process.cwd(), relative);
}

function getExecutionDirectory(executionId: string): string {
  return path.join(getArtifactStoreRoot(), 'executions', executionId);
}

function getExecutionSnapshotPath(executionId: string): string {
  return path.join(getExecutionDirectory(executionId), SNAPSHOT_FILENAME);
}

function getRuntimeCoordinationRoot(): string {
  return path.join(getArtifactStoreRoot(), RUNTIME_COORDINATION_DIR);
}

function getCoordinationStaleMs(): number {
  const raw = Number(process.env.EXECUTOR_COORDINATION_STALE_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_COORDINATION_STALE_MS;
  return Math.floor(raw);
}

function getInFlightRecordPath(pipelineId: number): string {
  return path.join(getRuntimeCoordinationRoot(), 'inflight', `pipeline-${pipelineId}.json`);
}

function hashIdempotencyKey(value: string): string {
  return createHash('sha1').update(value).digest('hex');
}

function getIdempotencyRecordPath(userId: number, pipelineId: number, idempotencyKey: string): string {
  const hashedKey = hashIdempotencyKey(idempotencyKey);
  return path.join(getRuntimeCoordinationRoot(), 'idempotency', `user-${userId}`, `pipeline-${pipelineId}`, `${hashedKey}.json`);
}

async function readJsonFile<T>(absolutePath: string): Promise<T | null> {
  let payloadText = '';
  try {
    payloadText = await readFile(absolutePath, 'utf8');
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(payloadText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(absolutePath: string, payload: unknown): Promise<void> {
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, JSON.stringify(payload, null, 2), 'utf8');
}

async function writeJsonFileExclusive(absolutePath: string, payload: unknown): Promise<boolean> {
  await mkdir(path.dirname(absolutePath), { recursive: true });

  try {
    const handle = await open(absolutePath, 'wx');
    try {
      await handle.writeFile(JSON.stringify(payload, null, 2), 'utf8');
      return true;
    } finally {
      await handle.close();
    }
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';
    if (code === 'EEXIST') return false;
    throw error;
  }
}

function parseUpdatedAtMs(value: string | undefined): number | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export function isCoordinationRecordStale(updatedAt: string | undefined, nowMs = Date.now()): boolean {
  const updatedAtMs = parseUpdatedAtMs(updatedAt);
  if (updatedAtMs === null) return true;
  return nowMs - updatedAtMs > getCoordinationStaleMs();
}

export async function writeExecutionSnapshot(snapshot: PipelineExecutionSnapshot): Promise<void> {
  const directory = getExecutionDirectory(snapshot.execution_id);
  await mkdir(directory, { recursive: true });
  const absolutePath = getExecutionSnapshotPath(snapshot.execution_id);
  await writeFile(absolutePath, JSON.stringify(snapshot, null, 2), 'utf8');
}

export async function readExecutionSnapshot(executionId: string): Promise<PipelineExecutionSnapshot | null> {
  return readJsonFile<PipelineExecutionSnapshot>(getExecutionSnapshotPath(executionId));
}

/** Удаляет execution-папки старше N дней и/или сверх лимита M штук.
 *  Защищает диск от бесконтрольного роста .artifacts/executions при batch-eval
 *  (десятки items × N items × snapshot.json + node-output/vectors_manifest).
 *
 *  Настройки через env:
 *    EXECUTION_RETENTION_DAYS  — TTL в днях (default 7)
 *    EXECUTION_RETENTION_MAX   — макс. число execution-папок (default 200)
 *
 *  Если параметр = 0 — соответствующая политика выключена. Best-effort: ошибки
 *  логируются, но не пробрасываются. */
export async function pruneOldExecutions(): Promise<{ removed: number; kept: number }> {
  const root = path.join(getArtifactStoreRoot(), 'executions');
  const retentionDays = Number(process.env.EXECUTION_RETENTION_DAYS ?? DEFAULT_EXECUTION_RETENTION_DAYS);
  const retentionMax = Number(process.env.EXECUTION_RETENTION_MAX ?? DEFAULT_EXECUTION_RETENTION_MAX);
  const cutoffMs = Date.now() - (retentionDays > 0 ? retentionDays * 86_400_000 : Infinity);

  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return { removed: 0, kept: 0 };
  }

  const candidates: Array<{ name: string; mtime: number }> = [];
  for (const name of entries) {
    try {
      const st = await stat(path.join(root, name));
      if (!st.isDirectory()) continue;
      candidates.push({ name, mtime: st.mtimeMs });
    } catch {
      // best-effort
    }
  }

  // Удаляем старше TTL
  const ttlVictims = new Set<string>();
  if (retentionDays > 0) {
    for (const c of candidates) {
      if (c.mtime < cutoffMs) ttlVictims.add(c.name);
    }
  }

  // Сверх лимита (FIFO: удаляем самые старые)
  const limitVictims = new Set<string>();
  if (retentionMax > 0 && candidates.length > retentionMax) {
    const sorted = [...candidates].sort((a, b) => a.mtime - b.mtime);
    const overshoot = sorted.length - retentionMax;
    for (let i = 0; i < overshoot; i += 1) {
      limitVictims.add(sorted[i]!.name);
    }
  }

  const victims = new Set([...ttlVictims, ...limitVictims]);
  let removed = 0;
  for (const name of victims) {
    try {
      await rm(path.join(root, name), { recursive: true, force: true });
      removed += 1;
    } catch (err) {
      console.warn(`[snapshot-store] failed to prune ${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { removed, kept: candidates.length - removed };
}

export async function writeInFlightExecutionRecord(pipelineId: number, executionId: string): Promise<void> {
  await writeJsonFile(getInFlightRecordPath(pipelineId), {
    pipeline_id: pipelineId,
    execution_id: executionId,
    updated_at: new Date().toISOString(),
  } satisfies InFlightExecutionRecord);
}

export async function readInFlightExecutionRecord(pipelineId: number): Promise<InFlightExecutionRecord | null> {
  return readJsonFile<InFlightExecutionRecord>(getInFlightRecordPath(pipelineId));
}

export async function claimInFlightExecutionRecord(
  pipelineId: number,
  executionId: string,
): Promise<CoordinationClaimResult<InFlightExecutionRecord>> {
  const absolutePath = getInFlightRecordPath(pipelineId);
  const candidateRecord: InFlightExecutionRecord = {
    pipeline_id: pipelineId,
    execution_id: executionId,
    updated_at: new Date().toISOString(),
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const created = await writeJsonFileExclusive(absolutePath, candidateRecord);
    if (created) {
      return {
        claimed: true,
        record: candidateRecord,
      };
    }

    const existing = await readJsonFile<InFlightExecutionRecord>(absolutePath);
    if (!existing) {
      try {
        await rm(absolutePath, { force: true });
      } catch {
        // best effort
      }
      continue;
    }

    if (!isCoordinationRecordStale(existing.updated_at)) {
      return {
        claimed: false,
        record: existing,
      };
    }

    try {
      await rm(absolutePath, { force: true });
    } catch {
      // best effort
    }
  }

  const fallbackRecord = (await readJsonFile<InFlightExecutionRecord>(absolutePath)) ?? candidateRecord;
  return {
    claimed: false,
    record: fallbackRecord,
  };
}

export async function deleteInFlightExecutionRecord(pipelineId: number, expectedExecutionId?: string): Promise<void> {
  const absolutePath = getInFlightRecordPath(pipelineId);
  if (expectedExecutionId) {
    const current = await readJsonFile<InFlightExecutionRecord>(absolutePath);
    if (!current || current.execution_id !== expectedExecutionId) return;
  }

  try {
    await rm(absolutePath, { force: true });
  } catch {
    // best effort
  }
}

export async function writeIdempotencyExecutionRecord(
  userId: number,
  pipelineId: number,
  idempotencyKey: string,
  executionId: string,
): Promise<void> {
  await writeJsonFile(getIdempotencyRecordPath(userId, pipelineId, idempotencyKey), {
    user_id: userId,
    pipeline_id: pipelineId,
    idempotency_key: idempotencyKey,
    execution_id: executionId,
    updated_at: new Date().toISOString(),
  } satisfies IdempotencyExecutionRecord);
}

export async function readIdempotencyExecutionRecord(
  userId: number,
  pipelineId: number,
  idempotencyKey: string,
): Promise<IdempotencyExecutionRecord | null> {
  return readJsonFile<IdempotencyExecutionRecord>(getIdempotencyRecordPath(userId, pipelineId, idempotencyKey));
}

export async function claimIdempotencyExecutionRecord(
  userId: number,
  pipelineId: number,
  idempotencyKey: string,
  executionId: string,
): Promise<CoordinationClaimResult<IdempotencyExecutionRecord>> {
  const absolutePath = getIdempotencyRecordPath(userId, pipelineId, idempotencyKey);
  const candidateRecord: IdempotencyExecutionRecord = {
    user_id: userId,
    pipeline_id: pipelineId,
    idempotency_key: idempotencyKey,
    execution_id: executionId,
    updated_at: new Date().toISOString(),
  };

  const created = await writeJsonFileExclusive(absolutePath, candidateRecord);
  if (created) {
    return {
      claimed: true,
      record: candidateRecord,
    };
  }

  const existing = await readJsonFile<IdempotencyExecutionRecord>(absolutePath);
  if (existing) {
    return {
      claimed: false,
      record: existing,
    };
  }

  await writeJsonFile(absolutePath, candidateRecord);
  return {
    claimed: true,
    record: candidateRecord,
  };
}

export async function deleteIdempotencyExecutionRecord(userId: number, pipelineId: number, idempotencyKey: string): Promise<void> {
  try {
    await rm(getIdempotencyRecordPath(userId, pipelineId, idempotencyKey), { force: true });
  } catch {
    // best effort
  }
}

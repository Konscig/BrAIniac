// Reads items from a managed dataset (JSONL or JSON-array file).
// Supports the AssessItem-compatible shape produced by golden datasets:
//   { item_key|id, input|question, reference|ground_truth_answer, ... }

import { readFile } from 'node:fs/promises';
import { HttpError } from '../../../common/http-error.js';
import { resolveManagedDatasetAbsolutePath } from '../dataset/dataset.upload.service.js';

export type GoldenItem = {
  item_key: string;
  question: string;
  reference?: { answer?: string };
  raw: Record<string, unknown>;
};

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function normalizeRecord(record: Record<string, unknown>, fallbackIndex: number): GoldenItem | null {
  const itemKey = pickString(record, ['item_key', 'id', 'key']) ?? `item_${fallbackIndex}`;
  const question = pickString(record, ['question', 'input', 'query', 'prompt']);
  if (!question) return null;
  const referenceAnswer = pickString(record, ['ground_truth_answer', 'reference', 'answer', 'expected']);
  const refRecord = (typeof record.reference === 'object' && record.reference !== null && !Array.isArray(record.reference))
    ? (record.reference as Record<string, unknown>)
    : null;
  const referenceFromObj = refRecord ? pickString(refRecord, ['answer', 'text']) : undefined;
  const finalReference = referenceFromObj ?? referenceAnswer;
  return {
    item_key: itemKey,
    question,
    ...(finalReference ? { reference: { answer: finalReference } } : {}),
    raw: record,
  };
}

export async function readGoldenItemsFromUri(uri: string): Promise<GoldenItem[]> {
  const absPath = resolveManagedDatasetAbsolutePath(uri);
  if (!absPath) {
    throw new HttpError(400, { code: 'JUDGE_DATASET_URI_UNSUPPORTED', error: 'dataset uri is not workspace-managed', details: { uri } });
  }

  let raw: string;
  try {
    raw = await readFile(absPath, 'utf-8');
  } catch (err) {
    throw new HttpError(404, { code: 'JUDGE_DATASET_FILE_NOT_FOUND', error: 'dataset file not readable', details: { uri, cause: (err as Error).message } });
  }

  const trimmed = raw.trim();
  if (!trimmed) return [];

  let records: unknown[];
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      records = Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      throw new HttpError(422, { code: 'JUDGE_DATASET_INVALID_JSON', error: 'dataset is not valid JSON array', details: { uri, cause: (err as Error).message } });
    }
  } else {
    records = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (err) {
          throw new HttpError(422, {
            code: 'JUDGE_DATASET_INVALID_JSONL',
            error: `invalid JSONL line at ${index + 1}`,
            details: { uri, cause: (err as Error).message },
          });
        }
      });
  }

  const items: GoldenItem[] = [];
  records.forEach((rec, idx) => {
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return;
    const normalized = normalizeRecord(rec as Record<string, unknown>, idx);
    if (normalized) items.push(normalized);
  });
  return items;
}

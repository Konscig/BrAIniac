// Reads items from a managed dataset (JSONL or JSON-array file).
// Поддерживает два формата:
//   - простой:    { item_key, input|question, reference: "<строка>", meta? }
//   - augmented: { item_key, input, reference: { answer, claims[], checklist[],
//                  context_texts[], relevant_docs[], relevant_urls[],
//                  tool_trajectory[], structured_reference, rubric, paraphrases[] }, meta? }

import { readFile } from 'node:fs/promises';
import { HttpError } from '../../../common/http-error.js';
import { resolveManagedDatasetAbsolutePath } from '../dataset/dataset.upload.service.js';

export interface ChecklistItem {
  criterion: string;
  expected: boolean;
}

export interface ToolTrajectoryStep {
  tool: string;
  params: Record<string, any>;
}

export interface GoldenReference {
  answer?: string;
  rubric?: string;
  claims?: string[];
  checklist?: ChecklistItem[];
  context_texts?: string[];
  relevant_docs?: string[];
  relevant_urls?: string[];
  tool_trajectory?: ToolTrajectoryStep[];
  structured_reference?: Record<string, any> | null;
  paraphrases?: string[];
}

export type GoldenItem = {
  item_key: string;
  question: string;
  reference?: GoldenReference;
  raw: Record<string, unknown>;
};

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const filtered = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return filtered.length > 0 ? filtered : undefined;
}

function asChecklist(value: unknown): ChecklistItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: ChecklistItem[] = [];
  for (const v of value) {
    if (!v || typeof v !== 'object') continue;
    const rec = v as Record<string, unknown>;
    if (typeof rec.criterion !== 'string') continue;
    out.push({ criterion: rec.criterion, expected: Boolean(rec.expected ?? true) });
  }
  return out.length > 0 ? out : undefined;
}

function asTrajectory(value: unknown): ToolTrajectoryStep[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: ToolTrajectoryStep[] = [];
  for (const v of value) {
    if (!v || typeof v !== 'object') continue;
    const rec = v as Record<string, unknown>;
    if (typeof rec.tool !== 'string') continue;
    out.push({
      tool: rec.tool,
      params: rec.params && typeof rec.params === 'object' && !Array.isArray(rec.params)
        ? rec.params as Record<string, any>
        : {},
    });
  }
  return out.length > 0 ? out : undefined;
}

function buildReferenceFromRecord(
  record: Record<string, unknown>,
  meta: Record<string, unknown> | undefined,
): GoldenReference | undefined {
  // Простой формат: reference — строка
  const refSimple = pickString(record, ['ground_truth_answer', 'reference', 'answer', 'expected']);

  // Augmented: reference — объект
  const refObj = (typeof record.reference === 'object' && record.reference !== null && !Array.isArray(record.reference))
    ? record.reference as Record<string, unknown>
    : null;

  const reference: GoldenReference = {};

  // answer: либо из объекта, либо из строки
  if (refObj && typeof refObj.answer === 'string' && refObj.answer.trim()) {
    reference.answer = refObj.answer.trim();
  } else if (refSimple) {
    reference.answer = refSimple;
  }

  // Все остальные поля — только из объекта
  if (refObj) {
    if (typeof refObj.rubric === 'string' && refObj.rubric.trim()) reference.rubric = refObj.rubric;
    const claims = asStringArray(refObj.claims);
    if (claims) reference.claims = claims;
    const checklist = asChecklist(refObj.checklist);
    if (checklist) reference.checklist = checklist;
    const ctx = asStringArray(refObj.context_texts);
    if (ctx) reference.context_texts = ctx;
    const docs = asStringArray(refObj.relevant_docs);
    if (docs) reference.relevant_docs = docs;
    const urls = asStringArray(refObj.relevant_urls);
    if (urls) reference.relevant_urls = urls;
    const traj = asTrajectory(refObj.tool_trajectory);
    if (traj) reference.tool_trajectory = traj;
    if (refObj.structured_reference !== undefined) {
      const sr = refObj.structured_reference;
      if (sr && typeof sr === 'object' && !Array.isArray(sr)) {
        reference.structured_reference = sr as Record<string, any>;
      } else if (sr === null) {
        reference.structured_reference = null;
      }
    }
    const par = asStringArray(refObj.paraphrases);
    if (par) reference.paraphrases = par;
  }

  // relevant_docs нормализуем под нашу систему id-шников: pageId из
  // confluence_url. Старый chunk_id voproshalych-корпуса (meta.chunk_id)
  // структурно несовместим с нашими `<pageId>_idx_chunk_N` и поэтому
  // никогда не даёт hit — он искусственно занижает recall@k. Pageid же
  // подтягивается как подстрока в retrieved id и работает корректно.
  if (meta) {
    const docs: string[] = [];
    const url = typeof meta.confluence_url === 'string' ? meta.confluence_url : '';
    const pageIdMatch = url.match(/pageId=(\d+)/);
    if (pageIdMatch?.[1]) docs.push(pageIdMatch[1]);
    if (docs.length > 0) reference.relevant_docs = docs;
  }
  if (!reference.relevant_urls && meta) {
    const url = meta.confluence_url;
    if (typeof url === 'string' && url.trim()) reference.relevant_urls = [url.trim()];
  }

  return Object.keys(reference).length > 0 ? reference : undefined;
}

function normalizeRecord(record: Record<string, unknown>, fallbackIndex: number): GoldenItem | null {
  const itemKey = pickString(record, ['item_key', 'id', 'key']) ?? `item_${fallbackIndex}`;
  const question = pickString(record, ['question', 'input', 'query', 'prompt']);
  if (!question) return null;
  const meta = (record.meta && typeof record.meta === 'object' && !Array.isArray(record.meta))
    ? record.meta as Record<string, unknown>
    : undefined;
  const reference = buildReferenceFromRecord(record, meta);
  return {
    item_key: itemKey,
    question,
    ...(reference ? { reference } : {}),
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

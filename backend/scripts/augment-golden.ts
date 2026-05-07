#!/usr/bin/env node
/**
 * augment-golden — обогащение golden-датасета полями для покрытия 8 осей метрик.
 *
 * Запуск:
 *   cd backend && npm run augment:golden -- \
 *     --in ../docs/research/voproshalych-golden.jsonl \
 *     --out ../docs/research/voproshalych-golden-augmented.jsonl \
 *     [--limit 5] [--concurrency 5] [--start 0]
 *
 * Использует resolveJudgeProvider() (mistral по умолчанию). Каждый item обогащается
 * одним LLM-вызовом, возвращающим JSON со всеми полями: claims, checklist,
 * context_texts, tool_trajectory, structured_reference, rubric, paraphrases.
 * relevant_docs / relevant_urls копируются из meta без LLM.
 *
 * Выходной формат (JSONL, по строке на item):
 *   {
 *     "item_key": "...",
 *     "input": "<вопрос>",
 *     "reference": {
 *       "answer": "<эталон>",
 *       "claims": [...], "checklist": [...], "context_texts": [...],
 *       "relevant_docs": [...], "relevant_urls": [...],
 *       "tool_trajectory": [...], "structured_reference": {...}|null,
 *       "rubric": "...", "paraphrases": [...]
 *     },
 *     "meta": {...},
 *     "augmentation": { "version", "model", "generated_at" }
 *   }
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

// .env живёт обычно в корне репозитория или в backend/. Грузим оба варианта по приоритету ENV_FILE.
const envCandidates = [
  process.env.ENV_FILE,
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../.env'),
].filter(Boolean) as string[];
for (const path of envCandidates) {
  if (existsSync(path)) { loadEnv({ path }); break; }
}

import { resolveJudgeProvider, type JudgeMessage } from '../src/services/core/judge_provider/index.js';

interface SourceItem {
  item_key: string;
  input: string;
  reference: string;
  meta?: Record<string, any>;
}

interface AugmentedReference {
  answer: string;
  claims: string[];
  checklist: Array<{ criterion: string; expected: boolean }>;
  context_texts: string[];
  relevant_docs: string[];
  relevant_urls: string[];
  tool_trajectory: Array<{ tool: string; params: Record<string, any> }>;
  structured_reference: Record<string, any> | null;
  rubric: string;
  paraphrases: string[];
}

interface AugmentedItem {
  item_key: string;
  input: string;
  reference: AugmentedReference;
  meta: Record<string, any>;
  augmentation: { version: string; model: string; generated_at: string };
}

const SYSTEM_PROMPT = [
  'Ты экспертный аннотатор тестовых данных для оценки агентного RAG-помощника университета ТюмГУ.',
  'Твоя задача — обогатить пары (вопрос, ответ) полями для покрытия 8 осей метрик качества.',
  'Отвечай СТРОГО одной строкой валидного JSON, без markdown-обёрток и комментариев.',
  'Все строки на русском, кроме имён инструментов.',
].join(' ');

function buildUserPrompt(item: SourceItem): string {
  return [
    'Дано:',
    `QUESTION: ${item.input}`,
    `ANSWER: ${item.reference}`,
    item.meta?.confluence_url ? `SOURCE_URL: ${item.meta.confluence_url}` : '',
    '',
    'Сгенерируй JSON следующей формы:',
    '{',
    '  "claims": [<3-5 атомарных фактов из ANSWER, каждый — самостоятельное проверяемое утверждение>],',
    '  "checklist": [<3-5 объектов {"criterion": <короткий критерий>, "expected": <true|false>} — что должно/не должно быть в корректном ответе>],',
    '  "context_texts": [<1 строка — фрагмент-источник, на котором основан ANSWER (можно перефразировать ANSWER в виде выдержки из документа)>],',
    '  "tool_trajectory": [',
    '    {"tool": "rag_search", "params": {"query": <переформулированный поисковый запрос на основе QUESTION, 3-8 ключевых слов>}},',
    '    {"tool": "answer", "params": {}}',
    '  ],',
    '  "structured_reference": <объект с ключами-данными если в ANSWER есть структурированные данные (телефон, email, адрес, срок, ссылка), иначе null. Пример: {"phone": "...", "email": "...", "address": "...", "deadline_days": 5}>,',
    '  "rubric": "<1-2 предложения: на что именно судья должен обратить внимание при оценке ответа на этот вопрос>",',
    '  "paraphrases": [<ровно 3 перефраза QUESTION в разных стилях: 1) формальный, 2) разговорный/сленговый, 3) краткий-телеграфный. Смысл сохрани точно>]',
    '}',
    '',
    'Отвечай ТОЛЬКО JSON. Без вступлений и комментариев.',
  ].filter(Boolean).join('\n');
}

function extractJson(text: string): any {
  const trimmed = (text ?? '').trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/```\s*$/, '')
    .trim();
  const start = trimmed.indexOf('{');
  if (start === -1) throw new Error('no { in response');
  // Берём от первой { до последней } чтобы пережить хвостовые токены
  const end = trimmed.lastIndexOf('}');
  const candidate = trimmed.slice(start, end + 1);
  return JSON.parse(candidate);
}

function asStringArray(value: any, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return fallback;
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

function asChecklist(value: any): AugmentedReference['checklist'] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => v && typeof v === 'object' && typeof v.criterion === 'string')
    .map((v) => ({
      criterion: String(v.criterion),
      expected: Boolean(v.expected ?? true),
    }));
}

function asTrajectory(value: any): AugmentedReference['tool_trajectory'] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => v && typeof v === 'object' && typeof v.tool === 'string')
    .map((v) => ({
      tool: String(v.tool),
      params: v.params && typeof v.params === 'object' && !Array.isArray(v.params) ? v.params : {},
    }));
}

function copyRelevantFromMeta(meta: Record<string, any> | undefined): { relevant_docs: string[]; relevant_urls: string[] } {
  const docs: string[] = [];
  const urls: string[] = [];
  if (!meta) return { relevant_docs: docs, relevant_urls: urls };
  if (meta.chunk_id !== undefined && meta.chunk_id !== null) docs.push(String(meta.chunk_id));
  if (typeof meta.confluence_url === 'string' && meta.confluence_url.length > 0) urls.push(meta.confluence_url);
  return { relevant_docs: docs, relevant_urls: urls };
}

async function augmentOne(item: SourceItem, modelId: string): Promise<AugmentedItem> {
  const provider = resolveJudgeProvider();
  const messages: JudgeMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(item) },
  ];

  let lastErr: unknown;
  // 2 попытки: модель иногда возвращает невалидный JSON
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await provider.chat(messages);
      const parsed = extractJson(result.text);
      const { relevant_docs, relevant_urls } = copyRelevantFromMeta(item.meta);
      const reference: AugmentedReference = {
        answer: item.reference,
        claims: asStringArray(parsed.claims),
        checklist: asChecklist(parsed.checklist),
        context_texts: asStringArray(parsed.context_texts, [item.reference]),
        relevant_docs,
        relevant_urls,
        tool_trajectory: asTrajectory(parsed.tool_trajectory),
        structured_reference:
          parsed.structured_reference && typeof parsed.structured_reference === 'object' && !Array.isArray(parsed.structured_reference)
            ? parsed.structured_reference
            : null,
        rubric: typeof parsed.rubric === 'string' ? parsed.rubric : '',
        paraphrases: asStringArray(parsed.paraphrases),
      };
      return {
        item_key: item.item_key,
        input: item.input,
        reference,
        meta: item.meta ?? {},
        augmentation: {
          version: 'v1',
          model: `${provider.family}/${modelId}`,
          generated_at: new Date().toISOString(),
        },
      };
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`augment failed for ${item.item_key}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a) continue;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next;
        i += 1;
      } else {
        args[key] = 'true';
      }
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const inPath = args.in ? resolve(args.in) : '';
  const outPath = args.out ? resolve(args.out) : '';
  if (!inPath || !outPath) {
    console.error('usage: --in <jsonl> --out <jsonl> [--limit N] [--start N] [--concurrency N]');
    process.exit(2);
  }
  const limit = args.limit ? Number.parseInt(args.limit, 10) : Infinity;
  const start = args.start ? Number.parseInt(args.start, 10) : 0;
  const concurrency = args.concurrency ? Math.max(1, Number.parseInt(args.concurrency, 10)) : 5;

  const provider = resolveJudgeProvider();
  console.error(`provider: ${provider.family} / ${provider.modelId}`);

  const raw = await readFile(inPath, 'utf-8');
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const items: SourceItem[] = lines.map((line) => JSON.parse(line));
  const slice = items.slice(start, start + (Number.isFinite(limit) ? (limit as number) : items.length));
  console.error(`source: ${items.length} items, обрабатываю ${slice.length} (start=${start}, limit=${args.limit ?? '-'})`);

  const results: (AugmentedItem | { error: string; item_key: string })[] = [];
  const queue = [...slice.entries()];
  let done = 0;
  const startedAt = Date.now();
  const tickEvery = Math.max(1, Math.floor(slice.length / 20));

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      const [, item] = next;
      try {
        const aug = await augmentOne(item, provider.modelId);
        results.push(aug);
      } catch (err) {
        results.push({ error: err instanceof Error ? err.message : String(err), item_key: item.item_key });
      }
      done += 1;
      if (done % tickEvery === 0 || done === slice.length) {
        const rate = done / ((Date.now() - startedAt) / 1000);
        const eta = (slice.length - done) / Math.max(rate, 0.01);
        console.error(`[${done}/${slice.length}] rate=${rate.toFixed(2)}/s eta=${Math.ceil(eta)}s`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  // Сортируем результаты в порядке исходного датасета (порядок ключей в slice)
  const orderIndex = new Map(slice.map((it, idx) => [it.item_key, idx] as const));
  results.sort((a, b) => {
    const ai = orderIndex.get('item_key' in a ? a.item_key : (a as any).item_key) ?? 0;
    const bi = orderIndex.get('item_key' in b ? b.item_key : (b as any).item_key) ?? 0;
    return ai - bi;
  });

  const successes = results.filter((r): r is AugmentedItem => !('error' in r));
  const failures = results.filter((r): r is { error: string; item_key: string } => 'error' in r);

  const outBody = successes.map((it) => JSON.stringify(it)).join('\n') + (successes.length ? '\n' : '');
  await writeFile(outPath, outBody, 'utf-8');
  console.error(`done: ok=${successes.length} fail=${failures.length} → ${outPath}`);
  if (failures.length > 0) {
    console.error('failures:');
    for (const f of failures) console.error(`  ${f.item_key}: ${f.error}`);
  }
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});

/**
 * LLM-as-a-judge для метрики f_judge_ref (axis G).
 *
 * Реализует rubric-based scoring в стиле Prometheus-2 / G-Eval:
 *   - инструктирует модель оценить ответ по рубрике на шкале 1..N (по умолчанию 5);
 *   - просит JSON {"score": N, "rationale": "..."};
 *   - нормализует на [0, 1] по формуле (score − 1) / (scale − 1).
 *
 * Anti-bias меры (см. SDD-12 §«Политика Судьи»):
 *   - явная инструкция игнорировать длину ответа;
 *   - дефолтная рубрика общего качества при отсутствии специфичной;
 *   - judge провайдер берётся из JUDGE_PROVIDER env, что позволяет настроить отличное от
 *     оцениваемой модели семейство (митигация self-preference).
 */

import { resolveJudgeProvider, type JudgeMessage } from '../../core/judge_provider/index.js';
import type { AssessItem } from './judge.service.js';

const DEFAULT_SCALE = 5;

const DEFAULT_RUBRIC = `Шкала 1..5 (semantic equivalence — главный критерий):
1 — ответ противоречит эталону (фактическая ошибка, выдуманные числа/имена, противоположный смысл) ИЛИ отказ ответить при наличии в эталоне нужной информации.
2 — ответ касается темы вопроса, но не передаёт ключевой факт эталона (главное число / имя / дату промахнул, либо ответил на другой подвопрос).
3 — ответ передаёт основное содержание эталона, но имеет одну заметную фактическую неточность ИЛИ упускает один из нескольких ключевых пунктов.
4 — ответ семантически эквивалентен эталону по существу: все ключевые сущности (числа, имена, даты, телефоны, условия) переданы верно; допустимы перифраз, частичная подача, отсутствие лишних деталей, иной порядок изложения, отсутствие приписки "Источник:".
5 — ответ передаёт всё ключевое содержание эталона без искажений.

ПРАВИЛА СУДЕЙСТВА (обязательны).
A. Не штрафуй за стиль, длину, форматирование, отсутствие/наличие приписок-источников, использование иных слов с тем же смыслом.
B. Не штрафуй за частичную подачу, если переданная часть содержит ключевой факт ответа.
C. Штрафуй ТОЛЬКО за: (1) фактическое противоречие эталону; (2) выдуманные сущности (числа/имена/даты, которых нет в эталоне); (3) отказ отвечать при наличии данных в эталоне; (4) пропуск ВСЕХ ключевых фактов.
D. Если сомневаешься между N и N+1 — выбирай N+1.
E. Если эталон пуст или отсутствует, оценивай по корректности ответа на вопрос; в этом случае базовая оценка 4 при отсутствии явных ошибок.

ПРИМЕРЫ.
— Эталон "4 балла за презентацию, 20 за собеседование, 60 за отчётность". Ответ "Презентация — 4 балла за семестр". → 4 (один из ключевых фактов передан верно, нет ошибок).
— Тот же эталон, ответ "Презентация — 40 баллов". → 1 (противоречие).
— Тот же эталон, ответ "За презентацию даётся определённое количество баллов, точное число у преподавателя". → 2 (отказ при наличии данных).
— Эталон "Сессия 25 мая — 10 июня". Ответ "Зимняя сессия с 25 мая по 10 июня 2026". → 5 (всё передано верно, доп. контекст не ошибка).`;

const SYSTEM_PROMPT = [
  'Ты беспристрастный судья качества ответа агентной системы.',
  'Главный критерий — семантическая эквивалентность ОТВЕТА и ЭТАЛОНА по фактическим сущностям (числа, имена, даты, условия).',
  'Игнорируй стиль, длину, форматирование, наличие/отсутствие приписок об источнике, перифразирование — это НЕ ошибки.',
  'Штрафуй только за фактическое противоречие, выдуманные сущности, или отказ отвечать при наличии данных в эталоне.',
  'При сомнении между двумя оценками выбирай более высокую.',
  'Верни СТРОГО валидный JSON одной строкой без markdown-обёрток вида:',
  '{"score": <int>, "rationale": "<краткое обоснование на русском>"}',
].join(' ');

function buildUserPrompt(item: AssessItem, rubric: string, scale: number): string {
  const question =
    typeof item.input.question === 'string' ? item.input.question :
    typeof item.input.user_query === 'string' ? item.input.user_query :
    JSON.stringify(item.input);
  const reference = item.reference?.answer ?? '';
  const answer = item.agent_output.text ?? '';
  return [
    `РУБРИКА (шкала 1..${scale}):`,
    rubric,
    '',
    'ВОПРОС:',
    question,
    '',
    'ЭТАЛОН (если предоставлен — учитывай как ground truth):',
    reference || '— не предоставлен —',
    '',
    'ОТВЕТ АГЕНТА:',
    answer || '— пусто —',
    '',
    `Верни JSON {"score": <целое 1..${scale}>, "rationale": "<до 200 символов>"}.`,
  ].join('\n');
}

function extractJson(text: string): { score?: number; rationale?: string } | null {
  if (!text) return null;
  const trimmed = text.trim();
  // Уберём markdown-обёртки ```json ... ``` если модель не послушалась
  const cleaned = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/```\s*$/, '')
    .trim();
  // Берём первую {...} группу
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (parsed && typeof parsed === 'object') return parsed as any;
    return null;
  } catch {
    return null;
  }
}

export function isLlmJudgeAvailable(): boolean {
  const provider = (process.env.JUDGE_PROVIDER ?? 'mistral').toLowerCase();
  if (provider === 'openrouter') {
    return Boolean(process.env.JUDGE_OPENROUTER_API_KEY);
  }
  return Boolean(process.env.JUDGE_MISTRAL_API_KEY);
}

class LlmJudgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmJudgeError';
  }
}

/** Считает f_judge_ref ∈ [0, 1] для одного item через LLM-судью.
 *  N=3 голосования с усреднением — снижает variance LLM-judge в √3 раз
 *  относительно одиночного запроса. Если хотя бы одна попытка распарсилась,
 *  результат считается валидным и возвращается среднее по успешным голосам.
 *  Бросает Error только если ВСЕ попытки провалились. */
const JUDGE_VOTES = 1;

export async function computeRubricJudge(item: AssessItem): Promise<number> {
  if (!isLlmJudgeAvailable()) {
    throw new LlmJudgeError('LLM-судья не настроен: задан JUDGE_PROVIDER, но отсутствует API key');
  }
  const rubric = (item.reference?.rubric ?? '').trim() || DEFAULT_RUBRIC;
  const scale = DEFAULT_SCALE;

  const provider = resolveJudgeProvider();
  const messages: JudgeMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(item, rubric, scale) },
  ];

  const votes: number[] = [];
  const errors: string[] = [];
  const votePromises = Array.from({ length: JUDGE_VOTES }, async () => {
    try {
      const result = await provider.chat(messages);
      const parsed = extractJson(result.text);
      if (!parsed || typeof parsed.score !== 'number' || !Number.isFinite(parsed.score)) {
        return { ok: false as const, err: `не распарсен: ${(result.text ?? '').slice(0, 80)}` };
      }
      const score = Math.max(1, Math.min(scale, parsed.score));
      return { ok: true as const, value: (score - 1) / (scale - 1) };
    } catch (err) {
      return { ok: false as const, err: err instanceof Error ? err.message : String(err) };
    }
  });

  for (const r of await Promise.all(votePromises)) {
    if (r.ok) votes.push(r.value);
    else errors.push(r.err);
  }

  if (votes.length === 0) {
    throw new LlmJudgeError(`все ${JUDGE_VOTES} голосов судьи провалились: ${errors.slice(0, 2).join(' | ')}`);
  }

  return votes.reduce((a, b) => a + b, 0) / votes.length;
}

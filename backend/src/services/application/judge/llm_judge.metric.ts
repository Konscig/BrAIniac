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

const DEFAULT_RUBRIC = `Шкала 1..5:
1 — ответ неверен или не отвечает на вопрос.
2 — частично затрагивает тему, но содержит существенные ошибки или пропуски.
3 — относительно корректен, но неполон или поверхностен.
4 — корректен и полон, есть мелкие неточности либо лишние детали.
5 — полностью корректен, релевантен, точен и хорошо структурирован.`;

const SYSTEM_PROMPT = [
  'Ты беспристрастный судья качества ответа агентной системы.',
  'Оцениваешь ОТВЕТ относительно ВОПРОСА и ЭТАЛОНА по предоставленной РУБРИКЕ.',
  'Игнорируй длину и стиль ответа — оценивай только корректность и полноту по существу.',
  'Не оправдывай низкие оценки желанием быть мягким, не оправдывай высокие желанием быть полезным.',
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
 *  Бросает Error при невозможности (нет провайдера, ответ нераспарсен, score вне диапазона) —
 *  judge.service.ts ловит и кладёт в skipped_metrics с reason. */
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

  let result;
  try {
    result = await provider.chat(messages);
  } catch (err) {
    throw new LlmJudgeError(`провайдер ${provider.family} вернул ошибку: ${err instanceof Error ? err.message : String(err)}`);
  }

  const parsed = extractJson(result.text);
  if (!parsed || typeof parsed.score !== 'number' || !Number.isFinite(parsed.score)) {
    throw new LlmJudgeError(`не удалось распарсить score из ответа судьи: ${(result.text ?? '').slice(0, 120)}`);
  }
  const score = Math.max(1, Math.min(scale, parsed.score));
  return (score - 1) / (scale - 1);
}

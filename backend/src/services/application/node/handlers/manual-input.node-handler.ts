import type { NodeHandler } from '../../pipeline/pipeline.executor.types.js';

function readManualQuestion(rawUiJson: unknown): string {
  if (!rawUiJson || typeof rawUiJson !== 'object' || Array.isArray(rawUiJson)) return '';
  const uiJson = rawUiJson as Record<string, unknown>;
  const manualInput = uiJson.manualInput;
  if (!manualInput || typeof manualInput !== 'object' || Array.isArray(manualInput)) return '';
  const question = (manualInput as Record<string, unknown>).question;
  return typeof question === 'string' ? question.trim() : '';
}

function readUpstreamQuestion(inputJson: unknown): string {
  if (!inputJson || typeof inputJson !== 'object' || Array.isArray(inputJson)) return '';
  const rec = inputJson as Record<string, unknown>;
  const question = rec.question ?? rec.user_query;
  return typeof question === 'string' ? question.trim() : '';
}

/**
 * ManualInput-узел.
 *
 * Приоритет источника вопроса:
 *   1) `context.input_json.question` (или `user_query`) — приходит из Trigger при
 *      оценочном прогоне (judge.service.runPipelineForItem передаёт сюда вопрос
 *      из golden dataset) или из UI «Run» с введённым пользователем вопросом.
 *   2) `runtime.node.ui_json.manualInput.question` — статический вопрос, заданный
 *      в UI-конфигурации узла. Используется только когда upstream-вопрос не дан
 *      (например ручной запуск без явного input).
 *
 * Раньше был обратный порядок (UI всегда побеждал), из-за чего пайплайн в
 * оценочных прогонах всегда отвечал на один и тот же захардкоженный вопрос
 * вне зависимости от datasets'овского item — это делало batch-оценку
 * бессмысленной (см. specs/003-judge-v2/CHANGES.md «Дата-аугментация»).
 */
export const manualInputNodeHandler: NodeHandler = async (runtime, _inputs, context) => {
  const upstreamQuestion = readUpstreamQuestion(context.input_json);
  const uiQuestion = readManualQuestion(runtime.node.ui_json);
  const question = upstreamQuestion || uiQuestion;

  const value = question.length > 0
    ? { question, user_query: question }
    : context.input_json ?? null;

  return {
    output: {
      kind: 'manual_input',
      value,
      ...(question.length > 0 ? { question } : {}),
      source: question.length > 0
        ? (upstreamQuestion ? 'upstream' : 'ui_json')
        : 'empty',
    },
    costUnits: 0,
  };
};

import type { NodeHandler } from '../../pipeline/pipeline.executor.types.js';

function readManualQuestion(rawUiJson: unknown): string {
  if (!rawUiJson || typeof rawUiJson !== 'object' || Array.isArray(rawUiJson)) return '';
  const uiJson = rawUiJson as Record<string, unknown>;
  const manualInput = uiJson.manualInput;
  if (!manualInput || typeof manualInput !== 'object' || Array.isArray(manualInput)) return '';
  const question = (manualInput as Record<string, unknown>).question;
  return typeof question === 'string' ? question.trim() : '';
}

export const manualInputNodeHandler: NodeHandler = async (runtime, _inputs, context) => {
  const question = readManualQuestion(runtime.node.ui_json);
  const value =
    question.length > 0
      ? {
          question,
          user_query: question,
        }
      : context.input_json ?? null;

  return {
    output: {
      kind: 'manual_input',
      value,
      ...(question.length > 0 ? { question } : {}),
    },
    costUnits: 0,
  };
};

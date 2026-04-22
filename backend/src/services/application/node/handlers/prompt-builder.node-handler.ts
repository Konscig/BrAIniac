import type { NodeHandler } from '../../pipeline/pipeline.executor.types.js';
import { buildPrompt } from '../../pipeline/pipeline.executor.utils.js';

export const promptBuilderNodeHandler: NodeHandler = async (_runtime, inputs, context) => {
  const prompt = buildPrompt(inputs, context.input_json);
  return {
    output: {
      kind: 'prompt',
      prompt,
      part_count: inputs.length,
    },
    costUnits: 0,
  };
};

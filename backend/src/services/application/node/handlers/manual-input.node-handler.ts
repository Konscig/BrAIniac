import type { NodeHandler } from '../../pipeline/pipeline.executor.types.js';

export const manualInputNodeHandler: NodeHandler = async (_runtime, _inputs, context) => ({
  output: {
    kind: 'manual_input',
    value: context.input_json ?? null,
  },
  costUnits: 0,
});

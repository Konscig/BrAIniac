import type { NodeHandler } from '../../pipeline/pipeline.executor.types.js';
import { nowIso } from '../../pipeline/pipeline.executor.utils.js';

export const saveResultNodeHandler: NodeHandler = async (_runtime, inputs) => ({
  output: {
    kind: 'save_result',
    saved_at: nowIso(),
    received_inputs: inputs.length,
    preview: inputs.length > 0 ? inputs[0] : null,
  },
  costUnits: 0,
});

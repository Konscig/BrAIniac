import type { NodeHandler } from '../../pipeline/pipeline.executor.types.js';
import { nowIso } from '../../pipeline/pipeline.executor.utils.js';

export const triggerNodeHandler: NodeHandler = async (_runtime, _inputs, context) => ({
  output: {
    kind: 'trigger',
    triggered_at: nowIso(),
    input: context.input_json ?? null,
  },
  costUnits: 0,
});

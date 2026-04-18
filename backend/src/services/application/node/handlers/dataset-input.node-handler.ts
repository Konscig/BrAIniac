import { HttpError } from '../../../../common/http-error.js';
import type { NodeHandler } from '../../pipeline/pipeline.executor.types.js';

export const datasetInputNodeHandler: NodeHandler = async (_runtime, _inputs, context) => {
  if (!context.dataset) {
    throw new HttpError(400, {
      code: 'EXECUTOR_DATASET_REQUIRED',
      error: 'dataset input node requires dataset',
    });
  }

  return {
    output: {
      kind: 'dataset_input',
      ...context.dataset,
    },
    costUnits: 0,
  };
};

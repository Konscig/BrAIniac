import { validatePipelineGraph } from '../../core/graph_validation.service.js';
import type { GraphValidationPreset } from '../../core/graph_validation.service.js';

export async function runPreflightGate(pipelineId: number, preset: GraphValidationPreset = 'default') {
  const result = await validatePipelineGraph(pipelineId, preset);
  return {
    valid: result.valid,
    errors: result.errors,
    warnings: result.warnings,
    metrics: result.metrics,
  };
}

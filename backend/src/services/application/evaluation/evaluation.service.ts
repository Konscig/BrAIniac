// Evaluation application service: orchestrates dataset load, pipeline runs,
// metric computation, aggregation and snapshot persistence.
// Contract aligned with docs/math_evaluation_draft.md and docs/math_metric_catalog_draft.md.
// A.1: contract skeleton. Execution, metrics and persistence arrive in A.2-A.5.

import { HttpError } from '../../../common/http-error.js';
import type {
  EvaluationSnapshot,
  StartEvaluationInput,
} from './evaluation.types.js';

export async function startEvaluationForUser(
  userId: number,
  input: StartEvaluationInput,
): Promise<EvaluationSnapshot> {
  void userId;
  void input;
  throw new HttpError(501, {
    error: 'EVALUATION_NOT_IMPLEMENTED',
    message: 'startEvaluationForUser is not wired yet (A.1 skeleton)',
  });
}

export async function getEvaluationForUser(
  userId: number,
  evaluationId: string,
): Promise<EvaluationSnapshot> {
  void userId;
  void evaluationId;
  throw new HttpError(501, {
    error: 'EVALUATION_NOT_IMPLEMENTED',
    message: 'getEvaluationForUser is not wired yet (A.1 skeleton)',
  });
}

export async function listEvaluationsForPipeline(
  userId: number,
  pipelineId: number,
): Promise<ReadonlyArray<EvaluationSnapshot>> {
  void userId;
  void pipelineId;
  throw new HttpError(501, {
    error: 'EVALUATION_NOT_IMPLEMENTED',
    message: 'listEvaluationsForPipeline is not wired yet (A.1 skeleton)',
  });
}

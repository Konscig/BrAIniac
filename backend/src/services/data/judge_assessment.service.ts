import prisma from '../../db.js';

export type AssessmentStatus = 'queued' | 'running' | 'succeeded' | 'failed';

const VALID_TRANSITIONS: Record<AssessmentStatus, AssessmentStatus[]> = {
  queued: ['running', 'failed'],
  running: ['succeeded', 'failed'],
  succeeded: [],
  failed: [],
};

export async function createAssessment(data: {
  fk_pipeline_id: number;
  fk_dataset_id: number;
  fk_weight_profile_id: number;
  fk_normalization_profile_id: number;
  fk_initiator_user_id: number;
  status: AssessmentStatus;
  preset: string;
  request_json: any;
  alpha_thresholds_json: any;
  idempotency_key?: string | null;
  total_items: number;
}) {
  return prisma.judgeAssessment.create({ data });
}

export async function getAssessmentById(assessment_id: number) {
  return prisma.judgeAssessment.findUnique({ where: { assessment_id } });
}

export async function getAssessmentForOwner(assessment_id: number, fk_user_id: number) {
  return prisma.judgeAssessment.findFirst({
    where: {
      assessment_id,
      pipeline: { project: { fk_user_id } },
    },
  });
}

export async function findByIdempotencyKey(params: {
  fk_pipeline_id: number;
  fk_dataset_id: number;
  idempotency_key: string;
}) {
  return prisma.judgeAssessment.findFirst({
    where: {
      fk_pipeline_id: params.fk_pipeline_id,
      fk_dataset_id: params.fk_dataset_id,
      idempotency_key: params.idempotency_key,
    },
  });
}

export async function transitionStatus(
  assessment_id: number,
  from: AssessmentStatus,
  to: AssessmentStatus,
  extra?: { verdict?: string; final_score?: number; summary_json?: any; error_json?: any; hard_gate_status?: string; started_at?: Date; finished_at?: Date },
) {
  if (!VALID_TRANSITIONS[from].includes(to)) {
    throw new Error(`invalid assessment transition ${from} → ${to}`);
  }
  const patch: Record<string, any> = { status: to };
  if (extra?.verdict !== undefined) patch.verdict = extra.verdict;
  if (extra?.final_score !== undefined) patch.final_score = extra.final_score;
  if (extra?.summary_json !== undefined) patch.summary_json = extra.summary_json;
  if (extra?.error_json !== undefined) patch.error_json = extra.error_json;
  if (extra?.hard_gate_status !== undefined) patch.hard_gate_status = extra.hard_gate_status;
  if (extra?.started_at !== undefined) patch.started_at = extra.started_at;
  if (extra?.finished_at !== undefined) patch.finished_at = extra.finished_at;

  return prisma.judgeAssessment.update({
    where: { assessment_id, status: from },
    data: patch,
  });
}

export async function incrementProgress(
  assessment_id: number,
  delta: { completed?: number; skipped?: number; failed?: number },
) {
  const patch: Record<string, any> = {};
  if (delta.completed) patch.completed_items = { increment: delta.completed };
  if (delta.skipped) patch.skipped_items = { increment: delta.skipped };
  if (delta.failed) patch.failed_items = { increment: delta.failed };
  if (Object.keys(patch).length === 0) return null;
  return prisma.judgeAssessment.update({ where: { assessment_id }, data: patch });
}

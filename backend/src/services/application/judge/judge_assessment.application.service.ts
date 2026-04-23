import { HttpError } from '../../../common/http-error.js';
import { ensurePipelineOwnedByUser } from '../../core/ownership.service.js';
import { getDatasetById } from '../../data/dataset.service.js';
import { listByDataset as listDocumentsByDataset } from '../../data/document.service.js';
import { findByCode as findNormByCode } from '../../data/normalization_profile.service.js';
import { findByCode as findWeightByCode } from '../../data/weight_profile.service.js';
import { runPreflightGate } from './preflight_gate.service.js';
import { classifyPipeline } from './architectural_class.service.js';
import { resolveWeightsForPipeline } from './weight_profile.application.service.js';
import { runAssessment } from './assessment_runner.service.js';
import {
  createAssessment,
  findByIdempotencyKey,
  getAssessmentForOwner,
  transitionStatus,
} from '../../data/judge_assessment.service.js';
import { claim as claimInflight, findActive as findActiveInflight, reapStale } from '../../data/judge_assessment_inflight.service.js';
import { listByAssessment as listMetricScores } from '../../data/metric_score.service.js';
import { listByAssessment as listCoverage } from '../../data/axis_coverage.service.js';
import { getByAssessment as getOperational } from '../../data/operational_metrics.service.js';

const DEFAULT_THRESHOLDS = { improvement: 0.6, pass: 0.8 };

export interface StartAssessmentInput {
  pipeline_id: number;
  dataset_id: number;
  preset?: 'default' | 'dev' | 'production';
  weight_profile_code?: string;
  normalization_profile_code?: string;
  alpha_thresholds?: { improvement?: number; pass?: number };
}

export async function startAssessment(
  body: StartAssessmentInput,
  userId: number,
  idempotencyKey?: string,
) {
  if (typeof body.pipeline_id !== 'number' || typeof body.dataset_id !== 'number') {
    throw new HttpError(400, { error: 'pipeline_id and dataset_id are required' });
  }

  const pipeline = await ensurePipelineOwnedByUser(body.pipeline_id, userId, { pipelineNotFoundMessage: 'not found' });
  const dataset = await getDatasetById(body.dataset_id);
  if (!dataset || dataset.fk_pipeline_id !== body.pipeline_id) {
    throw new HttpError(404, { error: 'not found' });
  }

  const documents = await listDocumentsByDataset(body.dataset_id);
  const maxItems = Number(process.env.JUDGE_MAX_ITEMS_PER_ASSESSMENT ?? 500);
  if (documents.length > maxItems) {
    throw new HttpError(400, {
      code: 'JUDGE_DATASET_TOO_LARGE',
      message: `dataset has ${documents.length} items, max allowed is ${maxItems}`,
    });
  }
  if (documents.length === 0) {
    throw new HttpError(400, {
      code: 'JUDGE_DATASET_EMPTY',
      message: 'dataset must contain at least one document with gold annotations',
    });
  }

  if (idempotencyKey) {
    const existing = await findByIdempotencyKey({
      fk_pipeline_id: body.pipeline_id,
      fk_dataset_id: body.dataset_id,
      idempotency_key: idempotencyKey,
    });
    if (existing) return existing;
  }

  // Stale inflight reaping
  const staleMs = Number(process.env.EVAL_INFLIGHT_STALE_MS ?? 600_000);
  await reapStale(staleMs);

  const active = await findActiveInflight({ fk_pipeline_id: body.pipeline_id, fk_dataset_id: body.dataset_id });
  if (active) {
    throw new HttpError(409, {
      code: 'JUDGE_ASSESSMENT_INFLIGHT',
      message: 'Active assessment exists for this pipeline/dataset',
      active_assessment_id: active.fk_assessment_id,
    });
  }

  const preflight = await runPreflightGate(body.pipeline_id, body.preset ?? 'default');
  if (!preflight.valid) {
    throw new HttpError(422, {
      code: 'JUDGE_ASSESSMENT_PREFLIGHT_FAILED',
      preflight_errors: preflight.errors,
    });
  }

  const weightCode = body.weight_profile_code ?? `${await classifyPipeline(body.pipeline_id)}_default_v1`;
  const weightProfile = await findWeightByCode(weightCode);
  if (!weightProfile) throw new HttpError(400, { error: `weight_profile ${weightCode} not found` });

  const normCode = body.normalization_profile_code ?? 'mvp_default_v1';
  const normProfile = await findNormByCode(normCode);
  if (!normProfile) throw new HttpError(400, { error: `normalization_profile ${normCode} not found` });

  const thresholds = {
    improvement: body.alpha_thresholds?.improvement ?? DEFAULT_THRESHOLDS.improvement,
    pass: body.alpha_thresholds?.pass ?? DEFAULT_THRESHOLDS.pass,
  };

  const assessment = await createAssessment({
    fk_pipeline_id: body.pipeline_id,
    fk_dataset_id: body.dataset_id,
    fk_weight_profile_id: weightProfile.weight_profile_id,
    fk_normalization_profile_id: normProfile.normalization_profile_id,
    fk_initiator_user_id: userId,
    status: 'queued',
    preset: body.preset ?? 'default',
    request_json: body,
    alpha_thresholds_json: thresholds,
    idempotency_key: idempotencyKey ?? null,
    total_items: documents.length,
  });

  try {
    await claimInflight({
      fk_pipeline_id: body.pipeline_id,
      fk_dataset_id: body.dataset_id,
      fk_assessment_id: assessment.assessment_id,
    });
  } catch (err) {
    await transitionStatus(assessment.assessment_id, 'queued', 'failed', {
      error_json: { code: 'JUDGE_ASSESSMENT_CLAIM_FAILED' },
      finished_at: new Date(),
    });
    throw new HttpError(409, { code: 'JUDGE_ASSESSMENT_INFLIGHT', message: 'claim failed' });
  }

  // Fire-and-forget runner. Persistent checkpoint allows resume-after-crash
  // when the same idempotency-key is re-submitted.
  kickRunner({
    assessmentId: assessment.assessment_id,
    pipelineId: body.pipeline_id,
    datasetId: body.dataset_id,
    weightProfileCode: weightCode,
    normalizationParams: (normProfile.params_json as Record<string, any>) ?? {},
    alphaThresholds: thresholds,
    failRateMax: Number(process.env.JUDGE_FAIL_RATE_MAX ?? 0.5),
  }).catch((err) => console.error('[judge] runner fatal', err));

  return assessment;
}

async function kickRunner(params: Parameters<typeof runAssessment>[0]) {
  await transitionStatus(params.assessmentId, 'queued', 'running', { started_at: new Date() });
  await runAssessment(params);
}

export async function getAssessment(assessmentId: number, userId: number) {
  const assessment = await getAssessmentForOwner(assessmentId, userId);
  if (!assessment) throw new HttpError(404, { error: 'not found' });

  const [scores, coverage, operational] = await Promise.all([
    listMetricScores(assessmentId),
    listCoverage(assessmentId),
    getOperational(assessmentId),
  ]);

  return {
    assessment_id: assessment.assessment_id,
    pipeline_id: assessment.fk_pipeline_id,
    dataset_id: assessment.fk_dataset_id,
    status: assessment.status.trim(),
    idempotency_key: assessment.idempotency_key,
    preset: assessment.preset.trim(),
    alpha_thresholds: assessment.alpha_thresholds_json,
    progress: {
      completed_items: assessment.completed_items,
      skipped_items: assessment.skipped_items,
      total_items: assessment.total_items,
    },
    created_at: assessment.created_at,
    updated_at: assessment.updated_at,
    started_at: assessment.started_at,
    finished_at: assessment.finished_at,
    request: assessment.request_json,
    summary: assessment.summary_json,
    error: assessment.error_json,
    axis_coverage: coverage,
    metric_scores: scores.map((s: any) => ({
      metric_code: s.metric.code,
      value: Number(s.value),
      axis: s.contributing_axis,
      node_id: s.fk_node_id,
      origin_reason: s.origin_reason,
      executor_used: s.executor_used,
      sample_size: s.sample_size,
      aggregation_method: s.aggregation_method,
    })),
    operational,
  };
}

export async function compareAssessments(baseId: number, againstId: number, userId: number) {
  const [base, against] = await Promise.all([
    getAssessment(baseId, userId),
    getAssessment(againstId, userId),
  ]);
  if (base.status !== 'succeeded' || against.status !== 'succeeded') {
    throw new HttpError(422, { code: 'JUDGE_ASSESSMENT_COMPARISON_NOT_READY' });
  }
  if (base.pipeline_id !== against.pipeline_id) {
    throw new HttpError(422, { code: 'JUDGE_ASSESSMENT_COMPARISON_PIPELINE_MISMATCH' });
  }
  const baseMap = new Map((base.metric_scores ?? []).map((m: any) => [m.metric_code, Number(m.value)]));
  const againstMap = new Map((against.metric_scores ?? []).map((m: any) => [m.metric_code, Number(m.value)]));
  const codes = new Set<string>([...baseMap.keys(), ...againstMap.keys()]);
  const delta_per_metric = Array.from(codes).map((code) => ({
    metric_code: code,
    base: baseMap.get(code) ?? null,
    against: againstMap.get(code) ?? null,
    delta: (againstMap.get(code) ?? 0) - (baseMap.get(code) ?? 0),
  }));
  return {
    base: { assessment_id: base.assessment_id, final_score: base.summary?.final_score, verdict: base.summary?.verdict },
    against: { assessment_id: against.assessment_id, final_score: against.summary?.final_score, verdict: against.summary?.verdict },
    delta_score: (against.summary?.final_score ?? 0) - (base.summary?.final_score ?? 0),
    delta_per_metric,
    axis_coverage_diff: diffAxisCoverage(base.axis_coverage, against.axis_coverage),
  };
}

function diffAxisCoverage(base: any[], against: any[]) {
  const map = new Map<string, { base_covered: boolean; against_covered: boolean }>();
  for (const c of base) map.set(c.axis, { base_covered: c.covered, against_covered: false });
  for (const c of against) {
    const entry = map.get(c.axis) ?? { base_covered: false, against_covered: false };
    entry.against_covered = c.covered;
    map.set(c.axis, entry);
  }
  return Array.from(map.entries())
    .filter(([, v]) => v.base_covered !== v.against_covered)
    .map(([axis, v]) => ({ axis, ...v }));
}

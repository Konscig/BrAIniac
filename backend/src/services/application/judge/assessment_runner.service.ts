import { resolveJudgeProvider } from '../../core/judge_provider/index.js';
import { EvalWorkerError, healthCheck as sidecarHealthCheck } from '../../core/eval_worker/eval_worker.client.js';
import { getMetric, initMetrics } from './metric_registry.js';
import { buildMPrime, type MPrimeResult } from './m_prime_builder.service.js';
import { persistAxisCoverage } from './axis_coverage.application.service.js';
import { resolveWeightsForPipeline, restrictAndRenormalize } from './weight_profile.application.service.js';
import { aggregateScore } from './score_aggregator.service.js';
import { listByDataset as listDocumentsByDataset } from '../../data/document.service.js';
import { listCurrentForDocument } from '../../data/gold_annotation.service.js';
import { upsertItem, markTerminal, listAllItems } from '../../data/judge_assessment_item.service.js';
import { upsertScore } from '../../data/metric_score.service.js';
import { findByCode as findMetricByCode } from '../../data/metric_definition.service.js';
import { upsertOperational } from '../../data/operational_metrics.service.js';
import { freeze as freezeGold } from '../../data/judge_assessment_frozen_gold.service.js';
import { incrementProgress, transitionStatus } from '../../data/judge_assessment.service.js';
import { release as releaseInflight, touch as touchInflight } from '../../data/judge_assessment_inflight.service.js';
import { listByAssessment as listAxisCoverage } from '../../data/axis_coverage.service.js';
import type { MetricContext, MetricItemInput, GoldPayloads } from './metrics/metric.base.js';

interface RunnerParams {
  assessmentId: number;
  pipelineId: number;
  datasetId: number;
  weightProfileCode?: string;
  normalizationParams: Record<string, any>;
  alphaThresholds: { improvement: number; pass: number };
  failRateMax: number;
}

async function collectGoldForDocument(documentId: number): Promise<GoldPayloads> {
  const types: Array<keyof GoldPayloads> = ['answer', 'claims', 'relevant_docs', 'tool_trajectory'] as any;
  const result: GoldPayloads = {};
  for (const t of types) {
    const ann = await listCurrentForDocument(documentId, String(t));
    if (!ann) continue;
    const payload = (ann as any).payload_json ?? {};
    if (t === 'answer' && typeof payload.text === 'string') result.answer = payload.text;
    else if (t === 'claims' && Array.isArray(payload.claims)) result.claims = payload.claims;
    else if (t === 'relevant_docs' && Array.isArray(payload.doc_ids)) result.relevant_docs = payload.doc_ids;
    else if (t === 'tool_trajectory' && Array.isArray(payload.steps)) result.tool_trajectory = payload.steps;
  }
  return result;
}

async function produceAgentOutput(input: any): Promise<MetricItemInput['agent_output']> {
  // MVP placeholder: настоящий прогон агента реализован в pipeline.executor
  // (существующий стек). До интеграции здесь — «идентичность»: если в
  // input_json лежит заранее вычисленный agent_output, используем его,
  // иначе возвращаем пустой envelope, чтобы метрики корректно помечали
  // элементы как skipped.
  if (input && typeof input === 'object' && input.agent_output && typeof input.agent_output === 'object') {
    return input.agent_output;
  }
  return { text: '', tool_call_trace: [] };
}

function classifyFailure(err: unknown): string {
  if (err instanceof EvalWorkerError) {
    if (err.status === 422) return 'parsing violation';
    if (err.status === 503) return 'sidecar_unreachable';
    return 'tool error';
  }
  if (err instanceof Error && err.message.includes('timed out')) return 'timeout';
  return 'tool error';
}

export async function runAssessment(params: RunnerParams): Promise<void> {
  await initMetrics();

  const documents = await listDocumentsByDataset(params.datasetId);
  if (!documents.length) {
    await transitionStatus(params.assessmentId, 'running', 'failed', {
      error_json: { code: 'JUDGE_ASSESSMENT_FAILED', reason: 'dataset_empty' },
      finished_at: new Date(),
    });
    await releaseInflight(params.assessmentId);
    return;
  }

  // Seed items in `pending` status for idempotent resume.
  for (let idx = 0; idx < documents.length; idx += 1) {
    const doc = documents[idx]!;
    await upsertItem({
      fk_assessment_id: params.assessmentId,
      fk_document_id: doc.document_id,
      item_index: idx,
      status: 'pending',
    });
  }

  const existingItems = await listAllItems(params.assessmentId);

  const mprime: MPrimeResult = await buildMPrime(params.pipelineId);
  await persistAxisCoverage(params.assessmentId, mprime);

  const allWeights = await resolveWeightsForPipeline(params.pipelineId, params.weightProfileCode);
  const activeWeights = restrictAndRenormalize(allWeights.weights, mprime.metric_codes);

  // Выбираем провайдера один раз и передаём в контексты метрик LLM-судьи.
  const judgeProvider = resolveJudgeProvider();

  // Per-item accumulators (for average over items, then we aggregate per metric code).
  const perMetricPerItem: Record<string, Array<{ nodeId: number; value: number; sampleSize: number; aggregation?: string }>> = {};
  const skippedMetricsBySidecar = new Set<string>();

  const sidecarAvailable = await sidecarHealthCheck();

  const maxAttempts = Number(process.env.JUDGE_MAX_ATTEMPTS_PER_ITEM ?? 3);
  const softRetryDelayMs = Number(process.env.JUDGE_SOFT_RETRY_DELAY_MS ?? 800);

  let completedItems = 0;
  let skippedItems = 0;
  const failureTaxonomy: Record<string, number> = {};
  const frozenGoldToPersist: { fk_gold_annotation_id: number; fk_document_id: number; annotation_type: string }[] = [];

  for (const itemRecord of existingItems) {
    if (itemRecord.status === 'completed' || itemRecord.status === 'skipped') continue;

    const doc = documents.find((d) => d.document_id === itemRecord.fk_document_id);
    if (!doc) continue;

    await touchInflight(params.assessmentId);

    let attempt = 0;
    let lastError: unknown;
    let succeeded = false;
    let agentOutput: MetricItemInput['agent_output'] | null = null;
    while (attempt < maxAttempts && !succeeded) {
      attempt += 1;
      try {
        agentOutput = await produceAgentOutput(doc.input_json);
        succeeded = true;
      } catch (err) {
        lastError = err;
        if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, softRetryDelayMs * attempt));
      }
    }

    if (!succeeded || !agentOutput) {
      const cls = classifyFailure(lastError);
      failureTaxonomy[cls] = (failureTaxonomy[cls] ?? 0) + 1;
      await markTerminal(itemRecord.item_id, 'skipped', cls, {
        message: lastError instanceof Error ? lastError.message : 'unknown',
      });
      skippedItems += 1;
      await incrementProgress(params.assessmentId, { skipped: 1 });
      continue;
    }

    const gold = await collectGoldForDocument(doc.document_id);

    // Freeze gold versions for the report (best-effort; we query them again).
    for (const t of ['answer', 'claims', 'relevant_docs', 'tool_trajectory'] as const) {
      const ann = await listCurrentForDocument(doc.document_id, t);
      if (ann) {
        frozenGoldToPersist.push({
          fk_gold_annotation_id: (ann as any).gold_annotation_id,
          fk_document_id: doc.document_id,
          annotation_type: t,
        });
      }
    }

    // Compute each metric from M' on this item.
    for (const entry of mprime.entries) {
      const metric = getMetric(entry.metric_code);
      if (!metric) continue;
      if (metric.executor === 'sidecar' && !sidecarAvailable) {
        skippedMetricsBySidecar.add(entry.metric_code);
        continue;
      }
      const ctx: MetricContext = {
        metric_code: entry.metric_code,
        node_id: entry.node_id,
        items: [
          {
            input_json: doc.input_json as any,
            agent_output: agentOutput,
            gold,
          },
        ],
        judge_provider: judgeProvider,
        normalization_params: params.normalizationParams,
      };
      try {
        const result = await metric.compute(ctx);
        perMetricPerItem[entry.metric_code] ??= [];
        perMetricPerItem[entry.metric_code]!.push({
          nodeId: entry.node_id,
          value: result.value,
          sampleSize: result.sample_size,
          aggregation: result.aggregation_method,
        });
      } catch (err) {
        const cls = classifyFailure(err);
        failureTaxonomy[cls] = (failureTaxonomy[cls] ?? 0) + 1;
      }
    }

    await markTerminal(itemRecord.item_id, 'completed');
    completedItems += 1;
    await incrementProgress(params.assessmentId, { completed: 1 });
  }

  if (frozenGoldToPersist.length) {
    try { await freezeGold(params.assessmentId, frozenGoldToPersist); } catch (err) { console.warn('freeze gold failed', err); }
  }

  // Persist MetricScore (average value per metric code across all items).
  const scoresByCode: Record<string, number> = {};
  for (const [code, rows] of Object.entries(perMetricPerItem)) {
    if (!rows.length) continue;
    const def = await findMetricByCode(code);
    if (!def) continue;
    const byNode = new Map<number, { sum: number; count: number; agg?: string }>();
    for (const row of rows) {
      const acc = byNode.get(row.nodeId) ?? { sum: 0, count: 0, agg: row.aggregation };
      acc.sum += row.value;
      acc.count += 1;
      acc.agg = row.aggregation ?? acc.agg;
      byNode.set(row.nodeId, acc);
    }
    const averages: number[] = [];
    for (const [nodeId, acc] of byNode.entries()) {
      const avg = acc.count > 0 ? acc.sum / acc.count : 0;
      averages.push(avg);
      await upsertScore({
        fk_assessment_id: params.assessmentId,
        fk_metric_id: def.metric_id,
        fk_node_id: nodeId,
        value: Math.max(0, Math.min(1, avg)),
        sample_size: acc.count,
        contributing_axis: def.axis,
        origin_reason: `${def.axis} axis`,
        executor_used: def.executor as any,
        aggregation_method: acc.agg,
      });
    }
    scoresByCode[code] = averages.reduce((s, v) => s + v, 0) / averages.length;
  }

  const failRate = documents.length > 0 ? skippedItems / documents.length : 0;
  const fSafe = scoresByCode['f_safe'] ?? null;

  await upsertOperational({
    fk_assessment_id: params.assessmentId,
    fail_rate: failRate,
    failure_taxonomy_json: failureTaxonomy,
    p95_latency_ms: null,
    total_cost_usd: null,
    total_tokens_in: null,
    total_tokens_out: null,
    hard_gate_status: null,
  });

  if (failRate > params.failRateMax) {
    await transitionStatus(params.assessmentId, 'running', 'failed', {
      error_json: {
        code: 'JUDGE_ASSESSMENT_FAILED',
        reason: 'fail_rate_exceeded',
        detail: `skipped_items / total_items = ${failRate.toFixed(3)} > R_fail_max = ${params.failRateMax}`,
      },
      finished_at: new Date(),
    });
    await releaseInflight(params.assessmentId);
    return;
  }

  const aggregate = aggregateScore({
    scoresByCode,
    weights: activeWeights,
    alphaThresholds: params.alphaThresholds,
    operational: { fail_rate: failRate, f_safe: fSafe, p95_latency_ms: null, total_cost_usd: null },
    hardGateLimits: {
      r_fail_max: params.failRateMax,
      f_safe_min: 0.95,
    },
  });

  const coverage = await listAxisCoverage(params.assessmentId);
  const summary = {
    final_score: aggregate.final_score,
    verdict: aggregate.verdict,
    hard_gate_status: aggregate.hard_gate_status,
    axis_coverage: coverage.map((c) => ({
      axis: c.axis,
      mandatory: c.mandatory,
      covered: c.covered,
      metric_count: c.metric_count,
    })),
    metric_scores: Object.entries(scoresByCode).map(([code, value]) => ({
      metric_code: code,
      value,
    })),
    operational: {
      fail_rate: failRate,
      failure_taxonomy: failureTaxonomy,
    },
    mandatory_axes: mprime.mandatory_axes,
    missing_mandatory_axes: mprime.missing_mandatory_axes,
    sidecar_skipped_metrics: Array.from(skippedMetricsBySidecar),
    weight_profile_code: allWeights.code,
    weights_used: aggregate.weights_used,
  };

  await transitionStatus(params.assessmentId, 'running', 'succeeded', {
    verdict: aggregate.verdict,
    final_score: aggregate.final_score,
    hard_gate_status: aggregate.hard_gate_status,
    summary_json: summary,
    finished_at: new Date(),
  });
  await releaseInflight(params.assessmentId);
}

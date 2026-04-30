import prisma from '../../../db.js';
import { HttpError } from '../../../common/http-error.js';
import {
  METRIC_BY_CODE,
  METRICS,
  NODE_TYPE_METRICS,
  WEIGHT_PROFILES,
  inferProfileFromGraph,
  groupByAxis,
  type QualityAxis,
} from './metric_registry.js';
import { computeNativeMetric } from './native_metrics.js';
import { computeSidecarMetric, isSidecarAvailable } from '../../core/eval_worker/eval_worker.client.js';
import { computeRubricJudge, isLlmJudgeAvailable } from './llm_judge.metric.js';
import { getDatasetById } from '../../data/dataset.service.js';
import { readGoldenItemsFromUri, type GoldenItem } from './dataset-items.reader.js';
import { runPipelineForItem, extractAssessOutput } from './pipeline-runner.js';
import { deterministicSample, type SampleSpec } from './sampling.js';

export interface AssessItem {
  item_key: string;
  input: Record<string, any>;
  agent_output: {
    text: string;
    structured_output?: any;
    tool_call_trace?: any[];
    retrieved_ids?: string[];
    loop_iterations?: number;
    loop_terminated?: boolean;
    loop_converged?: boolean;
  };
  reference?: { answer?: string; rubric?: string; claims?: string[]; relevant_docs?: string[]; tool_trajectory?: any[] };
  /** Per-item operational telemetry, измерено runtime'ом */
  ops?: { duration_ms?: number; cost_units?: number; status?: 'succeeded' | 'failed' };
}

export interface AssessRequest {
  pipeline_id: number;
  items?: AssessItem[];
  dataset_id?: number;
  sample?: SampleSpec;
  weight_profile?: string;
  user_id?: number;
}

export interface SamplingReport {
  seed: number;
  fraction: number;
  size: number;
  total_population: number;
  selected_item_keys: string[];
}

export interface ItemRunReport {
  item_key: string;
  execution_id?: string;
  status: 'succeeded' | 'failed' | 'skipped';
  error?: string;
  duration_ms?: number;
  cost_units?: number;
}

export interface MetricResult {
  metric_code: string;
  axis: string;
  value: number;
  sample_size: number;
  executor: string;
}

export interface NodeReport {
  node_id: number;
  node_type: string;
  metrics: MetricResult[];
}

export interface SkippedMetric {
  metric_code: string;
  axis: string;
  /** Сводное «почему пропущено» — берётся последняя причина из MetricNotApplicable. */
  reason: string;
  /** Сколько items дали эту причину пропуска. */
  occurrences: number;
}

export interface AxisCoverageEntry {
  axis: QualityAxis;
  metrics: string[];
  weight_total: number;
}

export interface OperationalGate {
  T_p95_ms: number | null;
  T_max_ms: number | null;
  C_total: number | null;
  C_max: number | null;
  R_fail: number;
  R_fail_max: number;
  f_safe: number | null;
  f_safe_min: number;
  passes: boolean;
  reasons: string[];
}

export interface ProfileSelection {
  /** Имя профиля, реально применённого для весов */
  applied: string;
  /** Откуда взят: 'request' (явно от клиента), 'auto' (определён по графу), 'fallback' (default из-за неизвестного запрошенного) */
  origin: 'request' | 'auto' | 'fallback';
  /** Краткое объяснение для UI */
  reason: string;
  /** Что просил клиент (если был) */
  requested?: string;
}

export interface AssessReport {
  pipeline_id: number;
  final_score: number;
  verdict: 'pass' | 'improvement' | 'fail';
  weight_profile: string;
  profile_selection: ProfileSelection;
  weights_used: Record<string, number>;
  metric_scores: MetricResult[];
  per_node: NodeReport[];
  skipped_metrics: string[];
  skipped_metrics_detail: SkippedMetric[];
  axis_coverage: AxisCoverageEntry[];
  axis_warning?: string;
  gate: OperationalGate;
  item_count: number;
  sampling?: SamplingReport;
  item_runs?: ItemRunReport[];
}

const ALPHA = { pass: 0.8, improvement: 0.6 };

/** Operational thresholds. Берутся из pipeline.max_time/max_cost если заданы (>0),
 *  иначе sane defaults для дипломной демонстрации. */
const DEFAULT_GATE = {
  T_max_ms: 60_000,
  C_max: 10_000,
  R_fail_max: 0.2,
  f_safe_min: 0.95,
};

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx]!;
}

/** Выбирает метрики для пайплайна на основе типов узлов (M'₀)
 *  Матчим как по node_type.name, так и по ui_json.tool.name (binding) —
 *  ToolNode со специфичным контрактом (LLMAnswer, HybridRetriever и т.п.)
 *  должен получать соответствующий набор метрик.
 */
async function selectMetrics(pipelineId: number) {
  const nodes = await prisma.node.findMany({
    where: { fk_pipeline_id: pipelineId },
    include: { node_type: { select: { name: true } } },
  });

  /** code → set of node_ids (нужно для per-node отчёта) */
  const codeToNodes = new Map<string, Set<number>>();
  /** node_id → normalized type (для axis grouping и per-node header) */
  const nodeTypeMap = new Map<number, string>();
  /** Все нормализованные имена типов в графе — для inferProfile */
  const allNodeTypes: string[] = [];

  for (const node of nodes) {
    const candidates = new Set<string>();
    const typeName = normalize(node.node_type?.name ?? '');
    if (typeName) {
      candidates.add(typeName);
      nodeTypeMap.set(node.node_id, typeName);
      allNodeTypes.push(typeName);
    }

    const ui = node.ui_json && typeof node.ui_json === 'object' ? (node.ui_json as Record<string, any>) : null;
    const toolName = ui?.tool && typeof ui.tool === 'object' ? ui.tool.name : undefined;
    if (typeof toolName === 'string') {
      const normalized = normalize(toolName);
      if (normalized) {
        candidates.add(normalized);
        allNodeTypes.push(normalized);
      }
    }

    for (const candidate of candidates) {
      for (const [key, codes] of Object.entries(NODE_TYPE_METRICS)) {
        if (!candidate.includes(key)) continue;
        for (const code of codes) {
          let bucket = codeToNodes.get(code);
          if (!bucket) {
            bucket = new Set<number>();
            codeToNodes.set(code, bucket);
          }
          bucket.add(node.node_id);
        }
      }
    }
  }

  return { codeToNodes, nodeTypeMap, allNodeTypes };
}

/** Считает веса. Возвращает renormalized веса по тем activeCodes, которые присутствуют в профиле.
 *  Метрики, не упомянутые в профиле, остаются с w=0 (отображаются в отчёте, но не входят в S).
 */
function resolveWeights(activeCodes: string[], profileName: string): Record<string, number> {
  const profile = WEIGHT_PROFILES[profileName] ?? WEIGHT_PROFILES.default!;
  const filtered: Record<string, number> = {};
  let sum = 0;
  for (const code of activeCodes) {
    const w = profile[code];
    if (w && w > 0) { filtered[code] = w; sum += w; }
  }
  if (sum === 0) {
    // Если профиль вообще не пересёкся с активными метриками — равномерный fallback,
    // чтобы S не оказался нулевым по техническим причинам.
    const eq = activeCodes.length > 0 ? 1 / activeCodes.length : 0;
    activeCodes.forEach(c => { filtered[c] = eq; });
    return filtered;
  }
  Object.keys(filtered).forEach(c => { filtered[c]! /= sum; });
  return filtered;
}

async function buildItemsFromDataset(
  pipelineId: number,
  userId: number,
  datasetId: number,
  sampleSpec: SampleSpec | undefined,
): Promise<{ items: AssessItem[]; sampling: SamplingReport; itemRuns: ItemRunReport[] }> {
  const dataset = await getDatasetById(datasetId);
  if (!dataset) {
    throw new HttpError(404, { code: 'JUDGE_DATASET_NOT_FOUND', error: 'dataset not found', details: { dataset_id: datasetId } });
  }
  if (dataset.fk_pipeline_id !== pipelineId) {
    throw new HttpError(400, {
      code: 'JUDGE_DATASET_PIPELINE_MISMATCH',
      error: 'dataset does not belong to pipeline',
      details: { dataset_id: datasetId, pipeline_id: pipelineId },
    });
  }

  const golden = await readGoldenItemsFromUri(dataset.uri);
  if (golden.length === 0) {
    throw new HttpError(422, { code: 'JUDGE_DATASET_EMPTY', error: 'dataset has no usable items', details: { dataset_id: datasetId } });
  }

  const sampled = deterministicSample<GoldenItem>(golden, sampleSpec ?? {});
  const sampling: SamplingReport = {
    seed: sampled.seed,
    fraction: sampled.fraction,
    size: sampled.size,
    total_population: sampled.total,
    selected_item_keys: sampled.selected.map((g) => g.item_key),
  };

  const items: AssessItem[] = [];
  const itemRuns: ItemRunReport[] = [];
  for (const g of sampled.selected) {
    try {
      const snapshot = await runPipelineForItem(pipelineId, userId, g.question);
      if (snapshot.status !== 'succeeded') {
        const errorText = snapshot.error?.message ?? snapshot.error?.code;
        const run: ItemRunReport = {
          item_key: g.item_key,
          ...(snapshot.execution_id ? { execution_id: snapshot.execution_id } : {}),
          status: 'failed',
          ...(errorText ? { error: errorText } : {}),
          ...(snapshot.summary?.duration_ms !== undefined ? { duration_ms: snapshot.summary.duration_ms } : {}),
          ...(snapshot.summary?.cost_units_used !== undefined ? { cost_units: snapshot.summary.cost_units_used } : {}),
        };
        itemRuns.push(run);
        continue;
      }
      const enriched = await extractAssessOutput(snapshot, pipelineId);
      const opsField: AssessItem['ops'] = {
        ...(snapshot.summary?.duration_ms !== undefined ? { duration_ms: snapshot.summary.duration_ms } : {}),
        ...(snapshot.summary?.cost_units_used !== undefined ? { cost_units: snapshot.summary.cost_units_used } : {}),
        status: 'succeeded',
      };
      items.push({
        item_key: g.item_key,
        input: { question: g.question },
        agent_output: enriched,
        ...(g.reference ? { reference: g.reference } : {}),
        ops: opsField,
      });
      const run: ItemRunReport = {
        item_key: g.item_key,
        execution_id: snapshot.execution_id,
        status: 'succeeded',
        ...(snapshot.summary?.duration_ms !== undefined ? { duration_ms: snapshot.summary.duration_ms } : {}),
        ...(snapshot.summary?.cost_units_used !== undefined ? { cost_units: snapshot.summary.cost_units_used } : {}),
      };
      itemRuns.push(run);
    } catch (err) {
      itemRuns.push({
        item_key: g.item_key,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (items.length === 0) {
    throw new HttpError(502, {
      code: 'JUDGE_PIPELINE_RUNS_ALL_FAILED',
      error: 'no successful pipeline runs to assess',
      details: { dataset_id: datasetId, pipeline_id: pipelineId, runs: itemRuns },
    });
  }

  return { items, sampling, itemRuns };
}

async function resolveProfile(
  requested: string | undefined,
  allNodeTypes: string[],
): Promise<ProfileSelection> {
  if (requested && requested !== 'auto') {
    if (WEIGHT_PROFILES[requested]) {
      return { applied: requested, origin: 'request', reason: 'указан явно клиентом', requested };
    }
    const inferred = inferProfileFromGraph(allNodeTypes);
    return {
      applied: inferred.profile,
      origin: 'fallback',
      reason: `неизвестный профиль "${requested}", применён авто-выбор: ${inferred.reason}`,
      requested,
    };
  }
  const inferred = inferProfileFromGraph(allNodeTypes);
  return { applied: inferred.profile, origin: 'auto', reason: inferred.reason, ...(requested ? { requested } : {}) };
}

async function loadOperationalThresholds(pipelineId: number): Promise<{ T_max_ms: number; C_max: number }> {
  const p = await prisma.pipeline.findUnique({
    where: { pipeline_id: pipelineId },
    select: { max_time: true, max_cost: true },
  });
  // Prisma Decimal → number; 0 трактуем как «не задано»
  const tMax = Number(p?.max_time ?? 0);
  const cMax = Number(p?.max_cost ?? 0);
  return {
    T_max_ms: tMax > 0 ? tMax : DEFAULT_GATE.T_max_ms,
    C_max: cMax > 0 ? cMax : DEFAULT_GATE.C_max,
  };
}

export async function runAssessment(req: AssessRequest): Promise<AssessReport> {
  const sidecarUp = await isSidecarAvailable();
  const llmJudgeUp = isLlmJudgeAvailable();

  let assessItems: AssessItem[];
  let sampling: SamplingReport | undefined;
  let itemRuns: ItemRunReport[] | undefined;

  if (req.dataset_id !== undefined) {
    if (req.user_id === undefined) {
      throw new HttpError(400, {
        code: 'JUDGE_USER_REQUIRED',
        error: 'user_id required when sampling from dataset_id',
      });
    }
    const built = await buildItemsFromDataset(req.pipeline_id, req.user_id, req.dataset_id, req.sample);
    assessItems = built.items;
    sampling = built.sampling;
    itemRuns = built.itemRuns;
  } else if (Array.isArray(req.items) && req.items.length > 0) {
    assessItems = req.items;
    if (req.sample && (req.sample.fraction !== undefined || req.sample.size !== undefined)) {
      const sampled = deterministicSample<AssessItem>(assessItems, req.sample);
      assessItems = sampled.selected;
      sampling = {
        seed: sampled.seed,
        fraction: sampled.fraction,
        size: sampled.size,
        total_population: sampled.total,
        selected_item_keys: sampled.selected.map((it) => it.item_key),
      };
    }
  } else {
    throw new HttpError(400, {
      code: 'JUDGE_ITEMS_OR_DATASET_REQUIRED',
      error: 'either items[] or dataset_id is required',
    });
  }

  const { codeToNodes, nodeTypeMap, allNodeTypes } = await selectMetrics(req.pipeline_id);
  const profileSelection = await resolveProfile(req.weight_profile, allNodeTypes);

  /** Накапливаем метрики per-(item, code) — каждое значение считается ОДИН раз вне зависимости
   *  от того, к скольким узлам метрика привязана. */
  const accumulator: Record<string, number[]> = {};
  /** Скип с причиной: code → reason → count */
  const skippedReasons = new Map<string, Map<string, number>>();
  const recordSkip = (code: string, reason: string) => {
    let bucket = skippedReasons.get(code);
    if (!bucket) { bucket = new Map(); skippedReasons.set(code, bucket); }
    bucket.set(reason, (bucket.get(reason) ?? 0) + 1);
  };

  const activeCodes = Array.from(codeToNodes.keys());

  for (const item of assessItems) {
    for (const code of activeCodes) {
      const def = METRIC_BY_CODE.get(code);
      if (!def) continue;
      if (def.executor === 'sidecar' && !sidecarUp) {
        recordSkip(code, 'sidecar недоступен');
        continue;
      }
      if (def.executor === 'llm_judge' && !llmJudgeUp) {
        recordSkip(code, 'llm_judge провайдер не настроен');
        continue;
      }
      try {
        const value =
          def.executor === 'sidecar' ? await computeSidecarMetric(code, item) :
          def.executor === 'llm_judge' ? await computeRubricJudge(item) :
          computeNativeMetric(code, item);
        accumulator[code] ??= [];
        accumulator[code]!.push(value);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        recordSkip(code, reason);
      }
    }
  }

  const metricScores: MetricResult[] = [];
  for (const [code, values] of Object.entries(accumulator)) {
    if (!values.length) continue;
    const def = METRIC_BY_CODE.get(code)!;
    metricScores.push({
      metric_code: code,
      axis: def.axis,
      value: values.reduce((s, v) => s + v, 0) / values.length,
      sample_size: values.length,
      executor: def.executor,
    });
  }

  const computedCodes = metricScores.map(m => m.metric_code);
  const weights = resolveWeights(computedCodes, profileSelection.applied);

  // S = Σ wⱼ · Sⱼ — по тем метрикам, что попали в профиль с w>0
  let finalScore = 0;
  for (const m of metricScores) {
    finalScore += (weights[m.metric_code] ?? 0) * m.value;
  }

  // Per-node отчёт: для каждого узла берём метрики, которые ассоциированы с этим узлом
  const perNode: NodeReport[] = [];
  for (const [nodeId, nodeType] of nodeTypeMap.entries()) {
    const nodeMetrics: MetricResult[] = [];
    for (const m of metricScores) {
      const nodeSet = codeToNodes.get(m.metric_code);
      if (nodeSet?.has(nodeId)) nodeMetrics.push(m);
    }
    if (!nodeMetrics.length) continue;
    perNode.push({ node_id: nodeId, node_type: nodeType, metrics: nodeMetrics });
  }

  // axis_coverage: какие оси реально посчитаны и какой их суммарный вес в S
  const axisGroups = groupByAxis(computedCodes);
  const axisCoverage: AxisCoverageEntry[] = (Object.keys(axisGroups) as QualityAxis[])
    .map((axis) => ({
      axis,
      metrics: axisGroups[axis],
      weight_total: axisGroups[axis].reduce((s, c) => s + (weights[c] ?? 0), 0),
    }))
    .filter((entry) => entry.metrics.length > 0);

  const axesWithSignal = axisCoverage.filter((e) => e.weight_total > 0).length;
  let axisWarning: string | undefined;
  if (axesWithSignal === 0) {
    axisWarning = 'ни одна ось не имеет ненулевого веса в выбранном профиле — S вычислен как равномерное среднее';
  } else if (axesWithSignal === 1) {
    axisWarning = 'оценка опирается только на одну ось качества — расширь профиль или датасет (reference)';
  } else if (axesWithSignal < 3 && profileSelection.applied !== 'extractor') {
    axisWarning = `S опирается на ${axesWithSignal} оси качества из 8 — оценка может быть нестабильной`;
  }

  // Operational gate
  const thresholds = await loadOperationalThresholds(req.pipeline_id);
  const durations: number[] = [];
  let costTotal = 0;
  let failCount = 0;
  let totalRuns = 0;
  if (itemRuns && itemRuns.length > 0) {
    totalRuns = itemRuns.length;
    for (const r of itemRuns) {
      if (typeof r.duration_ms === 'number') durations.push(r.duration_ms);
      if (typeof r.cost_units === 'number') costTotal += r.cost_units;
      if (r.status === 'failed') failCount += 1;
    }
  }
  const safeMetric = metricScores.find((m) => m.metric_code === 'f_safe');
  const tP95 = percentile(durations, 0.95);
  const rFail = totalRuns > 0 ? failCount / totalRuns : 0;
  const gateReasons: string[] = [];
  if (tP95 !== null && tP95 > thresholds.T_max_ms) gateReasons.push(`p95 latency ${tP95}ms > ${thresholds.T_max_ms}ms`);
  if (totalRuns > 0 && costTotal > thresholds.C_max) gateReasons.push(`cost ${costTotal} > ${thresholds.C_max}`);
  if (rFail > DEFAULT_GATE.R_fail_max) gateReasons.push(`R_fail ${(rFail * 100).toFixed(1)}% > ${(DEFAULT_GATE.R_fail_max * 100).toFixed(0)}%`);
  if (safeMetric && safeMetric.value < DEFAULT_GATE.f_safe_min) gateReasons.push(`f_safe ${safeMetric.value.toFixed(3)} < ${DEFAULT_GATE.f_safe_min}`);

  const gate: OperationalGate = {
    T_p95_ms: tP95,
    T_max_ms: thresholds.T_max_ms,
    C_total: itemRuns ? costTotal : null,
    C_max: thresholds.C_max,
    R_fail: rFail,
    R_fail_max: DEFAULT_GATE.R_fail_max,
    f_safe: safeMetric ? safeMetric.value : null,
    f_safe_min: DEFAULT_GATE.f_safe_min,
    passes: gateReasons.length === 0,
    reasons: gateReasons,
  };

  // Verdict: S vs α И operational gate
  let verdict: AssessReport['verdict'];
  if (finalScore >= ALPHA.pass && gate.passes) verdict = 'pass';
  else if (finalScore >= ALPHA.improvement && gate.passes) verdict = 'improvement';
  else verdict = 'fail';

  // skipped_metrics_detail: для UI
  const skippedDetail: SkippedMetric[] = [];
  for (const [code, reasons] of skippedReasons.entries()) {
    let topReason = '';
    let topCount = 0;
    let total = 0;
    for (const [r, c] of reasons.entries()) {
      total += c;
      if (c > topCount) { topCount = c; topReason = r; }
    }
    const def = METRIC_BY_CODE.get(code);
    skippedDetail.push({
      metric_code: code,
      axis: def?.axis ?? '',
      reason: topReason,
      occurrences: total,
    });
  }
  skippedDetail.sort((a, b) => a.metric_code.localeCompare(b.metric_code));

  const report: AssessReport = {
    pipeline_id: req.pipeline_id,
    final_score: finalScore,
    verdict,
    weight_profile: profileSelection.applied,
    profile_selection: profileSelection,
    weights_used: weights,
    metric_scores: metricScores,
    per_node: perNode,
    skipped_metrics: skippedDetail.map((s) => s.metric_code),
    skipped_metrics_detail: skippedDetail,
    axis_coverage: axisCoverage,
    ...(axisWarning ? { axis_warning: axisWarning } : {}),
    gate,
    item_count: assessItems.length,
    ...(sampling ? { sampling } : {}),
    ...(itemRuns ? { item_runs: itemRuns } : {}),
  };

  await prisma.pipeline.update({
    where: { pipeline_id: req.pipeline_id },
    data: {
      score: String(Math.round(finalScore * 100) / 100) as any,
      report_json: report as any,
    },
  });

  if (perNode.length > 0) {
    const nodeIds = perNode.map(nr => nr.node_id);
    const existingNodes = await prisma.node.findMany({
      where: { node_id: { in: nodeIds } },
      select: { node_id: true, output_json: true },
    });
    const existingMap = new Map(existingNodes.map(n => [n.node_id, (n.output_json ?? {}) as Record<string, any>]));

    for (const nr of perNode) {
      const existing = existingMap.get(nr.node_id) ?? {};
      await prisma.node.update({
        where: { node_id: nr.node_id },
        data: { output_json: { ...existing, judge: nr } as any },
      });
    }
  }

  return report;
}

// Re-export для возможных юнит-тестов (профильный авто-выбор и группировка по осям)
export { METRICS, inferProfileFromGraph, groupByAxis };

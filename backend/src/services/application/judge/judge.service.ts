import prisma from '../../../db.js';
import { HttpError } from '../../../common/http-error.js';
import { METRIC_BY_CODE, NODE_TYPE_METRICS, WEIGHT_PROFILES } from './metric_registry.js';
import { computeNativeMetric } from './native_metrics.js';
import { computeSidecarMetric, isSidecarAvailable } from '../../core/eval_worker/eval_worker.client.js';
import { getDatasetById } from '../../data/dataset.service.js';
import { readGoldenItemsFromUri, type GoldenItem } from './dataset-items.reader.js';
import { runPipelineForItem, extractAgentOutputText } from './pipeline-runner.js';
import { deterministicSample, type SampleSpec } from './sampling.js';

export interface AssessItem {
  item_key: string;
  input: Record<string, any>;
  agent_output: { text: string; structured_output?: any; tool_call_trace?: any[] };
  reference?: { answer?: string; rubric?: string; claims?: string[]; relevant_docs?: string[] };
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

export interface AssessReport {
  pipeline_id: number;
  final_score: number;
  verdict: 'pass' | 'improvement' | 'fail';
  weight_profile: string;
  weights_used: Record<string, number>;
  metric_scores: MetricResult[];
  per_node: NodeReport[];
  skipped_metrics: string[];
  item_count: number;
  sampling?: SamplingReport;
  item_runs?: ItemRunReport[];
}

const ALPHA = { pass: 0.8, improvement: 0.6 };

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
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

  const entries: Array<{ metric_code: string; node_id: number }> = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    const candidates = new Set<string>();
    const typeName = normalize(node.node_type?.name ?? '');
    if (typeName) candidates.add(typeName);

    const ui = node.ui_json && typeof node.ui_json === 'object' ? (node.ui_json as Record<string, any>) : null;
    const toolName = ui?.tool && typeof ui.tool === 'object' ? ui.tool.name : undefined;
    if (typeof toolName === 'string') {
      const normalized = normalize(toolName);
      if (normalized) candidates.add(normalized);
    }

    for (const candidate of candidates) {
      for (const [key, codes] of Object.entries(NODE_TYPE_METRICS)) {
        if (!candidate.includes(key)) continue;
        for (const code of codes) {
          const k = `${code}::${node.node_id}`;
          if (seen.has(k)) continue;
          seen.add(k);
          entries.push({ metric_code: code, node_id: node.node_id });
        }
      }
    }
  }

  return { entries, nodes };
}

/** Считает веса, применяя только метрики из M'₀ (остальные отбрасываются) */
function resolveWeights(activeCodes: string[], profileName: string): Record<string, number> {
  const profile = WEIGHT_PROFILES[profileName] ?? WEIGHT_PROFILES.default!;
  const filtered: Record<string, number> = {};
  let sum = 0;
  for (const code of activeCodes) {
    const w = profile[code];
    if (w) { filtered[code] = w; sum += w; }
  }
  if (sum === 0) {
    // Равномерные веса если профиль не покрывает ни одну метрику
    const eq = 1 / activeCodes.length;
    activeCodes.forEach(c => { filtered[c] = eq; });
    return filtered;
  }
  // Ренормализуем до 1
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
        itemRuns.push({
          item_key: g.item_key,
          execution_id: snapshot.execution_id,
          status: 'failed',
          ...(errorText ? { error: errorText } : {}),
        });
        continue;
      }
      const text = extractAgentOutputText(snapshot);
      items.push({
        item_key: g.item_key,
        input: { question: g.question },
        agent_output: { text },
        ...(g.reference ? { reference: g.reference } : {}),
      });
      itemRuns.push({ item_key: g.item_key, execution_id: snapshot.execution_id, status: 'succeeded' });
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

export async function runAssessment(req: AssessRequest): Promise<AssessReport> {
  const profileName = req.weight_profile ?? 'default';
  const sidecarUp = await isSidecarAvailable();

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

  const { entries, nodes } = await selectMetrics(req.pipeline_id);

  // Группируем по узлам
  const byNode = new Map<number, string[]>();
  for (const e of entries) {
    const list = byNode.get(e.node_id) ?? [];
    list.push(e.metric_code);
    byNode.set(e.node_id, list);
  }

  const nodeTypeMap = new Map(nodes.map((n: any) => [n.node_id, normalize(n.node_type?.name ?? '')]));
  const skippedMetrics = new Set<string>();

  // Per-metric accumulators across all items: code → values[]
  const accumulator: Record<string, number[]> = {};

  for (const item of assessItems) {
    for (const [nodeId, codes] of byNode.entries()) {
      for (const code of codes) {
        const def = METRIC_BY_CODE.get(code);
        if (!def) continue;
        if (def.executor === 'sidecar' && !sidecarUp) {
          skippedMetrics.add(code);
          continue;
        }
        try {
          const value = def.executor === 'sidecar'
            ? await computeSidecarMetric(code, item)
            : computeNativeMetric(code, item);
          accumulator[code] ??= [];
          accumulator[code]!.push(value);
        } catch {
          skippedMetrics.add(code);
        }
      }
    }
  }

  // Усредняем по всем items
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

  const activeCodes = metricScores.map(m => m.metric_code);
  const weights = resolveWeights(activeCodes, profileName);

  // S = Σ wⱼ · Sⱼ
  let finalScore = 0;
  for (const m of metricScores) {
    finalScore += (weights[m.metric_code] ?? 0) * m.value;
  }

  const verdict: AssessReport['verdict'] =
    finalScore >= ALPHA.pass ? 'pass' :
    finalScore >= ALPHA.improvement ? 'improvement' : 'fail';

  // Per-node отчёт
  const perNode: NodeReport[] = [];
  for (const [nodeId, codes] of byNode.entries()) {
    const nodeMetrics = metricScores.filter(m => codes.includes(m.metric_code));
    if (!nodeMetrics.length) continue;
    perNode.push({
      node_id: nodeId,
      node_type: nodeTypeMap.get(nodeId) ?? '',
      metrics: nodeMetrics,
    });
  }

  // Записываем результат в Pipeline.score и Pipeline.report_json
  const report: AssessReport = {
    pipeline_id: req.pipeline_id,
    final_score: finalScore,
    verdict,
    weight_profile: profileName,
    weights_used: weights,
    metric_scores: metricScores,
    per_node: perNode,
    skipped_metrics: Array.from(skippedMetrics),
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

  // Записываем per-node метрики в Node.output_json.judge, не трогая существующие поля
  // (executor/frontend читают execution_id/status/runs/data/error из того же объекта)
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

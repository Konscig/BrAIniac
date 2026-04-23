/**
 * Seed for 001-ai-judge feature.
 * Populates MetricDefinition (29 codes, FR-031), WeightProfile (4 templates,
 * R8), NormalizationProfile (mvp_default_v1).
 * Idempotent: re-runnable safely.
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const METRICS = [
  // Axis A — Correctness
  { code: 'f_EM',         axis: 'A', title: 'Exact Match',          requires_reference: true,  executor: 'native'  },
  { code: 'f_F1',         axis: 'A', title: 'Token F1',             requires_reference: true,  executor: 'native'  },
  { code: 'f_sim',        axis: 'A', title: 'Semantic Similarity',  requires_reference: true,  executor: 'sidecar' },
  { code: 'f_corr',       axis: 'A', title: 'Answer Correctness',   requires_reference: true,  executor: 'sidecar' },
  // Axis B — Grounding
  { code: 'f_faith',      axis: 'B', title: 'Faithfulness',         requires_reference: false, executor: 'sidecar' },
  { code: 'f_fact',       axis: 'B', title: 'FActScore',            requires_reference: true,  executor: 'sidecar' },
  { code: 'f_cite',       axis: 'B', title: 'Citation F1',          requires_reference: true,  executor: 'sidecar' },
  { code: 'f_contra',     axis: 'B', title: 'Contradiction Rate',   requires_reference: false, executor: 'sidecar' },
  // Axis C — Retrieval
  { code: 'f_recall@k',   axis: 'C', title: 'Recall@k',             requires_reference: true,  executor: 'native'  },
  { code: 'f_ndcg@k',     axis: 'C', title: 'nDCG@k',               requires_reference: true,  executor: 'native'  },
  { code: 'f_ctx_prec',   axis: 'C', title: 'Context Precision',    requires_reference: true,  executor: 'native'  },
  { code: 'f_ctx_rec',    axis: 'C', title: 'Context Recall',       requires_reference: true,  executor: 'native'  },
  // Axis D — Tool-Use & Trajectory
  { code: 'f_toolsel',    axis: 'D', title: 'Tool Selection',       requires_reference: true,  executor: 'native'  },
  { code: 'f_argF1',      axis: 'D', title: 'Parameter F1',         requires_reference: true,  executor: 'native'  },
  { code: 'f_tool_ok',    axis: 'D', title: 'Tool Call Success',    requires_reference: false, executor: 'native'  },
  { code: 'f_trajIoU',    axis: 'D', title: 'Trajectory IoU',       requires_reference: true,  executor: 'native'  },
  { code: 'f_planEff',    axis: 'D', title: 'Plan Efficiency',      requires_reference: false, executor: 'native'  },
  { code: 'f_node_cov',   axis: 'D', title: 'Node Coverage',        requires_reference: false, executor: 'native'  },
  // Axis E — Structure
  { code: 'f_schema',     axis: 'E', title: 'Schema Validity',      requires_reference: false, executor: 'native'  },
  { code: 'f_field',      axis: 'E', title: 'Field F1',             requires_reference: true,  executor: 'native'  },
  { code: 'f_TED',        axis: 'E', title: 'Tree Edit Distance',   requires_reference: true,  executor: 'native'  },
  // Axis F — Control Flow
  { code: 'f_loop_term',  axis: 'F', title: 'Loop Termination',     requires_reference: false, executor: 'native'  },
  { code: 'f_loop_budget',axis: 'F', title: 'Loop Budget Compliance',requires_reference: false,executor: 'native'  },
  { code: 'f_loop_conv',  axis: 'F', title: 'Loop Convergence',     requires_reference: false, executor: 'native'  },
  { code: 'f_retry',      axis: 'F', title: 'Retry Efficacy',       requires_reference: false, executor: 'native'  },
  // Axis G — LLM as a Judge
  { code: 'f_judge_ref',  axis: 'G', title: 'Reference Rubric',     requires_reference: true,  executor: 'sidecar' },
  { code: 'f_check',      axis: 'G', title: 'CheckEval',            requires_reference: false, executor: 'native'  },
  // Axis H — Safety
  { code: 'f_safe',       axis: 'H', title: 'Safety',               requires_reference: false, executor: 'sidecar' },
  { code: 'f_consist',    axis: 'H', title: 'Self-consistency',     requires_reference: false, executor: 'native'  },
];

function buildWeights(axisWeights) {
  // axisWeights: { A: 0.25, B: 0.15, ... } — распределяется равномерно
  // между метриками внутри оси.
  const byAxis = {};
  for (const m of METRICS) {
    byAxis[m.axis] ??= [];
    byAxis[m.axis].push(m.code);
  }
  const weights = {};
  for (const [axis, share] of Object.entries(axisWeights)) {
    const codes = byAxis[axis] ?? [];
    if (!codes.length) continue;
    const per = share / codes.length;
    for (const code of codes) weights[code] = per;
  }
  // Нормализация, чтобы Σ = 1
  const sum = Object.values(weights).reduce((s, v) => s + v, 0);
  if (sum > 0) {
    for (const k of Object.keys(weights)) weights[k] = +(weights[k] / sum).toFixed(6);
  }
  return weights;
}

const WEIGHT_PROFILES = [
  {
    code: 'rag_default_v1',
    architectural_class: 'rag',
    method: 'ahp_template',
    lambda: 0.7,
    weights: buildWeights({ A: 0.20, B: 0.30, C: 0.25, D: 0.05, E: 0.05, F: 0.05, G: 0.05, H: 0.05 }),
  },
  {
    code: 'tool_use_default_v1',
    architectural_class: 'tool_use',
    method: 'ahp_template',
    lambda: 0.7,
    weights: buildWeights({ A: 0.20, B: 0.05, C: 0.05, D: 0.45, E: 0.05, F: 0.10, G: 0.05, H: 0.05 }),
  },
  {
    code: 'extractor_default_v1',
    architectural_class: 'extractor',
    method: 'ahp_template',
    lambda: 0.7,
    weights: buildWeights({ A: 0.20, B: 0.10, C: 0.05, D: 0.05, E: 0.40, F: 0.05, G: 0.05, H: 0.10 }),
  },
  {
    code: 'judge_default_v1',
    architectural_class: 'judge',
    method: 'ahp_template',
    lambda: 0.7,
    weights: buildWeights({ A: 0.10, B: 0.10, C: 0.05, D: 0.05, E: 0.05, F: 0.05, G: 0.40, H: 0.20 }),
  },
];

const NORMALIZATION_PROFILE = {
  code: 'mvp_default_v1',
  version: 1,
  params_json: {
    // Для native-метрик MVP rescaling не нужен; sidecar возвращает нормализованные значения.
    // Здесь резервируется место для будущей калибровки latency/cost.
    latency_like: { x_min: 50, x_max: 20000, p5: 120, p95: 8000 },
    f_TED: { max_tree_size: 128 },
    f_judge_ref: { scale: 5 },
  },
  calibrated_on_json: null,
  active: true,
};

async function main() {
  console.log('[seed] judge-bootstrap: metric definitions');
  for (const m of METRICS) {
    await prisma.metricDefinition.upsert({
      where: { code: m.code },
      create: m,
      update: { axis: m.axis, title: m.title, requires_reference: m.requires_reference, executor: m.executor },
    });
  }

  console.log('[seed] judge-bootstrap: weight profiles');
  for (const wp of WEIGHT_PROFILES) {
    const sum = Object.values(wp.weights).reduce((s, v) => s + v, 0);
    if (Math.abs(sum - 1) > 0.001) throw new Error(`weights for ${wp.code} do not sum to 1 (got ${sum})`);
    await prisma.weightProfile.upsert({
      where: { code: wp.code },
      create: {
        code: wp.code,
        architectural_class: wp.architectural_class,
        method: wp.method,
        lambda: wp.lambda,
        weights_json: wp.weights,
        active: true,
      },
      update: {
        architectural_class: wp.architectural_class,
        method: wp.method,
        lambda: wp.lambda,
        weights_json: wp.weights,
        active: true,
      },
    });
  }

  console.log('[seed] judge-bootstrap: normalization profile');
  await prisma.normalizationProfile.upsert({
    where: { code_version: { code: NORMALIZATION_PROFILE.code, version: NORMALIZATION_PROFILE.version } },
    create: NORMALIZATION_PROFILE,
    update: {
      params_json: NORMALIZATION_PROFILE.params_json,
      active: NORMALIZATION_PROFILE.active,
    },
  });

  console.log('[seed] judge-bootstrap: done');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

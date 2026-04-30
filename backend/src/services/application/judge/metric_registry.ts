/**
 * Каталог 29 метрик и профили весов — хардкод, БД не нужна.
 * Источник истины: docs/sdd/12-evaluation-metrics-catalog.md.
 */

export type QualityAxis = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';
export type Executor = 'native' | 'sidecar' | 'llm_judge';

export interface MetricDef {
  code: string;
  axis: QualityAxis;
  title: string;
  requiresReference: boolean;
  executor: Executor;
}

export const METRICS: MetricDef[] = [
  // A — Correctness
  { code: 'f_EM',       axis: 'A', title: 'Exact Match',           requiresReference: true,  executor: 'native'    },
  { code: 'f_F1',       axis: 'A', title: 'Token F1',              requiresReference: true,  executor: 'native'    },
  { code: 'f_sim',      axis: 'A', title: 'Semantic Similarity',   requiresReference: true,  executor: 'sidecar'   },
  { code: 'f_corr',     axis: 'A', title: 'Answer Correctness',    requiresReference: true,  executor: 'sidecar'   },
  // B — Grounding
  { code: 'f_faith',    axis: 'B', title: 'Faithfulness',          requiresReference: false, executor: 'sidecar'   },
  { code: 'f_fact',     axis: 'B', title: 'FactScore',             requiresReference: true,  executor: 'sidecar'   },
  { code: 'f_cite',     axis: 'B', title: 'Citation F1',           requiresReference: true,  executor: 'native'    },
  { code: 'f_contra',   axis: 'B', title: 'Contradiction Rate',    requiresReference: true,  executor: 'sidecar'   },
  // C — Retrieval
  { code: 'f_recall@k', axis: 'C', title: 'Recall@k',             requiresReference: true,  executor: 'native'    },
  { code: 'f_ndcg@k',   axis: 'C', title: 'nDCG@k',               requiresReference: true,  executor: 'native'    },
  { code: 'f_ctx_prec', axis: 'C', title: 'Context Precision',     requiresReference: true,  executor: 'native'    },
  { code: 'f_ctx_rec',  axis: 'C', title: 'Context Recall',        requiresReference: true,  executor: 'native'    },
  // D — Tool-Use
  { code: 'f_toolsel',  axis: 'D', title: 'Tool Selection',        requiresReference: true,  executor: 'native'    },
  { code: 'f_argF1',    axis: 'D', title: 'Parameter F1',          requiresReference: true,  executor: 'native'    },
  { code: 'f_tool_ok',  axis: 'D', title: 'Tool Call Success',     requiresReference: false, executor: 'native'    },
  { code: 'f_trajIoU',  axis: 'D', title: 'Trajectory IoU',        requiresReference: true,  executor: 'native'    },
  { code: 'f_planEff',  axis: 'D', title: 'Plan Efficiency',       requiresReference: true,  executor: 'native'    },
  { code: 'f_node_cov', axis: 'D', title: 'Node Coverage',         requiresReference: true,  executor: 'native'    },
  // E — Structure
  { code: 'f_schema',   axis: 'E', title: 'Schema Validity',       requiresReference: false, executor: 'native'    },
  { code: 'f_field',    axis: 'E', title: 'Field F1',              requiresReference: true,  executor: 'native'    },
  { code: 'f_TED',      axis: 'E', title: 'Tree Edit Distance',    requiresReference: true,  executor: 'native'    },
  // F — Control-Flow
  { code: 'f_loop_term',  axis: 'F', title: 'Loop Termination',    requiresReference: false, executor: 'native'    },
  { code: 'f_loop_budget',axis: 'F', title: 'Loop Budget',         requiresReference: false, executor: 'native'    },
  { code: 'f_loop_conv',  axis: 'F', title: 'Loop Convergence',    requiresReference: false, executor: 'native'    },
  { code: 'f_retry',      axis: 'F', title: 'Retry Efficacy',      requiresReference: false, executor: 'native'    },
  // G — LLM-Judge (rubric judge runs in backend through judge_provider, see llm_judge.metric.ts)
  { code: 'f_judge_ref',  axis: 'G', title: 'Rubric Judge',        requiresReference: true,  executor: 'llm_judge' },
  { code: 'f_check',      axis: 'G', title: 'CheckEval',           requiresReference: true,  executor: 'native'    },
  // H — Safety
  { code: 'f_safe',    axis: 'H', title: 'Safety Score',           requiresReference: false, executor: 'sidecar'   },
  { code: 'f_consist', axis: 'H', title: 'Self-Consistency',       requiresReference: false, executor: 'native'    },
];

export const METRIC_BY_CODE = new Map(METRICS.map(m => [m.code, m]));

/** Узел → метрики из каталога SDD-12 (rule-based baseline M'_0) */
export const NODE_TYPE_METRICS: Record<string, string[]> = {
  llmcall:         ['f_EM', 'f_F1', 'f_sim', 'f_judge_ref'],
  llmanswer:       ['f_EM', 'f_F1', 'f_faith', 'f_corr', 'f_sim', 'f_cite', 'f_fact'],
  promptbuilder:   ['f_schema', 'f_TED'],
  agentcall:       ['f_EM', 'f_F1', 'f_toolsel', 'f_argF1', 'f_trajIoU', 'f_planEff', 'f_node_cov', 'f_judge_ref', 'f_consist', 'f_loop_budget', 'f_tool_ok'],
  toolnode:        ['f_tool_ok', 'f_argF1', 'f_schema'],
  hybridretriever: ['f_recall@k', 'f_ndcg@k', 'f_ctx_prec', 'f_ctx_rec'],
  reranker:        ['f_ndcg@k', 'f_ctx_prec'],
  contextassembler:['f_ctx_prec'],
  citationformatter:['f_cite'],
  parser:          ['f_schema', 'f_field', 'f_TED'],
  outputvalidator: ['f_schema'],
  filter:          ['f_recall@k'],
  ranker:          ['f_ndcg@k'],
  chunker:         ['f_recall@k'],
  embedder:        ['f_ndcg@k'],
  querybuilder:    ['f_sim', 'f_recall@k'],
  groundingchecker:['f_faith', 'f_contra'],
  retrygate:       ['f_retry'],
  loopgate:        ['f_loop_term', 'f_loop_budget', 'f_loop_conv'],
};

/** AHP-профили весов. Σwⱼ = 1 на полном пуле метрик профиля.
 *  resolveWeights(activeCodes, profile) ренормализует только по реально активным.
 */
export const WEIGHT_PROFILES: Record<string, Record<string, number>> = {
  rag: {
    // Axis A — Correctness (0.20)
    f_EM: 0.04, f_F1: 0.04, f_sim: 0.06, f_corr: 0.06,
    // Axis B — Grounding (0.25)
    f_faith: 0.10, f_fact: 0.07, f_cite: 0.04, f_contra: 0.04,
    // Axis C — Retrieval (0.25)
    'f_recall@k': 0.075, 'f_ndcg@k': 0.075, f_ctx_prec: 0.05, f_ctx_rec: 0.05,
    // Axis D — Tool-Use & Planning (0.10)
    f_tool_ok: 0.02, f_argF1: 0.02, f_toolsel: 0.02, f_trajIoU: 0.02, f_planEff: 0.02,
    // Axis E — Output Structure (0.02)
    f_schema: 0.02,
    // Axis F — Loop Discipline (0.03)
    f_loop_budget: 0.03,
    // Axis G — LLM-Judge (0.10) — повышаем, t.k. для RAG это ключевая ось согласованности с человеком
    f_judge_ref: 0.06, f_check: 0.04,
    // Axis H — Safety & Consistency (0.05)
    f_safe: 0.025, f_consist: 0.025,
  },
  agentic_rag: {
    // RAG-агент с tool-use loop. RAG-сигнал важен, но planning/trajectory выше, чем у чистого RAG.
    // Axis A — Correctness (0.15)
    f_EM: 0.03, f_F1: 0.03, f_sim: 0.05, f_corr: 0.04,
    // Axis B — Grounding (0.18)
    f_faith: 0.10, f_fact: 0.05, f_cite: 0.03,
    // Axis C — Retrieval (0.10)
    'f_recall@k': 0.04, 'f_ndcg@k': 0.04, f_ctx_prec: 0.02,
    // Axis D — Tool-Use & Trajectory (0.27) — ядро для AgentCall
    f_toolsel: 0.06, f_argF1: 0.06, f_trajIoU: 0.06, f_planEff: 0.04, f_node_cov: 0.03, f_tool_ok: 0.02,
    // Axis F — Loop Discipline (0.05)
    f_loop_budget: 0.03, f_loop_term: 0.02,
    // Axis G — LLM-Judge (0.15)
    f_judge_ref: 0.10, f_check: 0.05,
    // Axis H — Safety & Consistency (0.10)
    f_safe: 0.05, f_consist: 0.05,
  },
  tool_use: {
    f_toolsel: 0.18, f_argF1: 0.18, f_tool_ok: 0.12, f_trajIoU: 0.12,
    f_planEff: 0.08, f_node_cov: 0.08, f_loop_budget: 0.04,
    f_judge_ref: 0.08, f_safe: 0.06, f_consist: 0.06,
  },
  extractor: {
    f_EM: 0.12, f_F1: 0.12, f_schema: 0.20, f_field: 0.20,
    f_TED: 0.15, f_sim: 0.08, f_judge_ref: 0.08, f_safe: 0.05,
  },
  default: {
    f_EM: 0.10, f_F1: 0.10, f_sim: 0.10, f_judge_ref: 0.15,
    f_schema: 0.05, f_TED: 0.05, f_safe: 0.10,
    f_faith: 0.10, f_corr: 0.05, f_tool_ok: 0.05,
    'f_recall@k': 0.05, f_loop_term: 0.05, f_check: 0.05,
  },
};

export type WeightProfileName = keyof typeof WEIGHT_PROFILES;

/** Авто-выбор профиля по топологии графа.
 *  Принимает нормализованные имена типов узлов (см. normalize() в judge.service).
 *  Логика: по таблице из SDD-12 §«Rule-Based Baseline M'_0» с приоритетом более узкого случая.
 */
export function inferProfileFromGraph(normalizedNodeTypes: string[]): { profile: string; reason: string } {
  const has = (...keys: string[]) => keys.some(k => normalizedNodeTypes.some(t => t.includes(k)));

  const hasAgent = has('agentcall');
  const hasRetrieval = has('hybridretriever', 'retriever', 'reranker', 'embedder', 'chunker');
  const hasParser = has('parser', 'outputvalidator');

  if (hasAgent && hasRetrieval) {
    return { profile: 'agentic_rag', reason: 'граф содержит AgentCall + retrieval-узлы → смешанный RAG-агент' };
  }
  if (hasAgent) {
    return { profile: 'tool_use', reason: 'граф содержит AgentCall без retrieval-узлов → акцент на tool-use' };
  }
  if (hasRetrieval) {
    return { profile: 'rag', reason: 'граф содержит retrieval-узлы без AgentCall → классический RAG' };
  }
  if (hasParser) {
    return { profile: 'extractor', reason: 'граф содержит Parser/OutputValidator → экстракция' };
  }
  return { profile: 'default', reason: 'не распознано — общий профиль' };
}

/** Группировка активных метрик по осям для axis_coverage. */
export function groupByAxis(codes: string[]): Record<QualityAxis, string[]> {
  const out: Record<QualityAxis, string[]> = { A: [], B: [], C: [], D: [], E: [], F: [], G: [], H: [] };
  for (const code of codes) {
    const def = METRIC_BY_CODE.get(code);
    if (def) out[def.axis].push(code);
  }
  return out;
}

/**
 * Каталог 29 метрик и профили весов — хардкод, БД не нужна.
 */

export type QualityAxis = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';
export type Executor = 'native' | 'sidecar';

export interface MetricDef {
  code: string;
  axis: QualityAxis;
  title: string;
  requiresReference: boolean;
  executor: Executor;
}

export const METRICS: MetricDef[] = [
  // A — Correctness
  { code: 'f_EM',       axis: 'A', title: 'Exact Match',           requiresReference: true,  executor: 'native'  },
  { code: 'f_F1',       axis: 'A', title: 'Token F1',              requiresReference: true,  executor: 'native'  },
  { code: 'f_sim',      axis: 'A', title: 'Semantic Similarity',   requiresReference: true,  executor: 'sidecar' },
  { code: 'f_corr',     axis: 'A', title: 'Answer Correctness',    requiresReference: true,  executor: 'sidecar' },
  // B — Grounding
  { code: 'f_faith',    axis: 'B', title: 'Faithfulness',          requiresReference: false, executor: 'sidecar' },
  { code: 'f_fact',     axis: 'B', title: 'FactScore',             requiresReference: true,  executor: 'sidecar' },
  { code: 'f_cite',     axis: 'B', title: 'Citation F1',           requiresReference: true,  executor: 'native'  },
  { code: 'f_contra',   axis: 'B', title: 'Contradiction Rate',    requiresReference: true,  executor: 'sidecar' },
  // C — Retrieval
  { code: 'f_recall@k', axis: 'C', title: 'Recall@k',             requiresReference: true,  executor: 'native'  },
  { code: 'f_ndcg@k',   axis: 'C', title: 'nDCG@k',               requiresReference: true,  executor: 'native'  },
  { code: 'f_ctx_prec', axis: 'C', title: 'Context Precision',     requiresReference: true,  executor: 'native'  },
  { code: 'f_ctx_rec',  axis: 'C', title: 'Context Recall',        requiresReference: true,  executor: 'native'  },
  // D — Tool-Use
  { code: 'f_toolsel',  axis: 'D', title: 'Tool Selection',        requiresReference: true,  executor: 'native'  },
  { code: 'f_argF1',    axis: 'D', title: 'Parameter F1',          requiresReference: true,  executor: 'native'  },
  { code: 'f_tool_ok',  axis: 'D', title: 'Tool Call Success',     requiresReference: false, executor: 'native'  },
  { code: 'f_trajIoU',  axis: 'D', title: 'Trajectory IoU',        requiresReference: true,  executor: 'native'  },
  { code: 'f_planEff',  axis: 'D', title: 'Plan Efficiency',       requiresReference: true,  executor: 'native'  },
  { code: 'f_node_cov', axis: 'D', title: 'Node Coverage',         requiresReference: true,  executor: 'native'  },
  // E — Structure
  { code: 'f_schema',   axis: 'E', title: 'Schema Validity',       requiresReference: false, executor: 'native'  },
  { code: 'f_field',    axis: 'E', title: 'Field F1',              requiresReference: true,  executor: 'native'  },
  { code: 'f_TED',      axis: 'E', title: 'Tree Edit Distance',    requiresReference: true,  executor: 'native'  },
  // F — Control-Flow
  { code: 'f_loop_term',  axis: 'F', title: 'Loop Termination',    requiresReference: false, executor: 'native'  },
  { code: 'f_loop_budget',axis: 'F', title: 'Loop Budget',         requiresReference: false, executor: 'native'  },
  { code: 'f_loop_conv',  axis: 'F', title: 'Loop Convergence',    requiresReference: false, executor: 'native'  },
  { code: 'f_retry',      axis: 'F', title: 'Retry Efficacy',      requiresReference: false, executor: 'native'  },
  // G — LLM-Judge
  { code: 'f_judge_ref',  axis: 'G', title: 'Rubric Judge',        requiresReference: true,  executor: 'sidecar' },
  { code: 'f_check',      axis: 'G', title: 'CheckEval',           requiresReference: true,  executor: 'native'  },
  // H — Safety
  { code: 'f_safe',    axis: 'H', title: 'Safety Score',           requiresReference: false, executor: 'sidecar' },
  { code: 'f_consist', axis: 'H', title: 'Self-Consistency',       requiresReference: false, executor: 'native'  },
];

export const METRIC_BY_CODE = new Map(METRICS.map(m => [m.code, m]));

/** Узел → метрики из каталога SDD-12 */
export const NODE_TYPE_METRICS: Record<string, string[]> = {
  llmcall:         ['f_EM', 'f_F1', 'f_sim', 'f_judge_ref'],
  llmanswer:       ['f_faith', 'f_corr', 'f_sim', 'f_cite', 'f_fact'],
  promptbuilder:   ['f_schema', 'f_TED'],
  agentcall:       ['f_toolsel', 'f_argF1', 'f_trajIoU', 'f_planEff', 'f_node_cov', 'f_judge_ref', 'f_consist', 'f_loop_budget'],
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

/** AHP-профили весов. Σwⱼ = 1 */
export const WEIGHT_PROFILES: Record<string, Record<string, number>> = {
  rag: {
    f_EM: 0.05, f_F1: 0.05, f_sim: 0.10, f_corr: 0.10,
    f_faith: 0.15, f_fact: 0.10, f_cite: 0.05, f_contra: 0.05,
    'f_recall@k': 0.10, 'f_ndcg@k': 0.10, f_ctx_prec: 0.075, f_ctx_rec: 0.075,
    f_safe: 0.05,
  },
  tool_use: {
    f_toolsel: 0.20, f_argF1: 0.20, f_tool_ok: 0.15, f_trajIoU: 0.15,
    f_planEff: 0.10, f_node_cov: 0.10, f_safe: 0.10,
  },
  extractor: {
    f_EM: 0.15, f_F1: 0.15, f_schema: 0.20, f_field: 0.20,
    f_TED: 0.15, f_sim: 0.10, f_safe: 0.05,
  },
  default: {
    f_EM: 0.12, f_F1: 0.12, f_sim: 0.12, f_judge_ref: 0.12,
    f_schema: 0.08, f_TED: 0.08, f_safe: 0.10,
    f_faith: 0.08, f_tool_ok: 0.08, 'f_recall@k': 0.05, f_loop_term: 0.05,
  },
};

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
  // ВАЖНО: f_judge_ref (LLM-судья) — приоритетная метрика во всех профилях.
  // Это единственный метрический сигнал, согласованный с человеческой оценкой;
  // остальные (EM, F1, NLI-Faithfulness) — proxy без понимания семантики.
  // Поэтому судья получает 20-25% веса в любом профиле.
  // Старый профиль для линейного RAG — сохранён для воспроизводимости
  // baseline в главе 6. Применять только при сравнительных прогонах.
  rag_legacy: {
    f_EM: 0.03, f_F1: 0.03, f_sim: 0.05, f_corr: 0.05,
    f_faith: 0.08, f_fact: 0.05, f_cite: 0.04, f_contra: 0.03,
    'f_recall@k': 0.07, 'f_ndcg@k': 0.07, f_ctx_prec: 0.04, f_ctx_rec: 0.04,
    f_tool_ok: 0.01, f_argF1: 0.01, f_toolsel: 0.01, f_trajIoU: 0.01, f_planEff: 0.01,
    f_schema: 0.02, f_loop_budget: 0.03,
    f_judge_ref: 0.20, f_check: 0.05,
    f_safe: 0.04, f_consist: 0.03,
  },
  // v2 для линейного RAG. Перебалансировка по принципам MCDA/AHP с опорой
  // на «RAG Triad» (TruLens: context_relevance + groundedness + answer_relevance —
  // три равноправные группы метрик), RAG-survey (arXiv:2405.07437) и
  // RAGAS (arXiv:2309.15217: четыре метрики поровну, две из них retrieval).
  // Изменения:
  //   — Axis D=0 (линейный pipeline без tool-using; присвоение веса метрикам,
  //     которые структурно неприменимы, нарушает applicability gate AHP-калибровки);
  //   — Axis F=0 (loop_budget неприменим без LoopGate/AgentCall);
  //   — Axis A: EM убран (флексивный язык), F1 минимален; основной сигнал в sim+corr;
  //   — Axis B (Grounding): faith — главный сигнал hallucination-detection
  //     (TruLens: «most critical metric in the entire evaluation stack» для production);
  //   — Axis C (Retrieval): сохраняем как фундамент (RAGAS, Confident AI);
  //   — f_judge_ref понижен 0.20→0.13 (variance-correction, см. agentic_rag_v2);
  //   — f_consist убран (skipped при одиночных прогонах);
  //   — f_safe поднят 0.04→0.13 (HELM: core-метрика).
  // Основной профиль линейного RAG. Перебалансирован по принципам MCDA/AHP
  // в главе 6.4. Старая версия доступна как `rag_legacy`.
  rag: {
    // Axis A — Answer Correctness (0.15). RAG Triad answer_relevance proxy
    f_F1: 0.03, f_sim: 0.08, f_corr: 0.04,
    // Axis B — Grounding (0.07). NLI-faithfulness в eval-worker'е использует
    // англоязычную модель mnli-base, на русском не подтверждает ни одно
    // утверждение → f_faith систематически ≈ 0. По applicability gate AHP
    // (LLM-Assisted AHP, arXiv:2512.10487) метрика с нулевой discriminative
    // power на этих данных не должна занимать большой вес.
    // ВАЖНО: f_faith концептуально критична для anti-hallucination (TruLens
    // RAG Triad: «most critical metric»), поэтому она НЕ удаляется — её вес
    // символический. Замена sidecar-модели на multilingual NLI (mDeBERTa-v3-
    // xnli) поднимет дискриминативность и позволит вернуть исходный вес.
    f_faith: 0.02, f_fact: 0.03, f_cite: 0.02,
    // Axis C — Retrieval (0.28). RAG Triad context_relevance + RAGAS-фундамент
    'f_recall@k': 0.10, 'f_ndcg@k': 0.08, f_ctx_prec: 0.05, f_ctx_rec: 0.05,
    // Axis E (0.02)
    f_schema: 0.02,
    // Axis G — LLM-Judge (0.23) — повышен после высвобождения веса из axis B;
    // на линейном RAG судья даёт значительно более стабильный сигнал (≈0.50),
    // чем на агентном (≈0.22), поэтому его information value выше.
    f_judge_ref: 0.18, f_check: 0.05,
    // Axis H — Safety (0.23) — risk-asymmetric, HELM-core; вес поднят
    // как компенсация за неприменимый axis B
    f_safe: 0.23,
  },
  // Старый профиль для agentic RAG — сохранён для воспроизводимости baseline.
  agentic_rag_legacy: {
    f_EM: 0.02, f_F1: 0.03, f_sim: 0.04, f_corr: 0.03,
    f_faith: 0.08, f_fact: 0.04, f_cite: 0.03,
    'f_recall@k': 0.04, 'f_ndcg@k': 0.04, f_ctx_prec: 0.02,
    f_toolsel: 0.05, f_argF1: 0.05, f_trajIoU: 0.05, f_planEff: 0.03, f_node_cov: 0.02, f_tool_ok: 0.02,
    f_loop_budget: 0.03, f_loop_term: 0.02,
    f_judge_ref: 0.20, f_check: 0.05,
    f_safe: 0.04, f_consist: 0.07,
  },
  // v2: перебалансировка по принципам MCDA/AHP. См. главу 6 (раздел 6.4) и
  // источники: RAGAS (arXiv:2309.15217), HELM (arXiv:2211.09110), τ-bench
  // (arXiv:2406.12045), Prometheus-2 (arXiv:2405.01535), LLMs-as-Judges Survey
  // (arXiv:2412.05579), LLM-Assisted AHP (arXiv:2512.10487).
  //   — EM убран (флексивный язык → структурный шум, RAGAS-обоснование);
  //   — Axis C поднята до 0.20 (retrieval — фундамент RAG, RAGAS/Confident AI);
  //   — Axis D дедуплицирована (trajIoU, node_cov, planEff коррелированы с
  //     toolsel/argF1, τ-bench использует одну агрегатную метрику pass^k);
  //   — f_judge_ref понижен 0.20→0.15 (variance-correction, LLMs-as-Judges
  //     Survey: judge correlation с человеком ≈0.6, не доминирующее значение);
  //   — f_consist убран (applicability gate из LLM-Assisted AHP: метрика с
  //     нулевой discriminative power на одиночных прогонах не должна занимать
  //     вес);
  //   — f_safe поднят до 0.10 (HELM трактует safety как core, risk-asymmetric).
  // Основной профиль агентного RAG. Перебалансирован по MCDA/AHP в главе 6.4.
  // Старая версия доступна как `agentic_rag_legacy`.
  agentic_rag: {
    // Axis A (0.07)
    f_F1: 0.03, f_sim: 0.04,
    // Axis B (0.12)
    f_faith: 0.06, f_fact: 0.04, f_cite: 0.02,
    // Axis C (0.20) — поднята
    'f_recall@k': 0.08, 'f_ndcg@k': 0.06, f_ctx_prec: 0.03, f_ctx_rec: 0.03,
    // Axis D (0.16) — дедуплицирована, оставлены независимые сигналы
    f_toolsel: 0.06, f_argF1: 0.05, f_tool_ok: 0.05,
    // Axis F (0.05)
    f_loop_budget: 0.03, f_loop_term: 0.02,
    // Axis G (0.20) — судья понижен с variance-коррекцией
    f_judge_ref: 0.15, f_check: 0.05,
    // Axis H (0.20) — safety поднята, consist убран
    f_safe: 0.20,
  },
  tool_use: {
    f_toolsel: 0.15, f_argF1: 0.15, f_tool_ok: 0.10, f_trajIoU: 0.10,
    f_planEff: 0.07, f_node_cov: 0.05, f_loop_budget: 0.03,
    f_judge_ref: 0.20, f_check: 0.05,
    f_safe: 0.06, f_consist: 0.04,
  },
  extractor: {
    f_EM: 0.10, f_F1: 0.10, f_schema: 0.18, f_field: 0.18,
    f_TED: 0.12, f_sim: 0.05,
    f_judge_ref: 0.20, f_check: 0.03,
    f_safe: 0.04,
  },
  default: {
    f_EM: 0.06, f_F1: 0.08, f_sim: 0.10, f_corr: 0.05,
    f_faith: 0.10,
    'f_recall@k': 0.05, f_schema: 0.03, f_TED: 0.03,
    f_tool_ok: 0.03, f_loop_term: 0.03,
    f_judge_ref: 0.25, f_check: 0.05,
    f_safe: 0.10, f_consist: 0.04,
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

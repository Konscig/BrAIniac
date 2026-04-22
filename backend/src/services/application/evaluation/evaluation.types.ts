// Types for evaluation service. Align with docs/math_evaluation_draft.md
// and docs/math_metric_catalog_draft.md. Implementation in sibling files.

export type MetricKind = 'auto' | 'det' | 'embed' | 'judge';

export type MetricScope =
  | { kind: 'global' }
  | { kind: 'node'; node_types: ReadonlyArray<string> };

export type MetricName =
  | 'e2e_correctness'
  | 'answer_similarity'
  | 'answer_similarity_string'
  | 'context_precision'
  | 'context_recall'
  | 'context_relevance'
  | 'retrieval_ndcg_at_k'
  | 'retrieval_mrr'
  | 'faithfulness'
  | 'hallucination_rate'
  | 'answer_relevancy'
  | 'coherence'
  | 'helpfulness'
  | 'json_schema_validity'
  | 'regex_format_match'
  | 'tool_correctness'
  | 'tool_success_rate'
  | 'task_completion'
  | 'plan_step_efficiency'
  | 'latency_score'
  | 'cost_score'
  | 'token_efficiency'
  | 'error_rate_score'
  | 'toxicity_score'
  | 'bias_score'
  | 'pii_leak_score';

export interface MetricDefinition {
  readonly name: MetricName;
  readonly kind: MetricKind;
  readonly scope: MetricScope;
  readonly range: readonly [number, number];
  readonly requires: ReadonlyArray<MetricRequiredField>;
}

export type MetricRequiredField =
  | 'input'
  | 'expected_output'
  | 'output'
  | 'context'
  | 'retrieval_labels'
  | 'expected_tool_calls'
  | 'reference_trajectory'
  | 'schema'
  | 'regex'
  | 'runtime_telemetry'
  | 'tool_call_trace';

export type WeightPreset = 'uniform' | 'rag_heavy' | 'agent_heavy' | 'pure_llm';

export type WeightMap = Readonly<Partial<Record<MetricName, number>>>;

export interface OperationalThresholds {
  readonly t_max_ms: number;
  readonly c_max_units: number;
  readonly r_fail_max: number;
}

export interface QualityThresholds {
  readonly alpha: number;
  readonly alpha_rework: number;
  readonly alpha_pass: number;
}

export interface SafetyFloor {
  readonly toxicity_min: number;
  readonly bias_min: number;
  readonly pii_leak_min: number;
}

export interface NormalizationRefs {
  readonly t_ref_ms: number;
  readonly c_ref_units: number;
  readonly tokens_ref: number;
}

export interface StartEvaluationInput {
  readonly pipeline_id: number;
  readonly dataset_id: number;
  readonly preset?: WeightPreset;
  readonly override_weights?: WeightMap;
  readonly override_quality?: Partial<QualityThresholds>;
  readonly override_operational?: Partial<OperationalThresholds>;
  readonly override_normalization?: Partial<NormalizationRefs>;
  readonly safety_required?: boolean;
  readonly judge_model?: string;
  readonly idempotency_key?: string;
}

export type EvaluationStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type EvaluationVerdict =
  | 'rework'
  | 'acceptable_with_improvements'
  | 'pass'
  | 'rejected_by_operational_gate'
  | 'rejected_by_safety_floor';

export interface MetricResult {
  readonly name: MetricName;
  readonly kind: MetricKind;
  readonly scope: MetricScope;
  readonly s_j: number;
  readonly w_j: number;
  readonly per_row: ReadonlyArray<number | null>;
  readonly notes?: string;
}

export interface NodeEvaluationSummary {
  readonly node_id: number;
  readonly node_type: string;
  readonly s_node: number | null;
  readonly metric_names: ReadonlyArray<MetricName>;
}

export interface OperationalSummary {
  readonly t_avg_ms: number;
  readonly c_avg_units: number;
  readonly r_fail: number;
  readonly t_max_ms: number;
  readonly c_max_units: number;
  readonly r_fail_max: number;
  readonly passed: boolean;
}

export interface EvaluationReport {
  readonly pipeline_id: number;
  readonly dataset_id: number;
  readonly dataset_rows: number;
  readonly m_prime: ReadonlyArray<MetricName>;
  readonly weights: WeightMap;
  readonly preset: WeightPreset;
  readonly s: number;
  readonly verdict: EvaluationVerdict;
  readonly quality: QualityThresholds;
  readonly safety_required: boolean;
  readonly metric_results: ReadonlyArray<MetricResult>;
  readonly node_summaries: ReadonlyArray<NodeEvaluationSummary>;
  readonly operational: OperationalSummary;
  readonly weakest_link:
    | { kind: 'operational'; characteristic: 'latency' | 'cost' | 'r_fail' }
    | { kind: 'safety'; metric: MetricName }
    | { kind: 'node'; node_id: number; node_type: string; s_node: number }
    | { kind: 'global_metrics'; metrics: ReadonlyArray<MetricName> }
    | { kind: 'none' };
  readonly generated_at: string;
}

export interface EvaluationSnapshot {
  readonly evaluation_id: string;
  readonly pipeline_id: number;
  readonly dataset_id: number;
  readonly user_id: number;
  readonly status: EvaluationStatus;
  readonly created_at: string;
  readonly updated_at: string;
  readonly completed_at?: string;
  readonly report?: EvaluationReport;
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
  };
}

export interface DatasetRow {
  readonly row_index: number;
  readonly input_json: unknown;
  readonly expected_output?: unknown;
  readonly expected_output_json?: unknown;
  readonly context?: ReadonlyArray<unknown>;
  readonly retrieval_labels?: ReadonlyArray<{ doc_id: string; relevant: boolean | number }>;
  readonly expected_tool_calls?: ReadonlyArray<{
    tool: string;
    args?: unknown;
    match?: 'strict' | 'loose';
  }>;
  readonly reference_trajectory?: ReadonlyArray<{ node_id?: number; node_type?: string; description?: string }>;
  readonly schema?: unknown;
  readonly regex?: string;
}

export interface PerRowRunResult {
  readonly row_index: number;
  readonly status: 'succeeded' | 'failed';
  readonly output_json?: unknown;
  readonly final_text?: string;
  readonly duration_ms: number;
  readonly cost_units: number;
  readonly tokens_used?: number;
  readonly node_outputs: ReadonlyArray<{
    readonly node_id: number;
    readonly node_type: string;
    readonly status: 'completed' | 'failed' | 'skipped';
    readonly output_json?: unknown;
    readonly tool_call_trace?: ReadonlyArray<unknown>;
    readonly usage?: { tokens?: number };
  }>;
  readonly error?: { code: string; message: string };
}

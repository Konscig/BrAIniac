import type { JudgeProvider } from '../../../core/judge_provider/index.js';

export type QualityAxis = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';
export type MetricExecutor = 'native' | 'sidecar';

export interface ToolCallTraceEntry {
  index?: number;
  requested_tool?: string;
  resolved_tool?: string | null;
  source?: string;
  status?: 'completed' | 'failed' | 'not_found';
  output?: any;
  error?: any;
}

export interface GoldPayloads {
  answer?: string;
  claims?: string[];
  relevant_docs?: Array<string | number>;
  tool_trajectory?: Array<{ tool_name: string; args?: Record<string, any> }>;
  [key: string]: any;
}

export interface AgentOutputSample {
  text?: string;
  context?: string[];
  tool_call_trace?: ToolCallTraceEntry[];
  structured_output?: any;
  iteration_traces?: ToolCallTraceEntry[][];
  provider_soft_failures?: number;
  attempts_used?: number;
}

export interface MetricItemInput {
  input_json: Record<string, any>;
  agent_output: AgentOutputSample;
  gold?: GoldPayloads;
}

export interface MetricContext {
  metric_code: string;
  node_id: number;
  items: MetricItemInput[];
  judge_provider?: JudgeProvider;
  loop_policy?: { maxIterations?: number; stopCondition?: string };
  normalization_params?: Record<string, any>;
}

export interface MetricResult {
  value: number;
  sample_size: number;
  aggregation_method?: 'mean_over_iterations' | 'last_iteration';
  details?: Record<string, any>;
  warnings?: string[];
}

export abstract class MetricBase {
  abstract readonly code: string;
  abstract readonly axis: QualityAxis;
  abstract readonly requiresReference: boolean;
  abstract readonly executor: MetricExecutor;

  abstract compute(ctx: MetricContext): Promise<MetricResult>;
}

export function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

export function tokens(text: string): string[] {
  return text.toLowerCase().split(/\s+/).filter(Boolean);
}

export function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

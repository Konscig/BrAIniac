import type { GraphValidationPreset, GraphValidationResult } from '../../core/graph_validation.service.js';

export type PipelineRecord = {
  pipeline_id: number;
  max_time: number;
  max_cost: number;
};

export type PipelineNode = {
  node_id: number;
  fk_pipeline_id: number;
  fk_type_id: number;
  fk_sub_pipeline: number | null;
  top_k: number;
  ui_json: any;
  output_json: any;
};

export type PipelineEdge = {
  fk_from_node: number;
  fk_to_node: number;
};

export type NodeTypeRecord = {
  type_id: number;
  fk_tool_id: number;
  name: string;
  config_json: any;
};

export type ToolRecord = {
  tool_id: number;
  name: string;
  config_json: any;
};

export type DatasetContext = {
  dataset_id: number;
  uri: string;
  desc: string | null;
};

export type NodeExecutionStatus = 'completed' | 'failed' | 'skipped';
export type PipelineExecutionStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface PipelineExecutionNodeState {
  node_id: number;
  node_type: string;
  runs: number;
  status: NodeExecutionStatus;
  output_json?: any;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

export interface PipelineExecutionSummary {
  status: 'succeeded' | 'failed';
  steps_used: number;
  cost_units_used: number;
  duration_ms: number;
  node_total: number;
  node_completed: number;
  node_failed: number;
  node_skipped: number;
}

export interface PipelineExecutionFinalResult {
  node_id: number;
  node_type: string;
  status: NodeExecutionStatus;
  text?: string;
  output_preview?: string;
}

export interface StartPipelineExecutionInput {
  preset?: GraphValidationPreset;
  dataset_id?: number;
  input_json?: any;
}

export interface PipelineExecutionSnapshot {
  execution_id: string;
  pipeline_id: number;
  status: PipelineExecutionStatus;
  created_at: string;
  updated_at: string;
  started_at?: string;
  finished_at?: string;
  idempotency_key?: string;
  request: StartPipelineExecutionInput;
  preflight?: GraphValidationResult;
  summary?: PipelineExecutionSummary;
  final_result?: PipelineExecutionFinalResult;
  warnings?: string[];
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

export type ExecutionJob = {
  execution_id: string;
  pipeline_id: number;
  user_id: number;
  status: PipelineExecutionStatus;
  created_at: Date;
  updated_at: Date;
  started_at?: Date;
  finished_at?: Date;
  idempotency_key?: string;
  request: StartPipelineExecutionInput;
  preflight?: GraphValidationResult;
  summary?: PipelineExecutionSummary;
  final_result?: PipelineExecutionFinalResult;
  warnings: string[];
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
};

export type RuntimeNode = {
  node: PipelineNode;
  nodeType: NodeTypeRecord;
  tool: ToolRecord | null;
  config: any;
};

export type NodeHandlerResult = {
  output: any;
  costUnits: number;
};

export type NodeExecutionContext = {
  dataset: DatasetContext | null;
  input_json: any;
};

export type NodeHandler = (runtime: RuntimeNode, inputs: any[], context: NodeExecutionContext) => Promise<NodeHandlerResult>;

export type ExecuteGraphResult = {
  status: 'succeeded' | 'failed';
  nodeStates: PipelineExecutionNodeState[];
  terminalNodeIds: number[];
  warnings: string[];
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  stepsUsed: number;
  costUnitsUsed: number;
  durationMs: number;
  maxSteps: number;
};

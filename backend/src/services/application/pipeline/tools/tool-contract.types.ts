import type { NodeExecutionContext } from '../pipeline.executor.types.js';

export type ToolExecutorKind = 'http-json' | 'openrouter-embeddings';
export type ToolContractName = 'DocumentLoader' | 'QueryBuilder';

export interface ToolContractDefinition {
  name: ToolContractName;
  aliases: string[];
  allowedExecutors: ToolExecutorKind[];
  resolveInput: (inputs: any[], context: NodeExecutionContext) => Record<string, any>;
}

export interface ResolvedToolContract {
  name: ToolContractName;
  definition: ToolContractDefinition;
  input: Record<string, any>;
}

import type { NodeExecutionContext } from '../../pipeline/pipeline.executor.types.js';

export type ToolExecutorKind = 'http-json' | 'openrouter-embeddings';
export type ToolContractName = 'DocumentLoader' | 'QueryBuilder' | 'Chunker' | 'Embedder' | 'VectorUpsert' | 'HybridRetriever';

export interface ToolContractHttpSuccessContext {
  input: Record<string, any>;
  status: number;
  response: any;
}

export interface ToolContractEmbeddingSuccessContext {
  input: Record<string, any>;
  model: string;
  embeddings: number[][];
}

export interface ToolContractDefinition {
  name: ToolContractName;
  aliases: string[];
  allowedExecutors: ToolExecutorKind[];
  resolveInput: (inputs: any[], context: NodeExecutionContext) => Record<string, any>;
  buildHttpSuccessOutput?: (context: ToolContractHttpSuccessContext) => Record<string, any>;
  buildEmbeddingSuccessOutput?: (context: ToolContractEmbeddingSuccessContext) => Record<string, any>;
}

export interface ResolvedToolContract {
  name: ToolContractName;
  definition: ToolContractDefinition;
  input: Record<string, any>;
}

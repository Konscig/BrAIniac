import type { NodeExecutionContext } from '../../pipeline/pipeline.executor.types.js';

export type ToolExecutorKind = 'http-json' | 'openrouter-embeddings';

export type ToolContractName =
  | 'DocumentLoader'
  | 'RAGDataset'
  | 'QueryBuilder'
  | 'Chunker'
  | 'Embedder'
  | 'VectorUpsert'
  | 'HybridRetriever'
  | 'ContextAssembler'
  | 'LLMAnswer'
  | 'CitationFormatter';

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
  /**
   * Резолвит контрактный input для исполнителя. Третий параметр `toolConfig` —
   * объединённая конфигурация {tool.config_json, ui_json.toolConfig}, в нём лежат
   * UI-override'ы вроде index_name/namespace/model — контракт обязан учитывать
   * их приоритетно поверх context.input_json для соответствующих полей.
   */
  resolveInput: (
    inputs: any[],
    context: NodeExecutionContext,
    toolConfig?: Record<string, any>,
  ) => Record<string, any>;
  buildHttpSuccessOutput?: (
    context: ToolContractHttpSuccessContext,
  ) => Record<string, any> | Promise<Record<string, any>>;
  buildEmbeddingSuccessOutput?: (context: ToolContractEmbeddingSuccessContext) => Record<string, any>;
}

export interface ResolvedToolContract {
  name: ToolContractName;
  definition: ToolContractDefinition;
  input: Record<string, any>;
}

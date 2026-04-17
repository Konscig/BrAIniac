import type { NodeExecutionContext } from '../../pipeline/pipeline.executor.types.js';

/** Поддерживаемые executor-режимы для ToolNode-контрактов. */
export type ToolExecutorKind = 'http-json' | 'openrouter-embeddings';

/** Канонические имена всех контрактов, доступных в реестре инструментов. */
export type ToolContractName =
  | 'DocumentLoader'
  | 'QueryBuilder'
  | 'Chunker'
  | 'Embedder'
  | 'VectorUpsert'
  | 'HybridRetriever'
  | 'ContextAssembler'
  | 'LLMAnswer'
  | 'CitationFormatter';

/** Контекст успешного HTTP-вызова executor-а для построения contract_output. */
export interface ToolContractHttpSuccessContext {
  input: Record<string, any>;
  status: number;
  response: any;
}

/** Контекст успешного вызова embedding executor-а для построения contract_output. */
export interface ToolContractEmbeddingSuccessContext {
  input: Record<string, any>;
  model: string;
  embeddings: number[][];
}

/**
 * Единый контракт, который определяет поведение ToolNode для конкретного инструмента.
 * Через него задаются: входная нормализация, разрешенные executor-ы и формат выхода.
 */
export interface ToolContractDefinition {
  /** Каноническое имя контракта. */
  name: ToolContractName;
  /** Дополнительные алиасы (поиск по ним регистронезависимый). */
  aliases: string[];
  /** Список executor-ов, с которыми контракт совместим. */
  allowedExecutors: ToolExecutorKind[];
  /** Нормализует и валидирует входные данные перед запуском executor-а. */
  resolveInput: (inputs: any[], context: NodeExecutionContext) => Record<string, any>;
  /** Строит deterministic output для ветки http-json. */
  buildHttpSuccessOutput?: (context: ToolContractHttpSuccessContext) => Record<string, any>;
  /** Строит output для ветки openrouter-embeddings. */
  buildEmbeddingSuccessOutput?: (context: ToolContractEmbeddingSuccessContext) => Record<string, any>;
}

/** Результат разрешения контракта из реестра с уже нормализованным input. */
export interface ResolvedToolContract {
  name: ToolContractName;
  definition: ToolContractDefinition;
  input: Record<string, any>;
}

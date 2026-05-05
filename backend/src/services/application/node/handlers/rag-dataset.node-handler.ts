/**
 * Node handler для NodeType `RAGDataset`.
 *
 * Source-узел: читает корпус документов из `Node.ui_json.uris[]`, использует
 * контракт rag-dataset (валидация, чтение, сборка выхода). Не зависит от
 * upstream входов и не использует существующий ToolNode handler (тот
 * предполагает либо capability-режим без inputs, либо contract-режим с inputs).
 *
 * Выход совпадает по shape с DocumentLoader → drop-in совместимость
 * с нижестоящими RAG-тулами (Chunker, Embedder, HybridRetriever, ContextAssembler).
 */

import type { NodeHandler } from '../../pipeline/pipeline.executor.types.js';
import {
  buildRagDatasetContractOutput,
  readRagDatasetUrisFromConfig,
} from '../../tool/contracts/rag-dataset.tool.js';

export const ragDatasetNodeHandler: NodeHandler = async (runtime, _inputs, _context) => {
  // Источник конфига — Node.ui_json (per-node config). Frozen-контракт
  // ToolNode/AgentCall тоже использует ui_json для своих настроек.
  const uiJson = runtime.node.ui_json && typeof runtime.node.ui_json === 'object' ? runtime.node.ui_json : {};
  const uris = readRagDatasetUrisFromConfig(uiJson);
  const output = await buildRagDatasetContractOutput({ uris });

  return {
    output,
    costUnits: 0,
  };
};

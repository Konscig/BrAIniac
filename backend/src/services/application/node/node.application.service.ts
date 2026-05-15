import { HttpError } from '../../../common/http-error.js';
import { invalidatePipelineExportCache } from '../../../runtime/cache.service.js';
import {
  createNode,
  deleteNode,
  getNodeById,
  listNodesByOwner,
  listNodesByPipeline,
  updateNode,
} from '../../data/node.service.js';
import { listEdgesByPipeline } from '../../data/edge.service.js';
import { getNodeTypeById } from '../../data/node_type.service.js';
import { ensurePipelineOwnedByUser } from '../../core/ownership.service.js';
import { readRagDatasetUrisFromConfig } from '../tool/contracts/rag-dataset.tool.js';
import { RAG_DATASET_NODE_TYPE_NAME } from '../tool/contracts/rag-dataset.constants.js';

const PIPELINE_ACCESS_OPTIONS = {
  pipelineNotFoundMessage: 'pipeline not found',
  projectNotFoundMessage: 'project not found',
} as const;

async function ensureNodeTypeExists(typeId: number) {
  const type = await getNodeTypeById(typeId);
  if (!type) {
    throw new HttpError(404, { error: 'node type not found' });
  }
  return type;
}

/**
 * Hard-валидация Node.ui_json для NodeType=RAGDataset (FR-014, принцип III конституции).
 * При mutation допускаем пустой список URI (черновик узла на канве — пользователь
 * только что перетащил плитку, файлы ещё не загружены). Все ОСТАЛЬНЫЕ правила —
 * формат, дубли, лимит количества, префикс — проверяются. Полная hard-проверка
 * (включая «список не пуст») выполняется в preflight перед запуском пайплайна.
 */
function validateRagDatasetUiJsonOrThrow(uiJson: unknown): void {
  readRagDatasetUrisFromConfig(uiJson, { requireNonEmpty: false });
}

async function maybeValidateRagDatasetConfig(typeId: number, uiJson: unknown): Promise<void> {
  const type = await getNodeTypeById(typeId);
  const typeName = typeof type?.name === 'string' ? type.name.trim() : '';
  if (typeName === RAG_DATASET_NODE_TYPE_NAME) {
    validateRagDatasetUiJsonOrThrow(uiJson);
  }
}

async function ensureSubPipelineAccess(subPipelineId: number, userId: number) {
  await ensurePipelineOwnedByUser(subPipelineId, userId, {
    pipelineNotFoundMessage: 'sub pipeline not found',
    projectNotFoundMessage: 'project not found',
  });
}

export async function createNodeForUser(
  data: {
    fk_pipeline_id: number;
    fk_type_id: number;
    fk_sub_pipeline?: number;
    top_k: number;
    ui_json: any;
    output_json?: any;
  },
  userId: number,
) {
  await ensurePipelineOwnedByUser(data.fk_pipeline_id, userId, PIPELINE_ACCESS_OPTIONS);
  await ensureNodeTypeExists(data.fk_type_id);
  await maybeValidateRagDatasetConfig(data.fk_type_id, data.ui_json);

  if (data.fk_sub_pipeline !== undefined) {
    await ensureSubPipelineAccess(data.fk_sub_pipeline, userId);
  }

  const created = await createNode(data);
  await invalidatePipelineExportCache(data.fk_pipeline_id);
  return created;
}

export async function listNodesForPipelineForUser(pipelineId: number, userId: number) {
  await ensurePipelineOwnedByUser(pipelineId, userId, PIPELINE_ACCESS_OPTIONS);
  return listNodesByPipeline(pipelineId);
}

export async function listNodesForOwner(userId: number) {
  return listNodesByOwner(userId);
}

export async function getNodeByIdForUser(nodeId: number, userId: number) {
  const node = await getNodeById(nodeId);
  if (!node) {
    throw new HttpError(404, { error: 'not found' });
  }

  await ensurePipelineOwnedByUser(node.fk_pipeline_id, userId, PIPELINE_ACCESS_OPTIONS);
  return node;
}

export async function updateNodeForUser(
  nodeId: number,
  patch: {
    fk_type_id?: number;
    fk_sub_pipeline?: number | null;
    top_k?: number;
    ui_json?: any;
    output_json?: any;
  },
  userId: number,
) {
  const existing = await getNodeById(nodeId);
  if (!existing) {
    throw new HttpError(404, { error: 'not found' });
  }

  await ensurePipelineOwnedByUser(existing.fk_pipeline_id, userId, PIPELINE_ACCESS_OPTIONS);

  if (patch.fk_type_id !== undefined) {
    await ensureNodeTypeExists(patch.fk_type_id);
  }

  if (patch.fk_sub_pipeline !== undefined && patch.fk_sub_pipeline !== null) {
    await ensureSubPipelineAccess(patch.fk_sub_pipeline, userId);
  }

  // RAGDataset: валидируем при изменении ui_json или fk_type_id (если становится RAGDataset).
  if (patch.ui_json !== undefined) {
    const effectiveTypeId = patch.fk_type_id ?? existing.fk_type_id;
    await maybeValidateRagDatasetConfig(effectiveTypeId, patch.ui_json);
  } else if (patch.fk_type_id !== undefined && patch.fk_type_id !== existing.fk_type_id) {
    await maybeValidateRagDatasetConfig(patch.fk_type_id, existing.ui_json);
  }

  const updated = await updateNode(nodeId, patch);
  await invalidatePipelineExportCache(existing.fk_pipeline_id);
  return updated;
}

export async function deleteNodeByIdForUser(nodeId: number, userId: number) {
  const existing = await getNodeById(nodeId);
  if (!existing) {
    throw new HttpError(404, { error: 'not found' });
  }

  await ensurePipelineOwnedByUser(existing.fk_pipeline_id, userId, PIPELINE_ACCESS_OPTIONS);
  await deleteNode(nodeId);
  await invalidatePipelineExportCache(existing.fk_pipeline_id);
}

export async function updatePipelineNodeForUser(
  pipelineId: number,
  nodeId: number,
  patch: {
    label?: string;
    config_json?: unknown;
    ui_json?: any;
  },
  userId: number,
) {
  await ensurePipelineOwnedByUser(pipelineId, userId, PIPELINE_ACCESS_OPTIONS);
  const existing = await getNodeById(nodeId);
  if (!existing || existing.fk_pipeline_id !== pipelineId) {
    throw new HttpError(404, { error: 'node not found' });
  }

  const currentUi = existing.ui_json && typeof existing.ui_json === 'object' && !Array.isArray(existing.ui_json)
    ? (existing.ui_json as Record<string, unknown>)
    : {};
  const nextUi = {
    ...currentUi,
    ...(patch.ui_json && typeof patch.ui_json === 'object' && !Array.isArray(patch.ui_json) ? patch.ui_json : {}),
    ...(patch.label !== undefined ? { label: patch.label } : {}),
    ...(patch.config_json !== undefined ? { config_json: patch.config_json } : {}),
  };

  const updated = await updateNode(nodeId, { ui_json: nextUi });
  await invalidatePipelineExportCache(pipelineId);
  return updated;
}

export async function deletePipelineNodeForUser(pipelineId: number, nodeId: number, userId: number) {
  await ensurePipelineOwnedByUser(pipelineId, userId, PIPELINE_ACCESS_OPTIONS);
  const existing = await getNodeById(nodeId);
  if (!existing || existing.fk_pipeline_id !== pipelineId) {
    throw new HttpError(404, { error: 'node not found' });
  }

  const affectedEdges = (await listEdgesByPipeline(pipelineId)).filter(
    (edge) => edge.fk_from_node === nodeId || edge.fk_to_node === nodeId,
  );
  await deleteNode(nodeId);
  await invalidatePipelineExportCache(pipelineId);

  return {
    deleted_node_id: nodeId,
    affected_edges: affectedEdges.map((edge) => ({
      edge_id: edge.edge_id,
      fk_from_node: edge.fk_from_node,
      fk_to_node: edge.fk_to_node,
    })),
  };
}

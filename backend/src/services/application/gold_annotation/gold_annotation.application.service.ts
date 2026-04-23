import { HttpError } from '../../../common/http-error.js';
import { ensurePipelineOwnedByUser } from '../../core/ownership.service.js';
import { getDatasetById } from '../../data/dataset.service.js';
import { findById as findDocumentById } from '../../data/document.service.js';
import {
  createBatch,
  createOne,
  findById,
  listByDataset,
  revise,
  softDelete,
} from '../../data/gold_annotation.service.js';

const ALLOWED_TYPES = new Set(['answer', 'claims', 'relevant_docs', 'tool_trajectory']);

function validatePayload(annotationType: string, payload: unknown): void {
  if (!ALLOWED_TYPES.has(annotationType)) {
    throw new HttpError(400, { error: `unknown annotation_type: ${annotationType}` });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HttpError(400, { error: 'payload must be an object' });
  }
  switch (annotationType) {
    case 'answer':
      if (typeof (payload as any).text !== 'string') {
        throw new HttpError(400, { error: 'answer payload requires string field "text"' });
      }
      break;
    case 'claims':
      if (!Array.isArray((payload as any).claims)) {
        throw new HttpError(400, { error: 'claims payload requires array field "claims"' });
      }
      break;
    case 'relevant_docs':
      if (!Array.isArray((payload as any).doc_ids)) {
        throw new HttpError(400, { error: 'relevant_docs payload requires array field "doc_ids"' });
      }
      break;
    case 'tool_trajectory':
      if (!Array.isArray((payload as any).steps)) {
        throw new HttpError(400, { error: 'tool_trajectory payload requires array field "steps"' });
      }
      break;
    default:
      break;
  }
}

async function ensureDatasetOwnedByUser(datasetId: number, userId: number) {
  const dataset = await getDatasetById(datasetId);
  if (!dataset) throw new HttpError(404, { error: 'not found' });
  await ensurePipelineOwnedByUser(dataset.fk_pipeline_id, userId, { pipelineNotFoundMessage: 'not found' });
  return dataset;
}

async function ensureDocumentInDataset(documentId: number, datasetId: number) {
  const doc = await findDocumentById(documentId);
  if (!doc || doc.fk_dataset_id !== datasetId) {
    throw new HttpError(404, { error: 'document not found in dataset' });
  }
  return doc;
}

export async function createGoldAnnotationForUser(
  datasetId: number,
  userId: number,
  body: any,
) {
  await ensureDatasetOwnedByUser(datasetId, userId);
  if (!body?.annotation_type) {
    throw new HttpError(400, { error: 'annotation_type required' });
  }
  if (typeof body.document_id !== 'number') {
    throw new HttpError(400, { error: 'document_id required' });
  }
  await ensureDocumentInDataset(body.document_id, datasetId);
  validatePayload(body.annotation_type, body.payload);
  return createOne({
    fk_document_id: body.document_id,
    annotation_type: body.annotation_type,
    payload_json: body.payload,
    fk_author_user_id: userId,
  });
}

export async function createGoldAnnotationsBatchForUser(
  datasetId: number,
  userId: number,
  items: any[],
) {
  await ensureDatasetOwnedByUser(datasetId, userId);
  const prepared: Parameters<typeof createBatch>[0] = [];
  for (const item of items) {
    if (!item?.annotation_type || typeof item.document_id !== 'number') {
      throw new HttpError(400, { error: 'each item requires annotation_type and document_id' });
    }
    await ensureDocumentInDataset(item.document_id, datasetId);
    validatePayload(item.annotation_type, item.payload);
    prepared.push({
      fk_document_id: item.document_id,
      annotation_type: item.annotation_type,
      payload_json: item.payload,
      fk_author_user_id: userId,
    });
  }
  return createBatch(prepared);
}

export async function listGoldAnnotationsForUser(
  datasetId: number,
  userId: number,
  filter: { annotation_type?: string; document_id?: number; include_history?: boolean },
) {
  await ensureDatasetOwnedByUser(datasetId, userId);
  return listByDataset(datasetId, {
    annotation_type: filter.annotation_type,
    fk_document_id: filter.document_id,
    include_history: filter.include_history,
  });
}

export async function reviseGoldAnnotationForUser(
  goldAnnotationId: number,
  userId: number,
  payload: any,
) {
  const existing = await findById(goldAnnotationId);
  if (!existing) throw new HttpError(404, { error: 'not found' });
  const dataset = await ensureDatasetOwnedByUser((existing as any).document.fk_dataset_id, userId);
  if (!dataset) throw new HttpError(404, { error: 'not found' });
  validatePayload((existing as any).annotation_type, payload);
  return revise(goldAnnotationId, payload);
}

export async function deleteGoldAnnotationForUser(goldAnnotationId: number, userId: number) {
  const existing = await findById(goldAnnotationId);
  if (!existing) throw new HttpError(404, { error: 'not found' });
  await ensureDatasetOwnedByUser((existing as any).document.fk_dataset_id, userId);
  return softDelete(goldAnnotationId);
}

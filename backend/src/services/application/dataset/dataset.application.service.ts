import { HttpError } from '../common/http-error.js';
import {
  createDataset,
  deleteDataset,
  getDatasetById,
  listDatasets,
  listDatasetsByOwner,
  updateDataset,
} from './dataset.service.js';
import { ensurePipelineOwnedByUser } from './ownership.service.js';

const PIPELINE_ACCESS_OPTIONS = {
  pipelineNotFoundMessage: 'pipeline not found',
  projectNotFoundMessage: 'project not found',
} as const;

export async function createDatasetForUser(
  data: { fk_pipeline_id: number; uri: string; desc?: string },
  userId: number,
) {
  await ensurePipelineOwnedByUser(data.fk_pipeline_id, userId, PIPELINE_ACCESS_OPTIONS);
  return createDataset(data);
}

export async function listDatasetsForPipelineForUser(pipelineId: number, userId: number) {
  await ensurePipelineOwnedByUser(pipelineId, userId, PIPELINE_ACCESS_OPTIONS);
  return listDatasets(pipelineId);
}

export async function listDatasetsForOwner(userId: number) {
  return listDatasetsByOwner(userId);
}

export async function getDatasetByIdForUser(datasetId: number, userId: number) {
  const dataset = await getDatasetById(datasetId);
  if (!dataset) {
    throw new HttpError(404, { error: 'not found' });
  }

  await ensurePipelineOwnedByUser(dataset.fk_pipeline_id, userId, PIPELINE_ACCESS_OPTIONS);
  return dataset;
}

export async function updateDatasetForUser(
  datasetId: number,
  patch: { desc?: string; uri?: string },
  userId: number,
) {
  await getDatasetByIdForUser(datasetId, userId);
  return updateDataset(datasetId, patch);
}

export async function deleteDatasetByIdForUser(datasetId: number, userId: number) {
  await getDatasetByIdForUser(datasetId, userId);
  await deleteDataset(datasetId);
}

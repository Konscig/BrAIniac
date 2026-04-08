import prisma from '../db.js';

export async function createDataset(data: { fk_pipeline_id: number; desc?: string; uri: string }) {
  if (!data.uri) throw new Error('dataset uri is required');
  return prisma.dataset.create({
    data: {
      fk_pipeline_id: data.fk_pipeline_id,
      ...(data.desc !== undefined ? { desc: data.desc } : {}),
      uri: data.uri,
    },
  });
}

export async function updateDataset(dataset_id: number, data: { desc?: string; uri?: string }) {
  return prisma.dataset.update({
    where: { dataset_id },
    data: {
      ...(data.desc !== undefined ? { desc: data.desc } : {}),
      ...(data.uri !== undefined ? { uri: data.uri } : {}),
    },
  });
}

export async function listDatasets(fk_pipeline_id?: number) {
  if (!fk_pipeline_id) return prisma.dataset.findMany();
  return prisma.dataset.findMany({ where: { fk_pipeline_id } });
}

export async function listDatasetsByOwner(fk_user_id: number) {
  return prisma.dataset.findMany({
    where: {
      pipeline: {
        project: {
          fk_user_id,
        },
      },
    },
  });
}

export async function getDatasetById(dataset_id: number) {
  return prisma.dataset.findUnique({ where: { dataset_id } });
}

export async function deleteDataset(dataset_id: number) {
  return prisma.dataset.delete({ where: { dataset_id } });
}

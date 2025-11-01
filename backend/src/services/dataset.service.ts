import prisma from '../db.js';

export async function createDataset(data: { projectId: string; name: string; uri: string; configJson?: any }) {
  if (!data.name) throw new Error('dataset name is required');
  if (!data.uri) throw new Error('dataset uri is required');
  const d = await prisma.dataset.create({ data: {
    projectId: data.projectId,
    name: data.name,
    uri: data.uri,
    configJson: data.configJson ?? {},
  }});
  return d;
}

export async function listDatasets(projectId?: string) {
  if (!projectId) return prisma.dataset.findMany();
  return prisma.dataset.findMany({ where: { projectId } });
}

export async function getDatasetById(id: string) {
  return prisma.dataset.findUnique({ where: { id } });
}

export async function deleteDataset(id: string) {
  return prisma.dataset.delete({ where: { id } });
}

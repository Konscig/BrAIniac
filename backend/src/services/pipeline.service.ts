import prisma from '../db.js';

export async function createPipeline(data: { projectId: string; name: string; description?: string }) {
  if (!data.name) throw new Error('pipeline name is required');
  const p = await prisma.pipeline.create({ data: {
    projectId: data.projectId,
    name: data.name,
    description: data.description ?? '',
  }});
  return p;
}

export async function getPipelineById(id: string) {
  return prisma.pipeline.findUnique({ where: { id } });
}

export async function listPipelines(projectId?: string) {
  if (!projectId) return prisma.pipeline.findMany();
  return prisma.pipeline.findMany({ where: { projectId } });
}

export async function listPipelinesByOwner(ownerId?: string) {
  if (!ownerId) return prisma.pipeline.findMany();

  // Получаем id проектов владельца, затем фильтруем pipelines по projectId IN (...)
  const projects = await prisma.project.findMany({
    where: { ownerId },
    select: { id: true },
  });
  const projectIds = projects.map(p => p.id);
  if (projectIds.length === 0) return [];
  return prisma.pipeline.findMany({
    where: { projectId: { in: projectIds } },
  });
}

export async function updatePipeline(id: string, data: { name?: string; description?: string; lastPublishedVersionId?: string }) {
  return prisma.pipeline.update({ where: { id }, data });
}

export async function deletePipeline(id: string) {
  return prisma.pipeline.delete({ where: { id } });
}

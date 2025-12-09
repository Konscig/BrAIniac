import prisma from '../db.js';

export async function createPipelineVersion(data: { pipelineId: string; number: number; authorId?: string | null; state?: string; metadataJson?: any }) {
  const v = await prisma.pipelineVersion.create({ data: {
    pipelineId: data.pipelineId,
    number: data.number,
    authorId: data.authorId ?? null,
    state: data.state ?? 'draft',
    metadataJson: data.metadataJson ?? {},
  }});
  return v;
}

export async function listPipelineVersions(pipelineId?: string) {
  if (!pipelineId) return prisma.pipelineVersion.findMany();
  return prisma.pipelineVersion.findMany({ where: { pipelineId } });
}

export async function getPipelineVersionById(id: string) {
  return prisma.pipelineVersion.findUnique({ where: { id } });
}

export async function updatePipelineVersion(id: string, data: { state?: string; metadataJson?: any }) {
  return prisma.pipelineVersion.update({ where: { id }, data });
}

export async function getLatestPipelineVersion(pipelineId: string) {
  return prisma.pipelineVersion.findFirst({
    where: { pipelineId },
    orderBy: { number: 'desc' },
  });
}

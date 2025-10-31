import prisma from '../db.js';

export async function createEdge(data: { versionId: string; fromNode: string; toNode: string; label?: string }) {
  const e = await prisma.edge.create({ data: {
    versionId: data.versionId,
    fromNode: data.fromNode,
    toNode: data.toNode,
    label: data.label ?? '',
  }});
  return e;
}

export async function listEdgesByVersion(versionId?: string) {
  if (!versionId) return prisma.edge.findMany();
  return prisma.edge.findMany({ where: { versionId } });
}

export async function getEdgeById(id: string) {
  return prisma.edge.findUnique({ where: { id } });
}

export async function deleteEdge(id: string) {
  return prisma.edge.delete({ where: { id } });
}

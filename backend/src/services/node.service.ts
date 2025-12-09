import prisma from '../db.js';

export async function createNode(data: { versionId: string; key: string; label: string; category: string; type: string; status?: string; positionX?: number; positionY?: number; configJson?: any }) {
  const n = await prisma.node.create({ data: {
    versionId: data.versionId,
    key: data.key,
    label: data.label,
    category: data.category,
    type: data.type,
    status: data.status ?? 'idle',
    positionX: data.positionX ?? 0,
    positionY: data.positionY ?? 0,
    configJson: data.configJson ?? {},
  }});
  return n;
}

export async function updateNode(id: string, data: { key?: string; label?: string; category?: string; type?: string; status?: string; positionX?: number; positionY?: number; configJson?: any }) {
  return prisma.node.update({ where: { id }, data });
}

export async function updateNodeFields(id: string, fields: Record<string, any>) {
  return prisma.node.update({ where: { id }, data: fields });
}

export async function getNodeById(id: string) {
  return prisma.node.findUnique({ where: { id } });
}

export async function listNodesByVersion(versionId?: string) {
  if (!versionId) return prisma.node.findMany();
  return prisma.node.findMany({ where: { versionId } });
}

export async function deleteNode(id: string) {
  return prisma.node.delete({ where: { id } });
}

import prisma from '../db.js';

export async function createNodeType(data: { fk_tool_id: number; name: string; desc: string }) {
  return prisma.nodeType.create({
    data: {
      fk_tool_id: data.fk_tool_id,
      name: data.name,
      desc: data.desc,
    },
  });
}

export async function getNodeTypeById(type_id: number) {
  return prisma.nodeType.findUnique({ where: { type_id } });
}

export async function listNodeTypes(fk_tool_id?: number) {
  if (!fk_tool_id) return prisma.nodeType.findMany();
  return prisma.nodeType.findMany({ where: { fk_tool_id } });
}

export async function updateNodeType(type_id: number, data: { name?: string; desc?: string }) {
  return prisma.nodeType.update({
    where: { type_id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.desc !== undefined ? { desc: data.desc } : {}),
    },
  });
}

export async function deleteNodeType(type_id: number) {
  return prisma.nodeType.delete({ where: { type_id } });
}

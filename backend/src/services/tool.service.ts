import prisma from '../db.js';

export async function createTool(data: { kind: string; name: string; version: string; configJson?: any }) {
  if (!data.kind || !data.name || !data.version) throw new Error('kind, name and version are required');
  const t = await prisma.tool.create({ data: {
    kind: data.kind,
    name: data.name,
    version: data.version,
    configJson: data.configJson ?? {},
  }});
  return t;
}

export async function listTools() {
  return prisma.tool.findMany();
}

export async function getToolById(id: string) {
  return prisma.tool.findUnique({ where: { id } });
}

export async function deleteTool(id: string) {
  return prisma.tool.delete({ where: { id } });
}

import prisma from '../db.js';

export async function createExport(data: { projectId: string; type: string; uri: string; configJson?: any }) {
  if (!data.type) throw new Error('export type is required');
  if (!data.uri) throw new Error('export uri is required');
  const e = await prisma.export.create({ data: {
    projectId: data.projectId,
    type: data.type,
    uri: data.uri,
    configJson: data.configJson ?? {},
  }});
  return e;
}

export async function listExports(projectId?: string) {
  if (!projectId) return prisma.export.findMany();
  return prisma.export.findMany({ where: { projectId } });
}

export async function getExportById(id: string) {
  return prisma.export.findUnique({ where: { id } });
}

export async function deleteExport(id: string) {
  return prisma.export.delete({ where: { id } });
}

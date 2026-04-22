import prisma from '../../db.js';

export async function createTool(data: { name: string; config_json?: any }) {
  if (!data.name) throw new Error('name is required');
  return prisma.tool.create({
    data: {
      name: data.name,
      config_json: data.config_json ?? {},
    },
  });
}

export async function listTools() {
  return prisma.tool.findMany();
}

export async function getToolById(tool_id: number) {
  return prisma.tool.findUnique({ where: { tool_id } });
}

export async function updateTool(tool_id: number, data: { name?: string; config_json?: any }) {
  return prisma.tool.update({
    where: { tool_id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.config_json !== undefined ? { config_json: data.config_json } : {}),
    },
  });
}

export async function deleteTool(tool_id: number) {
  return prisma.tool.delete({ where: { tool_id } });
}

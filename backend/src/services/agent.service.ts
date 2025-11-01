import prisma from '../db.js';

export async function createAgent(data: { projectId: string; name: string; description?: string; configJson?: any; image: string }) {
  if (!data.name) throw new Error('agent name is required');
  if (!data.image) throw new Error('agent image is required');
  const a = await prisma.agent.create({ data: {
    projectId: data.projectId,
    name: data.name,
    description: data.description ?? '',
    configJson: data.configJson ?? {},
    image: data.image,
  }});
  return a;
}

export async function updateAgent(id: string, data: { name?: string; description?: string; configJson?: any; image?: string }) {
  const updated = await prisma.agent.update({ where: { id }, data });
  return updated;
}

export async function updateAgentConfig(id: string, configJson: any) {
  return prisma.agent.update({ where: { id }, data: { configJson } });
}

export async function getAgentById(id: string) {
  return prisma.agent.findUnique({ where: { id } });
}

export async function listAgentsByProject(projectId?: string) {
  if (!projectId) return prisma.agent.findMany();
  return prisma.agent.findMany({ where: { projectId } });
}

export async function deleteAgent(id: string) {
  return prisma.agent.delete({ where: { id } });
}

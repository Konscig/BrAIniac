import prisma from '../db.js';

export async function createProject(data: { ownerId: string; name: string; description?: string; config?: any }) {
  const project = await prisma.project.create({ data: {
    ownerId: data.ownerId,
    name: data.name,
    description: data.description ?? '',
    config: data.config ?? {},
  }});
  return project;
}

export async function updateProject(id: string, data: { name?: string; description?: string; config?: any }) {
  const project = await prisma.project.update({ where: { id }, data: {
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
    ...(data.config !== undefined ? { config: data.config } : {}),
  }});
  return project;
}

export async function deleteProject(id: string) {
  return prisma.project.delete({ where: { id } });
}

export async function getProjectById(id: string) {
  return prisma.project.findUnique({ where: { id } });
}

export async function listProjectsByOwner(ownerId?: string) {
  if (!ownerId) return prisma.project.findMany();
  return prisma.project.findMany({ where: { ownerId } });
}

import prisma from '../../db.js';

export async function createProject(data: { fk_user_id: number; name: string }) {
  return prisma.project.create({
    data: {
      fk_user_id: data.fk_user_id,
      name: data.name,
    },
  });
}

export async function updateProject(project_id: number, data: { name?: string }) {
  return prisma.project.update({
    where: { project_id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
    },
  });
}

export async function deleteProject(project_id: number) {
  return prisma.project.delete({ where: { project_id } });
}

export async function getProjectById(project_id: number) {
  return prisma.project.findUnique({ where: { project_id } });
}

export async function listProjectsByOwner(fk_user_id?: number) {
  if (!fk_user_id) return prisma.project.findMany();
  return prisma.project.findMany({ where: { fk_user_id } });
}

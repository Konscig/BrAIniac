import { createProject, deleteProject, listProjectsByOwner, updateProject } from '../../data/project.service.js';
import { ensureProjectOwnedByUser } from '../../core/ownership.service.js';

export async function createProjectForUser(name: string, userId: number) {
  return createProject({ fk_user_id: userId, name });
}

export async function listProjectsForUser(userId: number) {
  return listProjectsByOwner(userId);
}

export async function getProjectByIdForUser(projectId: number, userId: number) {
  return ensureProjectOwnedByUser(projectId, userId, 'not found');
}

export async function updateProjectByIdForUser(projectId: number, patch: { name?: string }, userId: number) {
  await ensureProjectOwnedByUser(projectId, userId, 'not found');
  return updateProject(projectId, patch);
}

export async function deleteProjectByIdForUser(projectId: number, userId: number) {
  await ensureProjectOwnedByUser(projectId, userId, 'not found');
  await deleteProject(projectId);
}

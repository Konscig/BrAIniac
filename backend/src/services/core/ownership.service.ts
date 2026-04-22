import { HttpError } from '../../common/http-error.js';
import { getPipelineById } from '../data/pipeline.service.js';
import { getProjectById } from '../data/project.service.js';

export async function ensureProjectOwnedByUser(
  projectId: number,
  userId: number,
  projectNotFoundMessage = 'project not found',
) {
  const project = await getProjectById(projectId);
  if (!project) {
    throw new HttpError(404, { error: projectNotFoundMessage });
  }

  if (project.fk_user_id !== userId) {
    throw new HttpError(403, { error: 'forbidden' });
  }

  return project;
}

export async function ensurePipelineOwnedByUser(
  pipelineId: number,
  userId: number,
  options?: { pipelineNotFoundMessage?: string; projectNotFoundMessage?: string },
) {
  const pipeline = await getPipelineById(pipelineId);
  if (!pipeline) {
    throw new HttpError(404, { error: options?.pipelineNotFoundMessage ?? 'not found' });
  }

  await ensureProjectOwnedByUser(
    pipeline.fk_project_id,
    userId,
    options?.projectNotFoundMessage ?? 'project not found',
  );

  return pipeline;
}

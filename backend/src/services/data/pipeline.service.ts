import prisma from '../db.js';

export async function createPipeline(data: {
  fk_project_id: number;
  name: string;
  max_time: number;
  max_cost: number;
  max_reject: number;
  score?: number;
  report_json?: any;
}) {
  if (!data.name) throw new Error('pipeline name is required');
  return prisma.pipeline.create({
    data: {
      fk_project_id: data.fk_project_id,
      name: data.name,
      max_time: data.max_time,
      max_cost: data.max_cost,
      max_reject: data.max_reject,
      ...(data.score !== undefined ? { score: data.score } : {}),
      ...(data.report_json !== undefined ? { report_json: data.report_json } : {}),
    },
  });
}

export async function getPipelineById(pipeline_id: number) {
  return prisma.pipeline.findUnique({ where: { pipeline_id } });
}

export async function listPipelines(fk_project_id?: number) {
  if (!fk_project_id) return prisma.pipeline.findMany();
  return prisma.pipeline.findMany({ where: { fk_project_id } });
}

export async function listPipelinesByOwner(fk_user_id?: number) {
  if (!fk_user_id) return prisma.pipeline.findMany();
  return prisma.pipeline.findMany({
    where: { project: { fk_user_id } },
  });
}

export async function updatePipeline(
  pipeline_id: number,
  data: {
    name?: string;
    max_time?: number;
    max_cost?: number;
    max_reject?: number;
    score?: number | null;
    report_json?: any;
  },
) {
  return prisma.pipeline.update({ where: { pipeline_id }, data });
}

export async function deletePipeline(pipeline_id: number) {
  return prisma.pipeline.delete({ where: { pipeline_id } });
}

import prisma from '../../db.js';

export async function claim(params: { fk_pipeline_id: number; fk_dataset_id: number; fk_assessment_id: number }) {
  return prisma.judgeAssessmentInflight.create({ data: params });
}

export async function release(fk_assessment_id: number) {
  return prisma.judgeAssessmentInflight.deleteMany({ where: { fk_assessment_id } });
}

export async function findActive(params: { fk_pipeline_id: number; fk_dataset_id: number }) {
  return prisma.judgeAssessmentInflight.findUnique({
    where: { fk_pipeline_id_fk_dataset_id: { fk_pipeline_id: params.fk_pipeline_id, fk_dataset_id: params.fk_dataset_id } },
  });
}

export async function reapStale(staleMs: number) {
  const threshold = new Date(Date.now() - staleMs);
  return prisma.judgeAssessmentInflight.deleteMany({ where: { updated_at: { lt: threshold } } });
}

export async function touch(fk_assessment_id: number) {
  return prisma.judgeAssessmentInflight.updateMany({
    where: { fk_assessment_id },
    data: { updated_at: new Date() },
  });
}

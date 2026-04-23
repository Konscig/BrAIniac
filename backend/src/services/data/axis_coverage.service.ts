import prisma from '../../db.js';

export async function upsertCoverage(data: {
  fk_assessment_id: number;
  axis: string;
  mandatory: boolean;
  covered: boolean;
  metric_count: number;
}) {
  return prisma.axisCoverage.upsert({
    where: { fk_assessment_id_axis: { fk_assessment_id: data.fk_assessment_id, axis: data.axis } },
    create: data,
    update: {
      mandatory: data.mandatory,
      covered: data.covered,
      metric_count: data.metric_count,
    },
  });
}

export async function listByAssessment(fk_assessment_id: number) {
  return prisma.axisCoverage.findMany({
    where: { fk_assessment_id },
    orderBy: { axis: 'asc' },
  });
}

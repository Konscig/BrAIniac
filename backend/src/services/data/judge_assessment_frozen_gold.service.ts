import prisma from '../../db.js';

export async function freeze(
  fk_assessment_id: number,
  annotations: { fk_gold_annotation_id: number; fk_document_id: number; annotation_type: string }[],
) {
  if (annotations.length === 0) return [];
  return prisma.$transaction(
    annotations.map((a) =>
      prisma.judgeAssessmentFrozenGold.upsert({
        where: {
          fk_assessment_id_fk_document_id_annotation_type: {
            fk_assessment_id,
            fk_document_id: a.fk_document_id,
            annotation_type: a.annotation_type,
          },
        },
        create: { fk_assessment_id, ...a },
        update: { fk_gold_annotation_id: a.fk_gold_annotation_id },
      }),
    ),
  );
}

export async function listForAssessment(fk_assessment_id: number) {
  return prisma.judgeAssessmentFrozenGold.findMany({
    where: { fk_assessment_id },
    include: { gold_annotation: true },
  });
}

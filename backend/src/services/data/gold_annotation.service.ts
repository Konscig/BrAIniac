import prisma from '../../db.js';

export type AnnotationType = 'answer' | 'claims' | 'relevant_docs' | 'tool_trajectory' | string;

export async function createOne(data: {
  fk_document_id: number;
  annotation_type: AnnotationType;
  payload_json: any;
  fk_author_user_id?: number | null;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.goldAnnotation.updateMany({
      where: {
        fk_document_id: data.fk_document_id,
        annotation_type: data.annotation_type,
        current: true,
      },
      data: { current: false },
    });
    const lastVersion = await tx.goldAnnotation.findFirst({
      where: { fk_document_id: data.fk_document_id, annotation_type: data.annotation_type },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return tx.goldAnnotation.create({
      data: {
        fk_document_id: data.fk_document_id,
        annotation_type: data.annotation_type,
        payload_json: data.payload_json,
        version: (lastVersion?.version ?? 0) + 1,
        current: true,
        fk_author_user_id: data.fk_author_user_id ?? null,
      },
    });
  });
}

export async function createBatch(items: {
  fk_document_id: number;
  annotation_type: AnnotationType;
  payload_json: any;
  fk_author_user_id?: number | null;
}[]) {
  const created = [] as any[];
  for (const item of items) {
    created.push(await createOne(item));
  }
  return created;
}

export async function listByDataset(
  fk_dataset_id: number,
  filter?: { annotation_type?: string; fk_document_id?: number; include_history?: boolean },
) {
  return prisma.goldAnnotation.findMany({
    where: {
      document: { fk_dataset_id },
      ...(filter?.annotation_type ? { annotation_type: filter.annotation_type } : {}),
      ...(filter?.fk_document_id ? { fk_document_id: filter.fk_document_id } : {}),
      ...(filter?.include_history ? {} : { current: true, deleted_at: null }),
    },
    include: { document: { select: { item_key: true, fk_dataset_id: true } } },
    orderBy: [{ fk_document_id: 'asc' }, { annotation_type: 'asc' }, { version: 'desc' }],
  });
}

export async function findById(gold_annotation_id: number) {
  return prisma.goldAnnotation.findUnique({
    where: { gold_annotation_id },
    include: { document: true },
  });
}

export async function revise(gold_annotation_id: number, payload_json: any) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.goldAnnotation.findUnique({ where: { gold_annotation_id } });
    if (!existing) throw new Error('gold annotation not found');
    await tx.goldAnnotation.updateMany({
      where: {
        fk_document_id: existing.fk_document_id,
        annotation_type: existing.annotation_type,
        current: true,
      },
      data: { current: false },
    });
    const lastVersion = await tx.goldAnnotation.findFirst({
      where: { fk_document_id: existing.fk_document_id, annotation_type: existing.annotation_type },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return tx.goldAnnotation.create({
      data: {
        fk_document_id: existing.fk_document_id,
        annotation_type: existing.annotation_type,
        payload_json,
        version: (lastVersion?.version ?? 0) + 1,
        current: true,
        fk_author_user_id: existing.fk_author_user_id,
      },
    });
  });
}

export async function softDelete(gold_annotation_id: number) {
  return prisma.goldAnnotation.update({
    where: { gold_annotation_id },
    data: { deleted_at: new Date(), current: false },
  });
}

export async function listCurrentForDocument(document_id: number, annotation_type: AnnotationType) {
  return prisma.goldAnnotation.findFirst({
    where: {
      fk_document_id: document_id,
      annotation_type,
      current: true,
      deleted_at: null,
    },
  });
}

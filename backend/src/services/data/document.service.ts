import prisma from '../../db.js';

export async function createDocument(data: {
  fk_dataset_id: number;
  item_key: string;
  input_json: any;
  metadata_json?: any;
}) {
  return prisma.document.create({ data });
}

export async function findByDatasetItemKey(fk_dataset_id: number, item_key: string) {
  return prisma.document.findFirst({ where: { fk_dataset_id, item_key } });
}

export async function listByDataset(fk_dataset_id: number) {
  return prisma.document.findMany({ where: { fk_dataset_id }, orderBy: { document_id: 'asc' } });
}

export async function findById(document_id: number) {
  return prisma.document.findUnique({ where: { document_id } });
}

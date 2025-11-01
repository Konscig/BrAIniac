import prisma from '../db.js';

export async function createDocument(data: { projectId: string; datasetId?: string | null; content: string; metadata?: any; embedding?: Uint8Array | null }) {
  if (!data.content) throw new Error('document content required');
  const embedding = data.embedding ? (data.embedding as unknown as any) : null;
  const d = await prisma.document.create({ data: {
    projectId: data.projectId,
    datasetId: data.datasetId ?? null,
    content: data.content,
    metadata: data.metadata ?? {},
    embedding: embedding,
  }});
  return d;
}

export async function listDocuments(filter: { projectId?: string | undefined; datasetId?: string | undefined } = {}) {
  const where: any = {};
  if (filter.projectId !== undefined) where.projectId = filter.projectId;
  if (filter.datasetId !== undefined) where.datasetId = filter.datasetId;
  return prisma.document.findMany({ where });
}

export async function getDocumentById(id: string) {
  return prisma.document.findUnique({ where: { id } });
}

export async function deleteDocument(id: string) {
  return prisma.document.delete({ where: { id } });
}

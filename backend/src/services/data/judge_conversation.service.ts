import prisma from '../../db.js';

export async function createConversation(data: {
  fk_user_id: number;
  fk_project_id: number;
  fk_assessment_id?: number | null;
  title?: string | null;
}) {
  return prisma.judgeConversation.create({ data });
}

export async function findById(conversation_id: number) {
  return prisma.judgeConversation.findUnique({ where: { conversation_id } });
}

export async function findForOwner(conversation_id: number, fk_user_id: number) {
  return prisma.judgeConversation.findFirst({
    where: { conversation_id, fk_user_id },
  });
}

export async function listForUser(fk_user_id: number, fk_project_id?: number) {
  return prisma.judgeConversation.findMany({
    where: {
      fk_user_id,
      ...(fk_project_id ? { fk_project_id } : {}),
    },
    orderBy: { updated_at: 'desc' },
  });
}

export async function touch(conversation_id: number) {
  return prisma.judgeConversation.update({
    where: { conversation_id },
    data: { updated_at: new Date() },
  });
}

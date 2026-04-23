import prisma from '../../db.js';

export type MessageRole = 'user' | 'assistant' | 'tool';

export async function appendMessage(data: {
  fk_conversation_id: number;
  role: MessageRole;
  content: string;
  tool_name?: string | null;
  tool_call_id?: string | null;
}) {
  return prisma.judgeMessage.create({ data });
}

export async function listByConversation(
  fk_conversation_id: number,
  options?: { limit?: number; beforeId?: number },
) {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  return prisma.judgeMessage.findMany({
    where: {
      fk_conversation_id,
      ...(options?.beforeId ? { message_id: { lt: options.beforeId } } : {}),
    },
    orderBy: { created_at: 'asc' },
    take: limit,
  });
}

export async function countByConversation(fk_conversation_id: number) {
  return prisma.judgeMessage.count({ where: { fk_conversation_id } });
}

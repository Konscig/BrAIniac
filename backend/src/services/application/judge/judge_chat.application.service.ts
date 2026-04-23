import { HttpError } from '../../../common/http-error.js';
import { ensureProjectOwnedByUser } from '../../core/ownership.service.js';
import { resolveJudgeProvider } from '../../core/judge_provider/index.js';
import type { JudgeMessage } from '../../core/judge_provider/index.js';
import {
  createConversation,
  findForOwner,
  touch as touchConversation,
} from '../../data/judge_conversation.service.js';
import {
  appendMessage,
  listByConversation,
} from '../../data/judge_message.service.js';
import { toolHandlers, toolSchemas } from './tool_handlers/index.js';

const SYSTEM_PROMPT = [
  'You are the BrAIniac judge. Explain assessment results strictly based on',
  'data returned by tool-calls. Do not invent metric values. Keep answers concise',
  "and always point to concrete node_id / assessment_item_id when possible.",
].join(' ');

export interface ChatInput {
  project_id: number;
  conversation_id?: number;
  assessment_id?: number;
  message: string;
}

export interface ChatResult {
  conversation_id: number;
  assistant_message: { message_id: number; role: 'assistant'; content: string; created_at: Date };
  tool_calls_executed: Array<{ tool_call_id: string; tool_name: string; input: Record<string, any>; output_preview: any }>;
}

export async function sendChatMessage(input: ChatInput, userId: number): Promise<ChatResult> {
  if (!input.message || typeof input.message !== 'string') {
    throw new HttpError(400, { error: 'message required' });
  }

  await ensureProjectOwnedByUser(input.project_id, userId);

  let conversationId = input.conversation_id;
  if (conversationId) {
    const existing = await findForOwner(conversationId, userId);
    if (!existing) throw new HttpError(404, { error: 'not found' });
  } else {
    const created = await createConversation({
      fk_user_id: userId,
      fk_project_id: input.project_id,
      fk_assessment_id: input.assessment_id ?? null,
    });
    conversationId = created.conversation_id;
  }

  await appendMessage({
    fk_conversation_id: conversationId!,
    role: 'user',
    content: input.message,
  });

  const history = await listByConversation(conversationId!, { limit: 50 });
  const messages: JudgeMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((h: any) => ({
      role: h.role.trim() as JudgeMessage['role'],
      content: h.content,
      ...(h.tool_name ? { tool_name: h.tool_name } : {}),
      ...(h.tool_call_id ? { tool_call_id: h.tool_call_id } : {}),
    })),
  ];

  const provider = resolveJudgeProvider();
  const toolCallsExecuted: ChatResult['tool_calls_executed'] = [];
  const first = await provider.chat(messages, toolSchemas);

  // If the judge issued tool calls, execute them sequentially and ask for a follow-up.
  if (first.tool_calls.length > 0) {
    for (const tc of first.tool_calls) {
      const handler = toolHandlers[tc.name];
      const output = handler ? await handler(tc.arguments ?? {}, userId) : { error: `unknown tool ${tc.name}` };
      toolCallsExecuted.push({
        tool_call_id: tc.id,
        tool_name: tc.name,
        input: tc.arguments ?? {},
        output_preview: output,
      });
      await appendMessage({
        fk_conversation_id: conversationId!,
        role: 'tool',
        content: JSON.stringify(output),
        tool_name: tc.name,
        tool_call_id: tc.id,
      });
    }
    const followupHistory = await listByConversation(conversationId!, { limit: 50 });
    const followupMessages: JudgeMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...followupHistory.map((h: any) => ({
        role: h.role.trim() as JudgeMessage['role'],
        content: h.content,
        ...(h.tool_name ? { tool_name: h.tool_name } : {}),
        ...(h.tool_call_id ? { tool_call_id: h.tool_call_id } : {}),
      })),
    ];
    const followup = await provider.chat(followupMessages, toolSchemas);
    const assistantRecord = await appendMessage({
      fk_conversation_id: conversationId!,
      role: 'assistant',
      content: followup.text ?? '',
    });
    await touchConversation(conversationId!);
    return {
      conversation_id: conversationId!,
      assistant_message: {
        message_id: assistantRecord.message_id,
        role: 'assistant',
        content: assistantRecord.content,
        created_at: assistantRecord.created_at,
      },
      tool_calls_executed: toolCallsExecuted,
    };
  }

  const assistantRecord = await appendMessage({
    fk_conversation_id: conversationId!,
    role: 'assistant',
    content: first.text ?? '',
  });
  await touchConversation(conversationId!);
  return {
    conversation_id: conversationId!,
    assistant_message: {
      message_id: assistantRecord.message_id,
      role: 'assistant',
      content: assistantRecord.content,
      created_at: assistantRecord.created_at,
    },
    tool_calls_executed: toolCallsExecuted,
  };
}

export async function getHistoryForOwner(
  conversationId: number,
  userId: number,
  options?: { limit?: number; beforeId?: number },
) {
  const existing = await findForOwner(conversationId, userId);
  if (!existing) throw new HttpError(404, { error: 'not found' });
  const messages = await listByConversation(conversationId, options);
  return {
    conversation_id: conversationId,
    project_id: existing.fk_project_id,
    assessment_id: existing.fk_assessment_id,
    created_at: existing.created_at,
    messages: messages.map((m: any) => ({
      message_id: m.message_id,
      role: String(m.role).trim(),
      content: m.content,
      tool_name: m.tool_name ? String(m.tool_name).trim() : null,
      tool_call_id: m.tool_call_id ? String(m.tool_call_id).trim() : null,
      created_at: m.created_at,
    })),
    has_more: false,
  };
}

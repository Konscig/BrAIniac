import prisma from '../../db.js';

export type ItemStatus = 'pending' | 'running' | 'completed' | 'skipped' | 'failed';

export async function upsertItem(data: {
  fk_assessment_id: number;
  fk_document_id: number;
  item_index: number;
  status: ItemStatus;
  attempt_count?: number;
  agent_output_json?: any;
  tool_call_trace_json?: any;
  failure_class?: string;
  failure_detail_json?: any;
}) {
  return prisma.judgeAssessmentItem.upsert({
    where: { fk_assessment_id_item_index: { fk_assessment_id: data.fk_assessment_id, item_index: data.item_index } },
    create: data,
    update: {
      status: data.status,
      ...(data.attempt_count !== undefined ? { attempt_count: data.attempt_count } : {}),
      ...(data.agent_output_json !== undefined ? { agent_output_json: data.agent_output_json } : {}),
      ...(data.tool_call_trace_json !== undefined ? { tool_call_trace_json: data.tool_call_trace_json } : {}),
      ...(data.failure_class !== undefined ? { failure_class: data.failure_class } : {}),
      ...(data.failure_detail_json !== undefined ? { failure_detail_json: data.failure_detail_json } : {}),
    },
  });
}

export async function listNonTerminal(assessment_id: number) {
  return prisma.judgeAssessmentItem.findMany({
    where: { fk_assessment_id: assessment_id, status: { notIn: ['completed', 'skipped'] } },
    orderBy: { item_index: 'asc' },
  });
}

export async function listAllItems(assessment_id: number) {
  return prisma.judgeAssessmentItem.findMany({
    where: { fk_assessment_id: assessment_id },
    orderBy: { item_index: 'asc' },
  });
}

export async function markTerminal(
  item_id: number,
  status: 'completed' | 'skipped' | 'failed',
  failure_class?: string,
  failure_detail_json?: any,
) {
  return prisma.judgeAssessmentItem.update({
    where: { item_id },
    data: {
      status,
      ...(failure_class !== undefined ? { failure_class } : {}),
      ...(failure_detail_json !== undefined ? { failure_detail_json } : {}),
    },
  });
}

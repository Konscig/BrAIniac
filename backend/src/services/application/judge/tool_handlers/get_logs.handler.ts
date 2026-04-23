import { getAssessmentForOwner } from '../../../data/judge_assessment.service.js';
import { listAllItems } from '../../../data/judge_assessment_item.service.js';

export async function handleGetLogs(args: Record<string, any>, userId: number) {
  const assessmentId = Number(args?.assessment_id ?? args?.id);
  const itemId = Number(args?.assessment_item_id ?? args?.item_id);
  if (!Number.isInteger(assessmentId) || assessmentId <= 0) return { error: 'assessment_id required' };
  const assessment = await getAssessmentForOwner(assessmentId, userId);
  if (!assessment) return { error: 'not found' };
  const items = await listAllItems(assessmentId);
  const filtered = Number.isInteger(itemId) && itemId > 0
    ? items.filter((it: any) => it.item_id === itemId)
    : items;
  return {
    assessment_id: assessmentId,
    items: filtered.map((it: any) => ({
      item_id: it.item_id,
      item_index: it.item_index,
      document_id: it.fk_document_id,
      status: String(it.status).trim(),
      failure_class: it.failure_class ? String(it.failure_class).trim() : null,
      tool_call_trace: it.tool_call_trace_json ?? [],
      agent_output: it.agent_output_json ?? null,
    })),
  };
}

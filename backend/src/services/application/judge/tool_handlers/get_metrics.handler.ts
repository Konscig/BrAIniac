import { getAssessmentForOwner } from '../../../data/judge_assessment.service.js';
import { listByAssessment as listScores } from '../../../data/metric_score.service.js';

export async function handleGetMetrics(args: Record<string, any>, userId: number) {
  const assessmentId = Number(args?.assessment_id ?? args?.id);
  if (!Number.isInteger(assessmentId) || assessmentId <= 0) return { error: 'assessment_id required' };
  const assessment = await getAssessmentForOwner(assessmentId, userId);
  if (!assessment) return { error: 'not found' };
  const scores = await listScores(assessmentId);
  const byCode: Record<string, number> = {};
  for (const s of scores as any[]) {
    byCode[s.metric.code] = Math.max(byCode[s.metric.code] ?? -Infinity, Number(s.value));
  }
  return {
    assessment_id: assessmentId,
    status: String(assessment.status).trim(),
    metrics: byCode,
    final_score: assessment.final_score ? Number(assessment.final_score) : null,
    verdict: assessment.verdict ? String(assessment.verdict).trim() : null,
  };
}

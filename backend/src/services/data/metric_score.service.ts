import prisma from '../../db.js';

export async function upsertScore(data: {
  fk_assessment_id: number;
  fk_metric_id: number;
  fk_node_id: number;
  value: number;
  sample_size: number;
  contributing_axis: string;
  origin_reason: string;
  executor_used: 'native' | 'sidecar';
  aggregation_method?: string;
  normalization_applied_json?: any;
  details_json?: any;
}) {
  return prisma.metricScore.upsert({
    where: {
      fk_assessment_id_fk_metric_id_fk_node_id: {
        fk_assessment_id: data.fk_assessment_id,
        fk_metric_id: data.fk_metric_id,
        fk_node_id: data.fk_node_id,
      },
    },
    create: data,
    update: {
      value: data.value,
      sample_size: data.sample_size,
      origin_reason: data.origin_reason,
      executor_used: data.executor_used,
      ...(data.aggregation_method !== undefined ? { aggregation_method: data.aggregation_method } : {}),
      ...(data.normalization_applied_json !== undefined ? { normalization_applied_json: data.normalization_applied_json } : {}),
      ...(data.details_json !== undefined ? { details_json: data.details_json } : {}),
    },
  });
}

export async function listByAssessment(assessment_id: number) {
  return prisma.metricScore.findMany({
    where: { fk_assessment_id: assessment_id },
    include: { metric: true, node: true },
  });
}

export async function listByRunTaskOrAssessment(params: { assessment_id?: number; node_id?: number }) {
  return prisma.metricScore.findMany({
    where: {
      ...(params.assessment_id !== undefined ? { fk_assessment_id: params.assessment_id } : {}),
      ...(params.node_id !== undefined ? { fk_node_id: params.node_id } : {}),
    },
    include: { metric: true },
  });
}

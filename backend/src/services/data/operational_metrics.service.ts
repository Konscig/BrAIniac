import prisma from '../../db.js';

export async function upsertOperational(data: {
  fk_assessment_id: number;
  p95_latency_ms?: number | null;
  total_cost_usd?: number | null;
  total_tokens_in?: number | null;
  total_tokens_out?: number | null;
  fail_rate?: number | null;
  failure_taxonomy_json?: any;
  hard_gate_status?: string | null;
}) {
  return prisma.operationalMetrics.upsert({
    where: { fk_assessment_id: data.fk_assessment_id },
    create: data,
    update: {
      ...(data.p95_latency_ms !== undefined ? { p95_latency_ms: data.p95_latency_ms } : {}),
      ...(data.total_cost_usd !== undefined ? { total_cost_usd: data.total_cost_usd } : {}),
      ...(data.total_tokens_in !== undefined ? { total_tokens_in: data.total_tokens_in } : {}),
      ...(data.total_tokens_out !== undefined ? { total_tokens_out: data.total_tokens_out } : {}),
      ...(data.fail_rate !== undefined ? { fail_rate: data.fail_rate } : {}),
      ...(data.failure_taxonomy_json !== undefined ? { failure_taxonomy_json: data.failure_taxonomy_json } : {}),
      ...(data.hard_gate_status !== undefined ? { hard_gate_status: data.hard_gate_status } : {}),
    },
  });
}

export async function getByAssessment(fk_assessment_id: number) {
  return prisma.operationalMetrics.findUnique({ where: { fk_assessment_id } });
}

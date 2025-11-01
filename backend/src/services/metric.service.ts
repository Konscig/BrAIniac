import prisma from '../db.js';

export async function createMetric(data: { name: string; value: number }) {
  const m = await prisma.metric.create({ data: { name: data.name, value: data.value } });
  return m;
}

export async function listMetrics() {
  return prisma.metric.findMany();
}

export async function getMetricById(id: string) {
  return prisma.metric.findUnique({ where: { id } });
}

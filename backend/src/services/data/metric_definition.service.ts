import prisma from '../../db.js';

export async function findByCode(code: string) {
  return prisma.metricDefinition.findUnique({ where: { code } });
}

export async function listByAxis(axis: string) {
  return prisma.metricDefinition.findMany({ where: { axis } });
}

export async function listAll() {
  return prisma.metricDefinition.findMany();
}

export async function upsertDefinition(data: {
  code: string;
  axis: string;
  title: string;
  requires_reference: boolean;
  executor: 'native' | 'sidecar';
  description?: string;
  source?: string;
}) {
  return prisma.metricDefinition.upsert({
    where: { code: data.code },
    create: data,
    update: {
      axis: data.axis,
      title: data.title,
      requires_reference: data.requires_reference,
      executor: data.executor,
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.source !== undefined ? { source: data.source } : {}),
    },
  });
}

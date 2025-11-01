import prisma from '../db.js';

export async function createRun(data: { pipelineVersion: string; author?: string | null; mode: string }) {
  const r = await prisma.run.create({ data: {
    pipelineVersionId: data.pipelineVersion,
    authorId: data.author ?? null,
    mode: data.mode,
    status: 'pending',
  }});
  return r;
}

export async function startRun(id: string) {
  const run = await prisma.run.update({ where: { id }, data: { status: 'running' } });
  return run;
}

export async function completeRun(id: string, success: boolean) {
  const status = success ? 'succeeded' : 'failed';
  return prisma.run.update({ where: { id }, data: { status } });
}

export async function getRunById(id: string) {
  return prisma.run.findUnique({ where: { id } });
}

export async function listRuns() {
  return prisma.run.findMany();
}

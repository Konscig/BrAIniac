import prisma from '../db.js';

export async function createRunTask(data: { runId: string; nodeId: string; worker: string; logsUri?: string; outputJson?: any }) {
  const t = await prisma.runTask.create({ data: {
    runId: data.runId,
    nodeId: data.nodeId,
    worker: data.worker,
    status: 'pending',
    attempt: 1,
    metric: null,
    logsUri: data.logsUri ?? '',
    outputJson: data.outputJson ?? {},
  }});
  return t;
}

export async function startRunTask(id: string, worker: string) {
  return prisma.runTask.update({ where: { id }, data: { status: 'running', worker } });
}

export async function retryRunTask(id: string) {
  const t = await prisma.runTask.findUnique({ where: { id } });
  if (!t) throw new Error('not found');
  return prisma.runTask.update({ where: { id }, data: { attempt: (t.attempt ?? 1) + 1 } });
}

export async function completeRunTask(id: string, outputJson: any, success: boolean) {
  const status = success ? 'done' : 'failed';
  return prisma.runTask.update({ where: { id }, data: { status, outputJson } });
}

export async function listRunTasks(runId?: string) {
  if (!runId) return prisma.runTask.findMany();
  return prisma.runTask.findMany({ where: { runId } });
}

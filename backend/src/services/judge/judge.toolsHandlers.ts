import prisma from '../../db.js';

export const judgeToolHandlers = {
  async getNode({ id }: { id: string }) {
    const node = await prisma.node.findUnique({ where: { id } });
    return node ?? { error: "Node not found" };
  },

  async getMetrics({ id }: { id: string }) {
    const metrics = await prisma.runTask.findMany({ where: { id } });
    return metrics;
  },

  async getLogs({ id }: { id: string }) {
    const logs = await prisma.runTask.findMany({ where: { id } });
    return logs;
  },

    /* чето такое, пока тоже TODO
    export async function runTask(pipelineId: string, projectId: string) {
        const task = await prisma.ranTask.create({ data: {
            pipelineId,
            projectId,
            status: 'pending',
        }});
        // Тут можно добавить логику запуска задачи в фоне, например через очередь задач
        return task;
    }
    */
};
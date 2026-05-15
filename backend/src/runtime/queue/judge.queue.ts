import { readQueueIntEnv, withRuntimeQueueSlot } from './runtime-queue.js';

export function withJudgeQueue<T>(ownerId: number | string | undefined, run: () => Promise<T>): Promise<T> {
  return withRuntimeQueueSlot(
    {
      queueName: 'judge-assessment',
      workloadType: 'judge-assessment',
      ownerId,
      maxActive: readQueueIntEnv('JUDGE_QUEUE_CONCURRENCY', 2),
      maxWaiting: readQueueIntEnv('JUDGE_QUEUE_WAITING_LIMIT', 32),
      waitTimeoutMs: readQueueIntEnv('JUDGE_QUEUE_WAIT_MS', 60_000),
      leaseMs: readQueueIntEnv('JUDGE_QUEUE_LEASE_MS', 120_000),
    },
    run,
  );
}

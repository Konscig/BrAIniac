import { acquireRuntimeQueueSlot, readQueueIntEnv, withRuntimeQueueSlot } from './runtime-queue.js';

function heavyToolQueueOptions(ownerId: number | string | undefined) {
  return {
    queueName: 'heavy-tool',
    workloadType: 'tool-contract',
    ownerId,
    maxActive: readQueueIntEnv('JUDGE_TOOL_EXECUTOR_HEAVY_LIMIT', 2),
    maxWaiting: readQueueIntEnv('JUDGE_TOOL_EXECUTOR_HEAVY_QUEUE_LIMIT', 32),
    waitTimeoutMs: readQueueIntEnv('JUDGE_TOOL_EXECUTOR_HEAVY_WAIT_MS', 60_000),
    leaseMs: readQueueIntEnv('JUDGE_TOOL_EXECUTOR_HEAVY_LEASE_MS', 120_000),
  };
}

export function withHeavyToolQueue<T>(ownerId: number | string | undefined, run: () => Promise<T>): Promise<T> {
  return withRuntimeQueueSlot(heavyToolQueueOptions(ownerId), run);
}

export function acquireHeavyToolQueueSlot(ownerId: number | string | undefined): Promise<{ release: () => Promise<void> }> {
  return acquireRuntimeQueueSlot(heavyToolQueueOptions(ownerId));
}

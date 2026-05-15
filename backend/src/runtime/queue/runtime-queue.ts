import { Queue } from 'bullmq';
import { HttpError } from '../../common/http-error.js';
import { requireRedisClient } from '../redis.client.js';
import { redisKey } from '../redis.keys.js';

type RuntimeQueueOptions = {
  queueName: string;
  workloadType: string;
  ownerId: number | string | undefined;
  maxActive: number;
  maxWaiting: number;
  waitTimeoutMs: number;
  leaseMs: number;
};

export type RuntimeQueueDiagnostics = {
  queue: string;
  workload_type: string;
  active: number;
  waiting: number;
  max_active: number;
  max_waiting: number;
};

const queues = new Map<string, Queue>();

function readPositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function readQueueIntEnv(name: string, fallback: number): number {
  return readPositive(Number(process.env[name]), fallback);
}

function redisConnectionOptions() {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname && url.pathname !== '/' ? Number(url.pathname.slice(1)) : undefined,
  };
}

export function getRuntimeQueue(queueName: string): Queue {
  const normalized = queueName.trim() || 'runtime';
  let queue = queues.get(normalized);
  if (!queue) {
    queue = new Queue(normalized, {
      connection: redisConnectionOptions(),
      prefix: redisKey('bullmq'),
    });
    queues.set(normalized, queue);
  }
  return queue;
}

function slotKey(queueName: string, kind: 'active' | 'waiting'): string {
  return redisKey('queue', queueName, kind);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readCounter(key: string): Promise<number> {
  const redis = await requireRedisClient('runtime queue unavailable');
  const value = Number(await redis.get(key));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export async function getRuntimeQueueDiagnostics(options: RuntimeQueueOptions): Promise<RuntimeQueueDiagnostics> {
  return {
    queue: options.queueName,
    workload_type: options.workloadType,
    active: await readCounter(slotKey(options.queueName, 'active')),
    waiting: await readCounter(slotKey(options.queueName, 'waiting')),
    max_active: options.maxActive,
    max_waiting: options.maxWaiting,
  };
}

function queueBusy(details: RuntimeQueueDiagnostics): never {
  throw new HttpError(503, {
    ok: false,
    code: 'RUNTIME_QUEUE_BUSY',
    error: 'runtime queue is busy',
    retryable: true,
    details,
  });
}

export async function withRuntimeQueueSlot<T>(options: RuntimeQueueOptions, run: () => Promise<T>): Promise<T> {
  const lease = await acquireRuntimeQueueSlot(options);
  try {
    return await run();
  } finally {
    await lease.release();
  }
}

export async function acquireRuntimeQueueSlot(options: RuntimeQueueOptions): Promise<{ release: () => Promise<void> }> {
  const redis = await requireRedisClient('runtime queue unavailable');
  const queue = getRuntimeQueue(options.queueName);
  const activeKey = slotKey(options.queueName, 'active');
  const waitingKey = slotKey(options.queueName, 'waiting');
  const startedAt = Date.now();
  let acquired = false;
  const job = await queue.add(
    options.workloadType,
    { owner_id: options.ownerId ?? null, requested_at: new Date().toISOString() },
    { removeOnComplete: { age: 600, count: 1000 }, removeOnFail: { age: 1800, count: 1000 } },
  );

  const waiting = await redis.incr(waitingKey);
  await redis.pExpire(waitingKey, options.leaseMs);
  if (waiting > options.maxWaiting) {
    await redis.decr(waitingKey);
    await job.remove().catch(() => {});
    queueBusy(await getRuntimeQueueDiagnostics(options));
  }

  try {
    while (Date.now() - startedAt <= options.waitTimeoutMs) {
      const active = await redis.incr(activeKey);
      await redis.pExpire(activeKey, options.leaseMs);
      if (active <= options.maxActive) {
        acquired = true;
        await redis.decr(waitingKey);
        await job.updateProgress({ state: 'running', active });
        return {
          release: async () => {
            await redis.decr(activeKey).catch(() => {});
            await job.remove().catch(() => {});
          },
        };
      }
      await redis.decr(activeKey);
      await sleep(Math.min(250, Math.max(25, Math.floor(options.waitTimeoutMs / 10))));
    }

    queueBusy(await getRuntimeQueueDiagnostics(options));
  } finally {
    if (!acquired) {
      await redis.decr(waitingKey).catch(() => {});
      await job.remove().catch(() => {});
    }
  }

  throw new Error('runtime queue slot acquisition ended unexpectedly');
}

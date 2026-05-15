import { getRedisClient } from './redis.client.js';
import { redisKey } from './redis.keys.js';

export type RuntimeProgressEvent = {
  scope: string;
  type: string;
  resource_id: string;
  ts: number;
  data: Record<string, unknown>;
};

const DEFAULT_PROGRESS_MAX_LEN = 500;

function streamKey(scope: string, resourceId: string): string {
  return redisKey('progress', scope, resourceId);
}

function maxLen(): number {
  const parsed = Number(process.env.RUNTIME_PROGRESS_MAX_LEN);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_PROGRESS_MAX_LEN;
}

export async function publishProgressEvent(event: RuntimeProgressEvent): Promise<void> {
  try {
    const redis = await getRedisClient();
    if (!redis) return;
    await redis.xAdd(
      streamKey(event.scope, event.resource_id),
      '*',
      {
        type: event.type,
        ts: String(event.ts),
        data: JSON.stringify(event.data),
      },
      { TRIM: { strategy: 'MAXLEN', strategyModifier: '~', threshold: maxLen() } },
    );
  } catch {
    // Realtime progress degrades to polling when Redis is unavailable.
  }
}

export async function readProgressEvents(scope: string, resourceId: string, fromId = '0-0'): Promise<RuntimeProgressEvent[]> {
  try {
    const redis = await getRedisClient();
    if (!redis) return [];
    const rows = await redis.xRange(streamKey(scope, resourceId), fromId, '+', { COUNT: maxLen() });
    return rows.map((row) => {
      const rawData = typeof row.message.data === 'string' ? row.message.data : '{}';
      let data: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(rawData);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          data = parsed as Record<string, unknown>;
        }
      } catch {
        data = {};
      }
      return {
        scope,
        resource_id: resourceId,
        type: String(row.message.type ?? 'progress'),
        ts: Number(row.message.ts ?? Date.now()),
        data,
      };
    });
  } catch {
    return [];
  }
}

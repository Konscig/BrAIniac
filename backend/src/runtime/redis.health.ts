import { isRedisRequired, pingRedis } from './redis.client.js';

export type RuntimeHealth = {
  ok: boolean;
  redis: {
    status: 'ok' | 'unavailable';
    required: boolean;
    latency_ms?: number;
    error?: string | null;
  };
  degraded: string[];
  fail_closed: string[];
};

export async function getRuntimeHealth(): Promise<RuntimeHealth> {
  const ping = await pingRedis();
  const required = isRedisRequired();

  if (ping.ok) {
    return {
      ok: true,
      redis: {
        status: 'ok',
        required,
        latency_ms: ping.latency_ms,
      },
      degraded: [],
      fail_closed: [],
    };
  }

  return {
    ok: false,
    redis: {
      status: 'unavailable',
      required,
      error: ping.error,
    },
    degraded: ['cache', 'progress'],
    fail_closed: ['auth-refresh', 'rate-limit', 'execution', 'queue', 'provider'],
  };
}


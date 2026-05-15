const DEFAULT_REDIS_KEY_PREFIX = 'brainiac:dev';

function normalizeSegment(value: string): string {
  return value
    .trim()
    .replace(/:+/g, ':')
    .replace(/[^a-zA-Z0-9:_\-./]/g, '_');
}

function normalizePatternSegment(value: string): string {
  return value
    .trim()
    .replace(/:+/g, ':')
    .replace(/[^a-zA-Z0-9:_\-./*]/g, '_');
}

export function getRedisKeyPrefix(): string {
  const raw = (process.env.REDIS_KEY_PREFIX ?? DEFAULT_REDIS_KEY_PREFIX).trim();
  return normalizeSegment(raw || DEFAULT_REDIS_KEY_PREFIX).replace(/:+$/g, '');
}

export function redisKey(...segments: Array<string | number | boolean | null | undefined>): string {
  const normalized = segments
    .filter((segment) => segment !== undefined && segment !== null && String(segment).trim().length > 0)
    .map((segment) => normalizeSegment(String(segment)));
  return [getRedisKeyPrefix(), ...normalized].join(':');
}

export function redisPattern(...segments: Array<string | number | boolean | null | undefined>): string {
  const normalized = segments
    .filter((segment) => segment !== undefined && segment !== null && String(segment).trim().length > 0)
    .map((segment) => normalizePatternSegment(String(segment)));
  return [getRedisKeyPrefix(), ...normalized].join(':');
}

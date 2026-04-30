// Deterministic seeded sampling for reproducible assessments.
// Uses mulberry32 PRNG for stable cross-run shuffles.

export const DEFAULT_SAMPLE_FRACTION = 0.2;
export const DEFAULT_SAMPLE_SEED = 42;

export type SampleSpec = {
  fraction?: number;
  size?: number;
  seed?: number;
};

export type SampleResult<T> = {
  selected: T[];
  indices: number[];
  seed: number;
  size: number;
  fraction: number;
  total: number;
};

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

function clampFraction(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_SAMPLE_FRACTION;
  if (value <= 0) return DEFAULT_SAMPLE_FRACTION;
  if (value >= 1) return 1;
  return value;
}

export function resolveSampleSize(total: number, spec: SampleSpec | undefined): { size: number; fraction: number } {
  const fraction = clampFraction(spec?.fraction);
  if (typeof spec?.size === 'number' && Number.isInteger(spec.size) && spec.size > 0) {
    const size = Math.min(spec.size, total);
    return { size, fraction: total > 0 ? size / total : 0 };
  }
  const size = Math.max(1, Math.min(total, Math.round(total * fraction)));
  return { size, fraction };
}

export function deterministicSample<T>(items: T[], spec: SampleSpec | undefined): SampleResult<T> {
  const total = items.length;
  const seed = typeof spec?.seed === 'number' && Number.isFinite(spec.seed) ? Math.floor(spec.seed) : DEFAULT_SAMPLE_SEED;
  const { size, fraction } = resolveSampleSize(total, spec);

  const rng = mulberry32(seed);
  const indexed = items.map((_, i) => i);
  for (let i = indexed.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [indexed[i], indexed[j]] = [indexed[j]!, indexed[i]!];
  }
  const indices = indexed.slice(0, size).sort((a, b) => a - b);
  const selected = indices.map((i) => items[i]!);
  return { selected, indices, seed, size, fraction, total };
}

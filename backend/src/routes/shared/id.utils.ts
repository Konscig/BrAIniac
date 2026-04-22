export function parseId(raw: unknown): number | null {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

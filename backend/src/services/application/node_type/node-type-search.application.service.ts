import { listNodeTypeCatalogEntries } from './node_type.application.service.js';

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function matchesQuery(values: unknown[], query: string): boolean {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return true;
  return values.some((value) => normalize(value).includes(normalizedQuery));
}

export async function searchNodeTypeCatalog(options: {
  query?: string;
  capability?: string;
  category?: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(Number(options.limit ?? 20), 1), 50);
  const query = options.query ?? options.capability ?? '';
  const category = normalize(options.category);
  const nodeTypes = await listNodeTypeCatalogEntries();

  return nodeTypes
    .filter((nodeType) => !category || normalize(nodeType.category) === category)
    .filter((nodeType) => matchesQuery([nodeType.name, nodeType.desc, nodeType.category], query))
    .slice(0, limit);
}

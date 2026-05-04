import { listToolEntries } from './tool.application.service.js';
import { searchNodeTypeCatalog } from '../node_type/node-type-search.application.service.js';

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function stringifyConfig(value: unknown): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '';
  }
}

export async function searchToolCatalog(options: { query?: string; capability?: string; limit?: number }) {
  const limit = Math.min(Math.max(Number(options.limit ?? 20), 1), 50);
  const query = normalize(options.query ?? options.capability ?? '');
  const [tools, nodeTypes] = await Promise.all([listToolEntries(), searchNodeTypeCatalog({ query, limit: 50 })]);

  return tools
    .filter((tool) => {
      if (!query) return true;
      return normalize(tool.name).includes(query) || normalize(stringifyConfig(tool.config_json)).includes(query);
    })
    .slice(0, limit)
    .map((tool) => ({
      tool,
      linked_node_types: nodeTypes.filter((nodeType) => nodeType.fk_tool_id === tool.tool_id),
    }));
}

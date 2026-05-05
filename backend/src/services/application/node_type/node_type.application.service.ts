import { HttpError } from '../../../common/http-error.js';
import { createNodeType, deleteNodeType, getNodeTypeById, listNodeTypes, updateNodeType } from '../../data/node_type.service.js';
import { getToolById } from '../../data/tool.service.js';

export type NodeTypeCatalogEntry = {
  node_type_id: number;
  name: string;
  desc: string;
  category: string | null;
  fk_tool_id: number;
  runtime_support_state: 'supported' | 'unsupported';
  config_schema: unknown;
  default_config: unknown;
};

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readCategory(configJson: unknown): string | null {
  const config = readObject(configJson);
  const role = config?.role;
  return typeof role === 'string' && role.trim().length > 0 ? role.trim() : null;
}

function toCatalogEntry(nodeType: Awaited<ReturnType<typeof getNodeTypeById>>): NodeTypeCatalogEntry {
  if (!nodeType) {
    throw new HttpError(404, { error: 'not found' });
  }

  return {
    node_type_id: nodeType.type_id,
    name: nodeType.name.trim(),
    desc: nodeType.desc.trim(),
    category: readCategory(nodeType.config_json),
    fk_tool_id: nodeType.fk_tool_id,
    runtime_support_state: nodeType.config_json ? 'supported' : 'unsupported',
    config_schema: nodeType.config_json ?? null,
    default_config: nodeType.config_json ?? {},
  };
}

async function ensureToolExists(toolId: number) {
  const tool = await getToolById(toolId);
  if (!tool) {
    throw new HttpError(404, { error: 'tool not found' });
  }
}

function ensureNodeTypeFields(name: unknown, desc: unknown) {
  if (typeof name !== 'string' || name.trim().length === 0 || typeof desc !== 'string' || desc.trim().length === 0) {
    throw new HttpError(400, { error: 'fk_tool_id, name and desc required' });
  }

  return { name, desc };
}

export async function createNodeTypeEntry(data: {
  fk_tool_id: number;
  name: unknown;
  desc: unknown;
  config_json?: any;
}) {
  const { name, desc } = ensureNodeTypeFields(data.name, data.desc);
  await ensureToolExists(data.fk_tool_id);

  return createNodeType({
    fk_tool_id: data.fk_tool_id,
    name,
    desc,
    ...(data.config_json !== undefined ? { config_json: data.config_json } : {}),
  });
}

export async function listNodeTypeEntries(fkToolId?: number) {
  return listNodeTypes(fkToolId);
}

export async function listNodeTypeCatalogEntries(options: { includeUnsupported?: boolean; fkToolId?: number } = {}) {
  const items = await listNodeTypes(options.fkToolId);
  const catalog = items.map(toCatalogEntry);
  return options.includeUnsupported ? catalog : catalog.filter((item) => item.runtime_support_state === 'supported');
}

export async function getNodeTypeEntryById(typeId: number) {
  const item = await getNodeTypeById(typeId);
  if (!item) {
    throw new HttpError(404, { error: 'not found' });
  }
  return item;
}

export async function getNodeTypeCatalogEntryById(typeId: number) {
  return toCatalogEntry(await getNodeTypeEntryById(typeId));
}

export async function updateNodeTypeEntryById(
  typeId: number,
  patch: { name?: unknown; desc?: unknown; config_json?: any },
) {
  await getNodeTypeEntryById(typeId);

  const normalizedPatch: { name?: string; desc?: string; config_json?: any } = {};
  if (patch.name !== undefined) {
    if (typeof patch.name !== 'string' || patch.name.trim().length === 0) {
      throw new HttpError(400, { error: 'invalid name' });
    }
    normalizedPatch.name = patch.name;
  }
  if (patch.desc !== undefined) {
    if (typeof patch.desc !== 'string' || patch.desc.trim().length === 0) {
      throw new HttpError(400, { error: 'invalid desc' });
    }
    normalizedPatch.desc = patch.desc;
  }
  if (patch.config_json !== undefined) {
    normalizedPatch.config_json = patch.config_json;
  }

  return updateNodeType(typeId, normalizedPatch);
}

export async function deleteNodeTypeEntryById(typeId: number) {
  await getNodeTypeEntryById(typeId);
  await deleteNodeType(typeId);
}

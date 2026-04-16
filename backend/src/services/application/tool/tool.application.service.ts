import { HttpError } from '../common/http-error.js';
import { createTool, deleteTool, getToolById, listTools, updateTool } from './tool.service.js';

function ensureToolName(name: unknown) {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new HttpError(400, { error: 'name required' });
  }

  return name;
}

export async function createToolEntry(data: { name: unknown; config_json?: any }) {
  const name = ensureToolName(data.name);
  return createTool({ name, ...(data.config_json !== undefined ? { config_json: data.config_json } : {}) });
}

export async function listToolEntries() {
  return listTools();
}

export async function getToolEntryById(toolId: number) {
  const item = await getToolById(toolId);
  if (!item) {
    throw new HttpError(404, { error: 'not found' });
  }
  return item;
}

export async function updateToolEntryById(toolId: number, patch: { name?: unknown; config_json?: any }) {
  await getToolEntryById(toolId);

  const normalizedPatch: { name?: string; config_json?: any } = {};
  if (patch.name !== undefined) {
    normalizedPatch.name = ensureToolName(patch.name);
  }
  if (patch.config_json !== undefined) {
    normalizedPatch.config_json = patch.config_json;
  }

  return updateTool(toolId, normalizedPatch);
}

export async function deleteToolEntryById(toolId: number) {
  await getToolEntryById(toolId);
  await deleteTool(toolId);
}

import { HttpError } from '../../../common/http-error.js';
import { getNodeTypeById } from '../../data/node_type.service.js';

export type NodeConfigValidationDiagnostic = {
  code: string;
  message: string;
  path?: string;
};

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function hasHiddenToolBinding(value: unknown, path = 'configJson'): boolean {
  const record = readObject(value);
  if (!record) return false;

  for (const [key, nested] of Object.entries(record)) {
    if (key === 'tool_ref' || key === 'tool_refs') {
      return true;
    }
    if (hasHiddenToolBinding(nested, `${path}.${key}`)) {
      return true;
    }
  }

  return false;
}

export async function validateNodeConfigForType(nodeTypeId: number, configJson: unknown) {
  const nodeType = await getNodeTypeById(nodeTypeId);
  if (!nodeType) {
    throw new HttpError(404, { error: 'node type not found' });
  }

  const errors: NodeConfigValidationDiagnostic[] = [];
  const warnings: NodeConfigValidationDiagnostic[] = [];

  if (!nodeType.config_json) {
    errors.push({
      code: 'NODE_TYPE_UNSUPPORTED',
      message: 'node type is not creatable through MCP authoring',
    });
  }

  if (configJson !== undefined && configJson !== null && !readObject(configJson)) {
    errors.push({
      code: 'NODE_CONFIG_INVALID_SHAPE',
      message: 'configJson must be an object when provided',
      path: 'configJson',
    });
  }

  if (hasHiddenToolBinding(configJson)) {
    errors.push({
      code: 'MCP_HIDDEN_TOOL_BINDING',
      message: 'hidden tool_ref/tool_refs bindings are not supported',
      path: 'configJson',
    });
  }

  if (configJson === undefined || configJson === null) {
    warnings.push({
      code: 'NODE_CONFIG_EMPTY',
      message: 'empty configJson will rely on node type defaults',
      path: 'configJson',
    });
  }

  return {
    node_type_id: nodeType.type_id,
    config_json: configJson ?? {},
    valid: errors.length === 0,
    errors,
    warnings,
    normalized_config: readObject(configJson) ?? {},
  };
}

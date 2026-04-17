import { documentLoaderToolContractDefinition } from './document-loader.tool.js';
import { queryBuilderToolContractDefinition } from './query-builder.tool.js';
import type { ToolContractDefinition, ToolContractName } from './tool-contract.types.js';

const TOOL_CONTRACT_DEFINITIONS: ToolContractDefinition[] = [
  documentLoaderToolContractDefinition,
  queryBuilderToolContractDefinition,
];

const TOOL_CONTRACT_ALIAS_MAP = buildToolContractAliasMap(TOOL_CONTRACT_DEFINITIONS);

function buildToolContractAliasMap(definitions: ToolContractDefinition[]): Map<string, ToolContractDefinition> {
  const out = new Map<string, ToolContractDefinition>();

  for (const definition of definitions) {
    out.set(definition.name.toLowerCase(), definition);

    for (const alias of definition.aliases) {
      out.set(alias.trim().toLowerCase(), definition);
    }
  }

  return out;
}

export function resolveToolContractDefinition(rawName: string): ToolContractDefinition | undefined {
  const name = rawName.trim().toLowerCase();
  if (!name) return undefined;
  return TOOL_CONTRACT_ALIAS_MAP.get(name);
}

export function listSupportedToolContracts(): ToolContractName[] {
  return TOOL_CONTRACT_DEFINITIONS.map((definition) => definition.name);
}

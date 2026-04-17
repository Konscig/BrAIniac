import { listEdgesByPipeline } from '../data/edge.service.js';
import { listNodesByPipeline } from '../data/node.service.js';
import { getNodeTypeById } from '../data/node_type.service.js';
import { getPipelineById } from '../data/pipeline.service.js';

export type ValidationMode = 'strict' | 'relaxed';
export type ProfileFallbackMode = 'warn' | 'strict' | 'off';
export type RoleValidationMode = 'off' | 'warn' | 'strict';
export type GraphValidationPreset = 'default' | 'production' | 'dev';

export interface GraphValidationOptions {
  mode: ValidationMode;
  includeWarnings: boolean;
  profileFallback: ProfileFallbackMode;
  enforceLoopPolicies: boolean;
  requireExecutionBudgets: boolean;
  roleValidationMode: RoleValidationMode;
}

export interface GraphDiagnostic {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface GraphValidationMetrics {
  nodeCount: number;
  edgeCount: number;
  maxInDegree: number;
  maxOutDegree: number;
  cycleCount: number;
  guardedCycleCount: number;
  unguardedCycleCount: number;
  estimatedMaxSteps: number;
  startNodeCount: number;
  endNodeCount: number;
}

export interface GraphValidationResult {
  valid: boolean;
  errors: GraphDiagnostic[];
  warnings: GraphDiagnostic[];
  metrics: GraphValidationMetrics;
}

type NodeRecord = {
  node_id: number;
  fk_type_id: number;
};

type EdgeRecord = {
  fk_from_node: number;
  fk_to_node: number;
};

const DEFAULT_OPTIONS: GraphValidationOptions = {
  mode: 'strict',
  includeWarnings: true,
  profileFallback: 'warn',
  enforceLoopPolicies: true,
  requireExecutionBudgets: false,
  roleValidationMode: 'warn',
};

const PRESET_OPTIONS: Record<GraphValidationPreset, Partial<GraphValidationOptions>> = {
  default: {
    ...DEFAULT_OPTIONS,
  },
  dev: {
    mode: 'strict',
    includeWarnings: true,
    profileFallback: 'warn',
    enforceLoopPolicies: true,
    requireExecutionBudgets: false,
    roleValidationMode: 'warn',
  },
  production: {
    mode: 'strict',
    includeWarnings: true,
    profileFallback: 'strict',
    enforceLoopPolicies: true,
    requireExecutionBudgets: true,
    roleValidationMode: 'strict',
  },
};

export function parseGraphValidationPreset(value: unknown): GraphValidationPreset | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'default' || normalized === 'dev' || normalized === 'production') {
    return normalized;
  }
  return undefined;
}

export function getGraphValidationPresetOptions(preset: GraphValidationPreset): Partial<GraphValidationOptions> {
  return { ...(PRESET_OPTIONS[preset] ?? PRESET_OPTIONS.default) };
}

function normalizeMode(value: any): ValidationMode | undefined {
  if (value === 'strict' || value === 'relaxed') return value;
  return undefined;
}

function normalizeProfileFallback(value: any): ProfileFallbackMode | undefined {
  if (value === 'warn' || value === 'strict' || value === 'off') return value;
  return undefined;
}

function normalizeRoleValidationMode(value: any): RoleValidationMode | undefined {
  if (value === 'off' || value === 'warn' || value === 'strict') return value;
  return undefined;
}

function normalizeOptions(overrides?: Partial<GraphValidationOptions>): GraphValidationOptions {
  return {
    mode: normalizeMode(overrides?.mode) ?? DEFAULT_OPTIONS.mode,
    includeWarnings: typeof overrides?.includeWarnings === 'boolean' ? overrides.includeWarnings : DEFAULT_OPTIONS.includeWarnings,
    profileFallback: normalizeProfileFallback(overrides?.profileFallback) ?? DEFAULT_OPTIONS.profileFallback,
    enforceLoopPolicies:
      typeof overrides?.enforceLoopPolicies === 'boolean' ? overrides.enforceLoopPolicies : DEFAULT_OPTIONS.enforceLoopPolicies,
    requireExecutionBudgets:
      typeof overrides?.requireExecutionBudgets === 'boolean'
        ? overrides.requireExecutionBudgets
        : DEFAULT_OPTIONS.requireExecutionBudgets,
    roleValidationMode: normalizeRoleValidationMode(overrides?.roleValidationMode) ?? DEFAULT_OPTIONS.roleValidationMode,
  };
}

function toNumberOrNull(value: any): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getLoopLimitStatus(configJson: any): 'missing' | 'invalid' | 'valid' {
  if (!configJson || typeof configJson !== 'object') return 'missing';

  const loop = (configJson as any).loop;
  if (loop === undefined || loop === null) return 'missing';
  if (typeof loop !== 'object') return 'invalid';

  const maxIterations = toNumberOrNull((loop as any).maxIterations);
  if (maxIterations === null || !Number.isInteger(maxIterations) || maxIterations <= 0) return 'invalid';

  return 'valid';
}

function getLoopMaxIterations(configJson: any): number {
  if (!configJson || typeof configJson !== 'object') return 1;
  const loop = (configJson as any).loop;
  if (!loop || typeof loop !== 'object') return 1;
  const maxIterations = toNumberOrNull((loop as any).maxIterations);
  if (maxIterations === null || !Number.isInteger(maxIterations) || maxIterations <= 0) return 1;
  return maxIterations;
}

function getRange(configJson: any, key: 'input' | 'output'): { min: number; max: number } | null {
  if (!configJson || typeof configJson !== 'object') return null;
  const section = (configJson as any)[key];
  if (!section || typeof section !== 'object') return null;

  const min = toNumberOrNull((section as any).min);
  const max = toNumberOrNull((section as any).max);
  if (min === null || max === null) return null;
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min) return null;

  return { min, max };
}

function getRole(configJson: any): string {
  if (!configJson || typeof configJson !== 'object') return 'transform';
  const role = (configJson as any).role;
  return typeof role === 'string' && role.trim() ? role.trim() : 'transform';
}

function getRoleList(configJson: any, key: 'allowedPredecessorRoles' | 'allowedSuccessorRoles'): string[] | null {
  if (!configJson || typeof configJson !== 'object') return null;
  const value = (configJson as any)[key];
  if (!Array.isArray(value)) return null;
  const normalized = value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return normalized.length > 0 ? normalized : null;
}

function buildAdjacency(edges: EdgeRecord[]) {
  const adjacency = new Map<number, number[]>();
  const selfLoops = new Set<number>();

  for (const edge of edges) {
    if (edge.fk_from_node === edge.fk_to_node) {
      selfLoops.add(edge.fk_from_node);
    }
    const list = adjacency.get(edge.fk_from_node) ?? [];
    list.push(edge.fk_to_node);
    adjacency.set(edge.fk_from_node, list);
  }

  return { adjacency, selfLoops };
}

function findCycleComponents(nodeIds: number[], adjacency: Map<number, number[]>, selfLoops: Set<number>) {
  let indexCounter = 0;
  const indexByNode = new Map<number, number>();
  const lowLinkByNode = new Map<number, number>();
  const stack: number[] = [];
  const onStack = new Set<number>();
  const components: number[][] = [];

  const strongConnect = (nodeId: number) => {
    indexByNode.set(nodeId, indexCounter);
    lowLinkByNode.set(nodeId, indexCounter);
    indexCounter += 1;

    stack.push(nodeId);
    onStack.add(nodeId);

    const neighbors = adjacency.get(nodeId) ?? [];
    for (const neighbor of neighbors) {
      if (!indexByNode.has(neighbor)) {
        strongConnect(neighbor);
        lowLinkByNode.set(nodeId, Math.min(lowLinkByNode.get(nodeId)!, lowLinkByNode.get(neighbor)!));
      } else if (onStack.has(neighbor)) {
        lowLinkByNode.set(nodeId, Math.min(lowLinkByNode.get(nodeId)!, indexByNode.get(neighbor)!));
      }
    }

    if (lowLinkByNode.get(nodeId) === indexByNode.get(nodeId)) {
      const component: number[] = [];
      while (stack.length > 0) {
        const member = stack.pop()!;
        onStack.delete(member);
        component.push(member);
        if (member === nodeId) break;
      }
      components.push(component);
    }
  };

  for (const nodeId of nodeIds) {
    if (!indexByNode.has(nodeId)) {
      strongConnect(nodeId);
    }
  }

  return components.filter((component) => {
    if (component.length > 1) return true;
    if (component.length === 0) return false;
    return selfLoops.has(component[0]!);
  });
}

export async function validatePipelineGraph(
  pipelineId: number,
  overrides?: Partial<GraphValidationOptions>,
): Promise<GraphValidationResult> {
  const options = normalizeOptions(overrides);

  const [pipeline, rawNodes, rawEdges] = await Promise.all([
    getPipelineById(pipelineId),
    listNodesByPipeline(pipelineId),
    listEdgesByPipeline(pipelineId),
  ]);

  if (!pipeline) {
    return {
      valid: false,
      errors: [
        {
          code: 'GRAPH_PIPELINE_NOT_FOUND',
          message: 'pipeline not found',
          details: { pipelineId },
        },
      ],
      warnings: [],
      metrics: {
        nodeCount: 0,
        edgeCount: 0,
        maxInDegree: 0,
        maxOutDegree: 0,
        cycleCount: 0,
        guardedCycleCount: 0,
        unguardedCycleCount: 0,
        estimatedMaxSteps: 0,
        startNodeCount: 0,
        endNodeCount: 0,
      },
    };
  }

  const nodes = rawNodes as NodeRecord[];
  const edges = rawEdges as EdgeRecord[];
  const nodeIds = nodes.map((node) => node.node_id);
  const nodeSet = new Set(nodeIds);

  const inDegree = new Map<number, number>();
  const outDegree = new Map<number, number>();
  const nodeById = new Map<number, NodeRecord>();
  for (const node of nodes) {
    nodeById.set(node.node_id, node);
    inDegree.set(node.node_id, 0);
    outDegree.set(node.node_id, 0);
  }

  for (const edge of edges) {
    if (!nodeSet.has(edge.fk_from_node) || !nodeSet.has(edge.fk_to_node)) continue;
    outDegree.set(edge.fk_from_node, (outDegree.get(edge.fk_from_node) ?? 0) + 1);
    inDegree.set(edge.fk_to_node, (inDegree.get(edge.fk_to_node) ?? 0) + 1);
  }

  const typeIds = [...new Set(nodes.map((node) => node.fk_type_id))];
  const nodeTypeMap = new Map<number, any>();
  for (const typeId of typeIds) {
    nodeTypeMap.set(typeId, await getNodeTypeById(typeId));
  }

  const errors: GraphDiagnostic[] = [];
  const warnings: GraphDiagnostic[] = [];

  const addWarning = (diagnostic: GraphDiagnostic) => {
    if (options.includeWarnings) warnings.push(diagnostic);
  };

  const addRoleViolation = (diagnostic: GraphDiagnostic) => {
    if (options.roleValidationMode === 'strict') errors.push(diagnostic);
    else if (options.roleValidationMode === 'warn') addWarning(diagnostic);
  };

  // Optional role/range checks (off/warn/strict).
  if (options.roleValidationMode !== 'off') {
    for (const node of nodes) {
      const nodeType = nodeTypeMap.get(node.fk_type_id);
      const configJson = nodeType?.config_json;

      if (!configJson && options.profileFallback === 'strict') {
        errors.push({
          code: 'GRAPH_NODETYPE_PROFILE_MISSING',
          message: 'node type profile is missing',
          details: { nodeId: node.node_id, nodeTypeId: node.fk_type_id },
        });
      } else if (!configJson && options.profileFallback === 'warn') {
        addWarning({
          code: 'GRAPH_PROFILE_DEFAULTED',
          message: 'profile defaults applied',
          details: { nodeId: node.node_id, nodeTypeId: node.fk_type_id },
        });
      }

      const inputRange = getRange(configJson, 'input') ?? { min: 0, max: 10 };
      const outputRange = getRange(configJson, 'output') ?? { min: 0, max: 10 };
      const inValue = inDegree.get(node.node_id) ?? 0;
      const outValue = outDegree.get(node.node_id) ?? 0;

      if (inValue < inputRange.min || inValue > inputRange.max) {
        addRoleViolation({
          code: 'GRAPH_ROLE_INPUT_LIMIT',
          message: 'incoming degree is outside configured range',
          details: { nodeId: node.node_id, inDegree: inValue, range: inputRange },
        });
      }

      if (outValue < outputRange.min || outValue > outputRange.max) {
        addRoleViolation({
          code: 'GRAPH_ROLE_OUTPUT_LIMIT',
          message: 'outgoing degree is outside configured range',
          details: { nodeId: node.node_id, outDegree: outValue, range: outputRange },
        });
      }
    }

    for (const edge of edges) {
      const fromNode = nodeById.get(edge.fk_from_node);
      const toNode = nodeById.get(edge.fk_to_node);
      if (!fromNode || !toNode) continue;

      const fromConfig = nodeTypeMap.get(fromNode.fk_type_id)?.config_json;
      const toConfig = nodeTypeMap.get(toNode.fk_type_id)?.config_json;
      const fromRole = getRole(fromConfig);
      const toRole = getRole(toConfig);

      const successorRoles = getRoleList(fromConfig, 'allowedSuccessorRoles');
      const predecessorRoles = getRoleList(toConfig, 'allowedPredecessorRoles');

      const successorViolation =
        successorRoles && !successorRoles.includes('any') && !successorRoles.includes(toRole);
      const predecessorViolation =
        predecessorRoles && !predecessorRoles.includes('any') && !predecessorRoles.includes(fromRole);

      if (successorViolation || predecessorViolation) {
        addRoleViolation({
          code: 'GRAPH_ROLE_COMPATIBILITY',
          message: 'role pair is outside configured compatibility',
          details: {
            fromNodeId: fromNode.node_id,
            toNodeId: toNode.node_id,
            fromRole,
            toRole,
          },
        });
      }
    }
  }

  // Structural hard checks.
  const seenEdgePairs = new Set<string>();
  for (const edge of edges) {
    if (!nodeSet.has(edge.fk_from_node) || !nodeSet.has(edge.fk_to_node)) continue;

    if (edge.fk_from_node === edge.fk_to_node) {
      addWarning({
        code: 'GRAPH_SELF_LOOP',
        message: 'self-loop detected; treated as cycle and validated by loop policy',
        details: { nodeId: edge.fk_from_node },
      });
    }

    const key = `${edge.fk_from_node}:${edge.fk_to_node}`;
    if (seenEdgePairs.has(key)) {
      errors.push({
        code: 'GRAPH_DUPLICATE_EDGE',
        message: 'duplicate edge pair found',
        details: { fk_from_node: edge.fk_from_node, fk_to_node: edge.fk_to_node },
      });
    }
    seenEdgePairs.add(key);
  }

  const { adjacency, selfLoops } = buildAdjacency(edges);
  const cycleComponents = findCycleComponents(nodeIds, adjacency, selfLoops);

  let guardedCycleCount = 0;
  let unguardedCycleCount = 0;
  let estimatedMaxSteps = nodes.length + edges.length;

  for (const component of cycleComponents) {
    let hasValid = false;
    let hasInvalid = false;
    let componentMaxIterations = 1;

    for (const nodeId of component) {
      const node = nodeById.get(nodeId);
      if (!node) continue;
      const nodeType = nodeTypeMap.get(node.fk_type_id);
      const configJson = nodeType?.config_json;

      const status = getLoopLimitStatus(configJson);
      if (status === 'valid') hasValid = true;
      if (status === 'invalid') hasInvalid = true;

      componentMaxIterations = Math.max(componentMaxIterations, getLoopMaxIterations(configJson));
    }

    estimatedMaxSteps += component.length * Math.max(0, componentMaxIterations - 1);

    if (!options.enforceLoopPolicies) {
      guardedCycleCount += 1;
      addWarning({
        code: 'GRAPH_GUARDED_CYCLE',
        message: 'cycle detected (loop policy enforcement disabled)',
        details: { cycleNodeIds: component },
      });
      continue;
    }

    if (hasValid) {
      guardedCycleCount += 1;
      addWarning({
        code: 'GRAPH_GUARDED_CYCLE',
        message: 'guarded cycle detected',
        details: { cycleNodeIds: component },
      });
      continue;
    }

    unguardedCycleCount += 1;

    if (hasInvalid) {
      errors.push({
        code: 'GRAPH_LOOP_MAX_ITER_INVALID',
        message: 'cycle requires loop.maxIterations >= 1',
        details: { cycleNodeIds: component },
      });
    } else {
      errors.push({
        code: 'GRAPH_LOOP_POLICY_REQUIRED',
        message: 'cycle requires loop policy',
        details: { cycleNodeIds: component },
      });
      errors.push({
        code: 'GRAPH_UNGUARDED_CYCLE',
        message: 'cycle is unguarded',
        details: { cycleNodeIds: component },
      });
    }
  }

  if (options.requireExecutionBudgets) {
    const missing: string[] = [];
    if (!(Number((pipeline as any).max_time) > 0)) missing.push('max_time');
    if (!(Number((pipeline as any).max_cost) > 0)) missing.push('max_cost');

    if (missing.length > 0) {
      addWarning({
        code: 'GRAPH_EXECUTION_BUDGET_MISSING',
        message: 'execution budgets are incomplete',
        details: { missingFields: missing },
      });
    }
  }

  const inValues = [...inDegree.values()];
  const outValues = [...outDegree.values()];
  const startNodeCount = inValues.filter((value) => value === 0).length;
  const endNodeCount = outValues.filter((value) => value === 0).length;

  const metrics: GraphValidationMetrics = {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    maxInDegree: inValues.length > 0 ? Math.max(...inValues) : 0,
    maxOutDegree: outValues.length > 0 ? Math.max(...outValues) : 0,
    cycleCount: cycleComponents.length,
    guardedCycleCount,
    unguardedCycleCount,
    estimatedMaxSteps,
    startNodeCount,
    endNodeCount,
  };

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metrics,
  };
}

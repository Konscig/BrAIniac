export const BRAINIAC_RESOURCE_SCHEME = 'brainiac';

export type BrainiacResourceKind =
  | 'projects'
  | 'project'
  | 'project-pipelines'
  | 'project-export'
  | 'pipeline'
  | 'pipeline-graph'
  | 'pipeline-validation'
  | 'pipeline-execution'
  | 'pipeline-agents'
  | 'pipeline-node'
  | 'pipeline-export'
  | 'pipeline-node-export'
  | 'tools'
  | 'tool';

export type BrainiacResourceUriParts = {
  kind: BrainiacResourceKind;
  projectId?: number;
  pipelineId?: number;
  nodeId?: number;
  executionId?: string;
  toolId?: number;
};

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
}

function encodeId(value: string | number): string {
  return encodeURIComponent(String(value));
}

function parsePositiveInteger(value: string | undefined, label: string): number {
  if (value === undefined || value.trim() === '') {
    throw new Error(`${label} is required`);
  }

  const parsed = Number(value);
  assertPositiveInteger(parsed, label);
  return parsed;
}

export function projectListUri(): string {
  return 'brainiac://projects';
}

export function projectUri(projectId: number): string {
  assertPositiveInteger(projectId, 'projectId');
  return `brainiac://projects/${projectId}`;
}

export function projectPipelinesUri(projectId: number): string {
  assertPositiveInteger(projectId, 'projectId');
  return `brainiac://projects/${projectId}/pipelines`;
}

export function projectExportUri(projectId: number): string {
  assertPositiveInteger(projectId, 'projectId');
  return `brainiac://projects/${projectId}/export`;
}

export function pipelineUri(pipelineId: number): string {
  assertPositiveInteger(pipelineId, 'pipelineId');
  return `brainiac://pipelines/${pipelineId}`;
}

export function pipelineGraphUri(pipelineId: number): string {
  assertPositiveInteger(pipelineId, 'pipelineId');
  return `brainiac://pipelines/${pipelineId}/graph`;
}

export function pipelineValidationUri(pipelineId: number): string {
  assertPositiveInteger(pipelineId, 'pipelineId');
  return `brainiac://pipelines/${pipelineId}/validation`;
}

export function pipelineExecutionUri(pipelineId: number, executionId: string): string {
  assertPositiveInteger(pipelineId, 'pipelineId');
  if (executionId.trim() === '') {
    throw new Error('executionId is required');
  }
  return `brainiac://pipelines/${pipelineId}/executions/${encodeId(executionId)}`;
}

export function pipelineAgentsUri(pipelineId: number): string {
  assertPositiveInteger(pipelineId, 'pipelineId');
  return `brainiac://pipelines/${pipelineId}/agents`;
}

export function pipelineNodeUri(pipelineId: number, nodeId: number): string {
  assertPositiveInteger(pipelineId, 'pipelineId');
  assertPositiveInteger(nodeId, 'nodeId');
  return `brainiac://pipelines/${pipelineId}/nodes/${nodeId}`;
}

export function pipelineExportUri(pipelineId: number): string {
  assertPositiveInteger(pipelineId, 'pipelineId');
  return `brainiac://pipelines/${pipelineId}/export`;
}

export function pipelineNodeExportUri(pipelineId: number, nodeId: number): string {
  assertPositiveInteger(pipelineId, 'pipelineId');
  assertPositiveInteger(nodeId, 'nodeId');
  return `brainiac://pipelines/${pipelineId}/nodes/${nodeId}/export`;
}

export function toolListUri(): string {
  return 'brainiac://tools';
}

export function toolUri(toolId: number): string {
  assertPositiveInteger(toolId, 'toolId');
  return `brainiac://tools/${toolId}`;
}

export function parseBrainiacResourceUri(uri: string): BrainiacResourceUriParts {
  const parsed = new URL(uri);

  if (parsed.protocol !== `${BRAINIAC_RESOURCE_SCHEME}:`) {
    throw new Error(`Unsupported resource URI scheme: ${parsed.protocol}`);
  }

  const segments = [
    parsed.hostname,
    ...parsed.pathname.split('/').filter((segment) => segment.length > 0),
  ];

  if (segments.length === 1 && segments[0] === 'projects') {
    return { kind: 'projects' };
  }

  if (segments.length === 1 && segments[0] === 'tools') {
    return { kind: 'tools' };
  }

  if (segments[0] === 'projects') {
    const projectId = parsePositiveInteger(segments[1], 'projectId');

    if (segments.length === 2) {
      return { kind: 'project', projectId };
    }
    if (segments.length === 3 && segments[2] === 'pipelines') {
      return { kind: 'project-pipelines', projectId };
    }
    if (segments.length === 3 && segments[2] === 'export') {
      return { kind: 'project-export', projectId };
    }
  }

  if (segments[0] === 'pipelines') {
    const pipelineId = parsePositiveInteger(segments[1], 'pipelineId');

    if (segments.length === 2) {
      return { kind: 'pipeline', pipelineId };
    }
    if (segments.length === 3 && segments[2] === 'graph') {
      return { kind: 'pipeline-graph', pipelineId };
    }
    if (segments.length === 3 && segments[2] === 'validation') {
      return { kind: 'pipeline-validation', pipelineId };
    }
    if (segments.length === 3 && segments[2] === 'agents') {
      return { kind: 'pipeline-agents', pipelineId };
    }
    if (segments.length === 3 && segments[2] === 'export') {
      return { kind: 'pipeline-export', pipelineId };
    }
    if (segments.length === 4 && segments[2] === 'executions') {
      return {
        kind: 'pipeline-execution',
        pipelineId,
        executionId: decodeURIComponent(segments[3] ?? ''),
      };
    }
    if (segments.length === 4 && segments[2] === 'nodes') {
      return {
        kind: 'pipeline-node',
        pipelineId,
        nodeId: parsePositiveInteger(segments[3], 'nodeId'),
      };
    }
    if (segments.length === 5 && segments[2] === 'nodes' && segments[4] === 'export') {
      return {
        kind: 'pipeline-node-export',
        pipelineId,
        nodeId: parsePositiveInteger(segments[3], 'nodeId'),
      };
    }
  }

  if (segments[0] === 'tools' && segments.length === 2) {
    return {
      kind: 'tool',
      toolId: parsePositiveInteger(segments[1], 'toolId'),
    };
  }

  throw new Error(`Unsupported BrAIniac resource URI: ${uri}`);
}

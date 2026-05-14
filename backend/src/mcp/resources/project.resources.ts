import { ResourceTemplate, type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpJsonEnvelope, toMcpJsonContent, type McpResourceLink } from '../serializers/mcp-safe-json.js';
import { pipelineUri, projectListUri, projectPipelinesUri, projectUri } from '../serializers/mcp-resource-uri.js';
import { requireMcpUserId } from '../mcp.auth.js';
import { listProjectsForUser, getProjectByIdForUser } from '../../services/application/project/project.application.service.js';
import { listPipelinesByOwner } from '../../services/data/pipeline.service.js';

type ProjectSummary = {
  project_id: number;
  name: string;
  pipeline_count: number;
  resource_uri: string;
};

function normalizeName(value: string): string {
  return value.trim();
}

function projectContent(kind: string, resourceUri: string, data: unknown, links: McpResourceLink[] = []) {
  const envelope = createMcpJsonEnvelope({
    kind,
    resourceUri,
    data,
    links,
  });
  const content = toMcpJsonContent(envelope);
  return { contents: [{ ...content, uri: envelope.resource_uri }] };
}

async function listProjectSummaries(userId: number): Promise<ProjectSummary[]> {
  const [projects, pipelines] = await Promise.all([listProjectsForUser(userId), listPipelinesByOwner(userId)]);
  const pipelineCountByProjectId = new Map<number, number>();

  for (const pipeline of pipelines) {
    pipelineCountByProjectId.set(pipeline.fk_project_id, (pipelineCountByProjectId.get(pipeline.fk_project_id) ?? 0) + 1);
  }

  return projects.map((project) => ({
    project_id: project.project_id,
    name: normalizeName(project.name),
    pipeline_count: pipelineCountByProjectId.get(project.project_id) ?? 0,
    resource_uri: projectUri(project.project_id),
  }));
}

export function registerProjectResources(server: McpServer): void {
  server.registerResource(
    'brainiac-projects',
    projectListUri(),
    {
      title: 'BrAIniac Projects',
      description: 'Owner-scoped BrAIniac project list.',
      mimeType: 'application/json',
    },
    async (_uri, extra) => {
      const userId = requireMcpUserId(extra);
      const projects = await listProjectSummaries(userId);
      return projectContent('projects', projectListUri(), { projects });
    },
  );

  server.registerResource(
    'brainiac-project',
    new ResourceTemplate('brainiac://projects/{projectId}', {
      list: async (extra) => {
        const userId = requireMcpUserId(extra);
        const projects = await listProjectSummaries(userId);
        return {
          resources: projects.map((project) => ({
            uri: project.resource_uri,
            name: `Project ${project.project_id}: ${project.name}`,
            title: project.name,
            description: `${project.pipeline_count} pipelines`,
            mimeType: 'application/json',
          })),
        };
      },
    }),
    {
      title: 'BrAIniac Project',
      description: 'One owner-scoped BrAIniac project with pipeline links.',
      mimeType: 'application/json',
    },
    async (_uri, variables, extra) => {
      const userId = requireMcpUserId(extra);
      const projectId = Number(variables.projectId);
      const project = await getProjectByIdForUser(projectId, userId);
      const pipelines = (await listPipelinesByOwner(userId)).filter((pipeline) => pipeline.fk_project_id === projectId);

      return projectContent(
        'project',
        projectUri(project.project_id),
        {
          project_id: project.project_id,
          name: normalizeName(project.name),
          pipeline_count: pipelines.length,
          pipelines: pipelines.map((pipeline) => ({
            pipeline_id: pipeline.pipeline_id,
            name: normalizeName(pipeline.name),
            resource_uri: pipelineUri(pipeline.pipeline_id),
          })),
        },
        [{ uri: projectPipelinesUri(project.project_id), name: `Project ${project.project_id} pipelines` }],
      );
    },
  );
}

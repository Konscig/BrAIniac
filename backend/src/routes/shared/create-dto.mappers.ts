import { HttpError } from '../../common/http-error.js';
import {
  optionalFiniteNumber,
  optionalId,
  requiredFiniteNumber,
  requiredId,
  requiredNonEmptyString,
} from './req-parse.js';

function toBodyRecord(body: unknown): Record<string, any> {
  if (!body || typeof body !== 'object') {
    return {};
  }
  return body as Record<string, any>;
}

export type AuthCredentialsDTO = {
  email: string;
  password: string;
};

export function mapAuthCredentialsDTO(body: unknown): AuthCredentialsDTO {
  const source = toBodyRecord(body);

  return {
    email: requiredNonEmptyString(source.email, 'email and password required'),
    password: requiredNonEmptyString(source.password, 'email and password required'),
  };
}

export type EdgeCreateDTO = {
  fk_from_node: number;
  fk_to_node: number;
};

export function mapEdgeCreateDTO(body: unknown): EdgeCreateDTO {
  const source = toBodyRecord(body);

  return {
    fk_from_node: requiredId(source.fk_from_node, 'fk_from_node and fk_to_node required'),
    fk_to_node: requiredId(source.fk_to_node, 'fk_from_node and fk_to_node required'),
  };
}

export type PipelineCreateDTO = {
  fk_project_id: number;
  name: string;
  max_time: number;
  max_cost: number;
  max_reject: number;
  score?: number;
  report_json?: any;
};

export function mapPipelineCreateDTO(body: unknown): PipelineCreateDTO {
  const source = toBodyRecord(body);
  const dto: PipelineCreateDTO = {
    fk_project_id: requiredId(source.fk_project_id, 'fk_project_id required'),
    name: requiredNonEmptyString(source.name, 'name required'),
    max_time: requiredFiniteNumber(source.max_time, 'max_time, max_cost and max_reject must be numbers'),
    max_cost: requiredFiniteNumber(source.max_cost, 'max_time, max_cost and max_reject must be numbers'),
    max_reject: requiredFiniteNumber(source.max_reject, 'max_time, max_cost and max_reject must be numbers'),
  };

  const score = optionalFiniteNumber(source.score, 'score must be a number');
  if (score !== undefined) dto.score = score;
  if (source.report_json !== undefined) dto.report_json = source.report_json;

  return dto;
}

export type NodeCreateDTO = {
  fk_pipeline_id: number;
  fk_type_id: number;
  fk_sub_pipeline?: number;
  top_k: number;
  ui_json: any;
  output_json?: any;
};

export function mapNodeCreateDTO(body: unknown): NodeCreateDTO {
  const source = toBodyRecord(body);
  if (source.ui_json === undefined) {
    throw new HttpError(400, { error: 'ui_json required' });
  }

  const dto: NodeCreateDTO = {
    fk_pipeline_id: requiredId(source.fk_pipeline_id, 'fk_pipeline_id and fk_type_id required'),
    fk_type_id: requiredId(source.fk_type_id, 'fk_pipeline_id and fk_type_id required'),
    top_k: requiredFiniteNumber(source.top_k, 'top_k must be a number'),
    ui_json: source.ui_json,
  };

  const fkSubPipeline = optionalId(source.fk_sub_pipeline, 'invalid fk_sub_pipeline');
  if (fkSubPipeline !== undefined) dto.fk_sub_pipeline = fkSubPipeline;
  if (source.output_json !== undefined) dto.output_json = source.output_json;

  return dto;
}

export type DatasetCreateDTO = {
  fk_pipeline_id: number;
  uri: string;
  desc?: string;
};

export function mapDatasetCreateDTO(body: unknown): DatasetCreateDTO {
  const source = toBodyRecord(body);
  const dto: DatasetCreateDTO = {
    fk_pipeline_id: requiredId(source.fk_pipeline_id, 'fk_pipeline_id and uri required'),
    uri: requiredNonEmptyString(source.uri, 'fk_pipeline_id and uri required'),
  };

  if (source.desc !== undefined) dto.desc = source.desc;
  return dto;
}

export type ProjectCreateDTO = {
  name: string;
};

export function mapProjectCreateDTO(body: unknown): ProjectCreateDTO {
  const source = toBodyRecord(body);

  return {
    name: requiredNonEmptyString(source.name, 'name required'),
  };
}

export type ToolCreateDTO = {
  name: string;
  config_json?: any;
};

export function mapToolCreateDTO(body: unknown): ToolCreateDTO {
  const source = toBodyRecord(body);
  const dto: ToolCreateDTO = {
    name: requiredNonEmptyString(source.name, 'name required'),
  };

  if (source.config_json !== undefined) dto.config_json = source.config_json;
  return dto;
}

export type NodeTypeCreateDTO = {
  fk_tool_id: number;
  name: string;
  desc: string;
  config_json?: any;
};

export function mapNodeTypeCreateDTO(body: unknown): NodeTypeCreateDTO {
  const source = toBodyRecord(body);
  const dto: NodeTypeCreateDTO = {
    fk_tool_id: requiredId(source.fk_tool_id, 'fk_tool_id, name and desc required'),
    name: requiredNonEmptyString(source.name, 'fk_tool_id, name and desc required'),
    desc: requiredNonEmptyString(source.desc, 'fk_tool_id, name and desc required'),
  };

  if (source.config_json !== undefined) dto.config_json = source.config_json;
  return dto;
}

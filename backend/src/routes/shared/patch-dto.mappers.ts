import { HttpError } from '../../common/http-error.js';
import {
  optionalFiniteNumber,
  optionalId,
} from './req-parse.js';

function toBodyRecord(body: unknown): Record<string, any> {
  if (!body || typeof body !== 'object') {
    return {};
  }
  return body as Record<string, any>;
}

export type PipelinePatchDTO = {
  name?: string;
  max_time?: number;
  max_cost?: number;
  max_reject?: number;
  score?: number | null;
  report_json?: any;
};

export function mapPipelinePatchDTO(body: unknown): PipelinePatchDTO {
  const source = toBodyRecord(body);
  const patch: PipelinePatchDTO = {};

  if (source.name !== undefined) {
    if (typeof source.name !== 'string' || source.name.trim().length === 0) {
      throw new HttpError(400, { error: 'invalid name' });
    }
    patch.name = source.name.trim();
  }
  if (source.max_time !== undefined) {
    const maxTime = optionalFiniteNumber(source.max_time, 'invalid max_time');
    if (maxTime !== undefined) patch.max_time = maxTime;
  }
  if (source.max_cost !== undefined) {
    const maxCost = optionalFiniteNumber(source.max_cost, 'invalid max_cost');
    if (maxCost !== undefined) patch.max_cost = maxCost;
  }
  if (source.max_reject !== undefined) {
    const maxReject = optionalFiniteNumber(source.max_reject, 'invalid max_reject');
    if (maxReject !== undefined) patch.max_reject = maxReject;
  }
  if (source.score !== undefined) {
    if (source.score === null) patch.score = null;
    else {
      const score = optionalFiniteNumber(source.score, 'invalid score');
      if (score !== undefined) patch.score = score;
    }
  }
  if (source.report_json !== undefined) patch.report_json = source.report_json;

  return patch;
}

export type NodePatchDTO = {
  fk_type_id?: number;
  fk_sub_pipeline?: number | null;
  top_k?: number;
  ui_json?: any;
  output_json?: any;
};

export function mapNodePatchDTO(body: unknown): NodePatchDTO {
  const source = toBodyRecord(body);
  const patch: NodePatchDTO = {};

  if (source.fk_type_id !== undefined) {
    const fkTypeId = optionalId(source.fk_type_id, 'invalid fk_type_id');
    if (fkTypeId !== undefined) patch.fk_type_id = fkTypeId;
  }
  if (source.fk_sub_pipeline !== undefined) {
    if (source.fk_sub_pipeline === null) {
      patch.fk_sub_pipeline = null;
    } else {
      const fkSubPipelineId = optionalId(source.fk_sub_pipeline, 'invalid fk_sub_pipeline');
      if (fkSubPipelineId !== undefined) patch.fk_sub_pipeline = fkSubPipelineId;
    }
  }
  if (source.top_k !== undefined) {
    const topK = optionalFiniteNumber(source.top_k, 'invalid top_k');
    if (topK !== undefined) patch.top_k = topK;
  }
  if (source.ui_json !== undefined) patch.ui_json = source.ui_json;
  if (source.output_json !== undefined) patch.output_json = source.output_json;

  return patch;
}

export type DatasetPatchDTO = {
  desc?: string;
  uri?: string;
};

export function mapDatasetPatchDTO(body: unknown): DatasetPatchDTO {
  const source = toBodyRecord(body);
  const patch: DatasetPatchDTO = {};

  if (source.desc !== undefined) patch.desc = source.desc;
  if (source.uri !== undefined) patch.uri = source.uri;

  return patch;
}

export type ProjectPatchDTO = {
  name?: string;
};

export function mapProjectPatchDTO(body: unknown): ProjectPatchDTO {
  const source = toBodyRecord(body);
  const patch: ProjectPatchDTO = {};

  if (source.name !== undefined) {
    if (typeof source.name !== 'string' || source.name.trim().length === 0) {
      throw new HttpError(400, { error: 'invalid name' });
    }
    patch.name = source.name.trim();
  }

  return patch;
}

export type ToolPatchDTO = {
  name?: unknown;
  config_json?: any;
};

export function mapToolPatchDTO(body: unknown): ToolPatchDTO {
  const source = toBodyRecord(body);
  const patch: ToolPatchDTO = {};

  if (source.name !== undefined) patch.name = source.name;
  if (source.config_json !== undefined) patch.config_json = source.config_json;

  return patch;
}

export type NodeTypePatchDTO = {
  name?: unknown;
  desc?: unknown;
  config_json?: any;
};

export function mapNodeTypePatchDTO(body: unknown): NodeTypePatchDTO {
  const source = toBodyRecord(body);
  const patch: NodeTypePatchDTO = {};

  if (source.name !== undefined) patch.name = source.name;
  if (source.desc !== undefined) patch.desc = source.desc;
  if (source.config_json !== undefined) patch.config_json = source.config_json;

  return patch;
}

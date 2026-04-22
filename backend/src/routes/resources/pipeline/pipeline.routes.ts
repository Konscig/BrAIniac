import express from 'express';
import { createPipeline, listPipelines, listPipelinesByOwner, updatePipeline, deletePipeline } from '../../../services/data/pipeline.service.js';
import {
  parseGraphValidationPreset,
  validatePipelineGraph,
} from '../../../services/core/graph_validation.service.js';
import { ensurePipelineOwnedByUser, ensureProjectOwnedByUser } from '../../../services/core/ownership.service.js';
import {
  getPipelineExecutionForUser,
  startPipelineExecutionForUser,
} from '../../../services/application/pipeline/pipeline.executor.application.service.js';
import { HttpError } from '../../../common/http-error.js';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { optionalId, requiredId } from '../../shared/req-parse.js';
import { mapPipelineCreateDTO } from '../../shared/create-dto.mappers.js';
import { mapPipelinePatchDTO } from '../../shared/patch-dto.mappers.js';
import { sendRouteError } from '../../shared/route-error.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req: any, res: any) => {
  try {
    const dto = mapPipelineCreateDTO(req.body);

    await ensureProjectOwnedByUser(dto.fk_project_id, req.user.user_id);

    const p = await createPipeline(dto);
    res.status(201).json(p);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.get('/', async (req, res) => {
  try {
    const projectId = optionalId(req.query.fk_project_id, 'invalid fk_project_id');
    if (projectId !== undefined) {

      await ensureProjectOwnedByUser(projectId, (req as any).user.user_id);
      const list = await listPipelines(projectId);
      return res.json(list);
    }

    const list = await listPipelinesByOwner((req as any).user.user_id);
    res.json(list);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const pipelineId = requiredId(req.params.id, 'invalid id');

    const p = await ensurePipelineOwnedByUser(pipelineId, (req as any).user.user_id);
    res.json(p);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.post('/:id/validate-graph', async (req, res) => {
  try {
    const pipelineId = requiredId(req.params.id, 'invalid id');

    await ensurePipelineOwnedByUser(pipelineId, (req as any).user.user_id);

    const body = (req.body ?? {}) as Record<string, any>;
    const unsupportedFields = Object.keys(body).filter((key) => key !== 'preset');
    if (unsupportedFields.length > 0) {
      throw new HttpError(400, {
        error: 'validate-graph accepts preset only',
        details: { unsupported_fields: unsupportedFields },
      });
    }

    const rawPreset = req.query.preset ?? body.preset;
    const preset = parseGraphValidationPreset(rawPreset);
    if (rawPreset !== undefined && rawPreset !== null && rawPreset !== '' && !preset) {
      throw new HttpError(400, { error: 'invalid preset' });
    }

    const result = await validatePipelineGraph(pipelineId, preset ?? 'default');

    res.json(result);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.post('/:id/execute', async (req: any, res) => {
  try {
    const pipelineId = requiredId(req.params.id, 'invalid id');
    const body = (req.body ?? {}) as Record<string, any>;
    const unsupportedFields = Object.keys(body).filter((key) => !['preset', 'dataset_id', 'input_json'].includes(key));
    if (unsupportedFields.length > 0) {
      throw new HttpError(400, {
        error: 'execute accepts preset, dataset_id and input_json only',
        details: { unsupported_fields: unsupportedFields },
      });
    }

    const rawPreset = body.preset ?? req.query.preset;
    const preset = parseGraphValidationPreset(rawPreset);

    if (rawPreset !== undefined && rawPreset !== null && rawPreset !== '' && !preset) {
      throw new HttpError(400, { error: 'invalid preset' });
    }

    const datasetId = optionalId(body.dataset_id, 'invalid dataset_id');
    const executionId = await startPipelineExecutionForUser(
      pipelineId,
      req.user.user_id,
      {
        preset: preset ?? 'default',
        ...(datasetId !== undefined ? { dataset_id: datasetId } : {}),
        ...(body.input_json !== undefined ? { input_json: body.input_json } : {}),
      },
      typeof req.headers['x-idempotency-key'] === 'string' ? req.headers['x-idempotency-key'] : undefined,
    );

    res.status(202).json(executionId);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.get('/:id/executions/:executionId', async (req: any, res) => {
  try {
    const pipelineId = requiredId(req.params.id, 'invalid id');
    const executionId = String(req.params.executionId ?? '').trim();
    if (!executionId) {
      throw new HttpError(400, { error: 'invalid executionId' });
    }

    const snapshot = await getPipelineExecutionForUser(pipelineId, executionId, req.user.user_id);
    res.json(snapshot);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const pipelineId = requiredId(req.params.id, 'invalid id');

    await ensurePipelineOwnedByUser(pipelineId, (req as any).user.user_id);

    const patch = mapPipelinePatchDTO(req.body);

    const p = await updatePipeline(pipelineId, patch);
    res.json(p);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const pipelineId = requiredId(req.params.id, 'invalid id');

    await ensurePipelineOwnedByUser(pipelineId, (req as any).user.user_id);

    await deletePipeline(pipelineId);
    res.status(204).end();
  } catch (err) {
    return sendRouteError(res, err);
  }
});

export default router;

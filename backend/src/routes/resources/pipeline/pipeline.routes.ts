import express from 'express';
import { createPipeline, listPipelines, listPipelinesByOwner, updatePipeline, deletePipeline } from '../../../services/data/pipeline.service.js';
import { validatePipelineGraph } from '../../../services/core/graph_validation.service.js';
import { ensurePipelineOwnedByUser, ensureProjectOwnedByUser } from '../../../services/core/ownership.service.js';
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
    const result = await validatePipelineGraph(pipelineId, {
      ...(body.mode !== undefined ? { mode: body.mode } : {}),
      ...(body.includeWarnings !== undefined ? { includeWarnings: body.includeWarnings } : {}),
      ...(body.profileFallback !== undefined ? { profileFallback: body.profileFallback } : {}),
      ...(body.enforceLoopPolicies !== undefined ? { enforceLoopPolicies: body.enforceLoopPolicies } : {}),
      ...(body.requireExecutionBudgets !== undefined ? { requireExecutionBudgets: body.requireExecutionBudgets } : {}),
      ...(body.roleValidationMode !== undefined ? { roleValidationMode: body.roleValidationMode } : {}),
    });

    res.json(result);
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

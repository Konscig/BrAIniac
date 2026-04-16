import express from 'express';
import { createPipeline, listPipelines, listPipelinesByOwner, updatePipeline, deletePipeline } from '../services/pipeline.service.js';
import { validatePipelineGraph } from '../services/graph_validation.service.js';
import { ensurePipelineOwnedByUser, ensureProjectOwnedByUser } from '../services/ownership.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { optionalFiniteNumber, optionalId, requiredFiniteNumber, requiredId, requiredNonEmptyString } from './req-parse.js';
import { sendRouteError } from './route-error.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req: any, res: any) => {
  try {
    const fk_project_id = requiredId(req.body.fk_project_id, 'fk_project_id required');
    const max_time = requiredFiniteNumber(req.body.max_time, 'max_time, max_cost and max_reject must be numbers');
    const max_cost = requiredFiniteNumber(req.body.max_cost, 'max_time, max_cost and max_reject must be numbers');
    const max_reject = requiredFiniteNumber(req.body.max_reject, 'max_time, max_cost and max_reject must be numbers');
    const score = optionalFiniteNumber(req.body.score, 'score must be a number');
    const name = requiredNonEmptyString(req.body.name, 'name required');

    await ensureProjectOwnedByUser(fk_project_id, req.user.user_id);

    const p = await createPipeline({
      fk_project_id,
      name,
      max_time,
      max_cost,
      max_reject,
      ...(score !== undefined ? { score } : {}),
      ...(req.body.report_json !== undefined ? { report_json: req.body.report_json } : {}),
    });
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

    const patch: any = {};
    if (req.body.name !== undefined) patch.name = req.body.name;
    if (req.body.max_time !== undefined) {
      patch.max_time = optionalFiniteNumber(req.body.max_time, 'invalid max_time');
    }
    if (req.body.max_cost !== undefined) {
      patch.max_cost = optionalFiniteNumber(req.body.max_cost, 'invalid max_cost');
    }
    if (req.body.max_reject !== undefined) {
      patch.max_reject = optionalFiniteNumber(req.body.max_reject, 'invalid max_reject');
    }
    if (req.body.score !== undefined) {
      if (req.body.score === null) patch.score = null;
      else patch.score = optionalFiniteNumber(req.body.score, 'invalid score');
    }
    if (req.body.report_json !== undefined) patch.report_json = req.body.report_json;

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

import express from 'express';
import { createPipeline, listPipelines, listPipelinesByOwner, updatePipeline, deletePipeline } from '../services/pipeline.service.js';
import { validatePipelineGraph } from '../services/graph_validation.service.js';
import { ensurePipelineOwnedByUser, ensureProjectOwnedByUser } from '../services/ownership.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { parseId } from './id.utils.js';
import { sendRouteError } from './route-error.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req: any, res: any) => {
  try {
    const fk_project_id = parseId(req.body.fk_project_id);
    const max_time = Number(req.body.max_time);
    const max_cost = Number(req.body.max_cost);
    const max_reject = Number(req.body.max_reject);
    const score = req.body.score === undefined || req.body.score === null ? undefined : Number(req.body.score);

    if (!fk_project_id) return res.status(400).json({ error: 'fk_project_id required' });
    if (!req.body.name) return res.status(400).json({ error: 'name required' });
    if (!Number.isFinite(max_time) || !Number.isFinite(max_cost) || !Number.isFinite(max_reject)) {
      return res.status(400).json({ error: 'max_time, max_cost and max_reject must be numbers' });
    }
    if (score !== undefined && !Number.isFinite(score)) {
      return res.status(400).json({ error: 'score must be a number' });
    }

    await ensureProjectOwnedByUser(fk_project_id, req.user.user_id);

    const p = await createPipeline({
      fk_project_id,
      name: req.body.name,
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
    const projectIdRaw = req.query.fk_project_id as string | undefined;
    if (projectIdRaw !== undefined) {
      const projectId = parseId(projectIdRaw);
      if (!projectId) return res.status(400).json({ error: 'invalid fk_project_id' });

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
    const pipelineId = parseId(req.params.id);
    if (!pipelineId) return res.status(400).json({ error: 'invalid id' });

    const p = await ensurePipelineOwnedByUser(pipelineId, (req as any).user.user_id);
    res.json(p);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.post('/:id/validate-graph', async (req, res) => {
  try {
    const pipelineId = parseId(req.params.id);
    if (!pipelineId) return res.status(400).json({ error: 'invalid id' });

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
    const pipelineId = parseId(req.params.id);
    if (!pipelineId) return res.status(400).json({ error: 'invalid id' });

    await ensurePipelineOwnedByUser(pipelineId, (req as any).user.user_id);

    const patch: any = {};
    if (req.body.name !== undefined) patch.name = req.body.name;
    if (req.body.max_time !== undefined) {
      const value = Number(req.body.max_time);
      if (!Number.isFinite(value)) return res.status(400).json({ error: 'invalid max_time' });
      patch.max_time = value;
    }
    if (req.body.max_cost !== undefined) {
      const value = Number(req.body.max_cost);
      if (!Number.isFinite(value)) return res.status(400).json({ error: 'invalid max_cost' });
      patch.max_cost = value;
    }
    if (req.body.max_reject !== undefined) {
      const value = Number(req.body.max_reject);
      if (!Number.isFinite(value)) return res.status(400).json({ error: 'invalid max_reject' });
      patch.max_reject = value;
    }
    if (req.body.score !== undefined) {
      if (req.body.score === null) patch.score = null;
      else {
        const value = Number(req.body.score);
        if (!Number.isFinite(value)) return res.status(400).json({ error: 'invalid score' });
        patch.score = value;
      }
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
    const pipelineId = parseId(req.params.id);
    if (!pipelineId) return res.status(400).json({ error: 'invalid id' });

    await ensurePipelineOwnedByUser(pipelineId, (req as any).user.user_id);

    await deletePipeline(pipelineId);
    res.status(204).end();
  } catch (err) {
    return sendRouteError(res, err);
  }
});

export default router;

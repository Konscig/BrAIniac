import express from 'express';
import { createNode, updateNode, getNodeById, listNodesByPipeline, listNodesByOwner, deleteNode } from '../services/node.service.js';
import { getPipelineById } from '../services/pipeline.service.js';
import { getProjectById } from '../services/project.service.js';
import { getNodeTypeById } from '../services/node_type.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { parseId } from './id.utils.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req: any, res: any) => {
  try {
    const fk_pipeline_id = parseId(req.body.fk_pipeline_id);
    const fk_type_id = parseId(req.body.fk_type_id);
    let fk_sub_pipeline: number | undefined;
    if (req.body.fk_sub_pipeline !== undefined) {
      const parsedSubPipelineId = parseId(req.body.fk_sub_pipeline);
      if (!parsedSubPipelineId) {
        return res.status(400).json({ error: 'invalid fk_sub_pipeline' });
      }
      fk_sub_pipeline = parsedSubPipelineId;
    }
    const top_k = Number(req.body.top_k);

    if (!fk_pipeline_id || !fk_type_id) {
      return res.status(400).json({ error: 'fk_pipeline_id and fk_type_id required' });
    }
    if (!Number.isFinite(top_k)) {
      return res.status(400).json({ error: 'top_k must be a number' });
    }
    if (req.body.ui_json === undefined) {
      return res.status(400).json({ error: 'ui_json required' });
    }
    const pipeline = await getPipelineById(fk_pipeline_id);
    if (!pipeline) return res.status(404).json({ error: 'pipeline not found' });
    const project = await getProjectById(pipeline.fk_project_id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (project.fk_user_id !== req.user.user_id) return res.status(403).json({ error: 'forbidden' });

    const type = await getNodeTypeById(fk_type_id);
    if (!type) return res.status(404).json({ error: 'node type not found' });

    if (fk_sub_pipeline !== undefined) {
      const subPipeline = await getPipelineById(fk_sub_pipeline);
      if (!subPipeline) return res.status(404).json({ error: 'sub pipeline not found' });
      const subProject = await getProjectById(subPipeline.fk_project_id);
      if (!subProject) return res.status(404).json({ error: 'project not found' });
      if (subProject.fk_user_id !== req.user.user_id) return res.status(403).json({ error: 'forbidden' });
    }

    const n = await createNode({
      fk_pipeline_id,
      fk_type_id,
      ...(fk_sub_pipeline !== undefined ? { fk_sub_pipeline } : {}),
      top_k,
      ui_json: req.body.ui_json,
      ...(req.body.output_json !== undefined ? { output_json: req.body.output_json } : {}),
    });
    res.status(201).json(n);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const pipelineRaw = req.query.fk_pipeline_id as string | undefined;
    if (pipelineRaw !== undefined) {
      const pipelineId = parseId(pipelineRaw);
      if (!pipelineId) return res.status(400).json({ error: 'invalid fk_pipeline_id' });

      const pipeline = await getPipelineById(pipelineId);
      if (!pipeline) return res.status(404).json({ error: 'pipeline not found' });
      const project = await getProjectById(pipeline.fk_project_id);
      if (!project) return res.status(404).json({ error: 'project not found' });
      if (project.fk_user_id !== (req as any).user.user_id) return res.status(403).json({ error: 'forbidden' });

      const nodes = await listNodesByPipeline(pipelineId);
      return res.json(nodes);
    }

    const nodes = await listNodesByOwner((req as any).user.user_id);
    res.json(nodes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const nodeId = parseId(req.params.id);
    if (!nodeId) return res.status(400).json({ error: 'invalid id' });

    const n = await getNodeById(nodeId);
    if (!n) return res.status(404).json({ error: 'not found' });
    const pipeline = await getPipelineById(n.fk_pipeline_id);
    if (!pipeline) return res.status(404).json({ error: 'pipeline not found' });
    const project = await getProjectById(pipeline.fk_project_id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (project.fk_user_id !== (req as any).user.user_id) return res.status(403).json({ error: 'forbidden' });

    res.json(n);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const nodeId = parseId(req.params.id);
    if (!nodeId) return res.status(400).json({ error: 'invalid id' });

    const existing = await getNodeById(nodeId);
    if (!existing) return res.status(404).json({ error: 'not found' });
    const pipeline = await getPipelineById(existing.fk_pipeline_id);
    if (!pipeline) return res.status(404).json({ error: 'pipeline not found' });
    const project = await getProjectById(pipeline.fk_project_id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (project.fk_user_id !== (req as any).user.user_id) return res.status(403).json({ error: 'forbidden' });

    const patch: any = {};
    if (req.body.fk_type_id !== undefined) {
      const fkType = parseId(req.body.fk_type_id);
      if (!fkType) return res.status(400).json({ error: 'invalid fk_type_id' });
      const type = await getNodeTypeById(fkType);
      if (!type) return res.status(404).json({ error: 'node type not found' });
      patch.fk_type_id = fkType;
    }
    if (req.body.fk_sub_pipeline !== undefined) {
      if (req.body.fk_sub_pipeline === null) {
        patch.fk_sub_pipeline = null;
      } else {
        const fkSubPipeline = parseId(req.body.fk_sub_pipeline);
        if (!fkSubPipeline) return res.status(400).json({ error: 'invalid fk_sub_pipeline' });
        const subPipeline = await getPipelineById(fkSubPipeline);
        if (!subPipeline) return res.status(404).json({ error: 'sub pipeline not found' });
        const subProject = await getProjectById(subPipeline.fk_project_id);
        if (!subProject) return res.status(404).json({ error: 'project not found' });
        if (subProject.fk_user_id !== (req as any).user.user_id) return res.status(403).json({ error: 'forbidden' });
        patch.fk_sub_pipeline = fkSubPipeline;
      }
    }
    if (req.body.top_k !== undefined) {
      const topK = Number(req.body.top_k);
      if (!Number.isFinite(topK)) return res.status(400).json({ error: 'invalid top_k' });
      patch.top_k = topK;
    }
    if (req.body.ui_json !== undefined) patch.ui_json = req.body.ui_json;
    if (req.body.output_json !== undefined) patch.output_json = req.body.output_json;

    const n = await updateNode(nodeId, patch);
    res.json(n);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const nodeId = parseId(req.params.id);
    if (!nodeId) return res.status(400).json({ error: 'invalid id' });

    const existing = await getNodeById(nodeId);
    if (!existing) return res.status(404).json({ error: 'not found' });
    const pipeline = await getPipelineById(existing.fk_pipeline_id);
    if (!pipeline) return res.status(404).json({ error: 'pipeline not found' });
    const project = await getProjectById(pipeline.fk_project_id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (project.fk_user_id !== (req as any).user.user_id) return res.status(403).json({ error: 'forbidden' });

    await deleteNode(nodeId);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;

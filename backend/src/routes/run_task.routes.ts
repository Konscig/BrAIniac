import express from 'express';
import { createRunTask, startRunTask, retryRunTask, completeRunTask, listRunTasks } from '../services/run_task.service.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { runId, nodeId, worker, logsUri } = req.body;
    if (!runId || !nodeId || !worker) return res.status(400).json({ error: 'runId, nodeId and worker required' });
    const t = await createRunTask({ runId, nodeId, worker, logsUri });
    res.status(201).json(t);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.post('/:id/start', async (req, res) => {
  try {
    const { worker } = req.body;
    const t = await startRunTask(req.params.id, worker);
    res.json(t);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.post('/:id/retry', async (req, res) => {
  try {
    const t = await retryRunTask(req.params.id);
    res.json(t);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.post('/:id/complete', async (req, res) => {
  try {
    const { outputJson, success } = req.body;
    const t = await completeRunTask(req.params.id, outputJson, !!success);
    res.json(t);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const runId = req.query.runId as string | undefined;
    const items = await listRunTasks(runId);
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;

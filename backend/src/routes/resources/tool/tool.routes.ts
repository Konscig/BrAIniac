import express from 'express';
import {
  createToolEntry,
  deleteToolEntryById,
  getToolEntryById,
  listToolEntries,
  updateToolEntryById,
} from '../services/tool.application.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requiredId } from './req-parse.js';
import { mapToolPatchDTO } from './patch-dto.mappers.js';
import { sendRouteError } from './route-error.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req, res) => {
  try {
    const t = await createToolEntry({ name: req.body?.name, config_json: req.body?.config_json });
    res.status(201).json(t);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.get('/', async (req, res) => {
  try {
    const items = await listToolEntries();
    res.json(items);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const toolId = requiredId(req.params.id, 'invalid id');

    const item = await getToolEntryById(toolId);
    res.json(item);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const toolId = requiredId(req.params.id, 'invalid id');

    const updated = await updateToolEntryById(toolId, mapToolPatchDTO(req.body));
    res.json(updated);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const toolId = requiredId(req.params.id, 'invalid id');
    await deleteToolEntryById(toolId);
    res.status(204).end();
  } catch (err) {
    return sendRouteError(res, err);
  }
});

export default router;

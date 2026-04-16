import express from 'express';
import {
  createNodeTypeEntry,
  deleteNodeTypeEntryById,
  getNodeTypeEntryById,
  listNodeTypeEntries,
  updateNodeTypeEntryById,
} from '../services/node_type.application.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { optionalId, requiredId } from './req-parse.js';
import { mapNodeTypePatchDTO } from './patch-dto.mappers.js';
import { sendRouteError } from './route-error.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req, res) => {
  try {
    const fk_tool_id = requiredId(req.body.fk_tool_id, 'fk_tool_id, name and desc required');

    const item = await createNodeTypeEntry({
      fk_tool_id,
      name: req.body.name,
      desc: req.body.desc,
      ...(req.body.config_json !== undefined ? { config_json: req.body.config_json } : {}),
    });
    res.status(201).json(item);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.get('/', async (req, res) => {
  try {
    const toolId = optionalId(req.query.fk_tool_id, 'invalid fk_tool_id');
    if (toolId !== undefined) {
      const items = await listNodeTypeEntries(toolId);
      return res.json(items);
    }

    const items = await listNodeTypeEntries();
    res.json(items);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const typeId = requiredId(req.params.id, 'invalid id');

    const item = await getNodeTypeEntryById(typeId);
    res.json(item);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const typeId = requiredId(req.params.id, 'invalid id');

    const item = await updateNodeTypeEntryById(typeId, mapNodeTypePatchDTO(req.body));
    res.json(item);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const typeId = requiredId(req.params.id, 'invalid id');

    await deleteNodeTypeEntryById(typeId);
    res.status(204).end();
  } catch (err) {
    return sendRouteError(res, err);
  }
});

export default router;

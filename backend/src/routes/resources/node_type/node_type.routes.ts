import express from 'express';
import {
  createNodeTypeEntry,
  deleteNodeTypeEntryById,
  getNodeTypeEntryById,
  listNodeTypeEntries,
  updateNodeTypeEntryById,
} from '../../../services/application/node_type/node_type.application.service.js';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { optionalId, requiredId } from '../../shared/req-parse.js';
import { mapNodeTypeCreateDTO } from '../../shared/create-dto.mappers.js';
import { mapNodeTypePatchDTO } from '../../shared/patch-dto.mappers.js';
import { sendRouteError } from '../../shared/route-error.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req, res) => {
  try {
    const dto = mapNodeTypeCreateDTO(req.body);
    const item = await createNodeTypeEntry(dto);
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

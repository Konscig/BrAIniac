import express from 'express';
import { loginAndIssueTokens, signupAndIssueTokens } from '../../../services/application/auth/auth.application.service.js';
import { mapAuthCredentialsDTO } from '../../shared/create-dto.mappers.js';
import { sendRouteError } from '../../shared/route-error.js';

const router = express.Router();

router.post('/signup', async (req, res) => {
  try {
    const dto = mapAuthCredentialsDTO(req.body);
    const tokens = await signupAndIssueTokens(dto);
    res.status(201).json(tokens);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.post('/login', async (req, res) => {
  try {
    const dto = mapAuthCredentialsDTO(req.body);
    const tokens = await loginAndIssueTokens(dto);
    res.json(tokens);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

export default router;

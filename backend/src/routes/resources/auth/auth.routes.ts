import express from 'express';
import { loginAndIssueTokens, signupAndIssueTokens } from '../services/auth.application.service.js';
import { requiredNonEmptyString } from './req-parse.js';
import { sendRouteError } from './route-error.js';

const router = express.Router();

router.post('/signup', async (req, res) => {
  try {
    const email = requiredNonEmptyString(req.body?.email, 'email and password required');
    const password = requiredNonEmptyString(req.body?.password, 'email and password required');
    const tokens = await signupAndIssueTokens({ email, password });
    res.status(201).json(tokens);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.post('/login', async (req, res) => {
  try {
    const email = requiredNonEmptyString(req.body?.email, 'email and password required');
    const password = requiredNonEmptyString(req.body?.password, 'email and password required');
    const tokens = await loginAndIssueTokens({ email, password });
    res.json(tokens);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

export default router;

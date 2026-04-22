import type express from 'express';
import { isHttpError } from '../../common/http-error.js';

export function sendRouteError(res: express.Response, err: unknown) {
  if (isHttpError(err)) {
    return res.status(err.status).json(err.body);
  }

  console.error(err);
  return res.status(500).json({ error: 'internal error' });
}

import { verifyAccessToken } from '../services/jwt.service.js';
import { findUserById } from '../services/user.service.js';

export async function requireAuth(req: any, res: any, next: any) {
  const h = req.headers.authorization as string | undefined;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthorized' });
  const token = h.slice('Bearer '.length);
  const payload = verifyAccessToken(token);
  if (!payload) return res.status(401).json({ error: 'invalid token' });
  const userId = (payload as any).sub;
  const user = await findUserById(userId);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  req.user = user;
  next();
}

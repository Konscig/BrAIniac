import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET_KEY || 'dev-secret';
const ACCESS_EXPIRES_IN = '15m';

export function signAccessToken(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_EXPIRES_IN });
}

export function verifyAccessToken(token: string) {
  try {
    return jwt.verify(token, JWT_SECRET) as any;
  } catch (err) {
    return null;
  }
}

export function readAccessTokenExpiresAt(token: string): string | undefined {
  const decoded = jwt.decode(token);
  const exp = decoded && typeof decoded === 'object' ? decoded.exp : undefined;
  return typeof exp === 'number' && Number.isFinite(exp) ? new Date(exp * 1000).toISOString() : undefined;
}

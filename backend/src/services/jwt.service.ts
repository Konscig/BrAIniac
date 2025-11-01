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

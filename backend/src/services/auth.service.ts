import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { signAccessToken, verifyAccessToken } from './jwt.service.js';
import { createRefreshToken, findRefreshTokenByHash, expireRefreshTokenById } from './refresh_token.service.js';
import { findUserByEmail, createUser } from './user.service.js';

export async function signup(data: { email: string; username: string; password: string }) {
  const existing = await findUserByEmail(data.email);
  if (existing) throw new Error('user exists');
  const hash = await bcrypt.hash(data.password, 10);
  const user = await createUser({ email: data.email, username: data.username, passwordHash: hash });
  return user;
}

export async function login(data: { email: string; password: string; userAgent?: string | undefined; ipAddress?: string | undefined }) {
  const user = await findUserByEmail(data.email);
  if (!user) throw new Error('invalid credentials');
  const ok = await bcrypt.compare(data.password, user.passwordHash);
  if (!ok) throw new Error('invalid credentials');

  const access = signAccessToken({ sub: user.id, email: user.email });

  // create refresh token raw value and store its hash
  const raw = crypto.randomBytes(48).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  await createRefreshToken({ userId: user.id, tokenHash, userAgent: data.userAgent as any, ipAddress: data.ipAddress as any });

  return { accessToken: access, refreshToken: raw };
}

export async function refresh(rawToken: string) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const rt = await findRefreshTokenByHash(tokenHash);
  if (!rt) throw new Error('invalid refresh token');
  // sign new access token
  // load user id from rt.userId
  const userId = rt.userId;
  const access = signAccessToken({ sub: userId });
  return { accessToken: access };
}

export async function logout(refreshId: number) {
  return expireRefreshTokenById(refreshId);
}

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { signAccessToken } from './jwt.service.js';
import { findUserByEmail, createUser } from '../data/user.service.js';

const SCRYPT_KEYLEN = Number(process.env.PASSWORD_SCRYPT_KEYLEN ?? 64);
const SCRYPT_OPTIONS = {
  N: Number(process.env.PASSWORD_SCRYPT_N ?? 16384),
  r: Number(process.env.PASSWORD_SCRYPT_R ?? 8),
  p: Number(process.env.PASSWORD_SCRYPT_P ?? 1)
};

function scryptAsync(password: string, salt: Buffer, keylen: number) {
  return new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, SCRYPT_OPTIONS, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey as Buffer);
    });
  });
}

async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN);
  return `s:${salt.toString('base64')}:${derived.toString('base64')}`;
}

async function verifyPassword(password: string, stored: string) {
  if (stored.startsWith('s:')) {
    const [, saltB64, hashB64] = stored.split(':');
    if (!saltB64 || !hashB64) return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
  const derived = await scryptAsync(password, salt, expected.length);
    return crypto.timingSafeEqual(derived, expected);
  }

  // Fallback for legacy bcrypt hashes stored ранее.
  return bcrypt.compare(password, stored);
}

export async function signup(data: { email: string; password: string }) {
  const existing = await findUserByEmail(data.email);
  if (existing) throw new Error('user exists');
  const hash = await hashPassword(data.password);
  const user = await createUser({ email: data.email, password_hash: hash });
  return user;
}

export async function login(data: { email: string; password: string }) {
  const user = await findUserByEmail(data.email);
  if (!user) throw new Error('invalid credentials');
  const ok = await verifyPassword(data.password, user.password_hash);
  if (!ok) throw new Error('invalid credentials');

  const access = signAccessToken({ sub: user.user_id, email: user.email });

  return { accessToken: access };
}

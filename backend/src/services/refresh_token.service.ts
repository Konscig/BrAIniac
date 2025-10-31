import prisma from '../db.js';

export async function createRefreshToken(data: { userId: string; tokenHash: string; userAgent?: string; ipAddress?: string }) {
  const rt = await prisma.refreshToken.create({ data: {
    userId: data.userId,
    tokenHash: data.tokenHash,
    userAgent: data.userAgent ?? null,
    ipAddress: data.ipAddress ?? null,
    expired: false,
  }});
  return rt;
}

export async function findRefreshTokenByHash(tokenHash: string) {
  return prisma.refreshToken.findFirst({ where: { tokenHash, expired: false } });
}

export async function expireRefreshTokenById(id: number) {
  return prisma.refreshToken.update({ where: { id }, data: { expired: true } });
}

export async function expireTokensForUser(userId: string) {
  return prisma.refreshToken.updateMany({ where: { userId }, data: { expired: true } });
}

import prisma from '../db.js';

const userPublicSelect = {
  user_id: true,
  email: true,
} as const;

export async function createUser(data: { email: string; password_hash: string }) {
  return prisma.user.create({
    data: {
      email: data.email,
      password_hash: data.password_hash,
    },
    select: userPublicSelect,
  });
}

export async function findUserById(user_id: number) {
  return prisma.user.findUnique({ where: { user_id }, select: userPublicSelect });
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

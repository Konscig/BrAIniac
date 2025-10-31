import prisma from '../db.js';

export async function createUser(data: { email: string; username: string; passwordHash: string; }): Promise<any> {
  const user = await prisma.user.create({ data: {
    email: data.email,
    username: data.username,
    passwordHash: data.passwordHash,
  }});
  return user;
}

export async function findUserById(id: string): Promise<any | null> {
  return prisma.user.findUnique({ where: { id } });
}

export async function findUserByEmail(email: string): Promise<any | null> {
  return prisma.user.findUnique({ where: { email } });
}

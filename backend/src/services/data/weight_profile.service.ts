import prisma from '../../db.js';

export async function findByCode(code: string) {
  return prisma.weightProfile.findUnique({ where: { code } });
}

export async function findById(weight_profile_id: number) {
  return prisma.weightProfile.findUnique({ where: { weight_profile_id } });
}

export async function listActive() {
  return prisma.weightProfile.findMany({ where: { active: true } });
}

export async function upsertProfile(data: {
  code: string;
  architectural_class: string;
  method: string;
  lambda?: number;
  consistency_ratio?: number;
  weights_json: any;
  active?: boolean;
}) {
  return prisma.weightProfile.upsert({
    where: { code: data.code },
    create: {
      code: data.code,
      architectural_class: data.architectural_class,
      method: data.method,
      ...(data.lambda !== undefined ? { lambda: data.lambda } : {}),
      ...(data.consistency_ratio !== undefined ? { consistency_ratio: data.consistency_ratio } : {}),
      weights_json: data.weights_json,
      active: data.active ?? true,
    },
    update: {
      architectural_class: data.architectural_class,
      method: data.method,
      weights_json: data.weights_json,
      ...(data.lambda !== undefined ? { lambda: data.lambda } : {}),
      ...(data.consistency_ratio !== undefined ? { consistency_ratio: data.consistency_ratio } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
    },
  });
}

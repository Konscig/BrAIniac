import prisma from '../../db.js';

export async function findByCode(code: string) {
  return prisma.normalizationProfile.findFirst({
    where: { code, active: true },
    orderBy: { version: 'desc' },
  });
}

export async function findById(normalization_profile_id: number) {
  return prisma.normalizationProfile.findUnique({ where: { normalization_profile_id } });
}

export async function listActive() {
  return prisma.normalizationProfile.findMany({ where: { active: true } });
}

export async function upsertProfile(data: {
  code: string;
  version: number;
  params_json: any;
  calibrated_on_json?: any;
  active?: boolean;
}) {
  return prisma.normalizationProfile.upsert({
    where: { code_version: { code: data.code, version: data.version } },
    create: {
      code: data.code,
      version: data.version,
      params_json: data.params_json,
      calibrated_on_json: data.calibrated_on_json,
      active: data.active ?? true,
    },
    update: {
      params_json: data.params_json,
      ...(data.calibrated_on_json !== undefined ? { calibrated_on_json: data.calibrated_on_json } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
    },
  });
}

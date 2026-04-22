import prisma from '../../db.js';

export async function createNode(data: {
  fk_pipeline_id: number;
  fk_type_id: number;
  fk_sub_pipeline?: number;
  top_k: number;
  ui_json: any;
  output_json?: any;
}) {
  return prisma.node.create({
    data: {
      fk_pipeline_id: data.fk_pipeline_id,
      fk_type_id: data.fk_type_id,
      ...(data.fk_sub_pipeline !== undefined ? { fk_sub_pipeline: data.fk_sub_pipeline } : {}),
      top_k: data.top_k,
      ui_json: data.ui_json,
      ...(data.output_json !== undefined ? { output_json: data.output_json } : {}),
    },
  });
}

export async function updateNode(
  node_id: number,
  data: {
    fk_type_id?: number;
    fk_sub_pipeline?: number | null;
    top_k?: number;
    ui_json?: any;
    output_json?: any;
  },
) {
  return prisma.node.update({
    where: { node_id },
    data,
  });
}

export async function getNodeById(node_id: number) {
  return prisma.node.findUnique({ where: { node_id } });
}

export async function listNodesByPipeline(fk_pipeline_id?: number) {
  if (!fk_pipeline_id) return prisma.node.findMany();
  return prisma.node.findMany({ where: { fk_pipeline_id } });
}

export async function listNodesByOwner(fk_user_id: number) {
  return prisma.node.findMany({
    where: {
      pipeline: {
        project: {
          fk_user_id,
        },
      },
    },
  });
}

export async function deleteNode(node_id: number) {
  return prisma.node.delete({ where: { node_id } });
}

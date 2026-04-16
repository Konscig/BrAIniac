import prisma from '../../db.js';

export async function createEdge(data: { fk_from_node: number; fk_to_node: number }) {
  return prisma.edge.create({
    data: {
      fk_from_node: data.fk_from_node,
      fk_to_node: data.fk_to_node,
    },
  });
}

export async function listEdgesByPipeline(fk_pipeline_id?: number) {
  if (!fk_pipeline_id) return prisma.edge.findMany();
  return prisma.edge.findMany({
    where: {
      from_node: {
        fk_pipeline_id,
      },
    },
  });
}

export async function getEdgeById(edge_id: number) {
  return prisma.edge.findUnique({
    where: { edge_id },
    include: {
      from_node: true,
      to_node: true,
    },
  });
}

export async function deleteEdge(edge_id: number) {
  return prisma.edge.delete({ where: { edge_id } });
}

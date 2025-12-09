import { OrderContext, SupplyOption } from './types.js';

const MOCK_SUPPLIERS: SupplyOption[] = [
  { supplierId: 'alt-1', name: 'FastSupply', price: 980, availableQty: 50, etaHours: 24, reliability: 0.92 },
  { supplierId: 'alt-2', name: 'BudgetParts', price: 910, availableQty: 120, etaHours: 72, reliability: 0.78 },
  { supplierId: 'alt-3', name: 'ReliableCo', price: 1020, availableQty: 200, etaHours: 36, reliability: 0.96 },
];

export function findAlternatives(order: OrderContext): SupplyOption[] {
  const scored = MOCK_SUPPLIERS.map((opt) => {
    const slaPenalty = order.slaHours <= 24 ? 0 : (order.slaHours <= 48 ? 0.05 : 0.1);
    const etaScore = opt.etaHours <= order.slaHours ? 1 : Math.max(0, 1 - (opt.etaHours - order.slaHours) / 72);
    const priceScore = order.basePrice > 0 ? Math.min(1, order.basePrice / opt.price) : 0.7;
    const reliabilityScore = opt.reliability;
    const score = 0.4 * etaScore + 0.3 * priceScore + 0.3 * reliabilityScore - slaPenalty;
    return { ...opt, score } as SupplyOption & { score: number };
  });

  return scored
    .filter((opt) => opt.availableQty >= order.quantity)
    .sort((a, b) => b.score - a.score)
    .map(({ score, ...rest }) => rest);
}

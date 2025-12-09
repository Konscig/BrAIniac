import { FinanceAssessment, LogisticsAssessment, SupplyOption, OrderContext } from './types.js';

export function assessFinance(order: OrderContext, option: SupplyOption, logistics: LogisticsAssessment): FinanceAssessment {
  const unitCost = option.price;
  const shipping = logistics.shippingCost / Math.max(1, order.quantity);
  const revenue = order.basePrice;
  const margin = revenue - (unitCost + shipping);
  const roi = (margin <= 0 ? 0 : margin) / (unitCost + shipping);
  const ok = margin > 0 && roi >= 0.05;
  const riskPenalty = logistics.risk * 0.2;
  const vote = Math.max(0, Math.min(1, roi + (ok ? 0.3 : -0.2) - riskPenalty));

  return {
    supplierId: option.supplierId,
    ok,
    unitCost,
    shippingCost: logistics.shippingCost,
    margin,
    roi,
    notes: ok ? 'Бюджет в норме' : 'Маржа слишком низкая',
    vote,
  };
}

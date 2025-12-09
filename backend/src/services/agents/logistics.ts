import { LogisticsAssessment, SupplyOption, OrderContext } from './types.js';

export function assessLogistics(order: OrderContext, option: SupplyOption): LogisticsAssessment {
  const margin = order.basePrice - option.price;
  const rushNeeded = option.etaHours > order.slaHours;
  const rushHours = rushNeeded ? option.etaHours - order.slaHours : 0;
  const rushCost = rushHours > 0 ? Math.min(120, rushHours * 5) : 0;
  const shippingCost = 40 + rushCost;
  const feasible = option.availableQty >= order.quantity && option.etaHours <= order.slaHours + 48;
  const risk = rushNeeded ? 0.35 : 0.15;

  return {
    supplierId: option.supplierId,
    feasible,
    etaHours: option.etaHours + (rushNeeded ? 0 : 0),
    shippingCost,
    risk,
    notes: rushNeeded ? 'Потребуется ускоренная доставка' : 'Стандартная доставка'
  };
}

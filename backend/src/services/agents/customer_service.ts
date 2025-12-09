import { CustomerServiceDecision, FinanceAssessment, OrderContext } from './types.js';

export function customerServiceDecision(order: OrderContext, finance: FinanceAssessment): CustomerServiceDecision {
  const notifyCustomer = order.isVip || order.slaHours <= 24;
  const compensation = finance.ok ? 'no-comp' : order.isVip ? '10% coupon' : 'free shipping';
  const message = notifyCustomer
    ? 'Сообщить о задержке и предложить компенсацию'
    : 'Задержка минимальна, уведомление не требуется';
  const vote = finance.ok ? 0.8 : 0.6;

  return { notifyCustomer, compensation, message, vote };
}

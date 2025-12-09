export interface OrderContext {
  id: string;
  sku: string;
  quantity: number;
  slaHours: number;
  isVip: boolean;
  penaltyCost: number;
  basePrice: number;
}

export interface SupplyOption {
  supplierId: string;
  name: string;
  price: number;
  availableQty: number;
  etaHours: number;
  reliability: number; // 0..1
  comment?: string;
}

export interface LogisticsAssessment {
  supplierId: string;
  feasible: boolean;
  etaHours: number;
  shippingCost: number;
  risk: number; // 0..1
  notes?: string;
}

export interface FinanceAssessment {
  supplierId: string;
  ok: boolean;
  unitCost: number;
  shippingCost: number;
  margin: number; // absolute margin per unit
  roi: number; // margin / (unitCost + shippingCost)
  notes?: string;
  vote?: number; // 0..1 for consensus
}

export interface CustomerServiceDecision {
  notifyCustomer: boolean;
  compensation?: string;
  message?: string;
  vote?: number;
}

export interface ConsensusResult {
  score: number;
  accepted: boolean;
}

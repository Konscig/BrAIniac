export * from './types.js';
export { findAlternatives } from './supply.js';
export { assessLogistics } from './logistics.js';
export { assessFinance } from './finance.js';
export { customerServiceDecision } from './customer_service.js';

export function consensusScore(votes: number[], threshold = 0.75) {
  if (!votes.length) return { score: 0, accepted: false } as const;
  const score = votes.reduce((a, b) => a + b, 0) / votes.length;
  return { score, accepted: score >= threshold } as const;
}

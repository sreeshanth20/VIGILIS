/**
 * AEGIS business-impact calculations.
 *
 * Connects ML predictions to merchant economics: given a risk threshold and
 * the transaction universe, computes the financial consequences of operating
 * the model at that threshold (prevented loss, false-positive cost, net
 * savings, investigation workload).
 *
 * These costs are grounded in realistic Indian e-commerce economics:
 *  - Investigating a flagged order costs ~₹45 in analyst time
 *  - Holding a legitimate order (false positive) costs ~3% of order value in
 *    delayed revenue + customer-acquisition damage (we use a conservative
 *    2.5% figure to stay defensible)
 *  - A missed chargeback/RTO costs the full lossAmount (merchandise + fees)
 *
 * The "prevented loss" assumes that holding/escalating a true-positive order
 * prevents ~75% of the loss (some slips through to manual review outcome).
 */

import type { Transaction } from '@prisma/client';

export interface BusinessCostParams {
  /** Cost per investigated order (analyst time + tooling), in INR. */
  investigationCostPerCase: number;
  /** Fraction of order value lost when a legitimate order is falsely held. */
  falsePositiveCostRate: number;
  /** Fraction of loss prevented when a true-positive is caught. */
  preventionRate: number;
}

export const DEFAULT_COST_PARAMS: BusinessCostParams = {
  investigationCostPerCase: 45,
  falsePositiveCostRate: 0.025,
  preventionRate: 0.75,
};

export interface ThresholdImpact {
  threshold: number;
  // Counts (on the realized subset — where we know the outcome)
  flagged: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  trueNegatives: number;
  precision: number;
  recall: number;
  f1: number;
  // Financial (INR)
  preventedLoss: number;
  falsePositiveCost: number;
  investigationCost: number;
  missedLoss: number;
  netSavings: number; // preventedLoss - falsePositiveCost - investigationCost
  // Workload
  investigationVolume: number;
  // For the full universe (including pending), how many orders would be flagged
  totalFlagged: number;
}

/**
 * Compute the business impact of operating the model at `threshold` on the
 * given transactions. Only `outcomeRealized` transactions contribute to the
 * financial math (we need ground truth); pending transactions contribute to
 * the "totalFlagged" workload projection.
 */
export function computeThresholdImpact(
  transactions: Pick<Transaction, 'riskScore' | 'amount' | 'lossAmount' | 'hadChargebackOrRto' | 'outcomeRealized'>[],
  threshold: number,
  params: BusinessCostParams = DEFAULT_COST_PARAMS,
): ThresholdImpact {
  let flagged = 0;
  let tp = 0, fp = 0, fn = 0, tn = 0;
  let preventedLoss = 0;
  let falsePositiveCost = 0;
  let missedLoss = 0;
  let totalFlagged = 0;

  for (const t of transactions) {
    const isFlagged = t.riskScore >= threshold;
    if (isFlagged) totalFlagged++;
    if (!t.outcomeRealized) continue; // can't score financially without outcome

    if (isFlagged) flagged++;
    if (t.hadChargebackOrRto) {
      if (isFlagged) {
        tp++;
        preventedLoss += t.lossAmount * params.preventionRate;
      } else {
        fn++;
        missedLoss += t.lossAmount;
      }
    } else {
      if (isFlagged) {
        fp++;
        falsePositiveCost += t.amount * params.falsePositiveCostRate;
      } else {
        tn++;
      }
    }
  }

  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const investigationCost = flagged * params.investigationCostPerCase;
  const netSavings = preventedLoss - falsePositiveCost - investigationCost;

  return {
    threshold,
    flagged,
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    trueNegatives: tn,
    precision,
    recall,
    f1,
    preventedLoss,
    falsePositiveCost,
    investigationCost,
    missedLoss,
    netSavings,
    investigationVolume: flagged,
    totalFlagged,
  };
}

/** Format INR amount with Indian grouping (lakhs/crores friendly). */
export function formatINR(amount: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact) {
    if (amount >= 1e7) return `₹${(amount / 1e7).toFixed(2)}Cr`;
    if (amount >= 1e5) return `₹${(amount / 1e5).toFixed(2)}L`;
    if (amount >= 1e3) return `₹${(amount / 1e3).toFixed(1)}K`;
    return `₹${Math.round(amount)}`;
  }
  return '₹' + Math.round(amount).toLocaleString('en-IN');
}

/** Risk band definition — consistent across UI and API. */
export const RISK_BANDS = {
  critical: { label: 'Critical', color: '#dc2626', textColor: '#fecaca', threshold: 0.8 },
  high: { label: 'High', color: '#ea580c', textColor: '#fed7aa', threshold: 0.5 },
  elevated: { label: 'Elevated', color: '#ca8a04', textColor: '#fef08a', threshold: 0.3 },
  normal: { label: 'Normal', color: '#16a34a', textColor: '#bbf7d0', threshold: 0 },
} as const;

export type RiskBand = keyof typeof RISK_BANDS;

export function bandForScore(score: number, operatingThreshold: number): RiskBand {
  if (score >= Math.min(0.95, operatingThreshold + 0.25)) return 'critical';
  if (score >= operatingThreshold + 0.05) return 'high';
  if (score >= operatingThreshold - 0.05) return 'elevated';
  return 'normal';
}

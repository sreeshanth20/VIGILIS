import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { computeThresholdImpact, DEFAULT_COST_PARAMS, BusinessCostParams } from '@/lib/business';
import { z } from 'zod';

/**
 * POST /api/threshold
 *
 * Simulate the operational impact of changing the model's risk threshold.
 * Returns the projected precision/recall/F1/investigation volume/
 * prevented-loss/false-positive-cost/net-savings for the requested
 * threshold, plus a sweep of thresholds for plotting the trade-off curves.
 *
 * Body: { threshold: number, costParams?: Partial<BusinessCostParams> }
 */
const BodySchema = z.object({
  threshold: z.number().min(0).max(1),
  costParams: z.object({
    investigationCostPerCase: z.number().optional(),
    falsePositiveCostRate: z.number().optional(),
    preventionRate: z.number().optional(),
  }).optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 });
  }
  const threshold = parsed.data.threshold;
  const costParams: BusinessCostParams = { ...DEFAULT_COST_PARAMS, ...(parsed.data.costParams ?? {}) };

  // Use ALL realized transactions for the financial math
  const realized = await db.transaction.findMany({
    where: { outcomeRealized: true },
    select: { riskScore: true, amount: true, lossAmount: true, hadChargebackOrRto: true, outcomeRealized: true },
  });
  const pending = await db.transaction.findMany({
    where: { outcomeRealized: false },
    select: { riskScore: true, amount: true },
  });

  const impact = computeThresholdImpact([...realized, ...pending.map((p) => ({ ...p, lossAmount: 0, hadChargebackOrRto: false, outcomeRealized: false }))], threshold, costParams);

  // Sweep for the curve
  const sweep = [];
  for (let t = 0; t <= 1.0001; t += 0.025) {
    const tt = Math.min(1, t);
    const sw = computeThresholdImpact([...realized, ...pending.map((p) => ({ ...p, lossAmount: 0, hadChargebackOrRto: false, outcomeRealized: false }))], tt, costParams);
    sweep.push({
      threshold: Number(tt.toFixed(3)),
      precision: Number(sw.precision.toFixed(4)),
      recall: Number(sw.recall.toFixed(4)),
      f1: Number(sw.f1.toFixed(4)),
      flagged: sw.flagged,
      totalFlagged: sw.totalFlagged,
      preventedLoss: sw.preventedLoss,
      falsePositiveCost: sw.falsePositiveCost,
      investigationCost: sw.investigationCost,
      netSavings: sw.netSavings,
    });
  }

  return NextResponse.json({
    threshold,
    impact: {
      precision: impact.precision,
      recall: impact.recall,
      f1: impact.f1,
      flagged: impact.flagged,
      truePositives: impact.truePositives,
      falsePositives: impact.falsePositives,
      falseNegatives: impact.falseNegatives,
      trueNegatives: impact.trueNegatives,
      preventedLoss: impact.preventedLoss,
      falsePositiveCost: impact.falsePositiveCost,
      investigationCost: impact.investigationCost,
      missedLoss: impact.missedLoss,
      netSavings: impact.netSavings,
      totalFlagged: impact.totalFlagged,
    },
    sweep,
    costParams,
  });
}

export const dynamic = 'force-dynamic';

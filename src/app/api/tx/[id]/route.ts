import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { toDetail } from '@/lib/api-dto';
import { getModel } from '@/lib/ml/inference';
import { DEFAULT_COST_PARAMS } from '@/lib/business';

/**
 * GET /api/tx/[id]
 *
 * Full transaction detail: all features + model risk score + top factors +
 * financial impact projection + analyst decision history.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tx = await db.transaction.findUnique({ where: { id } });
  if (!tx) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
  }
  const model = getModel();
  const operatingThreshold = model.metrics.atDefaultThreshold.threshold;

  // Expected loss if this order goes bad = score * (amount + fee) for the relevant outcome type
  // (we use a blended expected loss approximation for clarity)
  const expectedLoss = tx.riskScore * (
    tx.isCod ? tx.amount * 0.18 + 180 :
    tx.isGiftCard ? tx.amount + 150 + tx.amount * 0.02 :
    tx.amount * 0.55 + 120
  );

  // Related entities (resolved separately to keep this response fast)
  const detail = toDetail(tx);
  return NextResponse.json({
    ...detail,
    operatingThreshold,
    expectedLoss: Math.round(expectedLoss),
    costParams: DEFAULT_COST_PARAMS,
    modelInfo: {
      rocAuc: model.metrics.rocAuc,
      prAuc: model.metrics.prAuc,
      bestIteration: model.bestIteration,
      treeCount: model.trees.length,
    },
  });
}

export const dynamic = 'force-dynamic';

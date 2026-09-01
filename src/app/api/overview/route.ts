import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getModel } from '@/lib/ml/inference';
import { computeThresholdImpact, DEFAULT_COST_PARAMS } from '@/lib/business';

/**
 * GET /api/overview
 *
 * High-level risk intelligence dashboard. Returns KPIs, trend, distribution,
 * merchant breakdown, and the top-risk pending orders requiring attention.
 */
export async function GET() {
  const model = getModel();
  const operatingThreshold = model.metrics.atDefaultThreshold.threshold;

  const total = await db.transaction.count();
  const pending = await db.transaction.count({ where: { outcomeRealized: false } });

  // KPIs based on realized transactions (where we know outcomes)
  const realized = await db.transaction.findMany({
    where: { outcomeRealized: true },
    select: { riskScore: true, amount: true, lossAmount: true, hadChargebackOrRto: true, outcomeRealized: true },
  });
  const impact = computeThresholdImpact(realized, operatingThreshold);

  // Pending exposure
  const pendingTx = await db.transaction.findMany({
    where: { outcomeRealized: false },
    select: { riskScore: true, amount: true, lossAmount: true },
  });
  const positives = realized.filter((t) => t.hadChargebackOrRto);
  const avgLossPerPositive = positives.length > 0
    ? positives.reduce((s, t) => s + t.lossAmount, 0) / positives.length
    : 0;
  const pendingExpectedLoss = pendingTx.reduce((s, t) => s + t.riskScore * avgLossPerPositive, 0);
  const pendingExposure = pendingTx.reduce((s, t) => s + t.amount, 0);

  // Risk band distribution
  const bandCounts = await db.transaction.groupBy({
    by: ['riskBand'],
    _count: { _all: true },
  });
  const bandDistribution: Record<string, number> = { critical: 0, high: 0, elevated: 0, normal: 0 };
  bandCounts.forEach((b) => { bandDistribution[b.riskBand] = b._count._all; });

  // Daily risk trend
  const minTsRow = await db.transaction.findFirst({ orderBy: { ts: 'asc' }, select: { ts: true } });
  const maxTsRow = await db.transaction.findFirst({ orderBy: { ts: 'desc' }, select: { ts: true } });
  const trendBuckets: { day: string; count: number; flagged: number; positive: number; loss: number }[] = [];
  if (minTsRow && maxTsRow) {
    const startDay = Math.floor(Number(minTsRow.ts) / 86400000);
    const endDay = Math.floor(Number(maxTsRow.ts) / 86400000);
    const totalDays = endDay - startDay + 1;
    const bucketDays = totalDays > 90 ? 3 : totalDays > 60 ? 2 : 1;
    for (let d = startDay; d <= endDay; d += bucketDays) {
      const bucketStart = d * 86400000;
      const bucketEnd = (d + bucketDays) * 86400000;
      const rows = await db.transaction.findMany({
        where: { ts: { gte: BigInt(bucketStart), lt: BigInt(bucketEnd) } },
        select: { riskScore: true, lossAmount: true, hadChargebackOrRto: true, outcomeRealized: true },
      });
      const flagged = rows.filter((r) => r.riskScore >= operatingThreshold).length;
      const positive = rows.filter((r) => r.outcomeRealized && r.hadChargebackOrRto).length;
      const loss = rows.filter((r) => r.outcomeRealized && r.hadChargebackOrRto).reduce((s, r) => s + r.lossAmount, 0);
      trendBuckets.push({
        day: new Date(bucketStart).toISOString().slice(0, 10),
        count: rows.length,
        flagged,
        positive,
        loss,
      });
    }
  }

  // Merchant breakdown
  const merchants = await db.transaction.groupBy({
    by: ['merchantId', 'merchantCategory'],
    _count: { _all: true },
    _sum: { lossAmount: true },
    _avg: { riskScore: true },
    where: { outcomeRealized: true, hadChargebackOrRto: true },
  });
  const merchantBreakdown = merchants.map((m) => ({
    merchantId: m.merchantId,
    category: m.merchantCategory,
    lossCount: m._count._all,
    lossAmount: m._sum.lossAmount ?? 0,
    avgRisk: Number(m._avg.riskScore?.toFixed(4) ?? 0),
  })).sort((a, b) => b.lossAmount - a.lossAmount);

  // Category breakdown
  const categories = await db.transaction.groupBy({
    by: ['category'],
    _count: { _all: true },
    _sum: { lossAmount: true },
    where: { outcomeRealized: true, hadChargebackOrRto: true },
  });
  const categoryBreakdown = categories.map((c) => ({
    category: c.category,
    lossCount: c._count._all,
    lossAmount: c._sum.lossAmount ?? 0,
  })).sort((a, b) => b.lossAmount - a.lossAmount);

  // Top-risk pending orders
  const topRisky = await db.transaction.findMany({
    where: { outcomeRealized: false, decision: null },
    orderBy: { riskScore: 'desc' },
    take: 12,
  });

  const pendingDecisions = await db.transaction.count({
    where: { outcomeRealized: false, decision: null, riskScore: { gte: operatingThreshold } },
  });

  return NextResponse.json({
    model: {
      version: model.version,
      rocAuc: model.metrics.rocAuc,
      prAuc: model.metrics.prAuc,
      baselineRocAuc: model.metrics.baseline.rocAuc,
      baselinePrAuc: model.metrics.baseline.prAuc,
      operatingThreshold,
      trainedAt: model.createdAt,
      trainCount: model.data.trainCount,
      testCount: model.data.testCount,
      testPositiveRate: model.data.testPositiveRate,
    },
    kpis: {
      totalTransactions: total,
      pendingTransactions: pending,
      pendingDecisions,
      pendingExposure,
      pendingExpectedLoss,
      realizedLoss: impact.preventedLoss + impact.missedLoss,
      preventedLoss: impact.preventedLoss,
      missedLoss: impact.missedLoss,
      falsePositiveCost: impact.falsePositiveCost,
      investigationCost: impact.investigationCost,
      netSavings: impact.netSavings,
      investigationVolume: impact.investigationVolume,
      precision: impact.precision,
      recall: impact.recall,
      avgLossPerPositive,
    },
    bandDistribution,
    trend: trendBuckets,
    merchantBreakdown,
    categoryBreakdown,
    topRisky: topRisky.map((t) => ({
      id: t.id,
      ts: Number(t.ts),
      amount: t.amount,
      riskScore: t.riskScore,
      riskBand: t.riskBand,
      category: t.category,
      paymentMethod: t.paymentMethod,
      customerId: t.customerId,
      isGuest: t.isGuest,
      shippingCity: t.shippingCity,
    })),
    costParams: DEFAULT_COST_PARAMS,
  });
}

export const dynamic = 'force-dynamic';

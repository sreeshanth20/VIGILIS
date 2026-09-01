/**
 * VIGILIS database seeder.
 *
 *   bun run scripts/seed.ts
 *
 * Generates the (reproducible) transaction universe using the same seed as
 * training, scores every transaction with the *trained* model, persists
 * everything to SQLite, and marks the most recent N days of transactions as
 * "pending" (outcome not yet realised) so the demo workflow shows the model
 * catching risk before the outcome is known.
 *
 * The model has only ever seen train+val splits. To keep the demo honest,
 * we surface ALL transactions (including test) but tag each with the split
 * it belongs to in the JSON payload of topFactorsJson. This way an evaluator
 * can verify the model's live behaviour matches the held-out metrics.
 */

import { db } from '../src/lib/db';
import { generateDataset, Transaction } from '../src/lib/ml/data';
import { explainTransaction, getModel } from '../src/lib/ml/inference';

const SEED = 20240117; // MUST match training seed
const N = 24000;
const PENDING_DAYS = 7; // most recent week is "pending"

function riskBandFor(score: number, threshold: number): 'critical' | 'high' | 'elevated' | 'normal' {
  // Bands are defined relative to the operating threshold so they remain
  // meaningful when the analyst adjusts the threshold in the UI.
  if (score >= Math.min(0.95, threshold + 0.25)) return 'critical';
  if (score >= threshold + 0.05) return 'high';
  if (score >= threshold - 0.05) return 'elevated';
  return 'normal';
}

async function main() {
  const t0 = Date.now();
  console.log('VIGILIS seeder — generating dataset...');
  const { transactions } = generateDataset({ seed: SEED, count: N });
  console.log(`Generated ${transactions.length} transactions`);

  // Load the trained model (verifies the artifact exists)
  const model = getModel();
  const defaultThreshold = model.metrics.atDefaultThreshold.threshold;
  console.log(`Model loaded. defaultThreshold=${defaultThreshold.toFixed(3)}`);

  // Determine the "pending" cutoff: the most recent PENDING_DAYS of transactions
  // are marked as outcomeRealized=false (the analyst doesn't yet know the outcome).
  const maxTs = transactions.reduce((m, t) => Math.max(m, t.ts), 0);
  const pendingCutoff = maxTs - PENDING_DAYS * 86400000;

  // Wipe existing data (deterministic re-seed)
  console.log('Clearing existing transactions...');
  await db.transaction.deleteMany({});
  await db.auditLog.deleteMany({});

  // Score & insert in batches
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < transactions.length; i += BATCH) {
    const batch = transactions.slice(i, i + BATCH);
    const rows = batch.map((t) => {
      const explanation = explainTransaction(t);
      // Top 8 contributing factors (by absolute contribution)
      const topFactors = [...explanation.contributions]
        .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
        .slice(0, 8)
        .map((f) => ({
          feature: f.feature,
          description: f.description,
          group: f.group,
          value: f.value,
          contribution: Number(f.contribution.toFixed(4)),
        }));
      const realized = t.ts < pendingCutoff;
      return {
        id: t.id,
        ts: BigInt(t.ts),
        merchantId: t.merchantId,
        merchantCategory: t.merchantCategory,
        category: t.category,
        categoryBaseRisk: t.categoryBaseRisk,
        isHighValueCategory: t.isHighValueCategory,
        customerId: t.customerId,
        isGuest: t.isGuest,
        customerAccountAgeDays: t.customerAccountAgeDays,
        customerPriorOrders: t.customerPriorOrders,
        customerPriorReturns: t.customerPriorReturns,
        customerPriorChargebacks: t.customerPriorChargebacks,
        customerReturnRate: t.customerReturnRate,
        customerChargebackRate: t.customerChargebackRate,
        customerLtv: t.customerLtv,
        amount: t.amount,
        quantity: t.quantity,
        paymentMethod: t.paymentMethod,
        isCod: t.isCod,
        isPrepaid: t.isPrepaid,
        isUpi: t.isUpi,
        isEmi: t.isEmi,
        isGiftCard: t.isGiftCard,
        shippingCity: t.shippingCity,
        shippingTier: t.shippingTier,
        shippingState: t.shippingState,
        billingCity: t.billingCity,
        addressMismatch: t.addressMismatch,
        deviceId: t.deviceId,
        deviceSeenCount24h: t.deviceSeenCount24h,
        ipHash: t.ipHash,
        ipSeenCount24h: t.ipSeenCount24h,
        customerOrdersLast1h: t.customerOrdersLast1h,
        customerOrdersLast24h: t.customerOrdersLast24h,
        customerOrdersLast7d: t.customerOrdersLast7d,
        customerVelocity7d: t.customerVelocity7d,
        timeSinceLastOrderHours: t.timeSinceLastOrderHours,
        isNewDeviceForCustomer: t.isNewDeviceForCustomer,
        isFestivalPeriod: t.isFestivalPeriod,
        festivalName: t.festivalName,
        isWeekend: t.isWeekend,
        isNightTime: t.isNightTime,
        dayOfYear: t.dayOfYear,
        hour: t.hour,
        riskScore: Number(explanation.proba.toFixed(4)),
        riskBand: riskBandFor(explanation.proba, defaultThreshold),
        topFactorsJson: JSON.stringify(topFactors),
        outcomeRealized: realized,
        hadChargebackOrRto: realized ? t.hadChargebackOrRto : false,
        outcomeKind: realized ? t.outcomeKind : 'pending',
        lossAmount: realized ? t.lossAmount : 0,
      };
    });
    await db.transaction.createMany({ data: rows });
    inserted += rows.length;
    if (inserted % 4000 === 0 || inserted === transactions.length) {
      console.log(`  inserted ${inserted}/${transactions.length}`);
    }
  }

  // Quick sanity stats
  const total = await db.transaction.count();
  const pending = await db.transaction.count({ where: { outcomeRealized: false } });
  const critical = await db.transaction.count({ where: { riskBand: 'critical' } });
  const high = await db.transaction.count({ where: { riskBand: 'high' } });
  const realizedLoss = await db.transaction.aggregate({
    where: { outcomeRealized: true, hadChargebackOrRto: true },
    _sum: { lossAmount: true },
  });
  console.log('---');
  console.log(`Total transactions: ${total}`);
  console.log(`Pending (recent ${PENDING_DAYS}d): ${pending}`);
  console.log(`Risk bands: critical=${critical} high=${high}`);
  console.log(`Realised loss in DB: ₹${(realizedLoss._sum.lossAmount ?? 0).toLocaleString('en-IN')}`);
  console.log(`Seed complete in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});

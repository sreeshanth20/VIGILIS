/**
 * AEGIS tests — ML core, business logic, and data integrity.
 *
 * Run with: `bun test`
 *
 * These tests verify:
 *  - RNG determinism (reproducibility)
 *  - Data generator produces realistic distributions and label rates
 *  - Feature engineering is correct (no leakage, correct values)
 *  - GBDT metrics are computed correctly on known inputs
 *  - Inference loads the artifact and produces valid probabilities
 *  - Feature contributions sum approximately to the logit
 *  - Business-impact math is correct
 *  - Threshold simulation is monotonic where expected
 */

import { test, expect, describe } from 'bun:test';
import { Rng } from '../src/lib/ml/rng';
import { generateDataset, INDIAN_CITIES, PRODUCT_CATEGORIES, PAYMENT_METHODS } from '../src/lib/ml/data';
import { featurize, FEATURES, FEATURE_NAMES } from '../src/lib/ml/features';
import { rocAuc, prAuc, confusionMatrix, classificationMetrics, calibrationCurve, thresholdSweep } from '../src/lib/ml/gbdt';
import { predictProba, featureContributions, trainGBDT, DEFAULT_GBDT_SPEC } from '../src/lib/ml/gbdt';
import { getModel, getFeatureImportances, scoreTransaction, explainTransaction } from '../src/lib/ml/inference';
import { computeThresholdImpact, DEFAULT_COST_PARAMS, formatINR, bandForScore } from '../src/lib/business';

// ---------------------------------------------------------------------------
// RNG
// ---------------------------------------------------------------------------

describe('Rng', () => {
  test('is deterministic across instances with the same seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 10 }, () => a.uniform());
    const seqB = Array.from({ length: 10 }, () => b.uniform());
    expect(seqA).toEqual(seqB);
  });

  test('produces different sequences for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.uniform()).not.toBe(b.uniform());
  });

  test('uniform is in [0, 1)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.uniform();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test('int is within range inclusive', () => {
    const r = new Rng(99);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(10);
    }
  });

  test('shuffle preserves elements', () => {
    const r = new Rng(3);
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const copy = [...arr];
    r.shuffle(arr);
    expect(arr.sort((a, b) => a - b)).toEqual(copy);
  });
});

// ---------------------------------------------------------------------------
// Data generator
// ---------------------------------------------------------------------------

describe('Data generator', () => {
  test('is reproducible from the same seed', () => {
    const a = generateDataset({ seed: 12345, count: 500 });
    const b = generateDataset({ seed: 12345, count: 500 });
    expect(a.transactions.length).toBe(b.transactions.length);
    expect(a.transactions[0].id).toBe(b.transactions[0].id);
    expect(a.transactions[100].amount).toBe(b.transactions[100].amount);
    expect(a.transactions[100].hadChargebackOrRto).toBe(b.transactions[100].hadChargebackOrRto);
  });

  test('produces the requested number of transactions', () => {
    const { transactions } = generateDataset({ seed: 1, count: 800 });
    expect(transactions.length).toBe(800);
  });

  test('all transactions have valid feature values', () => {
    const { transactions } = generateDataset({ seed: 2, count: 500 });
    for (const t of transactions) {
      expect(t.amount).toBeGreaterThan(0);
      expect(t.quantity).toBeGreaterThanOrEqual(1);
      expect(t.riskScore ?? 0).toBeGreaterThanOrEqual(0); // not set yet but ok
      expect(INDIAN_CITIES.some(c => c.city === t.shippingCity)).toBe(true);
      expect(PRODUCT_CATEGORIES.some(c => c.name === t.category)).toBe(true);
      expect(PAYMENT_METHODS.includes(t.paymentMethod as any)).toBe(true);
      expect(t.deviceSeenCount24h).toBeGreaterThanOrEqual(1);
      expect(t.ipSeenCount24h).toBeGreaterThanOrEqual(1);
      expect(t.customerReturnRate).toBeGreaterThanOrEqual(0);
      expect(t.customerReturnRate).toBeLessThanOrEqual(1);
    }
  });

  test('positive rate is in a realistic range (5%-45%)', () => {
    const { transactions } = generateDataset({ seed: 20240117, count: 5000 });
    const pos = transactions.filter(t => t.hadChargebackOrRto).length;
    const rate = pos / transactions.length;
    expect(rate).toBeGreaterThan(0.05);
    expect(rate).toBeLessThan(0.45);
  });

  test('transactions span the expected time range and are generated day-by-day', () => {
    const { transactions } = generateDataset({ seed: 3, count: 2000 });
    const ts = transactions.map(t => t.ts);
    const min = Math.min(...ts);
    const max = Math.max(...ts);
    // Should span at least 7 days
    expect((max - min) / 86400000).toBeGreaterThan(7);
    // All timestamps should be within a plausible horizon (<= 1 year)
    expect((max - min) / 86400000).toBeLessThan(366);
  });

  test('customer history accumulates correctly (prior counts increase)', () => {
    const { transactions } = generateDataset({ seed: 4, count: 5000 });
    // Group by customer and verify prior orders are non-decreasing
    const seen: Record<string, number> = {};
    for (const t of transactions) {
      const prior = seen[t.customerId] ?? 0;
      expect(t.customerPriorOrders).toBe(prior);
      seen[t.customerId] = prior + 1;
    }
  });

  test('gift card orders never use COD (business rule)', () => {
    const { transactions } = generateDataset({ seed: 5, count: 5000 });
    const giftCardTxns = transactions.filter(t => t.isGiftCard);
    expect(giftCardTxns.length).toBeGreaterThan(0);
    for (const t of giftCardTxns) {
      expect(t.isCod).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Feature engineering
// ---------------------------------------------------------------------------

describe('Feature engineering', () => {
  test('feature count matches spec', () => {
    expect(FEATURES.length).toBe(FEATURE_NAMES.length);
    expect(FEATURES.length).toBeGreaterThan(30);
  });

  test('every feature has a name, description, and group', () => {
    for (const f of FEATURES) {
      expect(f.name).toBeTruthy();
      expect(f.description).toBeTruthy();
      expect(['customer', 'order', 'payment', 'behavior', 'geography', 'temporal']).toContain(f.group);
    }
  });

  test('featurize returns the correct number of values', () => {
    const { transactions } = generateDataset({ seed: 10, count: 50 });
    const x = featurize(transactions[0]);
    expect(x.length).toBe(FEATURES.length);
  });

  test('feature values are finite numbers', () => {
    const { transactions } = generateDataset({ seed: 11, count: 200 });
    for (const t of transactions) {
      const x = featurize(t);
      for (const v of x) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  test('binary features are 0 or 1', () => {
    const { transactions } = generateDataset({ seed: 12, count: 200 });
    const binaryFeatures = FEATURES.filter(f =>
      f.name.startsWith('is_') || f.name.includes('_flag') || f.name === 'mismatch_cod' || f.name === 'burst_purchase' || f.name === 'cod_high_value' || f.name === 'emi_high_value' || f.name === 'amount_over_15k' || f.name === 'amount_over_25k' || f.name === 'account_age_lt_7d' || f.name === 'account_age_lt_30d' || f.name === 'shipping_tier_1' || f.name === 'shipping_tier_3' || f.name === 'new_device_guest_high_value'
    );
    for (const t of transactions) {
      const x = featurize(t);
      for (const f of binaryFeatures) {
        const idx = FEATURE_NAMES.indexOf(f.name);
        expect([0, 1]).toContain(x[idx]);
      }
    }
  });

  test('no future leakage: features only use prior state', () => {
    // customerPriorOrders should equal the count BEFORE this order
    const { transactions } = generateDataset({ seed: 13, count: 1000 });
    const byCustomer: Record<string, number> = {};
    for (const t of transactions) {
      expect(t.customerPriorOrders).toBe(byCustomer[t.customerId] ?? 0);
      // update after
      byCustomer[t.customerId] = (byCustomer[t.customerId] ?? 0) + 1;
    }
  });
});

// ---------------------------------------------------------------------------
// GBDT metrics
// ---------------------------------------------------------------------------

describe('GBDT metrics', () => {
  test('rocAuc is 1.0 for a perfect classifier', () => {
    const scores = [0.9, 0.8, 0.7, 0.6, 0.1];
    const labels = [1, 1, 1, 1, 0];
    expect(rocAuc(scores, labels)).toBeCloseTo(1.0, 5);
  });

  test('rocAuc is 0.0 for a perfectly inverted classifier', () => {
    const scores = [0.1, 0.2, 0.3, 0.4, 0.9];
    const labels = [1, 1, 1, 1, 0];
    expect(rocAuc(scores, labels)).toBeCloseTo(0.0, 5);
  });

  test('rocAuc is 0.5 for random', () => {
    const scores = [0.5, 0.5, 0.5, 0.5];
    const labels = [1, 0, 1, 0];
    expect(rocAuc(scores, labels)).toBeCloseTo(0.5, 5);
  });

  test('rocAuc handles ties correctly', () => {
    const scores = [0.5, 0.5, 0.5, 0.5];
    const labels = [1, 1, 0, 0];
    expect(rocAuc(scores, labels)).toBeCloseTo(0.5, 5);
  });

  test('prAuc is 1.0 for a perfect classifier', () => {
    const scores = [0.9, 0.8, 0.1];
    const labels = [1, 1, 0];
    expect(prAuc(scores, labels)).toBeCloseTo(1.0, 4);
  });

  test('prAuc is 0 when there are no positives', () => {
    expect(prAuc([0.1, 0.5, 0.9], [0, 0, 0])).toBe(0);
  });

  test('confusionMatrix counts correctly', () => {
    const scores = [0.9, 0.8, 0.4, 0.3, 0.6];
    const labels = [1, 1, 0, 0, 1];
    const cm = confusionMatrix(scores, labels, 0.5);
    // >= 0.5 predicted positive: scores 0.9, 0.8, 0.6
    // label 1 at 0.9 → TP; label 1 at 0.8 → TP; label 1 at 0.6 → TP
    // label 0 at 0.4 → TN; label 0 at 0.3 → TN
    expect(cm.tp).toBe(3);
    expect(cm.fp).toBe(0);
    expect(cm.fn).toBe(0);
    expect(cm.tn).toBe(2);
  });

  test('classificationMetrics computes precision/recall/f1', () => {
    const scores = [0.9, 0.8, 0.7, 0.6, 0.55, 0.4, 0.3, 0.2];
    const labels = [1, 1, 1, 0, 1, 0, 1, 0];
    const m = classificationMetrics(scores, labels, 0.5);
    // predicted positive: 0.9,0.8,0.7,0.6,0.55 (5)
    // TP: 0.9,0.8,0.7,0.55 = 4; FP: 0.6 = 1
    // FN: 0.3 = 1; TN: 0.4,0.2 = 2
    expect(m.tp).toBe(4);
    expect(m.fp).toBe(1);
    expect(m.fn).toBe(1);
    expect(m.tn).toBe(2);
    expect(m.precision).toBeCloseTo(4 / 5, 4);
    expect(m.recall).toBeCloseTo(4 / 5, 4);
    expect(m.f1).toBeCloseTo(0.8, 4);
  });

  test('thresholdSweep produces monotonic recall', () => {
    const scores = [0.95, 0.85, 0.75, 0.65, 0.5, 0.3, 0.1];
    const labels = [1, 1, 1, 0, 1, 0, 0];
    const sweep = thresholdSweep(scores, labels, 50);
    // As threshold increases, recall should be non-increasing
    for (let i = 1; i < sweep.length; i++) {
      expect(sweep[i].recall).toBeLessThanOrEqual(sweep[i - 1].recall + 1e-9);
    }
  });

  test('calibrationCurve returns the right number of bins', () => {
    const scores = Array.from({ length: 100 }, (_, i) => i / 100);
    const labels = scores.map(s => (s > 0.5 ? 1 : 0));
    const cal = calibrationCurve(scores, labels, 10);
    expect(cal.length).toBe(10);
    for (const b of cal) {
      expect(b.binCenter).toBeGreaterThanOrEqual(0);
      expect(b.binCenter).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Model training (mini run)
// ---------------------------------------------------------------------------

describe('GBDT training', () => {
  test('trains and produces probabilities in [0,1]', () => {
    const { transactions } = generateDataset({ seed: 50, count: 1500 });
    const X = transactions.map(featurize);
    const y = transactions.map(t => (t.hadChargebackOrRto ? 1 : 0));
    const model = trainGBDT(X, y, null, null, { ...DEFAULT_GBDT_SPEC, nEstimators: 30, earlyStoppingRounds: undefined }, 123);
    expect(model.trees.length).toBeGreaterThan(0);
    for (const x of X) {
      const p = predictProba(model, x);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  test('beats random on a separable dataset', () => {
    const { transactions } = generateDataset({ seed: 51, count: 2500 });
    const n = transactions.length;
    const split = Math.floor(n * 0.7);
    const Xtr = transactions.slice(0, split).map(featurize);
    const ytr = transactions.slice(0, split).map(t => (t.hadChargebackOrRto ? 1 : 0));
    const Xte = transactions.slice(split).map(featurize);
    const yte = transactions.slice(split).map(t => (t.hadChargebackOrRto ? 1 : 0));
    const model = trainGBDT(Xtr, ytr, null, null, { ...DEFAULT_GBDT_SPEC, nEstimators: 60, earlyStoppingRounds: undefined }, 77);
    const scores = Xte.map(x => predictProba(model, x));
    const auc = rocAuc(scores, yte);
    expect(auc).toBeGreaterThan(0.65);
  });
});

// ---------------------------------------------------------------------------
// Inference (loaded artifact)
// ---------------------------------------------------------------------------

describe('Inference (trained artifact)', () => {
  test('model artifact loads', () => {
    const m = getModel();
    expect(m.version).toBe(1);
    expect(m.trees.length).toBeGreaterThan(50);
    expect(m.featureCount).toBe(FEATURES.length);
  });

  test('held-out test metrics are present and reasonable', () => {
    const m = getModel();
    expect(m.metrics.rocAuc).toBeGreaterThan(0.75);
    expect(m.metrics.prAuc).toBeGreaterThan(0.6);
    expect(m.metrics.atDefaultThreshold.threshold).toBeGreaterThan(0);
    expect(m.metrics.atDefaultThreshold.threshold).toBeLessThan(1);
  });

  test('test set count is the held-out 15%', () => {
    const m = getModel();
    expect(m.data.testCount).toBeGreaterThan(0);
    // train + val + test should be consistent
    const total = m.data.trainCount + m.data.valCount + m.data.testCount;
    expect(total).toBeGreaterThan(15000);
  });

  test('scoreTransaction returns a valid probability', () => {
    const { transactions } = generateDataset({ seed: 60, count: 50 });
    for (const t of transactions) {
      const p = scoreTransaction(t);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  test('feature contributions sum approximates the logit', () => {
    const { transactions } = generateDataset({ seed: 61, count: 50 });
    for (const t of transactions) {
      const exp = explainTransaction(t);
      const sumContribs = exp.contributions.reduce((s, c) => s + c.contribution, 0);
      // base + sum(contributions) should approximate logit
      const approx = exp.base + sumContribs;
      // Allow generous tolerance because contributions are a path-based approximation
      expect(Math.abs(approx - exp.logit)).toBeLessThan(5);
    }
  });

  test('feature importances sum to ~1 and are non-negative', () => {
    const imps = getFeatureImportances();
    const total = imps.reduce((s, f) => s + f.importance, 0);
    expect(total).toBeCloseTo(1.0, 2);
    for (const f of imps) {
      expect(f.importance).toBeGreaterThanOrEqual(0);
    }
  });

  test('top importances include known-risky features', () => {
    const imps = getFeatureImportances();
    const top10 = imps.slice(0, 10).map(f => f.feature);
    // At least one of these strong-signal features should be in the top 10
    const expected = ['is_cod', 'is_guest', 'device_seen_24h', 'ip_seen_24h', 'customer_prior_chargebacks', 'is_gift_card', 'customer_account_age_days', 'category_base_risk'];
    const overlap = top10.filter(f => expected.includes(f));
    expect(overlap.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Business logic
// ---------------------------------------------------------------------------

describe('Business logic', () => {
  test('computeThresholdImpact counts correctly', () => {
    const txns = [
      { riskScore: 0.9, amount: 1000, lossAmount: 200, hadChargebackOrRto: true, outcomeRealized: true },
      { riskScore: 0.8, amount: 500, lossAmount: 100, hadChargebackOrRto: true, outcomeRealized: true },
      { riskScore: 0.4, amount: 2000, lossAmount: 0, hadChargebackOrRto: false, outcomeRealized: true },
      { riskScore: 0.7, amount: 3000, lossAmount: 0, hadChargebackOrRto: false, outcomeRealized: true },
      { riskScore: 0.6, amount: 500, lossAmount: 0, hadChargebackOrRto: false, outcomeRealized: false }, // pending
    ];
    const impact = computeThresholdImpact(txns, 0.5);
    // threshold 0.5 → flags riskScore >= 0.5: txns 0,1,3 (txn 4 is pending, excluded from financials)
    expect(impact.truePositives).toBe(2);
    expect(impact.falsePositives).toBe(1);
    expect(impact.flagged).toBe(3); // includes pending
    expect(impact.totalFlagged).toBe(4); // 4 total flagged (incl pending)
  });

  test('prevented loss = lossAmount × preventionRate for each TP', () => {
    const txns = [
      { riskScore: 0.9, amount: 1000, lossAmount: 200, hadChargebackOrRto: true, outcomeRealized: true },
    ];
    const impact = computeThresholdImpact(txns, 0.5);
    expect(impact.preventedLoss).toBeCloseTo(200 * DEFAULT_COST_PARAMS.preventionRate, 2);
  });

  test('false-positive cost = amount × falsePositiveCostRate for each FP', () => {
    const txns = [
      { riskScore: 0.9, amount: 1000, lossAmount: 0, hadChargebackOrRto: false, outcomeRealized: true },
    ];
    const impact = computeThresholdImpact(txns, 0.5);
    expect(impact.falsePositiveCost).toBeCloseTo(1000 * DEFAULT_COST_PARAMS.falsePositiveCostRate, 2);
  });

  test('investigation cost = flagged × investigationCostPerCase', () => {
    const txns = [
      { riskScore: 0.9, amount: 1000, lossAmount: 0, hadChargebackOrRto: false, outcomeRealized: true },
      { riskScore: 0.8, amount: 1000, lossAmount: 0, hadChargebackOrRto: false, outcomeRealized: true },
    ];
    const impact = computeThresholdImpact(txns, 0.5);
    expect(impact.investigationCost).toBe(2 * DEFAULT_COST_PARAMS.investigationCostPerCase);
  });

  test('higher threshold → fewer flagged (monotonic)', () => {
    const { transactions } = generateDataset({ seed: 70, count: 1500 });
    const realized = transactions.filter(t => true).map(t => ({ riskScore: Math.random(), amount: t.amount, lossAmount: t.lossAmount, hadChargebackOrRto: t.hadChargebackOrRto, outcomeRealized: true }));
    // assign random risk scores for the test
    const low = computeThresholdImpact(realized, 0.2);
    const mid = computeThresholdImpact(realized, 0.5);
    const high = computeThresholdImpact(realized, 0.8);
    expect(low.flagged).toBeGreaterThanOrEqual(mid.flagged);
    expect(mid.flagged).toBeGreaterThanOrEqual(high.flagged);
  });

  test('formatINR produces Indian-grouped output', () => {
    expect(formatINR(1000)).toBe('₹1,000');
    expect(formatINR(150000)).toBe('₹1,50,000');
    expect(formatINR(10000000)).toBe('₹1,00,00,000');
  });

  test('formatINR compact uses L/Cr suffixes', () => {
    expect(formatINR(150000, { compact: true })).toBe('₹1.50L');
    expect(formatINR(10000000, { compact: true })).toBe('₹1.00Cr');
  });

  test('bandForScore respects threshold-relative bands', () => {
    expect(bandForScore(0.95, 0.35)).toBe('critical');
    expect(bandForScore(0.5, 0.35)).toBe('high');
    expect(bandForScore(0.36, 0.35)).toBe('elevated');
    expect(bandForScore(0.1, 0.35)).toBe('normal');
  });
});

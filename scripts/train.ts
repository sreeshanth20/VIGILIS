/**
 * AEGIS training pipeline.
 *
 *   bun run scripts/train.ts
 *
 * Produces:
 *   src/lib/ml/artifacts/model.json   (trained GBDT + feature spec + held-out metrics)
 *   src/lib/ml/artifacts/eval.json    (extra evaluation artefacts for inspection)
 *
 * The pipeline is fully reproducible from SEED below. The held-out test set
 * is generated and *never* used for model selection or training.
 */

import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { generateDataset } from '../src/lib/ml/data';
import { featurizeAll } from '../src/lib/ml/features';
import { trainGBDT, predictProbaBatch, rocAuc, prAuc, confusionMatrix, classificationMetrics, calibrationCurve, thresholdSweep, DEFAULT_GBDT_SPEC } from '../src/lib/ml/gbdt';
import { toArtifact, HeldOutMetrics, ModelArtifact } from '../src/lib/ml/inference';

const SEED = 20240117;
const N = 24000; // transactions to generate
const TRAIN_FRAC = 0.70;
const VAL_FRAC = 0.15;
// remaining 15% is the held-out test set

function splitByTime<T extends { ts: number }>(rows: T[], trainFrac: number, valFrac: number): { train: T[]; val: T[]; test: T[] } {
  // Sort by timestamp to simulate a real temporal split (older -> train, recent -> test).
  // This is the honest way: the model is evaluated on the future.
  const sorted = [...rows].sort((a, b) => a.ts - b.ts);
  const n = sorted.length;
  const trainEnd = Math.floor(n * trainFrac);
  const valEnd = trainEnd + Math.floor(n * valFrac);
  return {
    train: sorted.slice(0, trainEnd),
    val: sorted.slice(trainEnd, valEnd),
    test: sorted.slice(valEnd),
  };
}

// A simple logistic-regression baseline trained on the same featurised data,
// to honestly demonstrate the GBDT's lift over a linear model.
interface LogisticModel {
  w: number[];
  b: number;
  mean: number[];
  std: number[];
}

function trainLogisticBaseline(X: number[][], y: number[], epochs = 400, lr = 0.05, l2 = 0.001): LogisticModel {
  const n = X.length;
  const f = X[0].length;
  // standardise features for stable training
  const mean = new Array(f).fill(0);
  const std = new Array(f).fill(1);
  for (let j = 0; j < f; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += X[i][j];
    mean[j] = s / n;
    let ss = 0;
    for (let i = 0; i < n; i++) ss += (X[i][j] - mean[j]) ** 2;
    std[j] = Math.sqrt(ss / n) || 1;
  }
  const Xs = X.map((r) => r.map((v, j) => (v - mean[j]) / std[j]));
  const w = new Array(f).fill(0);
  const p0 = (y.reduce((a, c) => a + c, 0) + 1) / (n + 2);
  let b = Math.log(p0 / (1 - p0));
  for (let ep = 0; ep < epochs; ep++) {
    const gradW = new Array(f).fill(0);
    let gradB = 0;
    for (let i = 0; i < n; i++) {
      const z = b + Xs[i].reduce((s, v, j) => s + v * w[j], 0);
      const p = 1 / (1 + Math.exp(-z));
      const err = p - y[i];
      for (let j = 0; j < f; j++) gradW[j] += err * Xs[i][j];
      gradB += err;
    }
    for (let j = 0; j < f; j++) {
      w[j] -= lr * (gradW[j] / n + l2 * w[j]);
    }
    b -= lr * (gradB / n);
  }
  return { w, b, mean, std };
}

function scoreLogistic(model: LogisticModel, X: number[][]): number[] {
  return X.map((row) => {
    const z = row.reduce((s, v, j) => s + ((v - model.mean[j]) / model.std[j]) * model.w[j], 0) + model.b;
    return 1 / (1 + Math.exp(-z));
  });
}

async function main() {
  const t0 = Date.now();
  console.log(`AEGIS training pipeline — seed=${SEED}`);
  console.log(`Generating ${N} transactions...`);
  const { transactions } = generateDataset({ seed: SEED, count: N });
  console.log(`Generated ${transactions.length} transactions`);

  const { train, val, test } = splitByTime(transactions, TRAIN_FRAC, VAL_FRAC);
  const positiveRate = train.filter((t) => t.hadChargebackOrRto).length / train.length;
  const testPositiveRate = test.filter((t) => t.hadChargebackOrRto).length / test.length;
  console.log(`Split: train=${train.length} val=${val.length} test=${test.length}`);
  console.log(`Positive rate: train=${(positiveRate * 100).toFixed(2)}%  test=${(testPositiveRate * 100).toFixed(2)}%`);

  const Xtrain = featurizeAll(train);
  const ytrain = train.map((t) => (t.hadChargebackOrRto ? 1 : 0));
  const Xval = featurizeAll(val);
  const yval = val.map((t) => (t.hadChargebackOrRto ? 1 : 0));
  const Xtest = featurizeAll(test);
  const ytest = test.map((t) => (t.hadChargebackOrRto ? 1 : 0));

  console.log('Training logistic baseline...');
  const baseline = trainLogisticBaseline(Xtrain, ytrain);

  console.log('Training GBDT...');
  const model = trainGBDT(Xtrain, ytrain, Xval, yval, DEFAULT_GBDT_SPEC, SEED, (info) => {
    if (info.iter % 20 === 0) {
      const va = info.valPrAuc ? info.valPrAuc.toFixed(4) : 'n/a';
      console.log(`  iter ${info.iter.toString().padStart(3)}  trainLoss=${info.trainLoss.toFixed(4)}  valPrAuc=${va}`);
    }
  });
  console.log(`GBDT trained. bestIteration=${model.bestIteration}  trees=${model.trees.length}`);

  // Evaluate on the held-out test set
  const testScores = predictProbaBatch(model, Xtest);
  const baselineTestScores = scoreLogistic(baseline, Xtest);

  const auc = rocAuc(testScores, ytest);
  const pr = prAuc(testScores, ytest);
  const baseAuc = rocAuc(baselineTestScores, ytest);
  const basePr = prAuc(baselineTestScores, ytest);
  console.log(`Held-out TEST  GBDT  ROC-AUC=${auc.toFixed(4)}  PR-AUC=${pr.toFixed(4)}`);
  console.log(`Held-out TEST  LogReg ROC-AUC=${baseAuc.toFixed(4)}  PR-AUC=${basePr.toFixed(4)}`);

  // Choose a default operating threshold: maximise F1 on the *validation* set
  const valScores = predictProbaBatch(model, Xval);
  const valSweep = thresholdSweep(valScores, yval, 200);
  let bestF1 = -1;
  let bestThr = 0.5;
  for (const m of valSweep) {
    if (m.f1 > bestF1) { bestF1 = m.f1; bestThr = m.threshold; }
  }
  console.log(`Default threshold (max F1 on val): ${bestThr.toFixed(3)}  (F1=${bestF1.toFixed(3)})`);

  const atDefault = classificationMetrics(testScores, ytest, bestThr);
  const cm = confusionMatrix(testScores, ytest, bestThr);
  console.log(`Confusion @thr=${bestThr.toFixed(3)}: TP=${cm.tp} FP=${cm.fp} FN=${cm.fn} TN=${cm.tn}`);
  console.log(`precision=${atDefault.precision.toFixed(3)} recall=${atDefault.recall.toFixed(3)} fpr=${atDefault.fpr.toFixed(4)} fnr=${atDefault.fnr.toFixed(4)}`);

  const calib = calibrationCurve(testScores, ytest, 10);
  const sweep = thresholdSweep(testScores, ytest, 100);

  const metrics: HeldOutMetrics = {
    rocAuc: auc,
    prAuc: pr,
    baselinePrAuc: testPositiveRate,
    atDefaultThreshold: { threshold: bestThr, ...atDefault, tp: cm.tp, fp: cm.fp, fn: cm.fn, tn: cm.tn },
    calibration: calib,
    sweep: sweep,
    baseline: { rocAuc: baseAuc, prAuc: basePr },
  };

  const horizonDays = Math.ceil((transactions[transactions.length - 1].ts - transactions[0].ts) / 86400000);
  const artifact: ModelArtifact = toArtifact(model, metrics, {
    trainCount: train.length,
    valCount: val.length,
    testCount: test.length,
    positiveRate,
    testPositiveRate,
    generatedAt: new Date().toISOString(),
    horizonDays,
  }, SEED);

  const outDir = path.join(process.cwd(), 'src/lib/ml/artifacts');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'model.json'), JSON.stringify(artifact, null, 2));
  writeFileSync(path.join(outDir, 'eval.json'), JSON.stringify({
    trainLossHistory: model.trainLossHistory,
    valLossHistory: model.valLossHistory,
    valPrAucHistory: model.valPrAucHistory,
    baselineTestScoresSample: baselineTestScores.slice(0, 100),
    testScoresSample: testScores.slice(0, 100),
    ytestSample: ytest.slice(0, 100),
  }, null, 2));

  console.log(`Wrote ${path.join(outDir, 'model.json')}`);
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => { console.error(e); process.exit(1); });

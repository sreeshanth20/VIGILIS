import { NextResponse } from 'next/server';
import { getModel, getFeatureImportances } from '@/lib/ml/inference';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

/**
 * GET /api/model
 *
 * Full model performance view: held-out test metrics, ROC/PR curves
 * (computed from the sweep), confusion matrix at the operating threshold,
 * calibration curve, feature importances, baseline comparison, and the
 * training loss history.
 */
export async function GET() {
  const model = getModel();
  const importances = getFeatureImportances();

  // Derive ROC + PR curve points from the threshold sweep
  const sweep = model.metrics.sweep;
  // ROC: TPR vs FPR
  const rocCurve = sweep.map((s) => ({
    threshold: s.threshold,
    fpr: s.fpr,
    tpr: s.recall,
  }));
  // PR: precision vs recall
  const prCurve = sweep.map((s) => ({
    threshold: s.threshold,
    precision: s.precision,
    recall: s.recall,
  }));

  // Training history (if eval.json exists)
  let trainingHistory: { trainLoss: number[]; valLoss: number[]; valPrAuc: number[] } | null = null;
  const evalPath = path.join(process.cwd(), 'src/lib/ml/artifacts/eval.json');
  if (existsSync(evalPath)) {
    try {
      const evalData = JSON.parse(readFileSync(evalPath, 'utf8'));
      trainingHistory = {
        trainLoss: evalData.trainLossHistory ?? [],
        valLoss: evalData.valLossHistory ?? [],
        valPrAuc: evalData.valPrAucHistory ?? [],
      };
    } catch {
      // ignore
    }
  }

  const atDefault = model.metrics.atDefaultThreshold;

  return NextResponse.json({
    meta: {
      version: model.version,
      createdAt: model.createdAt,
      seed: model.seed,
      trainCount: model.data.trainCount,
      valCount: model.data.valCount,
      testCount: model.data.testCount,
      positiveRate: model.data.positiveRate,
      testPositiveRate: model.data.testPositiveRate,
      horizonDays: model.data.horizonDays,
      featureCount: model.featureCount,
      treeCount: model.trees.length,
      bestIteration: model.bestIteration,
    },
    spec: model.spec,
    metrics: {
      rocAuc: model.metrics.rocAuc,
      prAuc: model.metrics.prAuc,
      baselinePrAuc: model.metrics.baselinePrAuc,
      baseline: model.metrics.baseline,
      operatingThreshold: atDefault.threshold,
      confusion: {
        tp: atDefault.tp, fp: atDefault.fp, fn: atDefault.fn, tn: atDefault.tn,
      },
      classification: {
        precision: atDefault.precision,
        recall: atDefault.recall,
        f1: atDefault.f1,
        fpr: atDefault.fpr,
        fnr: atDefault.fnr,
        accuracy: atDefault.accuracy,
      },
      calibration: model.metrics.calibration,
    },
    curves: {
      roc: rocCurve,
      pr: prCurve,
      sweep: sweep.map((s) => ({
        threshold: s.threshold,
        precision: s.precision,
        recall: s.recall,
        f1: s.f1,
        fpr: s.fpr,
        fnr: s.fnr,
      })),
    },
    featureImportances: importances.slice(0, 20),
    allFeatureImportances: importances,
    trainingHistory,
  });
}

export const dynamic = 'force-dynamic';

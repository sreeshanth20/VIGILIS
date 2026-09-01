/**
 * AEGIS ML Core — Model artifact schema, persistence, and inference service.
 *
 * The trained model is persisted to `src/lib/ml/artifacts/model.json` so the
 * running application can serve predictions with zero training-time
 * dependencies. This module is the *only* surface the rest of the app uses:
 *
 *   import { getModel } from '@/lib/ml/inference';
 *   const model = getModel();
 *   const { proba, contributions } = model.explain(features);
 *
 * The artifact format is stable and versioned so future retraining can be
 * dropped in without touching the API.
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { FEATURES, featurize } from './features';
import type { Transaction } from './data';
import {
  TrainedGBDT,
  predictProba,
  featureContributions,
} from './gbdt';
import { TreeNode } from './tree';

export const MODEL_VERSION = 1;

export interface ModelArtifact {
  version: number;
  createdAt: string;
  seed: number;
  spec: TrainedGBDT['spec'];
  initScore: number;
  trees: TreeNode[];
  featureImportances: number[];
  featureCount: number;
  bestIteration: number;
  featureNames: string[];
  featureSpec: typeof FEATURES;
  // metrics on the held-out test set (populated by the training script)
  metrics: HeldOutMetrics;
  // metadata about the data the model was trained on
  data: {
    trainCount: number;
    valCount: number;
    testCount: number;
    positiveRate: number;
    testPositiveRate: number;
    generatedAt: string;
    horizonDays: number;
  };
}

export interface HeldOutMetrics {
  rocAuc: number;
  prAuc: number;
  baselinePrAuc: number; // always-predict-positive baseline = positive rate
  atDefaultThreshold: {
    threshold: number;
    tp: number; fp: number; fn: number; tn: number;
    precision: number; recall: number; f1: number;
    fpr: number; fnr: number; accuracy: number;
  };
  calibration: { binCenter: number; meanPred: number; meanActual: number; count: number }[];
  sweep: {
    threshold: number; precision: number; recall: number; f1: number;
    fpr: number; fnr: number; tp: number; fp: number; fn: number; tn: number;
    accuracy: number;
  }[];
  // baseline (logistic regression on same features) for honest comparison
  baseline: { rocAuc: number; prAuc: number; };
}

export interface PredictionExplanation {
  proba: number;
  logit: number;
  base: number;
  contributions: { feature: string; description: string; group: string; value: number; contribution: number }[];
}

let cachedArtifact: ModelArtifact | null = null;
let cachedPath: string | null = null;

/**
 * Returns the loaded model artifact, loading from disk on first call.
 * Subsequent calls return the cached instance.
 */
export function getModel(): ModelArtifact {
  if (cachedArtifact) return cachedArtifact;
  // Try a few candidate locations (source-tree first, then relative).
  const candidates = [
    path.join(process.cwd(), 'src/lib/ml/artifacts/model.json'),
    path.join(process.cwd(), 'lib/ml/artifacts/model.json'),
    path.join(__dirname, 'artifacts/model.json'),
  ];
  let resolved: string | null = null;
  for (const c of candidates) {
    if (existsSync(c)) { resolved = c; break; }
  }
  if (!resolved) {
    throw new Error(
      'AEGIS model artifact not found. Run `bun run train` (scripts/train.ts) to produce src/lib/ml/artifacts/model.json',
    );
  }
  cachedPath = resolved;
  const raw = readFileSync(resolved, 'utf8');
  cachedArtifact = JSON.parse(raw) as ModelArtifact;
  return cachedArtifact;
}

/** Convert a TrainedGBDT into a serializable artifact (used by training script). */
export function toArtifact(
  model: TrainedGBDT,
  metrics: HeldOutMetrics,
  dataMeta: ModelArtifact['data'],
  seed: number,
): ModelArtifact {
  return {
    version: MODEL_VERSION,
    createdAt: new Date().toISOString(),
    seed,
    spec: model.spec,
    initScore: model.initScore,
    trees: model.trees,
    featureImportances: model.featureImportances,
    featureCount: model.featureCount,
    bestIteration: model.bestIteration,
    featureNames: FEATURES.map((f) => f.name),
    featureSpec: FEATURES,
    metrics,
    data: dataMeta,
  };
}

/** Reconstruct a TrainedGBDT view from an artifact for inference calls. */
export function artifactToModel(art: ModelArtifact): TrainedGBDT {
  return {
    spec: art.spec,
    initScore: art.initScore,
    trees: art.trees,
    featureImportances: art.featureImportances,
    featureCount: art.featureCount,
    bestIteration: art.bestIteration,
    trainLossHistory: [],
    valLossHistory: [],
    valPrAucHistory: [],
  };
}

/** Predict probability for a transaction. */
export function scoreTransaction(t: Transaction): number {
  const art = getModel();
  return predictProba(artifactToModel(art), featurize(t));
}

/** Explain a transaction: probability + per-feature contributions. */
export function explainTransaction(t: Transaction): PredictionExplanation {
  const art = getModel();
  const x = featurize(t);
  const { proba, logit, base, contributions } = featureContributions(artifactToModel(art), x);
  return {
    proba,
    logit,
    base,
    contributions: contributions.map((c, i) => ({
      feature: FEATURES[i].name,
      description: FEATURES[i].description,
      group: FEATURES[i].group,
      value: x[i],
      contribution: c,
    })),
  };
}

/** Global feature importances (normalised to sum 1). */
export function getFeatureImportances(): { feature: string; description: string; group: string; importance: number }[] {
  const art = getModel();
  const total = art.featureImportances.reduce((a, b) => a + b, 0) || 1;
  return art.featureImportances.map((imp, i) => ({
    feature: FEATURES[i].name,
    description: FEATURES[i].description,
    group: FEATURES[i].group,
    importance: imp / total,
  })).sort((a, b) => b.importance - a.importance);
}

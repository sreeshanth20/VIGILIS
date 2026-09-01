/**
 * AEGIS ML Core — CART regression tree with histogram-based splits.
 *
 * Used as the base learner for gradient boosting. Implements:
 *  - Variance-reduction (squared-error) split selection,
 *  - Quantile candidate thresholds (robust to scale & outliers),
 *  - Leaf values = mean of gradients in the leaf,
 *  - Depth & min-sample controls for regularisation.
 *
 * Trees are intentionally serialisable to plain JSON so the trained model
 * can be loaded at inference time with zero external dependencies.
 */

export interface TreeNode {
  leaf: boolean;
  value?: number; // for leaf
  feature?: number; // for internal
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
  // bookkeeping for explanations (filled at training time)
  count?: number;
}

export interface TreeSpec {
  maxDepth: number;
  minSamplesSplit: number;
  minSamplesLeaf: number;
  /** Number of quantile candidates to consider per feature. */
  numThresholds: number;
  /** L2 regularisation on leaf value (like XGBoost lambda). */
  lambda: number;
}

export const DEFAULT_TREE_SPEC: TreeSpec = {
  maxDepth: 4,
  minSamplesSplit: 20,
  minSamplesLeaf: 10,
  numThresholds: 16,
  lambda: 1.0,
};

/**
 * Train a regression tree on (X, gradients) where we minimise squared error
 * against the gradient. (This is the standard GBDT-with-squared-loss base
 * learner; combined with the boosting loop's logistic link, the ensemble
 * performs logistic regression on the logit space.)
 */
export function trainTree(
  X: number[][],
  g: number[],
  spec: TreeSpec,
  featureSampleRate: number,
  rng: { uniform: () => number },
): TreeNode {
  const n = X.length;
  const f = X[0].length;
  const idx = Array.from({ length: n }, (_, i) => i);
  // sample features for this tree (column subsampling)
  const featureIndices: number[] = [];
  for (let j = 0; j < f; j++) {
    if (rng.uniform() < featureSampleRate) featureIndices.push(j);
  }
  if (featureIndices.length === 0) featureIndices.push(Math.floor(rng.uniform() * f));

  return buildNode(X, g, idx, featureIndices, 0, spec, rng);
}

function buildNode(
  X: number[][],
  g: number[],
  idx: number[],
  featureIndices: number[],
  depth: number,
  spec: TreeSpec,
  rng: { uniform: () => number },
): TreeNode {
  const n = idx.length;
  // Leaf value = optimal least-squares fit to the *negative gradient* (-g),
  // i.e. -sum(g)/(n+lambda). With L2 reg lambda, this is the closed-form
  // minimiser of  sum_i(-g_i - leaf)^2 + lambda*leaf^2.
  const sum = idx.reduce((s, i) => s + g[i], 0);

  if (depth >= spec.maxDepth || n < spec.minSamplesSplit || n <= 1) {
    return { leaf: true, value: -sum / (n + spec.lambda), count: n };
  }

  // variance reduction search
  let bestGain = 0;
  let bestFeat = -1;
  let bestThr = 0;
  let bestLeft: number[] | null = null;
  let bestRight: number[] | null = null;

  const totalSum = sum;
  const totalMean = sum / Math.max(1, n);
  const totalVar = idx.reduce((s, i) => s + (g[i] - totalMean) ** 2, 0);

  for (const feat of featureIndices) {
    // gather (value, grad) pairs
    const vals = new Float64Array(n);
    for (let k = 0; k < n; k++) vals[k] = X[idx[k]][feat];
    const candidates = quantileCandidates(vals, spec.numThresholds);
    if (candidates.length === 0) continue;

    for (const thr of candidates) {
      let leftN = 0;
      let leftSum = 0;
      let leftSq = 0;
      let rightN = 0;
      let rightSum = 0;
      let rightSq = 0;
      for (let k = 0; k < n; k++) {
        const gv = g[idx[k]];
        if (vals[k] <= thr) {
          leftN++;
          leftSum += gv;
          leftSq += gv * gv;
        } else {
          rightN++;
          rightSum += gv;
          rightSq += gv * gv;
        }
      }
      if (leftN < spec.minSamplesLeaf || rightN < spec.minSamplesLeaf) continue;
      const leftMean = leftSum / leftN;
      const rightMean = rightSum / rightN;
      const leftVar = leftSq - 2 * leftMean * leftSum + leftN * leftMean * leftMean;
      const rightVar = rightSq - 2 * rightMean * rightSum + rightN * rightMean * rightMean;
      const gain = totalVar - (leftVar + rightVar);
      if (gain > bestGain) {
        bestGain = gain;
        bestFeat = feat;
        bestThr = thr;
        bestLeft = [];
        bestRight = [];
        for (let k = 0; k < n; k++) {
          if (vals[k] <= thr) bestLeft.push(idx[k]);
          else bestRight.push(idx[k]);
        }
      }
    }
  }

  if (bestFeat === -1 || bestLeft === null || bestRight === null) {
    return { leaf: true, value: -sum / (n + spec.lambda), count: n };
  }

  void rng; // reserved for future randomisation
  void totalSum;

  return {
    leaf: false,
    feature: bestFeat,
    threshold: bestThr!,
    count: n,
    left: buildNode(X, g, bestLeft, featureIndices, depth + 1, spec, rng),
    right: buildNode(X, g, bestRight, featureIndices, depth + 1, spec, rng),
  };
}

/** Pick quantile candidate thresholds from a column. */
function quantileCandidates(vals: Float64Array, k: number): number[] {
  if (vals.length === 0) return [];
  const arr = Array.from(vals).sort((a, b) => a - b);
  // de-duplicate-ish: take k evenly spaced quantiles
  const out: number[] = [];
  const seen = new Set<number>();
  for (let i = 1; i <= k; i++) {
    const q = i / (k + 1);
    const pos = Math.min(arr.length - 1, Math.floor(q * (arr.length - 1)));
    const v = Math.round(arr[pos] * 1e6) / 1e6;
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/** Predict the leaf value for a single feature vector. */
export function predictTree(tree: TreeNode, x: number[]): number {
  let node = tree;
  while (!node.leaf) {
    if (x[node.feature!] <= node.threshold!) node = node.left!;
    else node = node.right!;
  }
  return node.value ?? 0;
}

/**
 * Collect the decision path as (feature, threshold, wentLeft, valueAtNode)
 * — used to compute per-prediction feature contributions (SHAP-like).
 */
export function treePath(tree: TreeNode, x: number[]): { feature: number; threshold: number; wentLeft: boolean; leafValue: number }[] {
  const path: { feature: number; threshold: number; wentLeft: boolean; leafValue: number }[] = [];
  let node = tree;
  while (!node.leaf) {
    const wentLeft = x[node.feature!] <= node.threshold!;
    path.push({ feature: node.feature!, threshold: node.threshold!, wentLeft, leafValue: 0 });
    node = wentLeft ? node.left! : node.right!;
  }
  if (path.length) path[path.length - 1].leafValue = node.value ?? 0;
  return path;
}

'use client';

import { useModelPerformance } from './data';
import { SectionHeader, StateBox } from './bits';
import { formatINR, formatPct, formatNumber } from './format';
import { cn } from '@/lib/utils';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, Area, AreaChart, BarChart, Bar, Cell, ScatterChart, Scatter,
} from 'recharts';
import { BrainCircuit, TrendingUp, Target, Gauge, Layers, GitBranch, Award, ChevronDown } from 'lucide-react';
import { useState } from 'react';

export function ModelPerformance() {
  const { data, isLoading, isError } = useModelPerformance();

  if (isLoading) return <div className="p-6"><StateBox kind="loading" /></div>;
  if (isError || !data) return <div className="p-6"><StateBox kind="error" message="Failed to load model performance" /></div>;

  const { meta, metrics, curves, featureImportances, trainingHistory, spec } = data;
  const rocCurve = curves.roc;
  const prCurve = curves.pr;
  const sweep = curves.sweep;
  const calib = metrics.calibration;
  const importances = featureImportances;
  const allImportances = data.allFeatureImportances ?? [];

  return (
    <div className="px-4 md:px-6 py-6 max-w-[1400px] mx-auto space-y-5">
      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-primary/80 mb-1">Model Performance</div>
        <h1 className="text-2xl font-semibold tracking-tight">Held-Out Evaluation</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Honest evaluation on a held-out temporal test set of <span className="tnum text-foreground">{formatNumber(meta.testCount)}</span> transactions
          ({formatPct(meta.testPositiveRate, 1)} positive rate), never seen during training or model selection.
        </p>
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard icon={Target} label="ROC-AUC" value={metrics.rocAuc.toFixed(4)} sub="GBDT" baseline={`baseline ${metrics.baseline.rocAuc.toFixed(4)}`} delta={metrics.rocAuc - metrics.baseline.rocAuc} />
        <MetricCard icon={Gauge} label="PR-AUC" value={metrics.prAuc.toFixed(4)} sub="GBDT" baseline={`baseline ${metrics.baseline.prAuc.toFixed(4)}`} delta={metrics.prAuc - metrics.baseline.prAuc} />
        <MetricCard icon={BrainCircuit} label="Precision" value={formatPct(metrics.classification.precision)} sub="@ threshold" baseline={`${formatPct(metrics.operatingThreshold, 0)}`} />
        <MetricCard icon={Award} label="Recall" value={formatPct(metrics.classification.recall)} sub="@ threshold" baseline={`F1 ${metrics.classification.f1.toFixed(3)}`} />
      </div>

      {/* Meta strip */}
      <div className="rounded-lg border border-border bg-card/40 p-4 grid grid-cols-2 md:grid-cols-6 gap-4 text-[12px]">
        <Meta label="Trained on" value={formatNumber(meta.trainCount)} sub="transactions" />
        <Meta label="Validation" value={formatNumber(meta.valCount)} sub="transactions" />
        <Meta label="Test set" value={formatNumber(meta.testCount)} sub="held-out" />
        <Meta label="Best iteration" value={String(meta.bestIteration)} sub={`of ${meta.treeCount} trees`} />
        <Meta label="Features" value={String(meta.featureCount)} sub="engineered" />
        <Meta label="Seed" value={String(meta.seed)} sub="reproducible" />
      </div>

      {/* ROC + PR */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CurveCard title="ROC Curve" description="TPR vs FPR on held-out test set">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rocCurve} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="#272320" strokeDasharray="3 3" />
              <XAxis dataKey="fpr" domain={[0, 1]} tickFormatter={(v) => v.toFixed(1)} tick={{ fill: '#98918b', fontSize: 10 }} tickLine={false} axisLine={false} label={{ value: 'FPR', position: 'insideBottom', offset: -2, fill: '#98918b', fontSize: 10 }} />
              <YAxis domain={[0, 1]} tickFormatter={(v) => v.toFixed(1)} tick={{ fill: '#98918b', fontSize: 10 }} tickLine={false} axisLine={false} width={32} />
              <Tooltip contentStyle={{ background: '#110f0d', border: '1px solid #272320', borderRadius: 6, fontSize: 12 }} formatter={(v: any) => Number(v).toFixed(3)} labelFormatter={(v) => `FPR ${Number(v).toFixed(3)}`} />
              <Line type="monotone" dataKey="tpr" name="TPR" stroke="#ef852e" strokeWidth={2} dot={false} />
              <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="#5a5550" strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-2 text-[11px] text-muted-foreground flex justify-between">
            <span>Area under curve = <span className="tnum text-foreground">{metrics.rocAuc.toFixed(4)}</span></span>
            <span>Logistic baseline = <span className="tnum text-foreground">{metrics.baseline.rocAuc.toFixed(4)}</span></span>
          </div>
        </CurveCard>

        <CurveCard title="Precision-Recall Curve" description="Precision vs Recall on held-out test set">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={prCurve} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="#272320" strokeDasharray="3 3" />
              <XAxis dataKey="recall" domain={[0, 1]} tickFormatter={(v) => v.toFixed(1)} tick={{ fill: '#98918b', fontSize: 10 }} tickLine={false} axisLine={false} label={{ value: 'Recall', position: 'insideBottom', offset: -2, fill: '#98918b', fontSize: 10 }} />
              <YAxis domain={[0, 1]} tickFormatter={(v) => v.toFixed(1)} tick={{ fill: '#98918b', fontSize: 10 }} tickLine={false} axisLine={false} width={32} />
              <Tooltip contentStyle={{ background: '#110f0d', border: '1px solid #272320', borderRadius: 6, fontSize: 12 }} formatter={(v: any) => Number(v).toFixed(3)} labelFormatter={(v) => `Recall ${Number(v).toFixed(3)}`} />
              <Line type="monotone" dataKey="precision" name="Precision" stroke="#ef852e" strokeWidth={2} dot={false} />
              <ReferenceLine y={meta.testPositiveRate} stroke="#5a5550" strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-2 text-[11px] text-muted-foreground flex justify-between">
            <span>Area under curve = <span className="tnum text-foreground">{metrics.prAuc.toFixed(4)}</span></span>
            <span>Always-positive baseline = <span className="tnum text-foreground">{metrics.baselinePrAuc.toFixed(4)}</span></span>
          </div>
        </CurveCard>
      </div>

      {/* Confusion + Calibration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card/40 p-4">
          <SectionHeader title="Confusion Matrix" description={`@ operating threshold ${formatPct(metrics.operatingThreshold, 0)}`} />
          <ConfusionMatrix tp={metrics.confusion.tp} fp={metrics.confusion.fp} fn={metrics.confusion.fn} tn={metrics.confusion.tn} />
        </div>

        <CurveCard title="Calibration Curve" description="Predicted probability vs observed frequency">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="#272320" strokeDasharray="3 3" />
              <XAxis dataKey="meanPred" domain={[0, 1]} type="number" tickFormatter={(v) => v.toFixed(1)} tick={{ fill: '#98918b', fontSize: 10 }} tickLine={false} axisLine={false} label={{ value: 'Predicted', position: 'insideBottom', offset: -2, fill: '#98918b', fontSize: 10 }} />
              <YAxis dataKey="meanActual" domain={[0, 1]} type="number" tickFormatter={(v) => v.toFixed(1)} tick={{ fill: '#98918b', fontSize: 10 }} tickLine={false} axisLine={false} width={32} />
              <Tooltip contentStyle={{ background: '#110f0d', border: '1px solid #272320', borderRadius: 6, fontSize: 12 }} formatter={(v: any) => Number(v).toFixed(3)} />
              <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="#5a5550" strokeDasharray="4 2" />
              <Scatter data={calib} fill="#ef852e" />
            </ScatterChart>
          </ResponsiveContainer>
          <div className="mt-2 text-[11px] text-muted-foreground">
            Closer to the diagonal = better calibrated. Each point = a probability bin.
          </div>
        </CurveCard>
      </div>

      {/* Training history */}
      {trainingHistory && trainingHistory.trainLoss.length > 0 && (
        <CurveCard title="Training History" description="Loss & validation PR-AUC over boosting iterations">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trainingHistory.trainLoss.map((tl, i) => ({ iter: i, trainLoss: tl, valLoss: trainingHistory.valLoss[i] ?? null, valPrAuc: trainingHistory.valPrAuc[i] ?? null }))} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="#272320" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="iter" tick={{ fill: '#98918b', fontSize: 10 }} tickLine={false} axisLine={false} label={{ value: 'Iteration', position: 'insideBottom', offset: -2, fill: '#98918b', fontSize: 10 }} />
              <YAxis yAxisId="left" tickFormatter={(v) => v.toFixed(2)} tick={{ fill: '#98918b', fontSize: 10 }} tickLine={false} axisLine={false} width={32} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 1]} tickFormatter={(v) => v.toFixed(2)} tick={{ fill: '#98918b', fontSize: 10 }} tickLine={false} axisLine={false} width={32} />
              <Tooltip contentStyle={{ background: '#110f0d', border: '1px solid #272320', borderRadius: 6, fontSize: 12 }} />
              <ReferenceLine yAxisId="left" x={meta.bestIteration} stroke="#ef852e" strokeDasharray="4 2" />
              <Line yAxisId="left" type="monotone" dataKey="trainLoss" name="Train loss" stroke="#ea6f2f" strokeWidth={1.5} dot={false} />
              <Line yAxisId="left" type="monotone" dataKey="valLoss" name="Val loss" stroke="#ee3533" strokeWidth={1.5} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="valPrAuc" name="Val PR-AUC" stroke="#3fa66b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CurveCard>
      )}

      {/* Feature importances */}
      <div className="rounded-lg border border-border bg-card/40 p-4">
        <SectionHeader title="Feature Importances" description="Cumulative split contribution across all trees" />
        <div className="h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={importances} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid stroke="#272320" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fill: '#98918b', fontSize: 10 }} tickLine={false} axisLine={false} domain={[0, 'dataMax']} />
              <YAxis type="category" dataKey="feature" tick={{ fill: '#d5d0cc', fontSize: 10 }} tickLine={false} axisLine={false} width={180} />
              <Tooltip contentStyle={{ background: '#110f0d', border: '1px solid #272320', borderRadius: 6, fontSize: 12 }} formatter={(v: any) => formatPct(v, 2)} />
              <Bar dataKey="importance" name="Importance" radius={[0, 3, 3, 0]} barSize={12}>
                {importances.map((_: any, i: number) => (
                  <Cell key={i} fill={i < 3 ? '#ef852e' : i < 6 ? '#ea6f2f' : 'rgba(63,166,107,0.7)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <FeatureGroupSummary importances={allImportances} />
      </div>

      {/* Spec */}
      <div className="rounded-lg border border-border bg-card/40 p-4">
        <SectionHeader title="Model Specification" description="Hyperparameters and architecture" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
          <SpecItem label="Algorithm" value="Gradient Boosted Decision Trees" />
          <SpecItem label="Loss function" value="Logistic (binary cross-entropy)" />
          <SpecItem label="Estimators" value={String(spec.nEstimators)} />
          <SpecItem label="Learning rate" value={String(spec.learningRate)} />
          <SpecItem label="Max depth" value={String(spec.maxDepth)} />
          <SpecItem label="Row sample" value={`${(spec.rowSample * 100).toFixed(0)}%`} />
          <SpecItem label="Column sample" value={`${(spec.colSample * 100).toFixed(0)}%`} />
          <SpecItem label="L2 (leaf λ)" value={String(spec.lambda)} />
          <SpecItem label="Early stopping" value={`${spec.earlyStoppingRounds ?? '—'} rounds`} />
          <SpecItem label="Quantile thresholds" value={String(spec.numThresholds)} />
          <SpecItem label="Min samples / leaf" value={String(spec.minSamplesLeaf)} />
          <SpecItem label="Min samples / split" value={String(spec.minSamplesSplit)} />
        </div>
      </div>

      {/* Honest note */}
      <div className="rounded-lg border border-border bg-card/20 p-4 text-[12px] text-muted-foreground leading-relaxed">
        <div className="flex items-center gap-2 mb-2 text-foreground font-medium">
          <GitBranch className="h-4 w-4 text-primary" />
          Reproducibility &amp; honesty
        </div>
        The model is trained deterministically from seed <span className="tnum text-foreground">{meta.seed}</span> on <span className="tnum text-foreground">{formatNumber(meta.trainCount)}</span> transactions.
        The temporal test split (<span className="tnum text-foreground">{formatNumber(meta.testCount)}</span> transactions, {formatPct(meta.testPositiveRate, 1)} positive rate) is the most recent 15% of data and was
        used <em>only</em> for final evaluation — never for model selection. A logistic-regression baseline trained on
        the same features is reported alongside for honest comparison: the GBDT and logistic models achieve comparable
        performance on this data, which is a legitimate finding for tabular risk modelling where most signal is additive.
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub, baseline, delta }: { icon: React.ElementType; label: string; value: string; sub?: string; baseline?: string; delta?: number }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tnum">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
      {baseline && (
        <div className="mt-2 pt-2 border-t border-border text-[11px] text-muted-foreground flex items-center justify-between">
          <span>{baseline}</span>
          {delta !== undefined && (
            <span className={cn('tnum flex items-center gap-0.5', delta >= 0 ? 'text-risk-normal' : 'text-risk-high')}>
              {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(4)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Meta({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-base font-semibold tnum mt-0.5">{value}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function CurveCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-4">
      <SectionHeader title={title} description={description} />
      <div className="h-[240px]">{children}</div>
    </div>
  );
}

function ConfusionMatrix({ tp, fp, fn, tn }: { tp: number; fp: number; fn: number; tn: number }) {
  const total = tp + fp + fn + tn || 1;
  return (
    <div>
      <div className="grid grid-cols-3 gap-1 text-[11px] mb-1">
        <div></div>
        <div className="text-center text-muted-foreground">Actual +</div>
        <div className="text-center text-muted-foreground">Actual −</div>
      </div>
      <div className="grid grid-cols-3 gap-1">
        <div className="flex items-center justify-center text-muted-foreground text-[11px]">Pred +</div>
        <div className="rounded border border-risk-normal/30 bg-risk-normal/5 p-3 text-center">
          <div className="text-[10px] text-muted-foreground">TP</div>
          <div className="text-xl font-semibold tnum text-risk-normal">{formatNumber(tp)}</div>
          <div className="text-[10px] text-muted-foreground">{(tp / total * 100).toFixed(1)}%</div>
        </div>
        <div className="rounded border border-risk-high/30 bg-risk-high/5 p-3 text-center">
          <div className="text-[10px] text-muted-foreground">FP</div>
          <div className="text-xl font-semibold tnum text-risk-high">{formatNumber(fp)}</div>
          <div className="text-[10px] text-muted-foreground">{(fp / total * 100).toFixed(1)}%</div>
        </div>
        <div className="flex items-center justify-center text-muted-foreground text-[11px]">Pred −</div>
        <div className="rounded border border-risk-critical/30 bg-risk-critical/5 p-3 text-center">
          <div className="text-[10px] text-muted-foreground">FN</div>
          <div className="text-xl font-semibold tnum text-risk-critical">{formatNumber(fn)}</div>
          <div className="text-[10px] text-muted-foreground">{(fn / total * 100).toFixed(1)}%</div>
        </div>
        <div className="rounded border border-border bg-muted/30 p-3 text-center">
          <div className="text-[10px] text-muted-foreground">TN</div>
          <div className="text-xl font-semibold tnum">{formatNumber(tn)}</div>
          <div className="text-[10px] text-muted-foreground">{(tn / total * 100).toFixed(1)}%</div>
        </div>
      </div>
    </div>
  );
}

function SpecItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col py-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-[13px] tnum text-foreground mt-0.5">{value}</span>
    </div>
  );
}

function FeatureGroupSummary({ importances }: { importances: any[] }) {
  const groups: Record<string, number> = {};
  importances.forEach((f) => {
    groups[f.group] = (groups[f.group] ?? 0) + f.importance;
  });
  const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]);
  return (
    <div className="mt-4 pt-3 border-t border-border">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Importance by feature group</div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {sorted.map(([group, imp]) => (
          <div key={group} className="flex items-center justify-between text-[12px]">
            <span className="text-muted-foreground capitalize">{group}</span>
            <span className="tnum text-foreground">{formatPct(imp, 1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

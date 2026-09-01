'use client';

import { useState, useEffect, useCallback } from 'react';
import { postThreshold } from './data';
import { SectionHeader, StateBox } from './bits';
import { formatINR, formatPct, formatNumber } from './format';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, AreaChart, Area, ComposedChart, Bar, Cell,
} from 'recharts';
import { SlidersHorizontal, RotateCcw, Loader2, TrendingUp, TrendingDown, AlertTriangle, ShieldCheck } from 'lucide-react';

const DEFAULT_THRESHOLD = 0.35;

export function ThresholdTuner() {
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [costParams, setCostParams] = useState({ investigationCostPerCase: 45, falsePositiveCostRate: 0.025, preventionRate: 0.75 });

  const run = useCallback(async (thr: number, cp: typeof costParams) => {
    setLoading(true);
    try {
      const r = await postThreshold(thr, cp);
      setResult(r);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => run(threshold, costParams), 200);
    return () => clearTimeout(t);
  }, [threshold, costParams, run]);

  const impact = result?.impact;
  const sweep = result?.sweep ?? [];

  return (
    <div className="px-4 md:px-6 py-6 max-w-[1400px] mx-auto space-y-5">
      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-primary/80 mb-1">Threshold Simulator</div>
        <h1 className="text-2xl font-semibold tracking-tight">Operating Point Tuner</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Adjust the model's risk threshold and observe the projected precision, recall, investigation volume,
          prevented loss, and false-positive cost across the full transaction universe.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Controls */}
        <div className="rounded-lg border border-border bg-card/40 p-4 space-y-5">
          <SectionHeader title="Threshold" description="Flag orders with risk ≥ threshold" />
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-[11px] text-muted-foreground">Risk threshold</span>
              <span className="text-2xl font-semibold tnum text-primary">{(threshold * 100).toFixed(0)}%</span>
            </div>
            <Slider
              value={[Math.round(threshold * 1000)]}
              onValueChange={(v) => setThreshold(v[0] / 1000)}
              min={5} max={95} step={1}
            />
            <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
              <span>5% (aggressive)</span>
              <span>95% (conservative)</span>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => { setThreshold(DEFAULT_THRESHOLD); setCostParams({ investigationCostPerCase: 45, falsePositiveCostRate: 0.025, preventionRate: 0.75 }); }}
            className="h-7 text-[12px] gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset to default
          </Button>

          <div className="pt-2 border-t border-border">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Business cost parameters</div>
            <CostSlider label="Investigation cost / case" value={costParams.investigationCostPerCase} min={0} max={200} step={5} onChange={(v) => setCostParams((p) => ({ ...p, investigationCostPerCase: v }))} format={(v) => formatINR(v)} />
            <CostSlider label="False-positive cost rate" value={costParams.falsePositiveCostRate} min={0} max={0.1} step={0.005} onChange={(v) => setCostParams((p) => ({ ...p, falsePositiveCostRate: v }))} format={(v) => formatPct(v, 1)} />
            <CostSlider label="Prevention rate" value={costParams.preventionRate} min={0.3} max={0.95} step={0.05} onChange={(v) => setCostParams((p) => ({ ...p, preventionRate: v }))} format={(v) => formatPct(v, 0)} />
          </div>
        </div>

        {/* Impact summary */}
        <div className="lg:col-span-2 rounded-lg border border-border bg-card/40 p-4">
          <SectionHeader
            title="Projected Impact"
            description={`At threshold ${(threshold * 100).toFixed(0)}%`}
            actions={loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
          />
          {impact ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <ImpactBox label="Precision" value={formatPct(impact.precision)} intent={impact.precision > 0.6 ? 'positive' : impact.precision > 0.4 ? 'warning' : 'critical'} sub={`of ${formatNumber(impact.flagged)} flagged`} />
              <ImpactBox label="Recall" value={formatPct(impact.recall)} intent={impact.recall > 0.7 ? 'positive' : impact.recall > 0.5 ? 'warning' : 'critical'} sub={`${impact.truePositives} of ${impact.truePositives + impact.falseNegatives} caught`} />
              <ImpactBox label="F1 Score" value={impact.f1.toFixed(3)} intent="neutral" sub="harmonic mean" />
              <ImpactBox label="Prevented Loss" value={formatINR(impact.preventedLoss, { compact: true })} intent="positive" sub={`${formatPct(costParams.preventionRate, 0)} of catchable`} />
              <ImpactBox label="False-Positive Cost" value={formatINR(impact.falsePositiveCost, { compact: true })} intent="critical" sub={`${impact.falsePositives} legit held`} />
              <ImpactBox label="Investigation Cost" value={formatINR(impact.investigationCost, { compact: true })} intent="neutral" sub={`${impact.flagged} cases × ${formatINR(costParams.investigationCostPerCase)}`} />
              <ImpactBox label="Missed Loss" value={formatINR(impact.missedLoss, { compact: true })} intent="critical" sub={`${impact.falseNegatives} slipped through`} />
              <ImpactBox label="Net Savings" value={formatINR(impact.netSavings, { compact: true })} intent={impact.netSavings > 0 ? 'positive' : 'critical'} sub="after all costs" />
              <ImpactBox label="Pending to Review" value={formatNumber(impact.totalFlagged)} intent="neutral" sub="from pending universe" />
            </div>
          ) : (
            <StateBox kind="loading" />
          )}
        </div>
      </div>

      {/* Trade-off curves */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CurveCard title="Precision / Recall / F1 vs Threshold" description="Classification trade-offs">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sweep} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="#272320" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="threshold" domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fill: '#98918b', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fill: '#98918b', fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
              <Tooltip contentStyle={{ background: '#110f0d', border: '1px solid #272320', borderRadius: 6, fontSize: 12 }} formatter={(v: any) => formatPct(v)} labelFormatter={(v) => `Threshold ${(v * 100).toFixed(0)}%`} />
              <ReferenceLine x={threshold} stroke="#ef852e" strokeWidth={1} strokeDasharray="4 2" />
              <Line type="monotone" dataKey="precision" name="Precision" stroke="#ef852e" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="recall" name="Recall" stroke="#3fa66b" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="f1" name="F1" stroke="#e6ac3d" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </CurveCard>

        <CurveCard title="Financial Impact vs Threshold" description="Prevented loss, FP cost, net savings">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={sweep} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="#272320" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="threshold" domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fill: '#98918b', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(v) => formatINR(v, { compact: true })} tick={{ fill: '#98918b', fontSize: 10 }} tickLine={false} axisLine={false} width={48} />
              <Tooltip contentStyle={{ background: '#110f0d', border: '1px solid #272320', borderRadius: 6, fontSize: 12 }} formatter={(v: any) => formatINR(v)} labelFormatter={(v) => `Threshold ${(v * 100).toFixed(0)}%`} />
              <ReferenceLine x={threshold} stroke="#ef852e" strokeWidth={1} strokeDasharray="4 2" />
              <Area type="monotone" dataKey="preventedLoss" name="Prevented" stroke="#3fa66b" fill="rgba(63,166,107,0.18)" strokeWidth={1.5} />
              <Area type="monotone" dataKey="falsePositiveCost" name="FP cost" stroke="#ee3533" fill="rgba(238,53,51,0.18)" strokeWidth={1.5} />
              <Line type="monotone" dataKey="netSavings" name="Net savings" stroke="#ef852e" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </CurveCard>

        <CurveCard title="Investigation Workload vs Threshold" description="Cases flagged from the pending universe">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={sweep} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="#272320" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="threshold" domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fill: '#98918b', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(v) => formatNumber(v)} tick={{ fill: '#98918b', fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
              <Tooltip contentStyle={{ background: '#110f0d', border: '1px solid #272320', borderRadius: 6, fontSize: 12 }} formatter={(v: any) => formatNumber(v)} labelFormatter={(v) => `Threshold ${(v * 100).toFixed(0)}%`} />
              <ReferenceLine x={threshold} stroke="#ef852e" strokeWidth={1} strokeDasharray="4 2" />
              <Bar dataKey="totalFlagged" name="Flagged (pending)" fill="#ea6f2f" opacity={0.7} barSize={3} />
              <Line type="monotone" dataKey="flagged" name="Flagged (realized)" stroke="#ef852e" strokeWidth={1.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </CurveCard>

        <CurveCard title="Confusion Matrix (projected)" description="At the selected threshold">
          {impact && <ConfusionGrid tp={impact.truePositives} fp={impact.falsePositives} fn={impact.falseNegatives} tn={impact.trueNegatives} />}
        </CurveCard>
      </div>
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

function ImpactBox({ label, value, intent, sub }: { label: string; value: string; intent: 'positive' | 'critical' | 'warning' | 'neutral'; sub: string }) {
  const color = intent === 'positive' ? 'text-risk-normal' : intent === 'critical' ? 'text-risk-critical' : intent === 'warning' ? 'text-risk-high' : 'text-foreground';
  const border = intent === 'positive' ? 'border-risk-normal/30' : intent === 'critical' ? 'border-risk-critical/30' : intent === 'warning' ? 'border-risk-high/30' : 'border-border';
  return (
    <div className={cn('rounded-md border bg-card/40 p-3', border)}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('text-lg font-semibold tnum mt-1', color)}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}

function CostSlider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string }) {
  return (
    <div className="mb-3">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span className="text-[12px] tnum text-foreground">{format(value)}</span>
      </div>
      <Slider value={[value * 1000]} onValueChange={(v) => onChange(v[0] / 1000)} min={min * 1000} max={max * 1000} step={step * 1000} />
    </div>
  );
}

function ConfusionGrid({ tp, fp, fn, tn }: { tp: number; fp: number; fn: number; tn: number }) {
  const total = tp + fp + fn + tn;
  return (
    <div className="grid grid-cols-2 gap-1.5 h-full">
      <ConfusionCell label="True Positives" count={tp} total={total} intent="positive" sub="caught" />
      <ConfusionCell label="False Positives" count={fp} total={total} intent="warning" sub="legit held" />
      <ConfusionCell label="False Negatives" count={fn} total={total} intent="critical" sub="missed" />
      <ConfusionCell label="True Negatives" count={tn} total={total} intent="neutral" sub="correctly released" />
    </div>
  );
}

function ConfusionCell({ label, count, total, intent, sub }: { label: string; count: number; total: number; intent: 'positive' | 'critical' | 'warning' | 'neutral'; sub: string }) {
  const color = intent === 'positive' ? 'text-risk-normal border-risk-normal/30 bg-risk-normal/5' : intent === 'critical' ? 'text-risk-critical border-risk-critical/30 bg-risk-critical/5' : intent === 'warning' ? 'text-risk-high border-risk-high/30 bg-risk-high/5' : 'text-foreground border-border bg-card/40';
  return (
    <div className={cn('rounded-md border p-3 flex flex-col justify-between', color)}>
      <div>
        <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
        <div className="text-[10px] text-muted-foreground">{sub}</div>
      </div>
      <div>
        <div className="text-2xl font-semibold tnum">{formatNumber(count)}</div>
        <div className="text-[10px] text-muted-foreground tnum">{(count / total * 100).toFixed(1)}% of total</div>
      </div>
    </div>
  );
}

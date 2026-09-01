'use client';

import { useOverview } from './data';
import { useApp } from '@/lib/store';
import { SectionHeader, KpiCard, StateBox, RiskBadge } from './bits';
import { formatINR, formatNumber, formatPct, bandMeta } from './format';
import {
  TrendingUp, TrendingDown, ShieldAlert, Wallet, Search, Gauge,
  ArrowRight, Building2, Package, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Cell, Line, ComposedChart,
} from 'recharts';
import { useMemo } from 'react';

const BAND_ORDER = ['critical', 'high', 'elevated', 'normal'] as const;
const BAND_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  elevated: '#ca8a04',
  normal: '#0d9488',
};

export function Overview() {
  const { data, isLoading, isError } = useOverview();
  const setView = useApp((s) => s.setView);
  const setQueueBandFilter = useApp((s) => s.setQueueBandFilter);
  const openInvestigation = useApp((s) => s.openInvestigation);

  if (isLoading) return <div className="p-6"><StateBox kind="loading" /></div>;
  if (isError || !data) return <div className="p-6"><StateBox kind="error" message="Failed to load overview" /></div>;

  const { kpis: k, model: m, bandDistribution, trend, merchantBreakdown, categoryBreakdown, topRisky } = data;
  const maxBand = Math.max(...BAND_ORDER.map((b) => bandDistribution[b] ?? 0));
  const maxMerchantLoss = Math.max(...merchantBreakdown.map((x: any) => x.lossAmount), 1);

  return (
    <div className="px-4 md:px-6 py-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-primary/80 mb-1">Risk Assessment</div>
          <h1 className="text-2xl font-semibold tracking-tight">Transaction Risk Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time risk exposure analysis across {formatNumber(k.totalTransactions)} transactions.
            {' '}Operating threshold at <span className="tnum text-foreground">{formatPct(m.operatingThreshold, 0)}</span>.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-risk-normal animate-vigilis-pulse" />
          Live · model v{m.version} · trained on {formatNumber(m.trainCount)} txns
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Pending Exposure"
          value={formatINR(k.pendingExposure, { compact: true })}
          sub={`${formatNumber(k.pendingTransactions)} orders awaiting outcome`}
          intent="warning"
          onClick={() => setView('queue')}
        />
        <KpiCard
          label="Expected Loss (pending)"
          value={formatINR(k.pendingExpectedLoss, { compact: true })}
          sub={`Avg ₹${formatNumber(Math.round(k.avgLossPerPositive))} per bad order`}
          intent="critical"
          onClick={() => { setQueueBandFilter('critical'); setView('queue'); }}
        />
        <KpiCard
          label="Prevented Loss"
          value={formatINR(k.preventedLoss, { compact: true })}
          sub={`Net savings ${formatINR(k.netSavings, { compact: true })}`}
          intent="positive"
          onClick={() => setView('threshold')}
        />
        <KpiCard
          label="Pending Decisions"
          value={formatNumber(k.pendingDecisions)}
          sub={`${formatNumber(k.investigationVolume)} flagged historically`}
          onClick={() => { setQueueBandFilter('critical'); setView('queue'); }}
        />
      </div>

      {/* Charts row: trend + bands */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-lg border border-border bg-card/40 p-4">
          <SectionHeader
            title="Daily Risk Trend"
            description="Order volume vs flagged (≥ threshold) vs realised loss events"
          />
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                <defs>
                  <linearGradient id="gradVol" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={32} />
                <YAxis yAxisId="left" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
                <Tooltip
                  contentStyle={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, color: '#1f2937', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
                  labelStyle={{ color: '#1f2937' }}
                  itemStyle={{ color: '#6b7280' }}
                />
                <Area yAxisId="left" type="monotone" dataKey="count" name="Orders" stroke="#2563eb" strokeWidth={2} fill="url(#gradVol)" />
                <Bar yAxisId="left" dataKey="flagged" name="Flagged" fill="#ea580c" opacity={0.8} barSize={10} radius={[2, 2, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="positive" name="Loss events" stroke="#dc2626" strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card/40 p-4">
          <SectionHeader title="Risk Distribution" description="All transactions by band" />
          <div className="space-y-3 mt-2">
            {BAND_ORDER.map((b) => {
              const count = bandDistribution[b] ?? 0;
              const pct = k.totalTransactions > 0 ? count / k.totalTransactions : 0;
              return (
                <button
                  key={b}
                  onClick={() => { setQueueBandFilter(b); setView('queue'); }}
                  className="group flex w-full items-center gap-3 rounded-md p-2 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="w-20 text-[12px] font-medium uppercase tracking-wide" style={{ color: BAND_COLORS[b] }}>{b}</div>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${maxBand > 0 ? (count / maxBand) * 100 : 0}%`, backgroundColor: BAND_COLORS[b] }} />
                  </div>
                  <div className="w-20 text-right">
                    <span className="tnum text-[12px] text-foreground">{formatNumber(count)}</span>
                    <span className="tnum text-[10px] text-muted-foreground ml-1">{formatPct(pct, 0)}</span>
                  </div>
                  <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-border grid grid-cols-2 gap-3 text-[11px]">
            <div>
              <div className="text-muted-foreground">Model precision</div>
              <div className="tnum text-base font-semibold text-foreground mt-0.5">{formatPct(k.precision)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Model recall</div>
              <div className="tnum text-base font-semibold text-foreground mt-0.5">{formatPct(k.recall)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Financial impact row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <ImpactTile icon={Wallet} label="Realised Loss" value={k.realizedLoss} intent="critical" sub={`Missed ${formatINR(k.missedLoss, { compact: true })}`} />
        <ImpactTile icon={ShieldAlert} label="Prevented Loss" value={k.preventedLoss} intent="positive" sub={`@ ${formatPct(k.recall)} recall`} />
        <ImpactTile icon={AlertTriangle} label="False-Positive Cost" value={k.falsePositiveCost} intent="warning" sub={`On ${formatNumber(k.investigationVolume)} investigations`} />
        <ImpactTile icon={Gauge} label="Net Savings" value={k.netSavings} intent="positive" sub="After all costs" />
      </div>

      {/* Top risky + merchant breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-lg border border-border bg-card/40">
          <SectionHeader
            title="Top-Risk Pending Orders"
            description="Highest model-score transactions awaiting analyst decision"
            actions={
              <button onClick={() => setView('queue')} className="text-[12px] text-primary hover:underline flex items-center gap-1">
                Open queue <ArrowRight className="h-3 w-3" />
              </button>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground border-y border-border">
                  <th className="text-left font-medium px-3 py-2">Txn</th>
                  <th className="text-left font-medium px-3 py-2">Customer</th>
                  <th className="text-left font-medium px-3 py-2">Category</th>
                  <th className="text-right font-medium px-3 py-2">Amount</th>
                  <th className="text-right font-medium px-3 py-2">Score</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {topRisky.slice(0, 8).map((t: any) => (
                  <tr
                    key={t.id}
                    onClick={() => openInvestigation(t.id)}
                    className="border-b border-border/60 last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-mono text-[11px] text-foreground">{t.id}</div>
                      <div className="text-[10px] text-muted-foreground">{t.shippingCity}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-mono text-[11px] text-foreground">{t.customerId}</div>
                      {t.isGuest && <span className="text-[10px] text-risk-high">guest</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-[12px]">{t.category}</div>
                      <div className="text-[10px] text-muted-foreground">{t.paymentMethod}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right tnum">{formatINR(t.amount, { compact: true })}</td>
                    <td className="px-3 py-2.5 text-right">
                      <RiskBadge band={t.riskBand} score={t.riskScore} />
                    </td>
                    <td className="px-3 py-2.5">
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card/40">
          <SectionHeader title="Loss by Merchant" description="Realised loss concentration" />
          <div className="space-y-2 px-1 pb-2">
            {merchantBreakdown.slice(0, 6).map((m: any) => (
              <div key={m.merchantId} className="flex items-center gap-3">
                <div className="w-24">
                  <div className="text-[11px] font-mono text-foreground truncate">{m.merchantId}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{m.category}</div>
                </div>
                <div className="flex-1">
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-risk-high/80 rounded-full" style={{ width: `${(m.lossAmount / maxMerchantLoss) * 100}%` }} />
                  </div>
                  <div className="flex justify-between mt-0.5 text-[10px] text-muted-foreground">
                    <span>{formatNumber(m.lossCount)} losses</span>
                    <span className="tnum">{formatINR(m.lossAmount, { compact: true })}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="rounded-lg border border-border bg-card/40 p-4">
        <SectionHeader title="Loss by Product Category" description="Where chargebacks & RTOs concentrate" />
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categoryBreakdown} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => formatINR(v, { compact: true })} />
              <YAxis type="category" dataKey="category" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} width={120} />
              <Tooltip
                contentStyle={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, color: '#1f2937', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
                cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                formatter={(v: any, n) => [formatINR(v, { compact: n === 'lossCount' }), n === 'lossAmount' ? 'Loss' : 'Count']}
                labelStyle={{ color: '#1f2937' }}
                itemStyle={{ color: '#6b7280' }}
              />
              <Bar dataKey="lossAmount" name="lossAmount" fill="#ea580c" radius={[0, 3, 3, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function ImpactTile({ icon: Icon, label, value, sub, intent }: { icon: React.ElementType; label: string; value: number; sub: string; intent: 'critical' | 'positive' | 'warning' }) {
  const color = intent === 'critical' ? 'text-risk-critical' : intent === 'positive' ? 'text-risk-normal' : 'text-risk-high';
  const ring = intent === 'critical' ? 'border-risk-critical/30' : intent === 'positive' ? 'border-risk-normal/30' : 'border-risk-high/30';
  return (
    <div className={`rounded-lg border ${ring} bg-card/40 p-4`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      </div>
      <div className={`mt-2 text-xl font-semibold tnum ${color}`}>{formatINR(value, { compact: true })}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useTransaction, useRelated, postDecision, fetchBrief } from './data';
import { useApp } from '@/lib/store';
import { RiskBadge, OutcomeBadge, StateBox, ContributionBar } from './bits';
import { formatINR, formatTime, formatDate, formatPct, bandMeta } from './format';
import { cn } from '@/lib/utils';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  X, ShieldCheck, ShieldAlert, Scale, Eye, Sparkles, Loader2,
  User, Smartphone, Globe, MapPin, Clock, Package, AlertTriangle,
  CheckCircle2, XCircle, ArrowRight, TrendingUp, TrendingDown,
} from 'lucide-react';

export function Investigation() {
  const id = useApp((s) => s.investigatingId);
  const close = useApp((s) => s.closeInvestigation);
  const { data, isLoading, isError } = useTransaction(id);
  const related = useRelated(id);

  return (
    <Sheet open={!!id} onOpenChange={(o) => { if (!o) close(); }}>
      <SheetContent side="right" className="w-full sm:max-w-[640px] md:max-w-[760px] lg:max-w-[860px] p-0 overflow-y-auto bg-background border-l border-border">
        <SheetHeader className="px-5 py-4 border-b border-border bg-card/40 sticky top-0 z-10">
          <div className="flex items-center justify-between gap-3 pr-8">
            <div className="min-w-0">
              <SheetTitle className="text-[15px] font-mono">{id ?? '—'}</SheetTitle>
              <SheetDescription className="text-[12px]">
                {data ? `${data.merchantId} · ${data.category} · ${formatINR(data.amount)}` : 'Loading…'}
              </SheetDescription>
            </div>
            {data && <RiskBadge band={data.riskBand} score={data.riskScore} />}
          </div>
        </SheetHeader>

        {isLoading ? (
          <StateBox kind="loading" />
        ) : isError || !data ? (
          <StateBox kind="error" message="Failed to load transaction" />
        ) : (
          <Body data={data} related={related} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function Body({ data, related }: { data: any; related: any }) {
  return (
    <div className="divide-y divide-border">
      <RiskSummary data={data} />
      <FinancialImpact data={data} />
      <FactorBreakdown data={data} />
      <BehavioralSignals data={data} related={related} />
      <CustomerHistory data={data} related={related} />
      <AnalystBrief id={data.id} />
      <DecisionPanel data={data} />
    </div>
  );
}

function RiskSummary({ data }: { data: any }) {
  const score = data.riskScore;
  const threshold = data.operatingThreshold;
  const band = bandMeta(data.riskBand);
  const scorePct = Math.round(score * 100);
  const thrPct = Math.round(threshold * 100);

  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Risk Score</h3>
        {data.outcomeRealized && (
          <OutcomeBadge kind={data.outcomeKind} />
        )}
      </div>
      <div className="flex items-end gap-3">
        <div className="text-4xl font-semibold tnum" style={{ color: band.color === 'bg-risk-critical' ? 'var(--risk-critical-fg)' : data.riskBand === 'critical' ? 'var(--risk-critical-fg)' : data.riskBand === 'high' ? 'var(--risk-high-fg)' : data.riskBand === 'elevated' ? 'var(--risk-elevated-fg)' : 'var(--risk-normal-fg)' }}>
          {scorePct}<span className="text-lg text-muted-foreground">%</span>
        </div>
        <div className="flex-1 pb-2">
          <div className="relative h-2 rounded-full bg-muted overflow-hidden">
            {/* threshold marker */}
            <div className="absolute inset-y-0 w-px bg-foreground/40" style={{ left: `${thrPct}%` }} />
            {/* score fill */}
            <div
              className={cn('h-full rounded-full', band.dot)}
              style={{ width: `${scorePct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
            <span>0%</span>
            <span>threshold {thrPct}%</span>
            <span>100%</span>
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <KV label="Logit" value={data.riskScore > 0.5 ? `+${((data.riskScore - 0.5) * 2).toFixed(2)}` : `-${((0.5 - data.riskScore) * 2).toFixed(2)}`} />
        <KV label="Confidence" value={data.riskScore > 0.8 || data.riskScore < 0.2 ? 'High' : data.riskScore > 0.6 || data.riskScore < 0.4 ? 'Medium' : 'Low'} />
        <KV label="Model" value={`${data.modelInfo.rocAuc.toFixed(3)} AUC`} />
      </div>
    </div>
  );
}

function FinancialImpact({ data }: { data: any }) {
  const expectedLoss = data.expectedLoss ?? 0;
  return (
    <div className="px-5 py-4">
      <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">Financial Impact</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border border-border bg-card/40 p-3">
          <div className="text-[11px] text-muted-foreground">Order value</div>
          <div className="text-lg font-semibold tnum mt-0.5">{formatINR(data.amount)}</div>
          <div className="text-[10px] text-muted-foreground">{data.quantity}× {data.category}</div>
        </div>
        <div className="rounded-md border border-risk-high/30 bg-risk-high/5 p-3">
          <div className="text-[11px] text-muted-foreground">Expected loss</div>
          <div className="text-lg font-semibold tnum mt-0.5 text-risk-high">{formatINR(expectedLoss, { compact: true })}</div>
          <div className="text-[10px] text-muted-foreground">score × outcome cost</div>
        </div>
        {data.outcomeRealized && data.hadChargebackOrRto && (
          <div className="rounded-md border border-risk-critical/30 bg-risk-critical/5 p-3 col-span-2">
            <div className="text-[11px] text-muted-foreground">Realised loss</div>
            <div className="text-lg font-semibold tnum mt-0.5 text-risk-critical">{formatINR(data.lossAmount)}</div>
            <div className="text-[10px] text-muted-foreground">{data.outcomeKind === 'chargeback' ? 'Chargeback: merchandise + fee + processing' : data.outcomeKind === 'rto' ? 'RTO: reverse logistics + handling' : 'Return fraud: damaged / swapped item'}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function FactorBreakdown({ data }: { data: any }) {
  const factors: any[] = data.topFactors ?? [];
  const maxAbs = Math.max(...factors.map((f) => Math.abs(f.contribution)), 0.001);
  const positive = factors.filter((f) => f.contribution > 0).sort((a, b) => b.contribution - a.contribution);
  const negative = factors.filter((f) => f.contribution < 0).sort((a, b) => a.contribution - b.contribution);

  return (
    <div className="px-5 py-4">
      <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">Why is this risky? — Feature Contributions</h3>
      <p className="text-[11px] text-muted-foreground mb-3">
        Per-prediction attribution from the model's tree paths. Positive bars push risk up; negative bars push it down.
        The sum approximates the model's logit for this transaction.
      </p>
      <div className="space-y-1.5">
        {positive.map((f, i) => (
          <FactorRow key={i} f={f} maxAbs={maxAbs} />
        ))}
        {negative.length > 0 && (
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground pt-2 pb-1">Risk-reducing</div>
        )}
        {negative.map((f, i) => (
          <FactorRow key={i} f={f} maxAbs={maxAbs} />
        ))}
      </div>
    </div>
  );
}

function FactorRow({ f, maxAbs }: { f: any; maxAbs: number }) {
  const groupIcon = GROUP_ICONS[f.group] ?? Eye;
  const Icon = groupIcon;
  const isPositive = f.contribution > 0;
  const valueDisplay = formatFactorValue(f);

  return (
    <div className="flex items-center gap-3 py-1">
      <Icon className={cn('h-3.5 w-3.5 shrink-0', isPositive ? 'text-risk-high' : 'text-risk-normal')} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[12px] text-foreground truncate">{f.description}</span>
          <span className="text-[11px] text-muted-foreground tnum shrink-0">{valueDisplay}</span>
        </div>
        <div className="mt-0.5">
          <ContributionBar value={f.contribution} max={maxAbs} />
        </div>
      </div>
      <span className={cn('text-[11px] tnum w-12 text-right shrink-0', isPositive ? 'text-risk-high' : 'text-risk-normal')}>
        {isPositive ? '+' : ''}{(f.contribution * 100).toFixed(1)}
      </span>
    </div>
  );
}

const GROUP_ICONS: Record<string, React.ElementType> = {
  customer: User,
  order: Package,
  payment: ShieldCheck,
  behavior: Smartphone,
  geography: MapPin,
  temporal: Clock,
};

function formatFactorValue(f: any): string {
  const v = f.value;
  if (typeof v !== 'number') return String(v);
  // binary features
  if (v === 0 || v === 1) {
    if (f.feature === 'is_cod' || f.feature === 'is_guest' || f.feature === 'is_upi' || f.feature === 'is_emi' || f.feature === 'is_credit_card' || f.feature === 'is_high_value_category' || f.feature === 'is_gift_card' || f.feature === 'is_night_time' || f.feature === 'is_weekend' || f.feature === 'is_festival_period' || f.feature === 'is_new_device_for_customer' || f.feature === 'address_mismatch' || f.feature === 'mismatch_cod' || f.feature === 'cod_high_value' || f.feature === 'emi_high_value' || f.feature === 'amount_over_15k' || f.feature === 'amount_over_25k' || f.feature === 'account_age_lt_7d' || f.feature === 'account_age_lt_30d' || f.feature === 'shipping_tier_1' || f.feature === 'shipping_tier_3' || f.feature === 'device_ring_flag' || f.feature === 'ip_ring_flag' || f.feature === 'burst_purchase' || f.feature === 'new_device_guest_high_value') {
      return v === 1 ? 'yes' : 'no';
    }
  }
  if (f.feature === 'amount' || f.feature === 'customer_ltv') return formatINR(v, { compact: true });
  if (f.feature === 'customer_return_rate' || f.feature === 'customer_chargeback_rate' || f.feature === 'category_base_risk' || f.feature === 'customer_velocity_7d') return (v * 100).toFixed(0) + (f.feature === 'customer_velocity_7d' ? '/d' : '%');
  if (f.feature === 'time_since_last_order_h') return v >= 998 ? 'none' : `${v.toFixed(0)}h`;
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2);
}

function BehavioralSignals({ data, related }: { data: any; related: any }) {
  const ring = related?.data?.ring;
  return (
    <div className="px-5 py-4">
      <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">Behavioural &amp; Abuse-Ring Signals</h3>
      <div className="grid grid-cols-2 gap-3">
        <SignalCard icon={Smartphone} label="Device" value={data.deviceId} sub={`${data.deviceSeenCount24h} customers (24h)`} ring={data.deviceSeenCount24h >= 3} />
        <SignalCard icon={Globe} label="IP" value={data.ipHash} sub={`${data.ipSeenCount24h} customers (24h)`} ring={data.ipSeenCount24h >= 3} />
        <SignalCard icon={Clock} label="Velocity" value={`${data.customerOrdersLast1h} / ${data.customerOrdersLast24h} / ${data.customerOrdersLast7d}`} sub="orders 1h / 24h / 7d" ring={data.customerOrdersLast1h >= 2} />
        <SignalCard icon={User} label="Customer" value={data.customerId} sub={data.isGuest ? 'Guest checkout' : `${data.customerPriorOrders} prior orders`} ring={data.customerPriorChargebacks > 0} />
      </div>
      {ring && (ring.deviceCustomers > 1 || ring.ipCustomers > 1) && (
        <div className="mt-3 rounded-md border border-risk-high/30 bg-risk-high/5 p-3">
          <div className="flex items-center gap-2 text-[12px] text-risk-high font-medium">
            <AlertTriangle className="h-4 w-4" />
            Shared infrastructure detected
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Device <span className="font-mono text-foreground">{data.deviceId}</span> used by <span className="tnum text-foreground">{ring.deviceCustomers}</span> distinct customers ({ring.deviceOrders} orders).
            IP <span className="font-mono text-foreground">{data.ipHash}</span> used by <span className="tnum text-foreground">{ring.ipCustomers}</span> customers ({ring.ipOrders} orders).
          </div>
        </div>
      )}
    </div>
  );
}

function SignalCard({ icon: Icon, label, value, sub, ring }: { icon: React.ElementType; label: string; value: string; sub: string; ring?: boolean }) {
  return (
    <div className={cn('rounded-md border bg-card/40 p-3', ring ? 'border-risk-high/30' : 'border-border')}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
        {ring && <span className="ml-auto text-risk-high">⚠ ring</span>}
      </div>
      <div className="mt-1 font-mono text-[12px] text-foreground truncate">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}

function CustomerHistory({ data, related }: { data: any; related: any }) {
  const sameCustomer: any[] = related?.data?.sameCustomer ?? [];
  if (sameCustomer.length === 0) return null;
  return (
    <div className="px-5 py-4">
      <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">Customer History</h3>
      <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
        {sameCustomer.slice(0, 8).map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-border/40 last:border-0">
            <div className="flex items-center gap-2 min-w-0">
              <RiskBadge band={t.riskBand} />
              <span className="text-[12px] text-muted-foreground truncate">{formatINR(t.amount, { compact: true })} · {t.category}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {t.outcomeRealized ? <OutcomeBadge kind={t.outcomeKind} /> : <span className="text-[10px] text-muted-foreground">pending</span>}
              <span className="text-[10px] text-muted-foreground">{formatDate(t.ts)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalystBrief({ id }: { id: string }) {
  const [brief, setBrief] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<string>('');

  const generate = async () => {
    setLoading(true);
    setBrief(null);
    try {
      const r = await fetchBrief(id);
      setBrief(r.brief);
      setSource(r.source);
    } catch {
      toast.error('Failed to generate brief');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Analyst Brief</h3>
        <Button variant="outline" size="sm" onClick={generate} disabled={loading} className="h-7 text-[12px] gap-1.5">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {brief ? 'Regenerate' : 'Generate'}
        </Button>
      </div>
      {brief ? (
        <div className="rounded-md border border-border bg-card/40 p-3 text-[12px] leading-relaxed whitespace-pre-line">
          {brief}
          <div className="mt-2 pt-2 border-t border-border text-[10px] text-muted-foreground">
            {source === 'llm' ? 'AI-generated, grounded in transaction data' : 'Synthesised from model explanation (rule-based)'}
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border bg-card/20 p-3 text-[12px] text-muted-foreground">
          {loading ? 'Generating a grounded brief from the model explanation and transaction data…' : 'Click Generate to produce a natural-language analyst brief. The brief is grounded in the actual transaction data and model explanation — it never invents facts.'}
        </div>
      )}
    </div>
  );
}

function DecisionPanel({ data }: { data: any }) {
  const [note, setNote] = useState(data.decisionNote ?? '');
  const [decision, setDecision] = useState<string | null>(data.decision ?? null);
  const [submitting, setSubmitting] = useState(false);
  const qc = useQueryClient();

  const submit = async (d: string) => {
    setSubmitting(true);
    setDecision(d);
    try {
      await postDecision(data.id, d, note || undefined);
      toast.success(`Decision recorded: ${d}`);
      qc.invalidateQueries({ queryKey: ['tx', data.id] });
      qc.invalidateQueries({ queryKey: ['queue'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
    } catch {
      toast.error('Failed to record decision');
      setDecision(data.decision ?? null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="px-5 py-4">
      <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">Decision</h3>
      {decision && (
        <div className="mb-3 rounded-md border border-primary/30 bg-primary/5 p-2.5 text-[12px] flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <span>Recorded: <span className="font-medium uppercase">{decision}</span> at {data.decidedAt ? formatDate(data.decidedAt) : 'now'}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <DecisionButton kind="hold" label="Hold" icon={ShieldAlert} onClick={submit} disabled={submitting} active={decision === 'hold'} desc="Block fulfillment pending verification" />
        <DecisionButton kind="escalate" label="Escalate" icon={AlertTriangle} onClick={submit} disabled={submitting} active={decision === 'escalate'} desc="Route to senior review" />
        <DecisionButton kind="approve" label="Approve" icon={ShieldCheck} onClick={submit} disabled={submitting} active={decision === 'approve'} desc="Release the order" />
        <DecisionButton kind="dismiss" label="Dismiss" icon={XCircle} onClick={submit} disabled={submitting} active={decision === 'dismiss'} desc="Mark as not-risky, no action" />
      </div>
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Analyst note (optional)…"
        className="text-[12px] min-h-[60px] resize-none bg-input/40"
      />
      <div className="mt-2 text-[10px] text-muted-foreground">
        All decisions are written to the append-only audit log. Defense-only: no offensive capability is exposed.
      </div>
    </div>
  );
}

function DecisionButton({ kind, label, icon: Icon, onClick, disabled, active, desc }: { kind: string; label: string; icon: React.ElementType; onClick: (d: string) => void; disabled?: boolean; active?: boolean; desc: string }) {
  const cls = kind === 'hold' || kind === 'escalate'
    ? 'border-risk-high/30 hover:bg-risk-high/10 text-risk-high'
    : 'border-risk-normal/30 hover:bg-risk-normal/10 text-risk-normal';
  return (
    <button
      onClick={() => onClick(kind)}
      disabled={disabled}
      className={cn(
        'rounded-md border bg-card/40 p-2.5 text-left transition-colors disabled:opacity-50',
        active ? cls + ' ring-1 ring-current' : cls,
      )}
    >
      <div className="flex items-center gap-1.5 text-[12px] font-medium">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{desc}</div>
    </button>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-card/30 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-[12px] tnum text-foreground mt-0.5">{value}</div>
    </div>
  );
}

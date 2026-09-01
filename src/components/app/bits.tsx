'use client';

import { cn } from '@/lib/utils';
import { bandMeta, formatINR, formatPct, formatNumber } from './format';
import { ArrowRight } from 'lucide-react';

/** A pill that renders a risk band. */
export function RiskBadge({ band, score, className }: { band: string; score?: number; className?: string }) {
  const m = bandMeta(band);
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide', m.cls, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', m.dot)} />
      {m.label}
      {score !== undefined && <span className="tnum opacity-80">{(score * 100).toFixed(0)}</span>}
    </span>
  );
}

/** Outcome badge (clean / chargeback / rto / pending). */
export function OutcomeBadge({ kind, className }: { kind: string; className?: string }) {
  const map: Record<string, string> = {
    clean: 'text-risk-normal',
    chargeback: 'text-risk-critical',
    rto: 'text-risk-high',
    return_fraud: 'text-risk-elevated',
    pending: 'text-muted-foreground',
  };
  const label: Record<string, string> = {
    clean: 'Clean',
    chargeback: 'Chargeback',
    rto: 'RTO',
    return_fraud: 'Return Fraud',
    pending: 'Pending',
  };
  return (
    <span className={cn('text-[11px] font-medium uppercase tracking-wide', map[kind] ?? 'text-muted-foreground', className)}>
      {label[kind] ?? kind}
    </span>
  );
}

/** A KPI card with label, value, delta/hint, and optional sparkline. */
export function KpiCard({
  label,
  value,
  sub,
  trend,
  intent = 'default',
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  trend?: 'up' | 'down' | 'flat';
  intent?: 'default' | 'critical' | 'warning' | 'positive';
  onClick?: () => void;
}) {
  const intentBorder =
    intent === 'critical' ? 'border-risk-critical/30'
    : intent === 'warning' ? 'border-risk-high/30'
    : intent === 'positive' ? 'border-risk-normal/30'
    : 'border-border';
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'group relative flex flex-col rounded-lg border bg-card/60 px-4 py-3 text-left transition-colors w-full',
        intentBorder,
        onClick && 'hover:bg-card hover:border-border/80 cursor-pointer',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
        {trend && <TrendArrow trend={trend} />}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight tnum">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
      {onClick && (
        <ArrowRight className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </button>
  );
}

function TrendArrow({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  const color = trend === 'up' ? 'text-risk-high' : trend === 'down' ? 'text-risk-normal' : 'text-muted-foreground';
  const glyph = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
  return <span className={cn('text-[11px] tnum', color)}>{glyph}</span>;
}

/** Section header with title + optional description + actions. */
export function SectionHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-3">
      <div>
        {eyebrow && <div className="text-[10px] uppercase tracking-[0.18em] text-primary/80 mb-1">{eyebrow}</div>}
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-[13px] text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

/** A thin horizontal bar with a proportional fill — used for risk distributions. */
export function MiniBar({ value, max, className, barClassName }: { value: number; max: number; className?: string; barClassName?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={cn('h-1.5 w-full rounded-full bg-muted overflow-hidden', className)}>
      <div className={cn('h-full rounded-full bg-primary', barClassName)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** A horizontal contribution bar (positive right / negative left) for explanations. */
export function ContributionBar({ value, max }: { value: number; max: number }) {
  const pos = value >= 0;
  const w = max > 0 ? Math.min(50, (Math.abs(value) / max) * 50) : 0;
  return (
    <div className="relative h-2 w-full flex items-center">
      <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
      {pos ? (
        <div className="absolute inset-y-0 left-1/2 bg-risk-high/70 rounded-r-sm" style={{ width: `${w}%` }} />
      ) : (
        <div className="absolute inset-y-0 right-1/2 bg-risk-normal/60 rounded-l-sm" style={{ width: `${w}%` }} />
      )}
    </div>
  );
}

/** Empty / loading / error states. */
export function StateBox({ kind, message }: { kind: 'loading' | 'empty' | 'error'; message?: string }) {
  const text = message ?? (kind === 'loading' ? 'Loading…' : kind === 'error' ? 'Something went wrong' : 'No data');
  return (
    <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground">
      {kind === 'loading' && <div className="h-5 w-5 mb-2 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />}
      {text}
    </div>
  );
}

export { formatINR, formatPct, formatNumber };

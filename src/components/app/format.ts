'use client';

/** AEGIS formatting helpers — Indian locale, INR, percentages, risk bands. */

export function formatINR(amount: number, opts: { compact?: boolean } = {}): string {
  if (!isFinite(amount)) return '₹0';
  if (opts.compact) {
    const sign = amount < 0 ? '-' : '';
    const a = Math.abs(amount);
    if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)}Cr`;
    if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2)}L`;
    if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(1)}K`;
    return `${sign}₹${Math.round(a)}`;
  }
  return '₹' + Math.round(amount).toLocaleString('en-IN');
}

export function formatPct(p: number, digits = 1): string {
  return `${(p * 100).toFixed(digits)}%`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-IN');
}

export function formatTime(ts: number | string): string {
  const d = new Date(ts);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export function formatDate(ts: number | string): string {
  return new Date(ts).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function relativeTime(ts: number | string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return formatDate(ts);
}

export const RISK_BAND_META: Record<string, { label: string; cls: string; dot: string; text: string }> = {
  critical: { label: 'Critical', cls: 'band-critical', dot: 'bg-risk-critical', text: 'text-risk-critical' },
  high: { label: 'High', cls: 'band-high', dot: 'bg-risk-high', text: 'text-risk-high' },
  elevated: { label: 'Elevated', cls: 'band-elevated', dot: 'bg-risk-elevated', text: 'text-risk-elevated' },
  normal: { label: 'Normal', cls: 'band-normal', dot: 'bg-risk-normal', text: 'text-risk-normal' },
};

export function bandMeta(band: string) {
  return RISK_BAND_META[band] ?? RISK_BAND_META.normal;
}

export const OUTCOME_META: Record<string, { label: string; cls: string }> = {
  clean: { label: 'Clean', cls: 'text-risk-normal' },
  chargeback: { label: 'Chargeback', cls: 'text-risk-critical' },
  rto: { label: 'RTO', cls: 'text-risk-high' },
  return_fraud: { label: 'Return Fraud', cls: 'text-risk-elevated' },
  pending: { label: 'Pending', cls: 'text-muted-foreground' },
};

export function outcomeMeta(kind: string) {
  return OUTCOME_META[kind] ?? { label: kind, cls: 'text-muted-foreground' };
}

'use client';

import { useState } from 'react';
import { useQueue, useApp } from './data';
import { useApp as useAppStore } from '@/lib/store';
import { SectionHeader, StateBox, RiskBadge, OutcomeBadge } from './bits';
import { formatINR, formatNumber, formatTime, relativeTime, bandMeta } from './format';
import { cn } from '@/lib/utils';
import {
  Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight,
  Filter, X, ExternalLink,
} from 'lucide-react';

type SortField = 'riskScore' | 'ts' | 'amount';
type Order = 'asc' | 'desc';

const BANDS = ['critical', 'high', 'elevated', 'normal'] as const;
const STATUSES = ['pending', 'realized', 'flagged', 'decided'] as const;

export function Queue() {
  const openInvestigation = useAppStore((s) => s.openInvestigation);
  const bandFilter = useAppStore((s) => s.queueBandFilter);
  const setBandFilter = useAppStore((s) => s.setQueueBandFilter);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [sort, setSort] = useState<SortField>('riskScore');
  const [order, setOrder] = useState<Order>('desc');
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState('');
  const [minScore, setMinScore] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Reset to page 1 whenever the store-driven band filter changes.
  // (When navigating from another view, Queue mounts fresh with page=1,
  //  so this only matters for in-view band changes — handled in the
  //  click handler below to avoid setState-in-effect.)

  const { data, isLoading, isError } = useQueue({
    page, pageSize, sort, order,
    band: bandFilter ?? '',
    status,
    search,
    minScore: minScore || undefined,
  });

  const toggleSort = (field: SortField) => {
    if (sort === field) setOrder(order === 'asc' ? 'desc' : 'asc');
    else { setSort(field); setOrder('desc'); }
  };

  return (
    <div className="px-4 md:px-6 py-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-primary/80 mb-1">Investigation Queue</div>
          <h1 className="text-2xl font-semibold tracking-tight">Risk Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data ? `${formatNumber(data.total)} transactions` : 'Loading…'} · sorted by {sort === 'riskScore' ? 'risk score' : sort === 'ts' ? 'time' : 'amount'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search txn / customer / device / IP…"
              className="w-[240px] h-9 pl-8 pr-3 rounded-md border border-border bg-input/40 text-[13px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn('h-9 px-3 rounded-md border border-border text-[12px] flex items-center gap-1.5', showFilters ? 'bg-accent text-accent-foreground' : 'bg-card/40 hover:bg-card')}
          >
            <Filter className="h-3.5 w-3.5" /> Filters
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-md border border-border bg-card/40 p-0.5">
          {BANDS.map((b) => {
            const active = bandFilter === b;
            const m = bandMeta(b);
            return (
              <button
                key={b}
                onClick={() => { setBandFilter(active ? null : b); setPage(1); }}
                className={cn(
                  'px-2.5 py-1 rounded text-[11px] font-medium uppercase tracking-wide transition-colors',
                  active ? m.cls : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {b}
              </button>
            );
          })}
        </div>

        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="h-8 px-2 rounded-md border border-border bg-card/40 text-[12px] focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
        </select>

        <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <span>Min score</span>
          <input
            type="number" min="0" max="1" step="0.05"
            value={minScore}
            onChange={(e) => { setMinScore(e.target.value); setPage(1); }}
            placeholder="0.0"
            className="w-16 h-8 px-2 rounded-md border border-border bg-card/40 text-[12px] tnum focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {(bandFilter || status || search || minScore) && (
          <button
            onClick={() => { setBandFilter(null); setStatus(''); setSearch(''); setMinScore(''); setPage(1); }}
            className="h-8 px-2.5 rounded-md border border-border bg-card/40 text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
        {isLoading ? (
          <StateBox kind="loading" />
        ) : isError ? (
          <StateBox kind="error" message="Failed to load queue" />
        ) : !data || data.items.length === 0 ? (
          <StateBox kind="empty" message="No transactions match these filters" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground border-b border-border bg-muted/30">
                  <th className="text-left font-medium px-3 py-2.5">Transaction</th>
                  <th className="text-left font-medium px-3 py-2.5">Customer</th>
                  <th className="text-left font-medium px-3 py-2.5">Order</th>
                  <th className="text-left font-medium px-3 py-2.5">Ship To</th>
                  <SortHeader field="amount" label="Amount" sort={sort} order={order} onSort={toggleSort} align="right" />
                  <SortHeader field="riskScore" label="Risk" sort={sort} order={order} onSort={toggleSort} align="right" />
                  <SortHeader field="ts" label="Time" sort={sort} order={order} onSort={toggleSort} align="right" />
                  <th className="text-left font-medium px-3 py-2.5">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((t: any) => (
                  <tr
                    key={t.id}
                    onClick={() => openInvestigation(t.id)}
                    className="border-b border-border/60 last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-mono text-[11px] text-foreground">{t.id}</div>
                      <div className="text-[10px] text-muted-foreground">{t.merchantId}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-mono text-[11px] text-foreground">{t.customerId}</div>
                      {t.isGuest && <span className="text-[10px] text-risk-high">guest</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-[12px]">{t.category}</div>
                      <div className="text-[10px] text-muted-foreground">{t.paymentMethod}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-[12px]">{t.shippingCity}</div>
                      <div className="text-[10px] text-muted-foreground">Tier {t.shippingTier}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right tnum">{formatINR(t.amount, { compact: true })}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <RiskBadge band={t.riskBand} score={t.riskScore} />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="text-[11px] text-muted-foreground">{relativeTime(t.ts)}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      {t.decision ? (
                        <span className="text-[11px] font-medium uppercase tracking-wide text-primary">{t.decision}</span>
                      ) : (
                        <OutcomeBadge kind={t.outcomeKind} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-muted/20">
            <div className="text-[11px] text-muted-foreground">
              Page {page} of {data.totalPages} · {formatNumber(data.total)} total
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="h-7 px-2 rounded border border-border text-[12px] disabled:opacity-40 hover:bg-card flex items-center gap-1"
              >
                <ChevronLeft className="h-3 w-3" /> Prev
              </button>
              <button
                onClick={() => setPage(Math.min(data.totalPages, page + 1))}
                disabled={page === data.totalPages}
                className="h-7 px-2 rounded border border-border text-[12px] disabled:opacity-40 hover:bg-card flex items-center gap-1"
              >
                Next <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SortHeader({ field, label, sort, order, onSort, align }: { field: SortField; label: string; sort: SortField; order: Order; onSort: (f: SortField) => void; align: 'left' | 'right' }) {
  const active = sort === field;
  return (
    <th className={cn('font-medium px-3 py-2.5', align === 'right' ? 'text-right' : 'text-left')}>
      <button
        onClick={() => onSort(field)}
        className={cn('inline-flex items-center gap-1 hover:text-foreground transition-colors', active && 'text-primary')}
      >
        {label}
        {active ? (
          order === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

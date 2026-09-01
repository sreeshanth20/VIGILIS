'use client';

import { useApp, View } from '@/lib/store';
import { cn } from '@/lib/utils';
import { useOverview } from './data';
import {
  Shield, LayoutDashboard, ListChecks, SlidersHorizontal, BrainCircuit,
  Activity, ChevronRight,
} from 'lucide-react';

const NAV: { id: View; label: string; icon: React.ElementType; hint: string }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, hint: 'Risk intelligence summary' },
  { id: 'queue', label: 'Risk Queue', icon: ListChecks, hint: 'Investigate transactions' },
  { id: 'threshold', label: 'Threshold Tuner', icon: SlidersHorizontal, hint: 'Simulate operating points' },
  { id: 'model', label: 'Model Performance', icon: BrainCircuit, hint: 'Held-out metrics & explanations' },
];

/** Static fallback model meta (matches the committed artifact). */
const FALLBACK_META = { rocAuc: 0.831, prAuc: 0.777, treeCount: 219, operatingThreshold: 0.35 };

export function Shell({ children }: { children: React.ReactNode }) {
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const { data } = useOverview();
  const meta = data?.model ?? FALLBACK_META;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="hidden md:flex w-[244px] shrink-0 flex-col border-r border-border bg-sidebar sticky top-0 h-screen">
        <div className="px-5 pt-6 pb-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/30">
              <Shield className="h-5 w-5 text-primary" />
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-risk-high ring-2 ring-background animate-vigilis-pulse" />
            </div>
            <div className="leading-tight">
              <div className="text-[15px] font-semibold tracking-tight">VIGILIS</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Risk Intelligence</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          <div className="px-2 pb-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">Workspace</div>
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={cn(
                  'group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
                )}
              >
                <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-primary' : 'text-muted-foreground group-hover:text-sidebar-foreground')} />
                <span className="flex-1 text-left font-medium">{item.label}</span>
                {active && <ChevronRight className="h-3.5 w-3.5 text-primary" />}
              </button>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-sidebar-border space-y-3">
          <div className="rounded-md border border-border bg-card/50 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-risk-normal" />
                <span className="text-[11px] font-medium text-muted-foreground">Model Status</span>
              </div>
              <span className="h-1.5 w-1.5 rounded-full bg-risk-normal animate-vigilis-pulse" />
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground space-y-1">
              <div className="flex justify-between"><span>ROC-AUC</span><span className="tnum text-foreground">{meta.rocAuc.toFixed(3)}</span></div>
              <div className="flex justify-between"><span>PR-AUC</span><span className="tnum text-foreground">{meta.prAuc.toFixed(3)}</span></div>
              <div className="flex justify-between"><span>Trees</span><span className="tnum text-foreground">{meta.treeCount ?? 219}</span></div>
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground/60 leading-relaxed">
            Defense-only system. No offensive capability. All actions logged.
          </div>
        </div>
      </aside>

      {/* Mobile top nav */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-sidebar border-b border-sidebar-border">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-semibold tracking-tight">VIGILIS</span>
          </div>
          <div className="flex items-center gap-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-md',
                    active ? 'bg-sidebar-accent text-primary' : 'text-muted-foreground',
                  )}
                  title={item.label}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <main className="flex-1 pt-14 md:pt-0">{children}</main>
        <Footer rocAuc={meta.rocAuc} prAuc={meta.prAuc} treeCount={meta.treeCount ?? 219} />
      </div>
    </div>
  );
}

function Footer({ rocAuc, prAuc, treeCount }: { rocAuc: number; prAuc: number; treeCount: number }) {
  return (
    <footer className="mt-auto border-t border-border bg-card/30 px-6 py-3 text-[11px] text-muted-foreground">
      <div className="flex flex-wrap items-center justify-between gap-2 max-w-[1400px] mx-auto">
        <div className="flex items-center gap-3">
          <span className="font-medium text-foreground/80">VIGILIS</span>
          <span className="text-muted-foreground/60">·</span>
          <span>AI Risk Intelligence Platform</span>
          <span className="text-muted-foreground/60">·</span>
          <span>Defense-only</span>
        </div>
        <div className="flex items-center gap-3 tnum">
          <span>GBDT · {treeCount} trees</span>
          <span className="text-muted-foreground/60">·</span>
          <span>ROC-AUC {rocAuc.toFixed(3)}</span>
          <span className="text-muted-foreground/60">·</span>
          <span>PR-AUC {prAuc.toFixed(3)}</span>
        </div>
      </div>
    </footer>
  );
}

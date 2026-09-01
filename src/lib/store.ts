'use client';

import { create } from 'zustand';

export type View = 'overview' | 'queue' | 'threshold' | 'model';

interface AppState {
  view: View;
  setView: (v: View) => void;

  /** Currently-open investigation transaction id (null = drawer closed). */
  investigatingId: string | null;
  openInvestigation: (id: string) => void;
  closeInvestigation: () => void;

  /** Threshold tuner is accessible from anywhere; opening it switches view. */
  openThreshold: () => void;
  openModel: () => void;

  /** Selected merchant filter (null = all merchants). */
  merchantFilter: string | null;
  setMerchantFilter: (id: string | null) => void;

  /** Queue pre-filter (e.g., open queue with only critical band). */
  queueBandFilter: string | null;
  setQueueBandFilter: (b: string | null) => void;
}

export const useApp = create<AppState>((set) => ({
  view: 'overview',
  setView: (v) => set({ view: v }),

  investigatingId: null,
  openInvestigation: (id) => set({ investigatingId: id }),
  closeInvestigation: () => set({ investigatingId: null }),

  openThreshold: () => set({ view: 'threshold' }),
  openModel: () => set({ view: 'model' }),

  merchantFilter: null,
  setMerchantFilter: (id) => set({ merchantFilter: id }),

  queueBandFilter: null,
  setQueueBandFilter: (b) => set({ queueBandFilter: b }),
}));

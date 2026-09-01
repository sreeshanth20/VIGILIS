'use client';

/**
 * VIGILIS chart color palette (hex).
 *
 * These mirror the oklch design tokens in globals.css but are expressed as
 * hex because some rendering engines (notably headless Chromium used for
 * screenshots / PDF export) do not paint oklch() values supplied as SVG
 * presentation attributes. Using hex guarantees the charts render identically
 * in every environment.
 *
 * Premium light-first palette with professional blue/indigo accent.
 */

export const C = {
  blue: '#3b82f6',
  blueBright: '#2563eb',
  indigo: '#6366f1',
  teal: '#14b8a6',
  red: '#dc2626',
  orange: '#ea580c',
  yellow: '#ca8a04',

  grid: '#e5e7eb',
  axis: '#6b7280',
  axisLight: '#9ca3af',

  tipBg: '#ffffff',
  tipFg: '#1f2937',
  tipMuted: '#6b7280',

  cursor: 'rgba(0,0,0,0.08)',
  bg: '#f9fafb',
};

export const TOOLTIP_STYLE = {
  background: C.tipBg,
  border: `1px solid ${C.grid}`,
  borderRadius: 6,
  fontSize: 12,
  color: C.tipFg,
  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
} as const;

export const TOOLTIP_LABEL_STYLE = { color: C.tipFg } as const;
export const TOOLTIP_ITEM_STYLE = { color: C.tipMuted } as const;

export const AXIS_TICK = { fill: C.axis, fontSize: 10 } as const;
export const AXIS_TICK_LIGHT = { fill: C.axisLight, fontSize: 11 } as const;
export const GRID_PROPS = { stroke: C.grid, strokeDasharray: '3 3' } as const;

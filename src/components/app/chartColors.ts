'use client';

/**
 * AEGIS chart color palette (hex).
 *
 * These mirror the oklch design tokens in globals.css but are expressed as
 * hex because some rendering engines (notably headless Chromium used for
 * screenshots / PDF export) do not paint oklch() values supplied as SVG
 * presentation attributes. Using hex guarantees the charts render identically
 * in every environment.
 */

export const C = {
  amber: '#ef852e',
  amberBright: '#ff9b50',
  orange: '#ea6f2f',
  red: '#ee3533',
  emerald: '#3fa66b',
  yellow: '#e6ac3d',

  grid: '#272320',
  axis: '#98918b',
  axisLight: '#c8c3bf',

  tipBg: '#110f0d',
  tipFg: '#f6f1ed',
  tipMuted: '#d5d0cc',

  cursor: 'rgba(29,26,24,0.5)',
  bg: '#0a0908',
};

export const TOOLTIP_STYLE = {
  background: C.tipBg,
  border: `1px solid ${C.grid}`,
  borderRadius: 6,
  fontSize: 12,
  color: C.tipFg,
} as const;

export const TOOLTIP_LABEL_STYLE = { color: C.tipFg } as const;
export const TOOLTIP_ITEM_STYLE = { color: C.tipMuted } as const;

export const AXIS_TICK = { fill: C.axis, fontSize: 10 } as const;
export const AXIS_TICK_LIGHT = { fill: C.axisLight, fontSize: 11 } as const;
export const GRID_PROPS = { stroke: C.grid, strokeDasharray: '3 3' } as const;

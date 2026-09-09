/**
 * Shared chart styling for Recharts. Stay-GEPF is always series 1 (green), leave-preserve series 2
 * (orange), leave-cash / offshore series 3 (blue). Keep colours consistent across pages.
 */
export const SERIES = {
  stay: '#2f7f6d',
  preserve: '#c2410c',
  cash: '#1d4ed8',
  s4: '#7c3aed',
  s5: '#b45309',
  s6: '#0e7490',
  target: '#64748b',
  grid: '#e2e8f0',
  axis: '#64748b',
} as const

export const SERIES_LIST = [SERIES.stay, SERIES.preserve, SERIES.cash, SERIES.s4, SERIES.s5, SERIES.s6]

export function colourForScenario(id: string, index = 0): string {
  if (id === 'stay') return SERIES.stay
  if (id === 'preserve') return SERIES.preserve
  if (id === 'cash') return SERIES.cash
  return SERIES_LIST[(index + 3) % SERIES_LIST.length]
}

/** Axis tick formatter for rand values: R1.2m, R450k. */
export function tickRand(v: number): string {
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}R${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}m`
  if (abs >= 1_000) return `${sign}R${Math.round(abs / 1_000)}k`
  return `${sign}R${Math.round(abs)}`
}

export function tickPct(v: number): string {
  return `${Math.round(v * 100)}%`
}

export const chartMargin = { top: 8, right: 16, bottom: 8, left: 8 }

export const tooltipStyle = {
  contentStyle: { borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 },
  labelStyle: { fontWeight: 600, color: '#0f172a' },
}

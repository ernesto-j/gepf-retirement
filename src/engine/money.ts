/** Formatting and small numeric helpers shared by the engine and the UI. */

const randFormatter = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

/** R1 234 567 (no decimals). Negative values keep the sign. */
export function formatRand(value: number | null | undefined, opts?: { decimals?: number }): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  if (opts?.decimals !== undefined) {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      minimumFractionDigits: opts.decimals,
      maximumFractionDigits: opts.decimals,
    })
      .format(value)
      .replace(/ /g, ' ')
  }
  return randFormatter.format(Math.round(value)).replace(/ /g, ' ')
}

/** R1.23m / R456k / R789 */
export function formatRandCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `${sign}R${(abs / 1_000_000_000).toFixed(2)}bn`
  if (abs >= 1_000_000) return `${sign}R${(abs / 1_000_000).toFixed(2)}m`
  if (abs >= 10_000) return `${sign}R${Math.round(abs / 1_000)}k`
  return `${sign}R${Math.round(abs).toLocaleString('en-ZA').replace(/,/g, ' ')}`
}

export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

/** 0.045 -> "4.5%" */
export function formatPct(rate: number | null | undefined, decimals = 1): string {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return '—'
  return `${(rate * 100).toFixed(decimals)}%`
}

export function formatAge(age: number | null | undefined): string {
  if (age === null || age === undefined || Number.isNaN(age)) return 'Never (lasts to horizon)'
  return `${Math.round(age)}`
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function round(value: number, decimals = 0): number {
  const f = 10 ** decimals
  return Math.round(value * f) / f
}

/** Compound growth: amount * (1+rate)^years */
export function grow(amount: number, rate: number, years: number): number {
  return amount * (1 + rate) ** years
}

/** Real rate from nominal and inflation: (1+n)/(1+i) - 1 */
export function realRate(nominal: number, inflation: number): number {
  return (1 + nominal) / (1 + inflation) - 1
}

/** Years between two ISO dates (fractional). */
export function yearsBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime()
  const to = new Date(toIso).getTime()
  return (to - from) / (365.25 * 24 * 3600 * 1000)
}

export function sum(values: number[]): number {
  let s = 0
  for (const v of values) s += v
  return s
}

/** Present value of a stream of annual amounts starting next year, discounted at rate. */
export function presentValue(amounts: number[], rate: number): number {
  let pv = 0
  amounts.forEach((a, i) => {
    pv += a / (1 + rate) ** (i + 1)
  })
  return pv
}

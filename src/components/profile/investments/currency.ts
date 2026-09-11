import type { InvestmentCurrency } from '../../../engine/types'
import { formatRand } from '../../../engine/money'

const LOCALE: Record<InvestmentCurrency, string> = {
  ZAR: 'en-ZA',
  USD: 'en-US',
  AUD: 'en-AU',
  GBP: 'en-GB',
  EUR: 'de-DE',
}

const SYMBOL: Record<InvestmentCurrency, string> = {
  ZAR: 'R',
  USD: '$',
  AUD: 'A$',
  GBP: '£',
  EUR: '€',
}

export function currencySymbol(currency: InvestmentCurrency): string {
  return SYMBOL[currency]
}

/** Full formatted amount in `currency`, e.g. "A$300,000". ZAR reuses the shared rand formatter for consistency. */
export function formatCcy(value: number | null | undefined, currency: InvestmentCurrency): string {
  if (currency === 'ZAR') return formatRand(value)
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat(LOCALE[currency], { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
}

/** Compact amount, e.g. "A$1.20m" / "$45k". */
export function formatCcyCompact(value: number | null | undefined, currency: InvestmentCurrency): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  const sym = currencySymbol(currency)
  if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(2)}m`
  if (abs >= 10_000) return `${sign}${sym}${Math.round(abs / 1_000)}k`
  return `${sign}${sym}${Math.round(abs).toLocaleString('en-ZA').replace(/,/g, ' ')}`
}

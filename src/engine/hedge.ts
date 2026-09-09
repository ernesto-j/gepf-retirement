/**
 * Rand-hedge and purchasing-power projections, plus history-derived FX/inflation stats.
 *
 * Pure TypeScript, no React. See docs/SPEC.md "src/engine/hedge.ts".
 *
 * `projectHedge` compares two portfolios holding the same starting capital:
 *  - "unhedged": 100% invested locally (ZAR), growing at `localBalancedReturn - feeLocal`.
 *  - "hedged": `offshoreShareHedged` held offshore (USD), growing at
 *    `offshoreReturnUsd - feeOffshore` and valued in rand at that year's usdZar rate; the
 *    remainder stays local. The offshore share is rebalanced back to target every year end
 *    (a real living annuity / discretionary pot would drift and need active rebalancing to
 *    keep the same risk profile).
 * A one-off `fxConversionCost` is charged only on the initial conversion of the offshore
 * share to USD at t=0 (SIMPLIFICATION: ignores the cost of annual rebalancing trades).
 *
 * `usdZar(t)` compounds at `randDepreciation` p.a., except the first `randStrengthYears`
 * (optional stress toggle — "what if the rand strengthens for a few years") which compound
 * at `randStrengthRate` instead; depreciation resumes for the years after that.
 *
 * `randStats` derives depreciation and inflation statistics from `MacroHistory`, always
 * anchoring on the closest available data point to the requested year (the history may not
 * have every year, or the window may reach before the earliest year on record).
 */
import type { Assumptions, HedgeProjectionRow, MacroHistory, MacroSeriesPoint } from './types'

// ---------------------------------------------------------------------------
// Small numeric guards (mirrors src/engine/gepf.ts's `num`)
// ---------------------------------------------------------------------------

/** Finite number or the fallback (NaN / Infinity / undefined never propagate). */
function num(value: number | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** Non-negative integer year count (fractional/negative input clamped down to 0). */
function nonNegativeInt(value: number): number {
  const n = num(value, 0)
  return n > 0 ? Math.floor(n) : 0
}

// ---------------------------------------------------------------------------
// projectHedge
// ---------------------------------------------------------------------------

const DEFAULT_FEE_LOCAL = 0.0075

/** usdZar(t): compounds at `randStrengthRate` for the first `strengthYears`, then at `depreciation`. */
function usdZarAt(t: number, spot: number, depreciation: number, strengthYears: number, strengthRate: number): number {
  const strong = Math.min(t, Math.max(strengthYears, 0))
  const remaining = t - strong
  return spot * (1 + strengthRate) ** strong * (1 + depreciation) ** remaining
}

export function projectHedge(opts: {
  capital: number
  years: number
  offshoreShareHedged: number
  assumptions: Assumptions
  feeLocal?: number
  feeOffshore?: number
  randStrengthYears?: number
  randStrengthRate?: number
}): HedgeProjectionRow[] {
  const { assumptions } = opts
  const capital = num(opts.capital, 0)
  const years = nonNegativeInt(opts.years)
  const offshoreShare = Math.min(Math.max(num(opts.offshoreShareHedged, 0), 0), 1)
  const feeLocal = num(opts.feeLocal, DEFAULT_FEE_LOCAL)
  const feeOffshore = num(opts.feeOffshore, num(assumptions.offshoreFee, 0))
  const strengthYears = nonNegativeInt(num(opts.randStrengthYears, 0))
  const strengthRate = num(opts.randStrengthRate, 0)

  const spot = num(assumptions.usdZarSpot, 0)
  const depreciation = num(assumptions.randDepreciation, 0)
  const officialCpi = num(assumptions.officialCpi, 0)
  const personalInflation = num(assumptions.personalInflation, 0)
  const fxConversionCost = Math.min(Math.max(num(assumptions.fxConversionCost, 0), 0), 1)

  const localReturn = num(assumptions.localBalancedReturn, 0) - feeLocal
  const offshoreReturn = num(assumptions.offshoreReturnUsd, 0) - feeOffshore

  const usdZar0 = usdZarAt(0, spot, depreciation, strengthYears, strengthRate)

  // Unhedged: 100% local, never touches USD.
  let unhedgedLocal = capital
  // Hedged: split at t=0, the offshore leg paying the one-off FX conversion cost.
  let hedgedLocal = capital * (1 - offshoreShare)
  let hedgedOffshoreUsd = usdZar0 > 0 ? (capital * offshoreShare * (1 - fxConversionCost)) / usdZar0 : 0

  const rows: HedgeProjectionRow[] = []
  for (let t = 0; t <= years; t++) {
    const usdZar = usdZarAt(t, spot, depreciation, strengthYears, strengthRate)
    const cpiIndex = (1 + officialCpi) ** t
    const personalIndex = (1 + personalInflation) ** t

    if (t > 0) {
      unhedgedLocal *= 1 + localReturn
      hedgedLocal *= 1 + localReturn
      hedgedOffshoreUsd *= 1 + offshoreReturn
    }

    const unhedgedNominal = unhedgedLocal
    const hedgedNominal = hedgedLocal + hedgedOffshoreUsd * usdZar

    rows.push({
      year: t,
      usdZar,
      cpiIndex,
      personalIndex,
      unhedgedNominal,
      hedgedNominal,
      unhedgedReal: personalIndex > 0 ? unhedgedNominal / personalIndex : unhedgedNominal,
      hedgedReal: personalIndex > 0 ? hedgedNominal / personalIndex : hedgedNominal,
      unhedgedUsd: usdZar > 0 ? unhedgedNominal / usdZar : 0,
      hedgedUsd: usdZar > 0 ? hedgedNominal / usdZar : 0,
    })

    // Rebalance the hedged sleeve back to target for the next year (no cost modelled).
    if (t < years) {
      const targetOffshoreZar = hedgedNominal * offshoreShare
      hedgedLocal = hedgedNominal - targetOffshoreZar
      hedgedOffshoreUsd = usdZar > 0 ? targetOffshoreZar / usdZar : 0
    }
  }
  return rows
}

// ---------------------------------------------------------------------------
// Purchasing power
// ---------------------------------------------------------------------------

/** What `amount` (today's rand) will buy in `years` at `rate` inflation: amount / (1+rate)^years. */
export function purchasingPower(amount: number, years: number, rate: number): number {
  const a = num(amount, 0)
  const n = num(years, 0)
  const r = num(rate, 0)
  const denom = (1 + r) ** n
  return denom !== 0 ? a / denom : a
}

/** Income needed in `years` to match `todayAmount`'s purchasing power today: amount x (1+inflation)^years. */
export function requiredIncomeForPurchasingPower(todayAmount: number, years: number, inflation: number): number {
  const a = num(todayAmount, 0)
  const n = num(years, 0)
  const i = num(inflation, 0)
  return a * (1 + i) ** n
}

// ---------------------------------------------------------------------------
// History-derived stats
// ---------------------------------------------------------------------------

/** The point in `series` whose year is closest to `targetYear` (ties keep the earlier match). */
function closestPoint(series: MacroSeriesPoint[], targetYear: number): MacroSeriesPoint | undefined {
  let best: MacroSeriesPoint | undefined
  let bestDiff = Number.POSITIVE_INFINITY
  for (const p of series) {
    const diff = Math.abs(p.year - targetYear)
    if (diff < bestDiff) {
      best = p
      bestDiff = diff
    }
  }
  return best
}

/**
 * Annualised change in `series` over `spanYears` ending at `asOfYear`, anchored on the
 * closest available data points at both ends (so a request for 30 years against a series
 * starting in 1994 still returns a sensible number instead of NaN).
 */
function annualisedChange(series: MacroSeriesPoint[], asOfYear: number, spanYears: number): number {
  const end = closestPoint(series, asOfYear)
  const start = closestPoint(series, asOfYear - spanYears)
  if (!end || !start) return 0
  const elapsed = end.year - start.year
  if (elapsed <= 0 || !(start.value > 0)) return 0
  return (end.value / start.value) ** (1 / elapsed) - 1
}

/** Mean of `series` values in the `spanYears`-year window ending at `asOfYear` (inclusive). */
function windowMean(series: MacroSeriesPoint[], asOfYear: number, spanYears: number): number {
  const points = series.filter((p) => p.year <= asOfYear && p.year > asOfYear - spanYears)
  if (points.length === 0) return 0
  let total = 0
  for (const p of points) total += p.value
  return total / points.length
}

export function randStats(
  history: MacroHistory,
  asOfYear: number,
): {
  dep10: number
  dep20: number
  dep30: number
  cpiAvg10: number
  cpiAvg20: number
  cpiAvg30: number
  usCpiAvg20: number
  inflationDifferential20: number
  pppImpliedDepreciation20: number
} {
  const asOf = num(asOfYear, 0)
  const dep10 = annualisedChange(history.usdZarAnnualAvg, asOf, 10)
  const dep20 = annualisedChange(history.usdZarAnnualAvg, asOf, 20)
  const dep30 = annualisedChange(history.usdZarAnnualAvg, asOf, 30)
  const cpiAvg10 = windowMean(history.saCpi, asOf, 10)
  const cpiAvg20 = windowMean(history.saCpi, asOf, 20)
  const cpiAvg30 = windowMean(history.saCpi, asOf, 30)
  const usCpiAvg20 = windowMean(history.usCpi, asOf, 20)
  const inflationDifferential20 = cpiAvg20 - usCpiAvg20
  const pppImpliedDepreciation20 = (1 + cpiAvg20) / (1 + usCpiAvg20) - 1
  return { dep10, dep20, dep30, cpiAvg10, cpiAvg20, cpiAvg30, usCpiAvg20, inflationDifferential20, pppImpliedDepreciation20 }
}

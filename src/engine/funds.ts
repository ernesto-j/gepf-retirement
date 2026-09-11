/**
 * Fee-impact maths and fund ranking. Pure TypeScript, no React.
 * See docs/SPEC.md "src/engine/funds.ts".
 */
import type { FundInfo } from './types'
import { yearsBetween } from './money'

// ---------------------------------------------------------------------------
// Small numeric guards (mirrors src/engine/gepf.ts's `num`)
// ---------------------------------------------------------------------------

/** Finite number or the fallback (NaN / Infinity / undefined never propagate). */
function num(value: number | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

// ---------------------------------------------------------------------------
// feeImpact
// ---------------------------------------------------------------------------

/**
 * Simulates `capital` for `years` annual steps: each year the `drawdown` fraction of the
 * balance is withdrawn first, then the remainder grows at `rate`. Used both for the
 * with-fee run (`rate = grossReturn - fee`) and the no-fee counterfactual (`rate = grossReturn`).
 */
function simulate(capital: number, years: number, rate: number, drawdown: number): number {
  let balance = capital
  for (let y = 0; y < years; y++) {
    balance *= 1 - drawdown
    balance *= 1 + rate
  }
  return balance
}

export function feeImpact(opts: {
  capital: number
  years: number
  grossReturn: number
  fee: number
  drawdown?: number
}): { finalCapital: number; feesPaid: number; finalCapitalNoFee: number; incomeLossPct: number } {
  const capital = num(opts.capital, 0)
  const years = Math.max(0, Math.floor(num(opts.years, 0)))
  const grossReturn = num(opts.grossReturn, 0)
  const fee = num(opts.fee, 0)
  const drawdown = Math.min(Math.max(num(opts.drawdown, 0), 0), 1)
  const netReturn = grossReturn - fee

  let balance = capital
  let feesPaid = 0
  for (let y = 0; y < years; y++) {
    const startOfYear = balance * (1 - drawdown)
    const endOfYear = startOfYear * (1 + netReturn)
    feesPaid += fee * ((startOfYear + endOfYear) / 2)
    balance = endOfYear
  }
  const finalCapital = balance
  const finalCapitalNoFee = simulate(capital, years, grossReturn, drawdown)
  const incomeLossPct = finalCapitalNoFee !== 0 ? 1 - finalCapital / finalCapitalNoFee : 0

  return { finalCapital, feesPaid, finalCapitalNoFee, incomeLossPct }
}

// ---------------------------------------------------------------------------
// Fund-history return basis
// ---------------------------------------------------------------------------

/**
 * The fund's own historic GROSS return, for scenarios with `returnBasis: 'fund-history'`
 * (src/engine/projection.ts): its longest available annualised return (10yr, else 5yr, else
 * 3yr) grossed back up by adding the fund's TER, since fact-sheet returns are net of TER while
 * the engine deducts its own all-in fee. `null` when the fund has no historic return on record
 * at all (the caller falls back to the global return assumption).
 */
export function fundGrossReturn(fund: FundInfo): number | null {
  const net = fund.returns.y10 ?? fund.returns.y5 ?? fund.returns.y3 ?? null
  if (net === null) return null
  return net + num(fund.ter, 0)
}

// ---------------------------------------------------------------------------
// 30-year view
// ---------------------------------------------------------------------------

/**
 * Reference "today" for deriving years-since-inception, a constant rather than `new Date()` so
 * results are reproducible (same convention as `TODAY` in src/engine/gepf.ts).
 */
export const FUNDS_TODAY = '2026-09-11'

export interface FundLongRunReturn {
  /** The longest-available annualised return on record, net of TER (same basis as `returns.*`); null if the fund has none. */
  rate: number | null
  /** Whole years backing `rate`: the bucket size (10/15/20/30) or years since `inceptionDate` when `sinceInception` is used. */
  years: number | null
  /** e.g. "20-yr" for a fixed bucket, or "since 1999 (27 yrs)" when `sinceInception` + `inceptionDate` give the longest track record. */
  label: string
}

/**
 * Picks the fund's longest available annualised return: the longest of `returns.y30/y20/y15/y10`
 * by bucket size, compared against `returns.sinceInception` (when both it and `inceptionDate` are
 * present) by actual years elapsed since launch — since a fund's full history is often longer
 * than its longest published fixed bucket (e.g. PSG Balanced: y20 only, but since-inception
 * spans ~27 years). Ties keep the fixed bucket over since-inception. Returns
 * `{ rate: null, years: null, label: '—' }` when the fund has no long-run figure at all (e.g. a
 * fund younger than 10 years, or with returns still unverified).
 */
export function fundLongRunReturn(fund: FundInfo, opts?: { today?: string }): FundLongRunReturn {
  const today = opts?.today ?? FUNDS_TODAY
  const candidates: { rate: number | null | undefined; years: number; label: string }[] = [
    { rate: fund.returns.y30, years: 30, label: '30-yr' },
    { rate: fund.returns.y20, years: 20, label: '20-yr' },
    { rate: fund.returns.y15, years: 15, label: '15-yr' },
    { rate: fund.returns.y10, years: 10, label: '10-yr' },
  ]
  if (fund.returns.sinceInception !== null && fund.returns.sinceInception !== undefined && fund.inceptionDate) {
    const years = Math.max(0, Math.floor(yearsBetween(fund.inceptionDate, today)))
    const inceptionYear = fund.inceptionDate.slice(0, 4)
    candidates.push({ rate: fund.returns.sinceInception, years, label: `since ${inceptionYear} (${years} yrs)` })
  }
  let best: { rate: number; years: number; label: string } | null = null
  for (const c of candidates) {
    if (c.rate === null || c.rate === undefined) continue
    if (!best || c.years > best.years) best = { rate: c.rate, years: c.years, label: c.label }
  }
  return best ?? { rate: null, years: null, label: '—' }
}

/**
 * Growth of `capital` over `years` at `rate` net of `fee`, compounded annually with no
 * withdrawals (the no-drawdown case of `simulate` above). Used for the "R1m after 30 yrs" column
 * and the 30-year growth chart: pass a GROSS return (e.g. `fundLongRunReturn(fund).rate + fund.ter`,
 * since long-run returns are net of TER only) and `fee = fund.allInFee` so the result nets out the
 * full member-borne cost, not just the fund's own TER. Guarded against non-finite input; a `null`
 * rate (no long-run figure available) returns `capital` unchanged rather than a guessed path.
 */
export function growthOfCapital(rate: number | null, fee: number, years: number, capital = 1_000_000): number {
  const c = num(capital, 0)
  if (rate === null) return c
  const netRate = num(rate, 0) - num(fee, 0)
  const y = Math.max(0, Math.floor(num(years, 0)))
  return c * (1 + netRate) ** y
}

// ---------------------------------------------------------------------------
// Ranking / lookup
// ---------------------------------------------------------------------------

/**
 * Ranks funds by `score = (10y ?? 5y ?? 3y ?? 0) − allInFee`, descending, excluding the
 * `gepf` pseudo-entry (it has no investment returns or member-borne fee to compare).
 */
export function rankFunds(funds: FundInfo[], _opts?: { horizon: 10 | 5 | 3 }): (FundInfo & { score: number })[] {
  return funds
    .filter((f) => f.id !== 'gepf')
    .map((f) => {
      const ret = f.returns.y10 ?? f.returns.y5 ?? f.returns.y3 ?? 0
      return { ...f, score: ret - num(f.allInFee, 0) }
    })
    .sort((a, b) => b.score - a.score)
}

/**
 * Looks up a fund by id. When `id` has no match (a stale id from a saved scenario, say)
 * this logs a warning and falls back to the first non-`gepf` fund rather than throwing,
 * per the engine convention of never throwing on ordinary bad input.
 */
export function fundById(funds: FundInfo[], id: string): FundInfo {
  const match = funds.find((f) => f.id === id)
  if (match) return match
  console.warn(`fundById: no fund with id "${id}" — falling back to the first non-gepf fund.`)
  const fallback = funds.find((f) => f.id !== 'gepf') ?? funds[0]
  if (!fallback) throw new Error('fundById: funds list is empty')
  return fallback
}

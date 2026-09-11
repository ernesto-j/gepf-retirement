/**
 * Fee-impact maths and fund ranking. Pure TypeScript, no React.
 * See docs/SPEC.md "src/engine/funds.ts".
 */
import type { FundInfo } from './types'

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

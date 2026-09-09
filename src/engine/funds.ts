// STUB — replaced by the hedge/funds engine agent. Signatures per docs/SPEC.md.
import type { FundInfo } from './types'

export function feeImpact(_opts: { capital: number; years: number; grossReturn: number; fee: number; drawdown?: number }): { finalCapital: number; feesPaid: number; finalCapitalNoFee: number; incomeLossPct: number } {
  throw new Error('not implemented')
}
export function rankFunds(_funds: FundInfo[], _opts?: { horizon: 10 | 5 | 3 }): (FundInfo & { score: number })[] {
  throw new Error('not implemented')
}
export function fundById(_funds: FundInfo[], _id: string): FundInfo {
  throw new Error('not implemented')
}

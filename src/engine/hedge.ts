// STUB — replaced by the hedge/funds engine agent. Signatures per docs/SPEC.md.
import type { Assumptions, HedgeProjectionRow, MacroHistory } from './types'

export function projectHedge(_opts: { capital: number; years: number; offshoreShareHedged: number; assumptions: Assumptions; feeLocal?: number; feeOffshore?: number; randStrengthYears?: number; randStrengthRate?: number }): HedgeProjectionRow[] {
  throw new Error('not implemented')
}
export function purchasingPower(_amount: number, _years: number, _rate: number): number {
  throw new Error('not implemented')
}
export function randStats(_history: MacroHistory, _asOfYear: number): { dep10: number; dep20: number; dep30: number; cpiAvg10: number; cpiAvg20: number; cpiAvg30: number; usCpiAvg20: number; inflationDifferential20: number; pppImpliedDepreciation20: number } {
  throw new Error('not implemented')
}
export function requiredIncomeForPurchasingPower(_todayAmount: number, _years: number, _inflation: number): number {
  throw new Error('not implemented')
}

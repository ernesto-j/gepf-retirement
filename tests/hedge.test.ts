/**
 * Hedge engine tests: rand-hedge projection, purchasing power and history-derived FX/
 * inflation stats. Expected values are hand-computed from the formulas in
 * docs/SPEC.md "src/engine/hedge.ts" (comments show the arithmetic).
 */
import { describe, expect, it } from 'vitest'
import { projectHedge, purchasingPower, randStats, requiredIncomeForPurchasingPower } from '../src/engine/hedge'
import { MACRO } from '../src/data/macroHistory'
import type { Assumptions, MacroHistory } from '../src/engine/types'

function makeAssumptions(overrides: Partial<Assumptions> = {}): Assumptions {
  return {
    taxYear: '2025/26',
    officialCpi: 0.045,
    personalInflation: 0.06,
    medicalInflation: 0.085,
    gepfIncreaseAsPctOfCpi: 1,
    usdZarSpot: 18,
    randDepreciation: 0.05,
    usInflation: 0.025,
    localBalancedReturn: 0.095,
    localCashReturn: 0.07,
    offshoreReturnUsd: 0.07,
    offshoreFee: 0.006,
    fxConversionCost: 0.005,
    livingAnnuityMinDrawdown: 0.025,
    livingAnnuityMaxDrawdown: 0.175,
    discretionaryReturnTaxRate: 0.12,
    returnVolatility: 0.12,
    ...overrides,
  }
}

describe('projectHedge', () => {
  it('returns years+1 rows, year 0 = the starting capital at spot', () => {
    const rows = projectHedge({
      capital: 100,
      years: 5,
      offshoreShareHedged: 0.5,
      assumptions: makeAssumptions(),
    })
    expect(rows).toHaveLength(6)
    expect(rows[0]!.year).toBe(0)
    expect(rows[0]!.usdZar).toBe(18)
    expect(rows[0]!.cpiIndex).toBe(1)
    expect(rows[0]!.personalIndex).toBe(1)
    expect(rows[5]!.year).toBe(5)
  })

  it('unhedged (0% offshore) grows the local sleeve at localBalancedReturn - feeLocal, in ZAR only', () => {
    // 9.5% - 0.75% fee = 8.75% net; usdZar drifts but never touches the unhedged sleeve.
    const rows = projectHedge({
      capital: 1000,
      years: 3,
      offshoreShareHedged: 0, // unhedgedNominal is independent of this; hedgedNominal becomes 100% local too
      assumptions: makeAssumptions({ localBalancedReturn: 0.095, randDepreciation: 0.05 }),
      feeLocal: 0.0075,
    })
    const netLocal = 0.095 - 0.0075 // 0.0875
    for (const row of rows) {
      const expected = 1000 * (1 + netLocal) ** row.year
      expect(row.unhedgedNominal).toBeCloseTo(expected, 6)
    }
    // With 0% offshore the hedged sleeve is identical to the unhedged one.
    expect(rows[3]!.hedgedNominal).toBeCloseTo(rows[3]!.unhedgedNominal, 6)
  })

  it('100% offshore, zero fee: the ZAR value of the offshore sleeve grows at (1+usReturn)(1+depreciation) - 1 = 12.35%/yr', () => {
    // 7% USD return x 5% rand depreciation: 1.07 x 1.05 = 1.1235 -> 12.35% p.a. in rand.
    const rows = projectHedge({
      capital: 1,
      years: 3,
      offshoreShareHedged: 1,
      assumptions: makeAssumptions({ offshoreReturnUsd: 0.07, randDepreciation: 0.05, fxConversionCost: 0 }),
      feeOffshore: 0,
      feeLocal: 0, // irrelevant at 100% offshore, set to 0 for clarity
    })
    const growthFactor = 1.07 * 1.05
    expect(growthFactor).toBeCloseTo(1.1235, 10)
    for (const row of rows) {
      const expected = 1 * growthFactor ** row.year
      expect(row.hedgedNominal).toBeCloseTo(expected, 6)
    }
    // usdZar itself must compound at the depreciation rate alone.
    expect(rows[1]!.usdZar).toBeCloseTo(18 * 1.05, 10)
    expect(rows[2]!.usdZar).toBeCloseTo(18 * 1.05 ** 2, 10)
  })

  it('applies fxConversionCost once, at t=0, only to the offshore share', () => {
    // capital 100, 50% offshore, 2% conversion cost: hedged t=0 = 100 - 100*0.5*0.02 = 99.
    const rows = projectHedge({
      capital: 100,
      years: 1,
      offshoreShareHedged: 0.5,
      assumptions: makeAssumptions({ fxConversionCost: 0.02, localBalancedReturn: 0, offshoreReturnUsd: 0, randDepreciation: 0 }),
      feeLocal: 0,
      feeOffshore: 0,
    })
    expect(rows[0]!.hedgedNominal).toBeCloseTo(99, 6)
    // No further growth and no further FX cost in year 1 (0% returns/depreciation set above).
    expect(rows[1]!.hedgedNominal).toBeCloseTo(99, 6)
  })

  it('uses randStrengthRate for the first randStrengthYears, then reverts to randDepreciation', () => {
    const rows = projectHedge({
      capital: 1,
      years: 4,
      offshoreShareHedged: 1,
      assumptions: makeAssumptions({ usdZarSpot: 10, randDepreciation: 0.05 }),
      feeOffshore: 0,
      randStrengthYears: 2,
      randStrengthRate: -0.03,
    })
    // t=1,2: strengthen at -3%/yr. t=3,4: depreciate at 5%/yr from the t=2 level.
    expect(rows[1]!.usdZar).toBeCloseTo(10 * 0.97, 10)
    expect(rows[2]!.usdZar).toBeCloseTo(10 * 0.97 ** 2, 10)
    expect(rows[3]!.usdZar).toBeCloseTo(10 * 0.97 ** 2 * 1.05, 10)
    expect(rows[4]!.usdZar).toBeCloseTo(10 * 0.97 ** 2 * 1.05 ** 2, 10)
  })

  it('reports real ZAR (divided by (1+personalInflation)^t) and USD values consistently', () => {
    const rows = projectHedge({
      capital: 1000,
      years: 2,
      offshoreShareHedged: 0.3,
      assumptions: makeAssumptions({ personalInflation: 0.06 }),
    })
    for (const row of rows) {
      expect(row.unhedgedReal).toBeCloseTo(row.unhedgedNominal / (1.06 ** row.year), 6)
      expect(row.hedgedReal).toBeCloseTo(row.hedgedNominal / (1.06 ** row.year), 6)
      expect(row.unhedgedUsd).toBeCloseTo(row.unhedgedNominal / row.usdZar, 6)
      expect(row.hedgedUsd).toBeCloseTo(row.hedgedNominal / row.usdZar, 6)
    }
  })

  it('defaults feeLocal to 0.0075 and feeOffshore to assumptions.offshoreFee when omitted', () => {
    const assumptions = makeAssumptions({ localBalancedReturn: 0.1, offshoreReturnUsd: 0.08, offshoreFee: 0.006, randDepreciation: 0 })
    const withDefaults = projectHedge({ capital: 100, years: 1, offshoreShareHedged: 1, assumptions })
    const withExplicit = projectHedge({ capital: 100, years: 1, offshoreShareHedged: 1, assumptions, feeOffshore: 0.006 })
    expect(withDefaults[1]!.hedgedNominal).toBeCloseTo(withExplicit[1]!.hedgedNominal, 10)
    const unhedgedDefaults = projectHedge({ capital: 100, years: 1, offshoreShareHedged: 0, assumptions })
    const expectedLocal = 100 * (1 + 0.1 - 0.0075)
    expect(unhedgedDefaults[1]!.unhedgedNominal).toBeCloseTo(expectedLocal, 6)
  })

  it('NaN guards: bad capital/years never produce NaN rows', () => {
    const rows = projectHedge({
      capital: Number.NaN,
      years: -3,
      offshoreShareHedged: 0.4,
      assumptions: makeAssumptions(),
    })
    expect(rows).toHaveLength(1) // negative years clamp to 0
    expect(Number.isNaN(rows[0]!.unhedgedNominal)).toBe(false)
    expect(Number.isNaN(rows[0]!.hedgedNominal)).toBe(false)
    expect(rows[0]!.unhedgedNominal).toBe(0)
  })
})

describe('purchasingPower', () => {
  it('amount / (1+rate)^years', () => {
    // R100,000 in 10 years at 6% "true" inflation: 100000 / 1.06^10.
    expect(purchasingPower(100_000, 10, 0.06)).toBeCloseTo(100_000 / 1.06 ** 10, 6)
    expect(purchasingPower(100_000, 0, 0.06)).toBe(100_000)
  })
  it('NaN guard: bad rate does not throw or return NaN', () => {
    expect(Number.isNaN(purchasingPower(1000, 5, Number.NaN))).toBe(false)
  })
})

describe('requiredIncomeForPurchasingPower', () => {
  it('amount x (1+inflation)^years', () => {
    // R30,000/month today needs 30000 x 1.075^20 in 20 years at 7.5% inflation.
    expect(requiredIncomeForPurchasingPower(30_000, 20, 0.075)).toBeCloseTo(30_000 * 1.075 ** 20, 6)
  })
  it('round-trips with purchasingPower', () => {
    const future = requiredIncomeForPurchasingPower(50_000, 15, 0.05)
    expect(purchasingPower(future, 15, 0.05)).toBeCloseTo(50_000, 6)
  })
})

describe('randStats', () => {
  // MACRO.usdZarAnnualAvg: 2024 = 18.33, 2014 = 10.85, 2004 = 6.45, 1994 = 3.55 (exact years present,
  // so "closest available" degenerates to an exact match here).
  const usdZarAt = (year: number) => MACRO.usdZarAnnualAvg.find((p) => p.year === year)!.value
  const asOfYear = 2024

  it('dep10/dep20/dep30: annualised change in usdZarAnnualAvg over the trailing 10/20/30 years', () => {
    const dep10 = (usdZarAt(2024) / usdZarAt(2014)) ** (1 / 10) - 1
    const dep20 = (usdZarAt(2024) / usdZarAt(2004)) ** (1 / 20) - 1
    const dep30 = (usdZarAt(2024) / usdZarAt(1994)) ** (1 / 30) - 1
    const stats = randStats(MACRO, asOfYear)
    expect(stats.dep10).toBeCloseTo(dep10, 3)
    expect(stats.dep20).toBeCloseTo(dep20, 3)
    expect(stats.dep30).toBeCloseTo(dep30, 3)
    // Sanity: ~5.4%/yr rand depreciation over each window (matches the historical record).
    expect(stats.dep10).toBeCloseTo(0.054, 3)
    expect(stats.dep20).toBeCloseTo(0.054, 3)
    expect(stats.dep30).toBeCloseTo(0.056, 3)
  })

  it('cpiAvg10/20/30: mean SA CPI over the same trailing windows', () => {
    // saCpi 2015-2024 (10 points): 4.6+6.3+5.3+4.6+4.1+3.3+4.5+6.9+6.0+4.4 = 50.0 -> mean 5.0%.
    const stats = randStats(MACRO, asOfYear)
    expect(stats.cpiAvg10).toBeCloseTo(0.05, 3)
    // saCpi 2005-2024 (20 points) sums to 110.5 -> mean 5.525%.
    expect(stats.cpiAvg20).toBeCloseTo(0.05525, 3)
    // saCpi 1995-2024 (30 points) sums to 174.8 -> mean 5.8267%.
    expect(stats.cpiAvg30).toBeCloseTo(0.058267, 3)
  })

  it('usCpiAvg20, inflationDifferential20 and pppImpliedDepreciation20', () => {
    // usCpi 2005-2024 (20 points) sums to 51.4 -> mean 2.57%.
    const stats = randStats(MACRO, asOfYear)
    expect(stats.usCpiAvg20).toBeCloseTo(0.0257, 3)
    expect(stats.inflationDifferential20).toBeCloseTo(stats.cpiAvg20 - stats.usCpiAvg20, 10)
    expect(stats.inflationDifferential20).toBeCloseTo(0.02955, 3)
    // PPP-implied depreciation: (1+SA CPI)/(1+US CPI) - 1.
    expect(stats.pppImpliedDepreciation20).toBeCloseTo((1 + stats.cpiAvg20) / (1 + stats.usCpiAvg20) - 1, 10)
    expect(stats.pppImpliedDepreciation20).toBeCloseTo(0.0288, 3)
  })

  it('NaN guard: an asOfYear before the earliest data point never produces NaN (closest point clamps)', () => {
    const stats = randStats(MACRO, 1900)
    for (const value of Object.values(stats)) {
      expect(Number.isNaN(value)).toBe(false)
    }
    // 1900's closest point to both ends of every window is 1994 itself -> zero elapsed years -> 0.
    expect(stats.dep10).toBe(0)
    expect(stats.dep30).toBe(0)
  })

  it('NaN guard: an empty history never throws or produces NaN', () => {
    const empty: MacroHistory = {
      usdZarAnnualAvg: [],
      saCpi: [],
      usCpi: [],
      medicalAidInflation: [],
      electricityTariffIncrease: [],
      assetReturns: [],
      asOf: '2026-01-01',
      sources: [],
    }
    const stats = randStats(empty, 2024)
    for (const value of Object.values(stats)) {
      expect(Number.isNaN(value)).toBe(false)
      expect(value).toBe(0)
    }
  })
})

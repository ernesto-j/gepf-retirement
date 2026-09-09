/**
 * Tax engine tests against the SARS 2025/26 tables in src/data/taxTables.ts.
 * Every expected value is hand-computed from the table; the arithmetic is in the comments.
 *
 * 2025/26 income brackets (threshold, rate, base):
 *   0/18%/0 · 237,100/26%/42,678 · 370,500/31%/77,362 · 512,800/36%/121,475 ·
 *   673,000/39%/179,147 · 857,900/41%/251,258 · 1,817,000/45%/644,489
 * Rebates: primary 17,235 · secondary 9,444 · tertiary 3,145
 * Medical credit per month: 364 (members 1-2) · 246 (each further member)
 * Retirement lump sum: 0/0% · 550,000/18%/0 · 770,000/27%/39,600 · 1,155,000/36%/143,550
 * Withdrawal lump sum:  0/0% · 27,500/18%/0 · 726,000/27%/125,730 · 1,089,000/36%/223,740
 */
import { describe, expect, it } from 'vitest'
import {
  annualMedicalCredit,
  bracketTax,
  calcIncomeTax,
  calcMonthlyPaye,
  calcRetirementLumpSumTax,
  calcSavingsPotWithdrawalTax,
  calcWithdrawalLumpSumTax,
  findBracket,
  getTaxTables,
  grossForNet,
  marginalRate,
  rebatesForAge,
  taxOnCumulativeLumpSum,
} from '../src/engine/tax'
import { TAX_TABLES } from '../src/data/taxTables'

const T = getTaxTables('2025/26')

describe('getTaxTables', () => {
  it('returns the 2026/27 tables by default (DEFAULT_TAX_YEAR)', () => {
    expect(getTaxTables().taxYear).toBe('2026/27')
    expect(getTaxTables()).toBe(TAX_TABLES['2026/27'])
  })
  it('returns the requested year and falls back to the default for unknown keys', () => {
    expect(getTaxTables('2025/26').taxYear).toBe('2025/26')
    // A stale value from localStorage must not crash the engine.
    expect(getTaxTables('1999/00' as never).taxYear).toBe('2026/27')
  })
})

describe('table self-consistency (validates the data file)', () => {
  it('every income bracket base equals the cumulative tax at its threshold', () => {
    // 237,100 x 18% = 42,678; 42,678 + 26% x 133,400 = 77,362; 77,362 + 31% x 142,300 = 121,475;
    // 121,475 + 36% x 160,200 = 179,147; 179,147 + 39% x 184,900 = 251,258;
    // 251,258 + 41% x 959,100 = 644,489.
    for (const table of [T.brackets, T.retirementLumpSum, T.withdrawalLumpSum]) {
      for (let i = 1; i < table.length; i++) {
        const lower = table.slice(0, i)
        expect(bracketTax(table[i]!.threshold, lower)).toBeCloseTo(table[i]!.base, 6)
      }
    }
  })
  it('the published tax thresholds are where gross tax equals the rebates', () => {
    // 95,750 x 18% = 17,235 = primary; 148,217 x 18% = 26,679.06 ~ 17,235 + 9,444;
    // 165,689 x 18% = 29,824.02 ~ 17,235 + 9,444 + 3,145.
    expect(bracketTax(T.thresholds.under65, T.brackets)).toBeCloseTo(T.rebates.primary, 6)
    expect(bracketTax(T.thresholds.age65to74, T.brackets)).toBeCloseTo(T.rebates.primary + T.rebates.secondary, 0)
    expect(bracketTax(T.thresholds.age75plus, T.brackets)).toBeCloseTo(
      T.rebates.primary + T.rebates.secondary + T.rebates.tertiary,
      0,
    )
  })
})

describe('findBracket / bracketTax', () => {
  it('picks the highest bracket with threshold <= amount, independent of table order', () => {
    expect(findBracket(0, T.brackets)?.rate).toBe(0.18)
    expect(findBracket(237_099.99, T.brackets)?.rate).toBe(0.18)
    expect(findBracket(237_100, T.brackets)?.rate).toBe(0.26)
    const reversed = [...T.brackets].reverse()
    expect(findBracket(400_000, reversed)?.rate).toBe(0.31)
    expect(findBracket(400_000, [])).toBeUndefined()
  })
  it('bracketTax clamps bad input to zero', () => {
    expect(bracketTax(-1000, T.brackets)).toBe(0)
    expect(bracketTax(Number.NaN, T.brackets)).toBe(0)
    expect(bracketTax(Number.POSITIVE_INFINITY, T.brackets)).toBe(0)
    expect(bracketTax(100, [])).toBe(0)
  })
})

describe('calcIncomeTax - golden SARS 2025/26 examples', () => {
  it('R500,000 at age 40 -> gross 117,507, payable 100,272', () => {
    // Bracket 370,500 @ 31%, base 77,362: 77,362 + 0.31 x (500,000 - 370,500)
    //   = 77,362 + 0.31 x 129,500 = 77,362 + 40,145 = 117,507
    // Less primary rebate 17,235 = 100,272
    const r = calcIncomeTax(500_000, 40, T)
    expect(r.taxableIncome).toBe(500_000)
    expect(r.grossTax).toBeCloseTo(117_507, 6)
    expect(r.rebates).toBe(17_235)
    expect(r.medicalCredits).toBe(0)
    expect(r.tax).toBeCloseTo(100_272, 6)
    expect(r.marginalRate).toBe(0.31)
    expect(r.effectiveRate).toBeCloseTo(100_272 / 500_000, 10) // 20.05%
  })

  it('R200,000 at age 65 -> 36,000 - 17,235 - 9,444 = 9,321', () => {
    // First bracket: 0.18 x 200,000 = 36,000; rebates primary + secondary = 26,679
    const r = calcIncomeTax(200_000, 65, T)
    expect(r.grossTax).toBeCloseTo(36_000, 6)
    expect(r.rebates).toBe(26_679)
    expect(r.tax).toBeCloseTo(9_321, 6)
    expect(r.marginalRate).toBe(0.18)
  })

  it('a 75-year-old gets all three rebates', () => {
    // R300,000: bracket 237,100 @ 26%, base 42,678: 42,678 + 0.26 x 62,900 = 42,678 + 16,354 = 59,032
    // Rebates 17,235 + 9,444 + 3,145 = 29,824 -> tax 29,208
    const r = calcIncomeTax(300_000, 75, T)
    expect(r.grossTax).toBeCloseTo(59_032, 6)
    expect(r.rebates).toBe(29_824)
    expect(r.tax).toBeCloseTo(29_208, 6)
    // Same income at 74 and 64 for comparison: 59,032 - 26,679 = 32,353; 59,032 - 17,235 = 41,797
    expect(calcIncomeTax(300_000, 74, T).tax).toBeCloseTo(32_353, 6)
    expect(calcIncomeTax(300_000, 64, T).tax).toBeCloseTo(41_797, 6)
  })

  it('rebate age boundaries are inclusive at exactly 65 and 75', () => {
    expect(rebatesForAge(64.99, T)).toBe(17_235)
    expect(rebatesForAge(65, T)).toBe(26_679)
    expect(rebatesForAge(74.99, T)).toBe(26_679)
    expect(rebatesForAge(75, T)).toBe(29_824)
    expect(rebatesForAge(Number.NaN, T)).toBe(17_235)
  })

  it('top bracket: R2,000,000 at age 40', () => {
    // 644,489 + 0.45 x (2,000,000 - 1,817,000) = 644,489 + 82,350 = 726,839; less 17,235 = 709,604
    const r = calcIncomeTax(2_000_000, 40, T)
    expect(r.grossTax).toBeCloseTo(726_839, 6)
    expect(r.tax).toBeCloseTo(709_604, 6)
    expect(r.marginalRate).toBe(0.45)
  })
})

describe('calcIncomeTax - thresholds and floors', () => {
  it('income at exactly the under-65 threshold R95,750 gives ~R0 tax', () => {
    // 0.18 x 95,750 = 17,235 = primary rebate -> 0
    const r = calcIncomeTax(95_750, 40, T)
    expect(r.tax).toBeCloseTo(0, 6)
    expect(r.rebates).toBeCloseTo(17_235, 6)
    // One rand more is taxed at 18c.
    expect(calcIncomeTax(95_751, 40, T).tax).toBeCloseTo(0.18, 6)
  })
  it('income at the 65-74 and 75+ thresholds gives less than R1 of tax', () => {
    // 0.18 x 148,217 = 26,679.06 -> 0.06; 0.18 x 165,689 = 29,824.02 -> 0.02
    expect(calcIncomeTax(148_217, 65, T).tax).toBeLessThan(1)
    expect(calcIncomeTax(148_217, 65, T).tax).toBeCloseTo(0.06, 6)
    expect(calcIncomeTax(165_689, 75, T).tax).toBeLessThan(1)
    expect(calcIncomeTax(165_689, 75, T).tax).toBeCloseTo(0.02, 6)
  })
  it('below the threshold the tax is 0 and the applied rebate is capped at the gross tax', () => {
    // 0.18 x 50,000 = 9,000 gross; rebate available 17,235 but only 9,000 can be used
    const r = calcIncomeTax(50_000, 40, T)
    expect(r.grossTax).toBeCloseTo(9_000, 6)
    expect(r.rebates).toBeCloseTo(9_000, 6)
    expect(r.tax).toBe(0)
    expect(r.effectiveRate).toBe(0)
    expect(r.grossTax - r.rebates - r.medicalCredits).toBeCloseTo(r.tax, 9)
  })
  it('never throws and never goes negative on bad input', () => {
    for (const bad of [0, -100_000, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = calcIncomeTax(bad, 40, T)
      expect(r.taxableIncome).toBe(0)
      expect(r.tax).toBe(0)
      expect(r.effectiveRate).toBe(0)
      expect(r.marginalRate).toBe(0.18)
    }
    expect(calcIncomeTax(500_000, Number.NaN, T).tax).toBeCloseTo(100_272, 6)
  })
})

describe('medical scheme fees tax credit', () => {
  it('annualMedicalCredit: 364/month for members 1-2, 246/month for each further member, x12', () => {
    expect(annualMedicalCredit(0, T)).toBe(0)
    expect(annualMedicalCredit(undefined, T)).toBe(0)
    expect(annualMedicalCredit(1, T)).toBe(364 * 12) // 4,368
    expect(annualMedicalCredit(2, T)).toBe(2 * 364 * 12) // 8,736
    expect(annualMedicalCredit(3, T)).toBe((2 * 364 + 246) * 12) // 11,688
    expect(annualMedicalCredit(4, T)).toBe((2 * 364 + 2 * 246) * 12) // 14,640
    // Fractions floor, negatives and NaN are 0 members.
    expect(annualMedicalCredit(2.9, T)).toBe(8_736)
    expect(annualMedicalCredit(-3, T)).toBe(0)
    expect(annualMedicalCredit(Number.NaN, T)).toBe(0)
  })
  it('credits reduce the R500,000 / age 40 tax after the rebate', () => {
    // 100,272 - 8,736 = 91,536 (2 members); 100,272 - 14,640 = 85,632 (4 members); 100,272 - 4,368 = 95,904 (1)
    expect(calcIncomeTax(500_000, 40, T, { medicalMembers: 2 }).tax).toBeCloseTo(91_536, 6)
    expect(calcIncomeTax(500_000, 40, T, { medicalMembers: 4 }).tax).toBeCloseTo(85_632, 6)
    expect(calcIncomeTax(500_000, 40, T, { medicalMembers: 1 }).tax).toBeCloseTo(95_904, 6)
    expect(calcIncomeTax(500_000, 40, T, { medicalMembers: 2 }).medicalCredits).toBe(8_736)
  })
  it('credits cannot make tax negative; the applied credit is capped', () => {
    // R100,000 at 40: 18,000 - 17,235 = 765 after rebate; credit 14,640 available -> only 765 used
    const r = calcIncomeTax(100_000, 40, T, { medicalMembers: 4 })
    expect(r.tax).toBe(0)
    expect(r.medicalCredits).toBeCloseTo(765, 6)
    expect(r.rebates).toBe(17_235)
    expect(r.grossTax - r.rebates - r.medicalCredits).toBeCloseTo(r.tax, 9)
  })
})

describe('calcMonthlyPaye', () => {
  it('is the annual liability / 12 with the net = (income - tax) / 12', () => {
    // 100,272 / 12 = 8,356; (500,000 - 100,272) / 12 = 399,728 / 12 = 33,310.666...
    const p = calcMonthlyPaye(500_000, 40, T)
    expect(p.monthlyTax).toBeCloseTo(8_356, 6)
    expect(p.monthlyNet).toBeCloseTo(399_728 / 12, 6)
    expect(p.annual.tax).toBeCloseTo(100_272, 6)
    expect(p.monthlyTax * 12).toBeCloseTo(p.annual.tax, 6)
  })
  it('passes the medical credit and age through', () => {
    // R200,000 at 65 with 2 members: 9,321 - 8,736 = 585 -> 48.75 / month
    const p = calcMonthlyPaye(200_000, 65, T, { medicalMembers: 2 })
    expect(p.monthlyTax).toBeCloseTo(585 / 12, 6)
    expect(p.monthlyNet).toBeCloseTo((200_000 - 585) / 12, 6)
  })
  it('a pension below the threshold has no PAYE', () => {
    const p = calcMonthlyPaye(140_000, 65, T)
    expect(p.monthlyTax).toBe(0)
    expect(p.monthlyNet).toBeCloseTo(140_000 / 12, 6)
  })
})

describe('marginalRate at bracket edges', () => {
  it('returns the rate of the bracket whose threshold <= income', () => {
    const cases: [number, number][] = [
      [0, 0.18],
      [95_750, 0.18], // below the threshold the bracket rate is still 18% (see simplification 6)
      [237_099, 0.18],
      [237_100, 0.26],
      [370_499.99, 0.26],
      [370_500, 0.31],
      [512_800, 0.36],
      [672_999, 0.36],
      [673_000, 0.39],
      [857_900, 0.41],
      [1_816_999, 0.41],
      [1_817_000, 0.45],
      [5_000_000, 0.45],
    ]
    for (const [income, rate] of cases) expect(marginalRate(income, T), `income ${income}`).toBe(rate)
  })
  it('bad input maps to the first bracket', () => {
    expect(marginalRate(-1, T)).toBe(0.18)
    expect(marginalRate(Number.NaN, T)).toBe(0.18)
  })
})

describe('taxOnCumulativeLumpSum (T) at table boundaries', () => {
  it('retirement table', () => {
    expect(taxOnCumulativeLumpSum(0, T.retirementLumpSum)).toBe(0)
    expect(taxOnCumulativeLumpSum(550_000, T.retirementLumpSum)).toBe(0)
    expect(taxOnCumulativeLumpSum(550_001, T.retirementLumpSum)).toBeCloseTo(0.18, 6)
    expect(taxOnCumulativeLumpSum(770_000, T.retirementLumpSum)).toBeCloseTo(39_600, 6) // 0.18 x 220,000
    expect(taxOnCumulativeLumpSum(1_155_000, T.retirementLumpSum)).toBeCloseTo(143_550, 6) // 39,600 + 0.27 x 385,000
    expect(taxOnCumulativeLumpSum(2_000_000, T.retirementLumpSum)).toBeCloseTo(447_750, 6) // 143,550 + 0.36 x 845,000
  })
  it('withdrawal table', () => {
    expect(taxOnCumulativeLumpSum(27_500, T.withdrawalLumpSum)).toBe(0)
    expect(taxOnCumulativeLumpSum(50_000, T.withdrawalLumpSum)).toBeCloseTo(4_050, 6) // 0.18 x 22,500
    expect(taxOnCumulativeLumpSum(726_000, T.withdrawalLumpSum)).toBeCloseTo(125_730, 6) // 0.18 x 698,500
    expect(taxOnCumulativeLumpSum(1_089_000, T.withdrawalLumpSum)).toBeCloseTo(223_740, 6) // 125,730 + 0.27 x 363,000
  })
})

describe('calcRetirementLumpSumTax', () => {
  it('R1,000,000 with no previous lump sums -> 101,700', () => {
    // 39,600 + 0.27 x (1,000,000 - 770,000) = 39,600 + 62,100 = 101,700
    const r = calcRetirementLumpSumTax(1_000_000, 0, T)
    expect(r.tax).toBeCloseTo(101_700, 6)
    expect(r.taxOnPrevious).toBe(0)
    expect(r.net).toBeCloseTo(898_300, 6)
    expect(r.effectiveRate).toBeCloseTo(0.1017, 10)
    expect(r.table).toBe('retirement')
    expect(r.amount).toBe(1_000_000)
    expect(r.previousLumpSums).toBe(0)
  })
  it('aggregation: previous withdrawal R300,000 then retirement lump sum R600,000 -> 74,700', () => {
    // T_ret(900,000) = 39,600 + 0.27 x 130,000 = 39,600 + 35,100 = 74,700; T_ret(300,000) = 0
    const r = calcRetirementLumpSumTax(600_000, 300_000, T)
    expect(r.tax).toBeCloseTo(74_700, 6)
    expect(r.taxOnPrevious).toBe(0)
    expect(r.net).toBeCloseTo(525_300, 6)
    // Without the earlier withdrawal the same R600,000 would cost 0.18 x 50,000 = 9,000:
    // the prior lump sum used up most of the once-in-a-lifetime R550,000 band.
    expect(calcRetirementLumpSumTax(600_000, 0, T).tax).toBeCloseTo(9_000, 6)
  })
  it('aggregation with previous lump sums already above the table top', () => {
    // T_ret(2,100,000) = 143,550 + 0.36 x 945,000 = 483,750; T_ret(2,000,000) = 447,750 -> 36,000 (= 36% flat)
    const r = calcRetirementLumpSumTax(100_000, 2_000_000, T)
    expect(r.taxOnPrevious).toBeCloseTo(447_750, 6)
    expect(r.tax).toBeCloseTo(36_000, 6)
    expect(r.effectiveRate).toBeCloseTo(0.36, 10)
  })
  it('a lump sum inside the tax-free band is untaxed', () => {
    const r = calcRetirementLumpSumTax(550_000, 0, T)
    expect(r.tax).toBe(0)
    expect(r.net).toBe(550_000)
    expect(r.effectiveRate).toBe(0)
  })
  it('zero / negative / NaN amounts and previous are clamped', () => {
    const zero = calcRetirementLumpSumTax(0, 0, T)
    expect(zero.tax).toBe(0)
    expect(zero.net).toBe(0)
    expect(zero.effectiveRate).toBe(0)
    const neg = calcRetirementLumpSumTax(-5, -10, T)
    expect(neg.amount).toBe(0)
    expect(neg.previousLumpSums).toBe(0)
    expect(neg.tax).toBe(0)
    const nan = calcRetirementLumpSumTax(Number.NaN, Number.NaN, T)
    expect(nan.tax).toBe(0)
    expect(nan.net).toBe(0)
  })
})

describe('calcWithdrawalLumpSumTax', () => {
  it('R1,000,000 with no previous -> 199,710', () => {
    // 125,730 + 0.27 x (1,000,000 - 726,000) = 125,730 + 73,980 = 199,710
    const r = calcWithdrawalLumpSumTax(1_000_000, 0, T)
    expect(r.tax).toBeCloseTo(199_710, 6)
    expect(r.net).toBeCloseTo(800_290, 6)
    expect(r.effectiveRate).toBeCloseTo(0.19971, 10)
    expect(r.table).toBe('withdrawal')
  })
  it('the withdrawal table is harsher than the retirement table for the same amount', () => {
    expect(calcWithdrawalLumpSumTax(1_000_000, 0, T).tax).toBeGreaterThan(calcRetirementLumpSumTax(1_000_000, 0, T).tax)
    // Only R27,500 tax free versus R550,000.
    expect(calcWithdrawalLumpSumTax(27_500, 0, T).tax).toBe(0)
    expect(calcWithdrawalLumpSumTax(50_000, 0, T).tax).toBeCloseTo(4_050, 6) // 0.18 x 22,500
  })
  it('aggregation with a previous retirement lump sum of R500,000 then a R300,000 withdrawal', () => {
    // T_wd(800,000) = 125,730 + 0.27 x 74,000 = 125,730 + 19,980 = 145,710
    // T_wd(500,000) = 0.18 x 472,500 = 85,050 -> tax 60,660
    const r = calcWithdrawalLumpSumTax(300_000, 500_000, T)
    expect(r.taxOnPrevious).toBeCloseTo(85_050, 6)
    expect(r.tax).toBeCloseTo(60_660, 6)
    // Without the previous lump sum: 0.18 x 272,500 = 49,050
    expect(calcWithdrawalLumpSumTax(300_000, 0, T).tax).toBeCloseTo(49_050, 6)
  })
})

describe('calcSavingsPotWithdrawalTax', () => {
  it('is taxed at the marginal rate on top of other income (R400,000 income, R30,000 withdrawal -> 9,300)', () => {
    // tax(430,000) = 77,362 + 0.31 x 59,500 - 17,235 = 77,362 + 18,445 - 17,235 = 78,572
    // tax(400,000) = 77,362 + 0.31 x 29,500 - 17,235 = 77,362 + 9,145 - 17,235 = 69,272
    // difference 9,300 = 0.31 x 30,000
    expect(calcSavingsPotWithdrawalTax(30_000, 400_000, 40, T)).toBeCloseTo(9_300, 6)
  })
  it('straddles a bracket edge correctly (R230,000 income, R20,000 withdrawal)', () => {
    // 7,100 at 18% + 12,900 at 26% = 1,278 + 3,354 = 4,632
    expect(calcSavingsPotWithdrawalTax(20_000, 230_000, 40, T)).toBeCloseTo(4_632, 6)
  })
  it('uses the age rebates: below the threshold the withdrawal is sheltered', () => {
    // No other income at 40: tax(50,000) = 9,000 - 17,235 -> 0
    expect(calcSavingsPotWithdrawalTax(50_000, 0, 40, T)).toBe(0)
    // R140,000 pension at 65 (below the 148,217 threshold) + R30,000: tax(170,000) = 30,600 - 26,679 = 3,921
    expect(calcSavingsPotWithdrawalTax(30_000, 140_000, 65, T)).toBeCloseTo(3_921, 6)
    // Same at 40: tax(170,000) = 30,600 - 17,235 = 13,365; tax(140,000) = 25,200 - 17,235 = 7,965 -> 5,400
    expect(calcSavingsPotWithdrawalTax(30_000, 140_000, 40, T)).toBeCloseTo(5_400, 6)
  })
  it('optional medical credit is honoured and bad input is clamped', () => {
    // R400,000 / age 40 / 2 members: both sides shift by the same 8,736 credit -> still 9,300
    expect(calcSavingsPotWithdrawalTax(30_000, 400_000, 40, T, { medicalMembers: 2 })).toBeCloseTo(9_300, 6)
    expect(calcSavingsPotWithdrawalTax(0, 400_000, 40, T)).toBe(0)
    expect(calcSavingsPotWithdrawalTax(-1, 400_000, 40, T)).toBe(0)
    expect(calcSavingsPotWithdrawalTax(Number.NaN, Number.NaN, 40, T)).toBe(0)
  })
})

describe('grossForNet', () => {
  const netOf = (total: number, age: number, medicalMembers?: number): number =>
    total - calcIncomeTax(total, age, T, { medicalMembers }).tax

  it('inverts the R500,000 / age 40 example: net 399,728 -> gross 500,000', () => {
    // net(500,000) = 500,000 - 100,272 = 399,728
    const g = grossForNet(399_728, 40, T)
    expect(Math.abs(g - 500_000)).toBeLessThanOrEqual(1)
    expect(Math.abs(netOf(g, 40) - 399_728)).toBeLessThanOrEqual(2)
  })

  it('accounts for other income already using up the lower brackets', () => {
    // other 300,000 at 40: tax = 42,678 + 0.26 x 62,900 - 17,235 = 41,797 -> net 258,203
    // total 500,000: net 399,728 -> extra net from a 200,000 draw = 141,525
    const withOther = grossForNet(141_525, 40, T, { otherTaxableIncome: 300_000 })
    expect(Math.abs(withOther - 200_000)).toBeLessThanOrEqual(1)
    // Without other income the same net needs only x: x - (0.18x - 17,235) = 141,525
    //   -> 0.82x = 124,290 -> x = 151,573.17 (inside the first bracket)
    const alone = grossForNet(141_525, 40, T)
    expect(Math.abs(alone - 124_290 / 0.82)).toBeLessThanOrEqual(1)
    expect(withOther).toBeGreaterThan(alone)
  })

  it('handles rebates and medical credits (age 65, 2 members, net 300,000)', () => {
    // In bracket 237,100 @ 26%: grossTax = 0.26g - 18,968; less rebates 26,679 and credits 8,736
    //   -> tax = 0.26g - 54,383; net = 0.74g + 54,383 = 300,000 -> g = 245,617 / 0.74 = 331,914.86
    const g = grossForNet(300_000, 65, T, { medicalMembers: 2 })
    expect(Math.abs(g - 245_617 / 0.74)).toBeLessThanOrEqual(1)
    expect(Math.abs(netOf(g, 65, 2) - 300_000)).toBeLessThanOrEqual(2)
  })

  it('below the tax threshold gross equals net', () => {
    expect(Math.abs(grossForNet(50_000, 40, T) - 50_000)).toBeLessThanOrEqual(1)
    expect(Math.abs(grossForNet(140_000, 65, T) - 140_000)).toBeLessThanOrEqual(1)
  })

  it('returns 0 for zero, negative or NaN targets', () => {
    expect(grossForNet(0, 40, T)).toBe(0)
    expect(grossForNet(-10_000, 40, T)).toBe(0)
    expect(grossForNet(Number.NaN, 40, T)).toBe(0)
  })

  it('round-trips within R2 across ages, targets, other income and medical members', () => {
    const targets = [1, 12_000, 95_750, 150_000, 399_728, 1_000_000, 5_000_000]
    const ages = [40, 65, 75]
    const others = [0, 100_000, 300_000, 900_000]
    const members = [0, 2, 5]
    for (const target of targets)
      for (const age of ages)
        for (const other of others)
          for (const m of members) {
            const g = grossForNet(target, age, T, { otherTaxableIncome: other, medicalMembers: m })
            const extraNet = netOf(other + g, age, m) - netOf(other, age, m)
            expect(Math.abs(extraNet - target), `target ${target} age ${age} other ${other} members ${m}`).toBeLessThanOrEqual(2)
            // Never undershoots (the upper end of the bisection bracket is returned).
            expect(extraNet).toBeGreaterThanOrEqual(target - 1e-6)
            expect(g).toBeGreaterThanOrEqual(target)
          }
  })
})

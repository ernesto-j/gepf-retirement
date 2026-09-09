/**
 * GEPF benefit-formula tests against docs/SPEC.md (section src/engine/gepf.ts) and the GEPF
 * rules formulas restated in the module header of src/engine/gepf.ts. Every expected value is
 * hand-computed; the arithmetic is in the comments next to each assertion.
 *
 * IMPORTANT — resignation-benefit formula discrepancy found while writing these tests:
 * The module header of src/engine/gepf.ts (line 15) and the actual code
 * (`resignationFromUnreduced`) AGREE with each other:
 *     actuarialInterest = unreduced gratuity + unreduced annuity x F(age)
 * They do NOT match docs/SPEC.md ("actuarialInterest = serviceYears x FS x F(age)") or the doc
 * comments on `GepfResignationBenefit`/`ActuarialFactorTable` in src/engine/types.ts, which were
 * rewritten by the most recent commit (120ae1a, "Model GEPF actuarial interest as service x
 * final salary x F(Z)") to describe that different formula — a commit that touched SPEC.md,
 * types.ts and gepfRules.ts but never touched gepf.ts itself. Since the header comment IN
 * gepf.ts already matches the code, there is nothing to fix in that file's comment (per the
 * task's rule: fix the comment only when the *local* header and code disagree). The tests below
 * exercise the formula exactly as gepf.ts implements it today: gratuity + annuity x F(age).
 * types.ts / SPEC.md were intentionally left untouched (out of scope for this task).
 */
import { describe, expect, it } from 'vitest'
import {
  calcGepfResignationBenefit,
  calcGepfRetirementBenefit,
  deriveServiceYearsBeforeTwoPot,
  getGepfRules,
  interpolateFactor,
  projectServiceAndSalary,
  splitTwoPot,
  twoPotPreShare,
  TODAY,
} from '../src/engine/gepf'
import { yearsBetween } from '../src/engine/money'
import type { ActuarialFactorTable, GepfMembership, GepfRules } from '../src/engine/types'

const RULES = getGepfRules()

// ---------------------------------------------------------------------------
// calcGepfRetirementBenefit
// ---------------------------------------------------------------------------

describe('calcGepfRetirementBenefit', () => {
  it('10+ years, at normal retirement age (60): gratuity 1,209,600, annuity 327,632.73 p.a.', () => {
    // gratuity = 0.0672 x 600,000 x 30 = 0.0672 x 18,000,000 = 1,209,600
    // annuity  = 600,000 x 30 / 55 + 360 = 18,000,000 / 55 + 360
    //          = 327,272.727272... + 360 = 327,632.727272... ~= 327,632.73
    const result = calcGepfRetirementBenefit(
      { finalSalaryAnnual: 600_000, pensionableServiceYears: 30, ageAtExit: 60 },
      RULES,
    )
    expect(result.gratuity).toBeCloseTo(1_209_600, 2)
    expect(result.annuityAnnual).toBeCloseTo(327_632.73, 2)
    expect(result.annuityMonthly).toBeCloseTo(327_632.73 / 12, 2)
    expect(result.reductionFactor).toBe(1)
    expect(result.monthsEarly).toBe(0)
    expect(result.gratuityOnly).toBe(false)
  })

  it('early retirement at 57 without exemption: 36 months early -> factor 0.88 -> gratuity 1,064,448, annuity 288,316.80', () => {
    // monthsEarly = round((60 - 57) x 12) = 36
    // reductionFactor = 1 - 36 x (1/300) = 1 - 0.12 = 0.88
    // gratuity = 1,209,600 x 0.88 = 1,064,448
    // annuity  = 327,632.727272... x 0.88 = 288,316.80 (327,632.7272... x 0.88 = 288,316.8 exactly)
    const result = calcGepfRetirementBenefit(
      { finalSalaryAnnual: 600_000, pensionableServiceYears: 30, ageAtExit: 57 },
      RULES,
    )
    expect(result.monthsEarly).toBe(36)
    expect(result.reductionFactor).toBeCloseTo(0.88, 10)
    expect(result.gratuity).toBeCloseTo(1_064_448, 2)
    expect(result.annuityAnnual).toBeCloseTo(288_316.8, 2)
  })

  it('early retirement at 57 WITH exemption (employer-initiated / ill-health): no reduction', () => {
    const result = calcGepfRetirementBenefit(
      { finalSalaryAnnual: 600_000, pensionableServiceYears: 30, ageAtExit: 57, exemptFromEarlyReduction: true },
      RULES,
    )
    // monthsEarly is still computed (informational) but the reduction factor is forced to 1.
    expect(result.monthsEarly).toBe(36)
    expect(result.reductionFactor).toBe(1)
    expect(result.gratuity).toBeCloseTo(1_209_600, 2)
    expect(result.annuityAnnual).toBeCloseTo(327_632.73, 2)
  })

  it('under 10 years of service: gratuity-only, no annuity', () => {
    // < 10 years: the gratuity IS the actuarial interest = N x FS x F(60) = 8 x 600,000 x F(60)
    const result = calcGepfRetirementBenefit(
      { finalSalaryAnnual: 600_000, pensionableServiceYears: 8, ageAtExit: 60 },
      RULES,
    )
    expect(result.gratuity).toBeCloseTo(8 * 600_000 * interpolateFactor(RULES.actuarialFactors, 60), 2)
    expect(result.annuityAnnual).toBe(0)
    expect(result.gratuityOnly).toBe(true)
  })

  it('exactly 10 years of service is the pension branch, not the short-service one', () => {
    const result = calcGepfRetirementBenefit(
      { finalSalaryAnnual: 600_000, pensionableServiceYears: 10, ageAtExit: 60 },
      RULES,
    )
    expect(result.gratuityOnly).toBe(false)
    expect(result.annuityAnnual).toBeGreaterThan(0)
  })

  it('spouse pension: default 50% is free; 75% costs the enhanced-cost reduction on the annuity', () => {
    const base = calcGepfRetirementBenefit(
      { finalSalaryAnnual: 600_000, pensionableServiceYears: 30, ageAtExit: 60 },
      RULES,
    )
    // Default spousePensionPct (undefined) falls back to rules.spousePensionDefault x 100 = 50.
    expect(base.spousePensionAnnual).toBeCloseTo(base.annuityAnnual * 0.5, 6)

    const enhanced = calcGepfRetirementBenefit(
      { finalSalaryAnnual: 600_000, pensionableServiceYears: 30, ageAtExit: 60, spousePensionPct: 75 },
      RULES,
    )
    // annuity reduced by spousePensionEnhancedCostPct (0.05), then 75% of that reduced annuity.
    const reducedAnnuity = base.annuityAnnual * (1 - RULES.spousePensionEnhancedCostPct)
    expect(enhanced.annuityAnnual).toBeCloseTo(reducedAnnuity, 6)
    expect(enhanced.spousePensionAnnual).toBeCloseTo(reducedAnnuity * 0.75, 6)
  })
})

// ---------------------------------------------------------------------------
// projectServiceAndSalary
// ---------------------------------------------------------------------------

describe('projectServiceAndSalary', () => {
  const membership: GepfMembership = {
    pensionableServiceYearsNow: 27,
    pensionableSalaryAnnual: 720_000,
    salaryGrowth: 0.055,
    serviceYearsBeforeTwoPot: undefined,
    medicalSubsidyEligible: true,
    medicalSubsidyMonthly: 5_000,
    statement: undefined,
    useStatementValues: false,
    previousLumpSumsWithdrawal: 0,
    previousLumpSumsRetirement: 0,
  }

  it('57 -> 60 at R720k salary and 5.5% growth: salaryAtExit and final-salary averaging', () => {
    // n = 60 - 57 = 3
    // salaryAtExit = 720,000 x 1.055^3
    // finalSalary  = 720,000 x 1.055^2 x (2.055/2)   (average of the last two years' salary)
    // serviceYears = 27 + 3 = 30
    const n = 3
    const expectedSalaryAtExit = 720_000 * 1.055 ** n
    const expectedFinalSalary = 720_000 * 1.055 ** (n - 1) * (2.055 / 2)
    const result = projectServiceAndSalary(membership, 57, 60)
    expect(result.serviceYears).toBeCloseTo(30, 10)
    expect(result.salaryAtExit).toBeCloseTo(expectedSalaryAtExit, 6)
    expect(result.finalSalaryAnnual).toBeCloseTo(expectedFinalSalary, 6)
    // Sanity: the two formulas from the spec, spelled out numerically.
    expect(result.salaryAtExit).toBeCloseTo(720_000 * 1.174241375, 2) // 1.055^3 = 1.174241375
    expect(result.finalSalaryAnnual).toBeCloseTo(720_000 * 1.113025 * 1.0275, 2) // 1.055^2=1.113025; 2.055/2=1.0275
  })

  it('n < 1 (exit within a year, or exit age <= current age): final salary is the current salary as-is', () => {
    const result = projectServiceAndSalary(membership, 57, 57)
    expect(result.serviceYears).toBeCloseTo(27, 10)
    expect(result.salaryAtExit).toBeCloseTo(720_000, 6)
    expect(result.finalSalaryAnnual).toBe(720_000)
  })

  it('an exit age in the past is treated as "exit now" (n clamped to 0)', () => {
    const result = projectServiceAndSalary(membership, 60, 55)
    expect(result.serviceYears).toBeCloseTo(27, 10)
    expect(result.salaryAtExit).toBe(720_000)
    expect(result.finalSalaryAnnual).toBe(720_000)
  })
})

// ---------------------------------------------------------------------------
// interpolateFactor
// ---------------------------------------------------------------------------

describe('interpolateFactor', () => {
  const table: ActuarialFactorTable = {
    label: 'test table',
    effectiveFrom: '2020-01-01',
    points: [
      { age: 60, factor: 0.3 },
      { age: 50, factor: 0.2 }, // deliberately unsorted
      { age: 70, factor: 0.5 },
    ],
    source: 'test',
    confidence: 'high',
  }

  it('interpolates linearly between two table points regardless of input order', () => {
    // 55 is halfway between 50 (0.2) and 60 (0.3): 0.2 + 0.5 x (0.3-0.2) = 0.25
    expect(interpolateFactor(table, 55)).toBeCloseTo(0.25, 10)
    // 65 is halfway between 60 (0.3) and 70 (0.5): 0.3 + 0.5 x (0.5-0.3) = 0.4
    expect(interpolateFactor(table, 65)).toBeCloseTo(0.4, 10)
    // exact points are returned exactly
    expect(interpolateFactor(table, 60)).toBeCloseTo(0.3, 10)
  })

  it('is monotone non-decreasing across an ascending sample of ages (this table is increasing)', () => {
    const ages = [45, 50, 52, 55, 58, 60, 63, 66, 70, 75]
    const values = ages.map((a) => interpolateFactor(table, a))
    for (let i = 1; i < values.length; i++) {
      expect(values[i]!).toBeGreaterThanOrEqual(values[i - 1]!)
    }
  })

  it('clamps to the first point below the table range and the last point above it', () => {
    expect(interpolateFactor(table, 20)).toBe(0.2)
    expect(interpolateFactor(table, 200)).toBe(0.5)
  })

  it('treats a NaN age as the youngest tabulated age', () => {
    expect(interpolateFactor(table, NaN)).toBe(0.2)
  })

  it('returns 0 for an empty table rather than throwing', () => {
    const empty: ActuarialFactorTable = { ...table, points: [] }
    expect(interpolateFactor(empty, 45)).toBe(0)
  })

  it('ignores non-finite points defensively', () => {
    const dirty: ActuarialFactorTable = {
      ...table,
      points: [
        { age: 50, factor: 0.2 },
        { age: 60, factor: 0.3 },
        { age: NaN, factor: 0.99 }, // filtered out: non-finite age
        { age: 65, factor: Infinity }, // filtered out: non-finite factor
        { age: 70, factor: 0.5 },
      ],
    }
    // Same result as the clean table (55 interpolates between the surviving 50/60 points) since
    // the NaN-age and Infinity-factor points are filtered out rather than corrupting the result.
    expect(interpolateFactor(dirty, 55)).toBeCloseTo(0.25, 10)
  })
})

// ---------------------------------------------------------------------------
// calcGepfResignationBenefit — the formula EXACTLY as gepf.ts implements it
// ---------------------------------------------------------------------------

describe('calcGepfResignationBenefit (actuarial interest = service x final salary x F(age), GEPF Rule 14.4)', () => {
  it('matches service x salary x F(Z), reporting the unreduced gratuity as the gratuity part', () => {
    const finalSalaryAnnual = 600_000
    const pensionableServiceYears = 20
    const ageAtExit = 45
    const serviceYearsBeforeTwoPot = 10

    // Unreduced components (10+ years branch, no early-retirement reduction on resignation):
    // gratuity = 0.0672 x 600,000 x 20 = 806,400
    // annuity  = 600,000 x 20 / 55 + 360 = 12,000,000/55 + 360 = 218,181.818181... + 360 = 218,541.818181...
    const unreducedGratuity = 806_400
    const unreducedAnnuity = (600_000 * 20) / 55 + 360
    expect(unreducedAnnuity).toBeCloseTo(218_541.818181818, 6)

    // The age-45 point is one of the table's own tabulated ages (see AGES in src/data/gepfRules.ts),
    // so interpolateFactor returns that exact table value with no interpolation involved. We source
    // the factor from the (separately tested) interpolateFactor rather than duplicating the fund's
    // curve-shaping arithmetic here.
    const factor = interpolateFactor(RULES.actuarialFactors, ageAtExit)
    expect(factor).toBeGreaterThan(0)
    expect(factor).toBeLessThan(1)

    // Rule 14.4: AI = N x FS x F(Z) = 20 x 600,000 x factor
    const expectedActuarialInterest = pensionableServiceYears * finalSalaryAnnual * factor
    const expectedGratuityComponent = Math.min(unreducedGratuity, expectedActuarialInterest)
    const expectedAnnuityComponent = expectedActuarialInterest - expectedGratuityComponent
    expect(unreducedAnnuity).toBeGreaterThan(0)

    const result = calcGepfResignationBenefit(
      { finalSalaryAnnual, pensionableServiceYears, ageAtExit, serviceYearsBeforeTwoPot },
      RULES,
    )

    expect(result.factorUsed).toBeCloseTo(factor, 10)
    expect(result.gratuityComponent).toBeCloseTo(expectedGratuityComponent, 6)
    expect(result.annuityComponent).toBeCloseTo(expectedAnnuityComponent, 6)
    expect(result.actuarialInterest).toBeCloseTo(expectedActuarialInterest, 6)
    // Explicitly NOT the old "gratuity + annuity x factor" formula:
    expect(result.actuarialInterest).not.toBeCloseTo(unreducedGratuity + unreducedAnnuity * factor, 0)

    // Two-pot split sums back to the actuarial interest (see the dedicated splitTwoPot tests below
    // for the seed-cap behaviour).
    const sum = result.vestedComponent + result.savingsComponent + result.retirementComponent
    expect(sum).toBeCloseTo(result.actuarialInterest, 2) // within 1c
    expect(result.maxCashOnResignation).toBeCloseTo(result.vestedComponent + result.savingsComponent, 6)

    // Comparison figure against the previous (2021) factor table is filled when present.
    const prevFactor = interpolateFactor(RULES.previousActuarialFactors!, ageAtExit)
    expect(result.actuarialInterestPreviousFactors).toBeCloseTo(pensionableServiceYears * finalSalaryAnnual * prevFactor, 6)
  })

  it('applies no early-retirement reduction to the resignation benefit (unlike the retirement benefit)', () => {
    const input = { finalSalaryAnnual: 600_000, pensionableServiceYears: 20, serviceYearsBeforeTwoPot: 10 }
    const at60 = calcGepfResignationBenefit({ ...input, ageAtExit: 60 }, RULES)
    const at57 = calcGepfResignationBenefit({ ...input, ageAtExit: 57 }, RULES)
    // Different ages give different F(age), but neither value has the 1/300-per-month reduction
    // applied — gratuityComponent (unreduced) is identical at both ages.
    expect(at60.gratuityComponent).toBeCloseTo(at57.gratuityComponent, 6)
    expect(at60.gratuityComponent).toBeCloseTo(0.0672 * 600_000 * 20, 6)
  })

  it('under 10 years: actuarial interest is still N x FS x F(Z); the short-service gratuity is the reported gratuity part', () => {
    const result = calcGepfResignationBenefit(
      { finalSalaryAnnual: 600_000, pensionableServiceYears: 8, ageAtExit: 45, serviceYearsBeforeTwoPot: 4 },
      RULES,
    )
    const factor = interpolateFactor(RULES.actuarialFactors, 45)
    // AI = 8 x 600,000 x F(45); with < 10 years the whole benefit is a gratuity, so the gratuity part is the AI
    const ai = 8 * 600_000 * factor
    expect(result.actuarialInterest).toBeCloseTo(ai, 2)
    expect(result.gratuityComponent).toBeCloseTo(ai, 2)
    expect(result.annuityComponent).toBeCloseTo(0, 2)
  })
})

// ---------------------------------------------------------------------------
// splitTwoPot
// ---------------------------------------------------------------------------

describe('splitTwoPot', () => {
  it('sums to the actuarial interest within 1c when the seed is NOT capped', () => {
    // AI = 100,000, preShare = 0.5
    // vestedBeforeSeed = 50,000; seed = min(0.1 x 50,000, 30,000) = min(5,000, 30,000) = 5,000
    // vestedComponent = 50,000 - 5,000 = 45,000
    // post = 50,000; savingsComponent = 5,000 + 50,000/3 = 5,000 + 16,666.6666... = 21,666.6666...
    // retirementComponent = 50,000 x 2/3 = 33,333.3333...
    const result = splitTwoPot(100_000, 0.5, RULES)
    expect(result.vestedComponent).toBeCloseTo(45_000, 6)
    expect(result.savingsComponent).toBeCloseTo(21_666.6667, 3)
    expect(result.retirementComponent).toBeCloseTo(33_333.3333, 3)
    const sum = result.vestedComponent + result.savingsComponent + result.retirementComponent
    expect(sum).toBeCloseTo(100_000, 2) // within 1c
    expect(result.maxCashOnResignation).toBeCloseTo(result.vestedComponent + result.savingsComponent, 6)
  })

  it('caps the seed at R30,000 for a large pre-two-pot vested amount', () => {
    // AI = 10,000,000, preShare = 1 (fully accrued before two-pot)
    // vestedBeforeSeed = 10,000,000; uncapped seed would be 0.1 x 10,000,000 = 1,000,000 -> capped at 30,000
    // vestedComponent = 10,000,000 - 30,000 = 9,970,000
    // post = 0 -> savingsComponent = 30,000 + 0 = 30,000; retirementComponent = 0
    const result = splitTwoPot(10_000_000, 1, RULES)
    expect(result.savingsComponent).toBeCloseTo(30_000, 6)
    expect(result.vestedComponent).toBeCloseTo(9_970_000, 6)
    expect(result.retirementComponent).toBe(0)
    expect(result.maxCashOnResignation).toBeCloseTo(10_000_000, 6)
    const sum = result.vestedComponent + result.savingsComponent + result.retirementComponent
    expect(sum).toBeCloseTo(10_000_000, 2)
  })

  it('maxCashOnResignation is always vested + savings, never including the retirement component', () => {
    const result = splitTwoPot(500_000, 0.3, RULES)
    expect(result.maxCashOnResignation).toBeCloseTo(result.vestedComponent + result.savingsComponent, 9)
    expect(result.maxCashOnResignation).not.toBeCloseTo(
      result.vestedComponent + result.savingsComponent + result.retirementComponent,
      2,
    )
  })

  it('clamps and floors non-finite / negative inputs instead of producing NaN', () => {
    const result = splitTwoPot(NaN, NaN, RULES)
    expect(result.vestedComponent).toBe(0)
    expect(result.savingsComponent).toBe(0)
    expect(result.retirementComponent).toBe(0)
    expect(result.maxCashOnResignation).toBe(0)

    const negativeAi = splitTwoPot(-50_000, 0.5, RULES)
    expect(negativeAi.vestedComponent).toBe(0)
    expect(negativeAi.savingsComponent).toBe(0)
    expect(negativeAi.retirementComponent).toBe(0)
  })
})

describe('twoPotPreShare', () => {
  it('is the ratio of pre-two-pot service to total service, clamped to [0, 1]', () => {
    expect(twoPotPreShare(10, 20)).toBeCloseTo(0.5, 10)
    expect(twoPotPreShare(25, 20)).toBe(1) // clamped: can't exceed total service
    expect(twoPotPreShare(-5, 20)).toBe(0) // clamped: can't be negative
  })

  it('is 0 when total service is 0 or negative (avoids a divide-by-zero NaN)', () => {
    expect(twoPotPreShare(5, 0)).toBe(0)
    expect(twoPotPreShare(5, -10)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// deriveServiceYearsBeforeTwoPot
// ---------------------------------------------------------------------------

describe('deriveServiceYearsBeforeTwoPot', () => {
  const membership: GepfMembership = {
    pensionableServiceYearsNow: 30,
    pensionableSalaryAnnual: 720_000,
    salaryGrowth: 0.055,
    serviceYearsBeforeTwoPot: undefined,
    medicalSubsidyEligible: true,
    medicalSubsidyMonthly: 5_000,
    statement: undefined,
    useStatementValues: false,
    previousLumpSumsWithdrawal: 0,
    previousLumpSumsRetirement: 0,
  }

  it('uses the explicit value, clamped to the service at exit, when the member supplies it', () => {
    const withExplicit: GepfMembership = { ...membership, serviceYearsBeforeTwoPot: 12 }
    expect(deriveServiceYearsBeforeTwoPot(withExplicit, 20, RULES)).toBe(12)
    // Clamped down when it would exceed the service years projected at exit.
    const tooHigh: GepfMembership = { ...membership, serviceYearsBeforeTwoPot: 25 }
    expect(deriveServiceYearsBeforeTwoPot(tooHigh, 20, RULES)).toBe(20)
  })

  it('ignores a negative explicit value and falls back to the derived figure', () => {
    // derived = max(0, serviceNow - yearsSince(twoPotStart, today))
    const yearsSince = yearsBetween(RULES.twoPotStartDate, TODAY)
    const expected = Math.max(0, membership.pensionableServiceYearsNow - yearsSince)
    const negative: GepfMembership = { ...membership, serviceYearsBeforeTwoPot: -1 }
    expect(deriveServiceYearsBeforeTwoPot(negative, 40, RULES, TODAY)).toBeCloseTo(expected, 6)
  })

  it('derives from service-now minus years elapsed since the two-pot start date when omitted', () => {
    // twoPotStartDate = 2024-09-01, TODAY = 2026-09-09 -> a little over 2 years have elapsed.
    const yearsSince = yearsBetween(RULES.twoPotStartDate, TODAY)
    expect(yearsSince).toBeGreaterThan(2)
    expect(yearsSince).toBeLessThan(2.1)
    const expected = Math.max(0, 30 - yearsSince)
    const result = deriveServiceYearsBeforeTwoPot(membership, 33, RULES, TODAY)
    expect(result).toBeCloseTo(expected, 6)
    // And it is clamped to the service years at exit when that is the tighter bound.
    const clamped = deriveServiceYearsBeforeTwoPot(membership, 1, RULES, TODAY)
    expect(clamped).toBe(1)
  })

  it('BUGFIX: an invalid "today" string no longer poisons the result with NaN', () => {
    // Before the fix: yearsBetween(twoPotStartDate, 'not-a-date') -> NaN -> Math.max(0, NaN) -> NaN
    // -> clamp(...) -> NaN, in violation of the module's own "never NaN" invariant. The function now
    // falls back to the exported TODAY constant for an unparsable date, exactly like every other
    // date input in this file.
    const result = deriveServiceYearsBeforeTwoPot(membership, 33, RULES, 'not-a-date')
    expect(Number.isNaN(result)).toBe(false)
    const expected = deriveServiceYearsBeforeTwoPot(membership, 33, RULES, TODAY)
    expect(result).toBeCloseTo(expected, 6)
  })

  it('handles an all-defaults rules object without special-casing (defensive)', () => {
    const rules: GepfRules = { ...RULES, twoPotStartDate: TODAY } // no service before two-pot yet
    expect(deriveServiceYearsBeforeTwoPot(membership, 30, rules, TODAY)).toBeCloseTo(30, 6)
  })
})

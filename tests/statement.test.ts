/**
 * Tests for src/engine/statement.ts (`applyStatement`) and the "statement path" of
 * `gepfBenefitsAtExit` in src/engine/gepf.ts that it feeds into (source precedence, growth to
 * exit age, factor rebasing between the 2021 and 2025 tables, and the two-pot component
 * override). Every expected value is hand-computed; the arithmetic is in the comments.
 */
import { describe, expect, it } from 'vitest'
import { applyStatement } from '../src/engine/statement'
import { TODAY, getGepfRules, gepfBenefitsAtExit, interpolateFactor } from '../src/engine/gepf'
import { yearsBetween } from '../src/engine/money'
import { DEFAULT_PROFILE } from '../src/data/defaults'
import type { GepfStatementValues, Profile } from '../src/engine/types'

const RULES = getGepfRules()

/** Deep clone so each test gets an isolated profile (DEFAULT_PROFILE is a shared module value). */
function cloneProfile(): Profile {
  return JSON.parse(JSON.stringify(DEFAULT_PROFILE)) as Profile
}

// ---------------------------------------------------------------------------
// applyStatement purity
// ---------------------------------------------------------------------------

describe('applyStatement', () => {
  it('never mutates the input profile', () => {
    const profile = cloneProfile()
    const snapshot = JSON.parse(JSON.stringify(profile))
    const values: GepfStatementValues = {
      statementDate: '2026-01-01',
      pensionableServiceYears: 31,
      finalSalaryAnnual: 750_000,
      resignationBenefit: 2_000_000,
      uncertainFields: ['finalSalaryAnnual'],
    }
    const result = applyStatement(profile, values)
    expect(profile).toEqual(snapshot) // original untouched
    expect(result).not.toBe(profile) // a new object was returned
    expect(result.gepf).not.toBe(profile.gepf)
  })

  it('does not let mutations of the returned profile leak back into the caller-supplied values', () => {
    const profile = cloneProfile()
    const values: GepfStatementValues = { uncertainFields: ['a', 'b'] }
    const result = applyStatement(profile, values)
    result.gepf.statement!.uncertainFields!.push('c')
    expect(values.uncertainFields).toEqual(['a', 'b']) // the source array was copied, not shared
  })

  it('turns useStatementValues on and stores a copy of the statement block', () => {
    const profile = cloneProfile()
    expect(profile.gepf.useStatementValues).toBe(false)
    const values: GepfStatementValues = { retirementGratuity: 1_000_000 }
    const result = applyStatement(profile, values)
    expect(result.gepf.useStatementValues).toBe(true)
    expect(result.gepf.statement).toEqual(values)
    expect(result.gepf.statement).not.toBe(values)
  })

  it('copies pensionableServiceYears / finalSalaryAnnual onto the membership when valid', () => {
    const profile = cloneProfile()
    const values: GepfStatementValues = { pensionableServiceYears: 31, finalSalaryAnnual: 750_000 }
    const result = applyStatement(profile, values)
    expect(result.gepf.pensionableServiceYearsNow).toBe(31)
    expect(result.gepf.pensionableSalaryAnnual).toBe(750_000)
  })

  it('leaves the existing service/salary untouched when the statement values are missing, negative or non-numeric', () => {
    const profile = cloneProfile()
    const originalServiceYears = profile.gepf.pensionableServiceYearsNow
    const originalSalary = profile.gepf.pensionableSalaryAnnual

    const missing = applyStatement(profile, {})
    expect(missing.gepf.pensionableServiceYearsNow).toBe(originalServiceYears)
    expect(missing.gepf.pensionableSalaryAnnual).toBe(originalSalary)

    const negative = applyStatement(profile, { pensionableServiceYears: -1, finalSalaryAnnual: -1 })
    expect(negative.gepf.pensionableServiceYearsNow).toBe(originalServiceYears)
    expect(negative.gepf.pensionableSalaryAnnual).toBe(originalSalary)

    const nonNumeric = applyStatement(profile, {
      pensionableServiceYears: NaN,
      finalSalaryAnnual: Number.POSITIVE_INFINITY,
    })
    expect(nonNumeric.gepf.pensionableServiceYearsNow).toBe(originalServiceYears)
    expect(nonNumeric.gepf.pensionableSalaryAnnual).toBe(originalSalary)
  })

  it('leaves lifestyle/person/assumptions untouched (only gepf is affected)', () => {
    const profile = cloneProfile()
    const result = applyStatement(profile, { retirementGratuity: 500_000 })
    expect(result.person).toEqual(profile.person)
    expect(result.lifestyle).toEqual(profile.lifestyle)
    expect(result.assumptions).toEqual(profile.assumptions)
  })
})

// ---------------------------------------------------------------------------
// gepfBenefitsAtExit — statement path precedence
// ---------------------------------------------------------------------------

describe('gepfBenefitsAtExit source precedence', () => {
  it('uses the formula when useStatementValues is false, regardless of a stored statement', () => {
    const profile = cloneProfile()
    profile.gepf.statement = { resignationBenefit: 9_999_999 }
    profile.gepf.useStatementValues = false
    const { source } = gepfBenefitsAtExit(profile, 60, RULES)
    expect(source).toBe('formula')
  })

  it('falls back to the formula when useStatementValues is true but no benefit value is present', () => {
    const profile = cloneProfile()
    profile.gepf.useStatementValues = true
    profile.gepf.statement = { pensionableServiceYears: 30 } // no resignation/gratuity/annuity value
    const { source } = gepfBenefitsAtExit(profile, 60, RULES)
    expect(source).toBe('formula')
  })

  it('uses the statement path as soon as ANY of the three benefit values is present', () => {
    const profile = cloneProfile()
    profile.gepf.useStatementValues = true
    profile.gepf.statement = { retirementGratuity: 1_000_000 }
    expect(gepfBenefitsAtExit(profile, 60, RULES).source).toBe('statement')
  })

  it('ignores a non-positive statement value (0 or negative) as if it were absent', () => {
    const profile = cloneProfile()
    profile.gepf.useStatementValues = true
    profile.gepf.statement = { retirementGratuity: 0, retirementAnnuityAnnual: -5 }
    expect(gepfBenefitsAtExit(profile, 60, RULES).source).toBe('formula')
  })
})

describe('gepfBenefitsAtExit statement path — growth to exit age', () => {
  it('grows a statement retirement gratuity by salary growth over the years to exit', () => {
    const profile = cloneProfile()
    profile.person.currentAge = 57
    profile.gepf.salaryGrowth = 0.055
    profile.gepf.useStatementValues = true
    profile.gepf.statement = { statementDate: TODAY, retirementGratuity: 100_000 }

    // statementDate === today, so yearsSinceStatement = 0; yearsToExit = 60 - 57 = 3.
    // growth = (1.055)^3 = 1.174241375
    // expected unreduced gratuity = 100,000 x 1.174241375 = 117,424.1375
    // At exit age 60 there is no early-retirement reduction (reductionFactor = 1).
    const growth = 1.055 ** 3
    const expectedGratuity = 100_000 * growth
    const { retirement, source } = gepfBenefitsAtExit(profile, 60, RULES)
    expect(source).toBe('statement')
    expect(retirement.reductionFactor).toBe(1)
    expect(retirement.gratuity).toBeCloseTo(expectedGratuity, 6)
    expect(retirement.gratuity).toBeCloseTo(117_424.1375, 2)
  })

  it('falls back to the formula annuity when only the gratuity is on the statement', () => {
    const profile = cloneProfile()
    profile.person.currentAge = 60 // exit now: no growth, isolates the fallback
    profile.gepf.useStatementValues = true
    profile.gepf.statement = { statementDate: TODAY, retirementGratuity: 100_000 }
    const { retirement } = gepfBenefitsAtExit(profile, 60, RULES)
    // Formula annuity for the projected service/salary at 60 (no statement annuity given).
    expect(retirement.annuityAnnual).toBeGreaterThan(0)
    expect(retirement.gratuityOnly).toBe(false)
  })

  it('rebuilds the resignation value from the (grown) statement gratuity/annuity when resignationBenefit is absent', () => {
    const profile = cloneProfile()
    profile.person.currentAge = 60 // exit now, so growth = 1 and the numbers are easy to check
    profile.gepf.useStatementValues = true
    profile.gepf.statement = { statementDate: TODAY, retirementGratuity: 200_000, retirementAnnuityAnnual: 50_000 }
    const { resignation } = gepfBenefitsAtExit(profile, 60, RULES)
    const factor = interpolateFactor(RULES.actuarialFactors, 60)
    // Without a statement resignation value the engine falls back to Rule 14.4 on the projected
    // service and salary: AI = N x FS x F(60); the (grown) statement gratuity is the gratuity part.
    const { serviceYears, finalSalaryAnnual } = gepfBenefitsAtExit(profile, 60, RULES)
    const ai = serviceYears * finalSalaryAnnual * factor
    expect(resignation.actuarialInterest).toBeCloseTo(ai, 4)
    expect(resignation.gratuityComponent).toBeCloseTo(Math.min(200_000, ai), 4)
    expect(resignation.annuityComponent).toBeCloseTo(ai - Math.min(200_000, ai), 4)
    const sum = resignation.vestedComponent + resignation.savingsComponent + resignation.retirementComponent
    expect(sum).toBeCloseTo(resignation.actuarialInterest, 2)
  })
})

describe('gepfBenefitsAtExit statement path — factor-table rebasing', () => {
  it('rebases a pre-October-2025 statement resignation value onto the current factor table', () => {
    const profile = cloneProfile()
    profile.person.currentAge = 57
    profile.gepf.salaryGrowth = 0 // isolate the rebasing arithmetic from salary growth
    profile.gepf.useStatementValues = true
    // Statement dated before rules.actuarialFactors.effectiveFrom (2025-10-01): its value is on
    // the previous-factor basis and must be scaled up to the current basis.
    const statementDate = '2025-01-01'
    profile.gepf.statement = { statementDate, resignationBenefit: 500_000 }

    const yearsSinceStatement = yearsBetween(statementDate, TODAY)
    const ageAtStatement = 57 - yearsSinceStatement
    const factorNewAtStatement = interpolateFactor(RULES.actuarialFactors, ageAtStatement)
    const factorPrevAtStatement = interpolateFactor(RULES.previousActuarialFactors!, ageAtStatement)

    // aiPrevious = the statement value as-is (it was computed on the previous basis)
    // aiCurrent  = statementValue x factorNew / factorPrev (rebased onto the current, lower, factors)
    // growth = 1 (salaryGrowth = 0, and exit age 60 is used below so growthYears could be > 0 but
    // (1+0)^n = 1 regardless).
    const expectedAiPrevious = 500_000
    const expectedAiCurrent = (500_000 * factorNewAtStatement) / factorPrevAtStatement

    const { resignation } = gepfBenefitsAtExit(profile, 60, RULES)
    expect(resignation.actuarialInterest).toBeCloseTo(expectedAiCurrent, 4)
    expect(resignation.actuarialInterestPreviousFactors).toBeCloseTo(expectedAiPrevious, 4)
    // The 2025 factors are on average ~15% lower than the 2021 ones, so the current-basis value
    // must come out lower than the previous-basis value the statement carried.
    expect(expectedAiCurrent).toBeLessThan(expectedAiPrevious)
  })
})

describe('gepfBenefitsAtExit statement path — two-pot components from the statement', () => {
  it('overrides the split using the statement shares (normalised) applied to the grown actuarial interest', () => {
    const profile = cloneProfile()
    profile.person.currentAge = 60 // exit now: growth = 1, easy numbers
    profile.gepf.useStatementValues = true
    profile.gepf.statement = {
      statementDate: TODAY,
      resignationBenefit: 1_000_000,
      vestedComponent: 400_000,
      savingsComponent: 100_000,
      retirementComponent: 500_000, // already sums to 1,000,000 (total = 1)
    }
    const { resignation } = gepfBenefitsAtExit(profile, 60, RULES)
    expect(resignation.actuarialInterest).toBeCloseTo(1_000_000, 6)
    // Shares are normalised to the reported total (400k+100k+500k = 1,000,000 -> shares 0.4/0.1/0.5)
    // and reapplied to the (grown) actuarial interest, which here is also 1,000,000.
    expect(resignation.vestedComponent).toBeCloseTo(400_000, 6)
    expect(resignation.savingsComponent).toBeCloseTo(100_000, 6)
    expect(resignation.retirementComponent).toBeCloseTo(500_000, 6)
    expect(resignation.maxCashOnResignation).toBeCloseTo(500_000, 6) // vested + savings, not + retirement
  })

  it('falls back to the derived pre-two-pot share when the statement carries no two-pot components', () => {
    const profile = cloneProfile()
    profile.person.currentAge = 60
    profile.gepf.useStatementValues = true
    profile.gepf.statement = { statementDate: TODAY, resignationBenefit: 1_000_000 }
    const { resignation } = gepfBenefitsAtExit(profile, 60, RULES)
    const sum = resignation.vestedComponent + resignation.savingsComponent + resignation.retirementComponent
    expect(sum).toBeCloseTo(resignation.actuarialInterest, 2)
    expect(resignation.maxCashOnResignation).toBeCloseTo(resignation.vestedComponent + resignation.savingsComponent, 6)
  })

  it('ignores statement two-pot components that are all zero (falls back to the derived share)', () => {
    const profile = cloneProfile()
    profile.person.currentAge = 60
    profile.gepf.useStatementValues = true
    profile.gepf.statement = {
      statementDate: TODAY,
      resignationBenefit: 1_000_000,
      vestedComponent: 0,
      savingsComponent: 0,
      retirementComponent: 0,
    }
    const { resignation } = gepfBenefitsAtExit(profile, 60, RULES)
    // With all-zero shares the total <= 0 guard kicks in, so the derived-share split is used
    // instead of a 0/0/0 (all-NaN) split.
    expect(resignation.vestedComponent + resignation.savingsComponent + resignation.retirementComponent).toBeCloseTo(
      1_000_000,
      2,
    )
  })
})

// ---------------------------------------------------------------------------
// End-to-end: applyStatement feeds gepfBenefitsAtExit's statement path
// ---------------------------------------------------------------------------

describe('applyStatement -> gepfBenefitsAtExit integration', () => {
  it('a statement applied to the default profile takes precedence over the formula estimate', () => {
    const profile = cloneProfile()
    const beforeSource = gepfBenefitsAtExit(profile, 60, RULES).source
    expect(beforeSource).toBe('formula')

    const withStatement = applyStatement(profile, {
      statementDate: TODAY,
      pensionableServiceYears: 31,
      finalSalaryAnnual: 800_000,
      retirementGratuity: 1_300_000,
      retirementAnnuityAnnual: 340_000,
    })

    const afterResult = gepfBenefitsAtExit(withStatement, 60, RULES)
    expect(afterResult.source).toBe('statement')
    // The membership inputs used for the formula fallback / service-year projection were updated too.
    expect(withStatement.gepf.pensionableServiceYearsNow).toBe(31)
    expect(withStatement.gepf.pensionableSalaryAnnual).toBe(800_000)
    // Statement retirement values are used directly since exit age (60) === current age (57 default)+3? no:
    // currentAge stays 57 (default) here and exitAge is 60, so growth still applies over 3 years.
    const growth = 1.055 ** 3 // default salaryGrowth is 0.055
    expect(afterResult.retirement.gratuity).toBeCloseTo(1_300_000 * growth, 2)
    // Original profile passed into applyStatement remains on the formula path (purity).
    expect(gepfBenefitsAtExit(profile, 60, RULES).source).toBe('formula')
  })
})

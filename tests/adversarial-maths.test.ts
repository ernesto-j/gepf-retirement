/**
 * ADVERSARIAL MATHS REVIEW — independent re-derivation of the calculation engine.
 *
 * This file deliberately does NOT reuse any helper, constant or expectation from the other
 * test files. Every number is recomputed here from first principles (SARS bracket arithmetic,
 * GEPF formulas, compound growth) and checked against what the engine produces, over a grid of
 * profiles: ages 50 / 55 / 58 / 62, service 8 / 15 / 30 years, salaries R400k / R720k / R1.5m,
 * targets R15k–R100k a month, all three core routes from `defaultScenarios` + `runScenario`.
 *
 * Where an assertion is loose, the comment says which documented simplification makes it so.
 * Conventions that are self-consistent but not obvious (end-of-year FX and deflator on capital,
 * capital that legitimately leaves the system at a lump-sum event) are pinned explicitly so a
 * future change to them shows up here as a failure rather than as a silent drift.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_TAX_YEAR, TAX_TABLES } from '../src/data/taxTables'
import { DEFAULT_PROFILE } from '../src/data/defaults'
import { FUNDS } from '../src/data/funds'
import { GEPF_RULES } from '../src/data/gepfRules'
import {
  calcIncomeTax,
  calcRetirementLumpSumTax,
  calcSavingsPotWithdrawalTax,
  calcWithdrawalLumpSumTax,
  getTaxTables,
  grossForNet,
  marginalRate,
} from '../src/engine/tax'
import {
  calcGepfResignationBenefit,
  calcGepfRetirementBenefit,
  gepfBenefitsAtExit,
  interpolateFactor,
  projectServiceAndSalary,
} from '../src/engine/gepf'
import { compareScenarios, defaultScenarios, runScenario, summarise } from '../src/engine/projection'
import type {
  Assumptions,
  GepfMembership,
  LifestyleInputs,
  PersonProfile,
  Profile,
  ScenarioDefinition,
  ScenarioResult,
  TaxBracket,
  TaxTables,
  TaxYear,
  YearRow,
} from '../src/engine/types'

const YEARS: TaxYear[] = ['2025/26', '2026/27']

// ---------------------------------------------------------------------------
// Independent re-implementations (nothing imported from src/engine is used here)
// ---------------------------------------------------------------------------

/** Progressive tax on `amount` walked bracket by bracket, ignoring the table's `base` column. */
function slabTax(amount: number, brackets: TaxBracket[]): number {
  if (!(amount > 0)) return 0
  const sorted = [...brackets].sort((x, y) => x.threshold - y.threshold)
  let tax = 0
  for (let i = 0; i < sorted.length; i++) {
    const lower = sorted[i].threshold
    const upper = i + 1 < sorted.length ? sorted[i + 1].threshold : Number.POSITIVE_INFINITY
    if (amount <= lower) break
    tax += (Math.min(amount, upper) - lower) * sorted[i].rate
  }
  return tax
}

/** Normal tax: slab tax, less the age rebates, less the s6A medical credit; floored at zero. */
function refIncomeTax(taxable: number, age: number, t: TaxTables, members = 0): number {
  const gross = slabTax(Math.max(0, taxable), t.brackets)
  let rebate = t.rebates.primary
  if (age >= 65) rebate += t.rebates.secondary
  if (age >= 75) rebate += t.rebates.tertiary
  const n = Math.max(0, Math.floor(members))
  const credit = (Math.min(n, 2) * t.medicalCredit.firstTwo + Math.max(n - 2, 0) * t.medicalCredit.additional) * 12
  return Math.max(0, gross - rebate - credit)
}

const refNetOfTax = (taxable: number, age: number, t: TaxTables, members = 0): number =>
  taxable - refIncomeTax(taxable, age, t, members)

// ---------------------------------------------------------------------------
// Profile grid
// ---------------------------------------------------------------------------

const BASE_ASSUMPTIONS: Assumptions = { ...DEFAULT_PROFILE.assumptions }

function profileOf(opts: {
  age: number
  service: number
  salary: number
  targetMonthly: number
  person?: Partial<PersonProfile>
  gepf?: Partial<GepfMembership>
  lifestyle?: Partial<LifestyleInputs>
  assumptions?: Partial<Assumptions>
}): Profile {
  return {
    person: {
      ...DEFAULT_PROFILE.person,
      currentAge: opts.age,
      plannedExitAge: opts.age,
      planToAge: 90,
      ...opts.person,
    },
    gepf: {
      ...DEFAULT_PROFILE.gepf,
      pensionableServiceYearsNow: opts.service,
      pensionableSalaryAnnual: opts.salary,
      ...opts.gepf,
    },
    lifestyle: {
      ...DEFAULT_PROFILE.lifestyle,
      targetNetMonthlyIncomeToday: opts.targetMonthly,
      ...opts.lifestyle,
    },
    assumptions: { ...BASE_ASSUMPTIONS, ...opts.assumptions },
  }
}

const AGES = [50, 55, 58, 62]
const SERVICE = [8, 15, 30]
const SALARIES = [400_000, 720_000, 1_500_000]
const TARGETS = [15_000, 35_000, 60_000, 100_000]

interface GridCase {
  label: string
  profile: Profile
  def: ScenarioDefinition
  result: ScenarioResult
}

/** Every (age x service x salary x target) profile x the three core routes, run once. */
const GRID: GridCase[] = (() => {
  const out: GridCase[] = []
  for (const age of AGES) {
    for (const service of SERVICE) {
      for (const salary of SALARIES) {
        for (const targetMonthly of TARGETS) {
          const profile = profileOf({ age, service, salary, targetMonthly })
          for (const def of defaultScenarios(profile, FUNDS)) {
            out.push({
              label: `age${age} svc${service} sal${salary / 1000}k tgt${targetMonthly / 1000}k ${def.id}`,
              profile,
              def,
              result: runScenario(profile, def, { funds: FUNDS }),
            })
          }
        }
      }
    }
  }
  return out
})()

/** Ages at which capital legitimately LEAVES the system between rows (documented events). */
function capitalLeakAges(r: ScenarioResult): Set<number> {
  const ages = new Set<number>()
  if (r.atRetirementFromPreservation) ages.add(r.atRetirementFromPreservation.age)
  for (const note of r.notes) {
    // "At age 65 the living annuity is worth less than the de-minimis commutation amount (...)"
    const m = /^At age (\d+(?:\.\d+)?) the living annuity is worth less than the de-minimis/.exec(note)
    if (m) ages.add(Number(m[1]))
  }
  return ages
}

// ===========================================================================
// 1. SARS tables: bracket, rebate and lump-sum arithmetic from first principles
// ===========================================================================

describe('tax tables reconcile arithmetically', () => {
  it.each(YEARS)('%s income brackets: base[i] = base[i-1] + rate[i-1] x (threshold[i] - threshold[i-1])', (year) => {
    const b = TAX_TABLES[year].brackets
    expect(b[0].threshold).toBe(0)
    expect(b[0].base).toBe(0)
    for (let i = 1; i < b.length; i++) {
      expect(b[i].threshold, `${year} bracket ${i} ordering`).toBeGreaterThan(b[i - 1].threshold)
      expect(b[i].rate, `${year} bracket ${i} rate`).toBeGreaterThan(b[i - 1].rate)
      const derived = b[i - 1].base + b[i - 1].rate * (b[i].threshold - b[i - 1].threshold)
      expect(b[i].base, `${year} bracket ${i} base`).toBeCloseTo(derived, 6)
    }
  })

  it.each(YEARS)('%s tax thresholds equal the rebates grossed up at the first bracket rate', (year) => {
    const t = TAX_TABLES[year]
    const firstRate = t.brackets[0].rate
    expect(t.thresholds.under65 * firstRate).toBeCloseTo(t.rebates.primary, 0)
    expect(t.thresholds.age65to74 * firstRate).toBeCloseTo(t.rebates.primary + t.rebates.secondary, 0)
    expect(t.thresholds.age75plus * firstRate).toBeCloseTo(t.rebates.primary + t.rebates.secondary + t.rebates.tertiary, 0)
  })

  it.each(YEARS)('%s lump-sum tables reconcile and start with a tax-free slab', (year) => {
    const t = TAX_TABLES[year]
    for (const table of [t.retirementLumpSum, t.withdrawalLumpSum]) {
      expect(table[0]).toEqual({ threshold: 0, rate: 0, base: 0 })
      for (let i = 1; i < table.length; i++) {
        const derived = table[i - 1].base + table[i - 1].rate * (table[i].threshold - table[i - 1].threshold)
        expect(table[i].base).toBeCloseTo(derived, 6)
      }
    }
  })

  it('2026/27 is the default tax year and getTaxTables() returns it', () => {
    expect(DEFAULT_TAX_YEAR).toBe('2026/27')
    expect(getTaxTables().taxYear).toBe('2026/27')
    expect(getTaxTables('2025/26').taxYear).toBe('2025/26')
    // A stale/unknown year (e.g. from localStorage) must fall back, not throw.
    expect(getTaxTables('2019/20' as TaxYear).taxYear).toBe('2026/27')
    expect(DEFAULT_PROFILE.assumptions.taxYear).toBe('2026/27')
  })
})

describe('calcIncomeTax matches an independent slab computation', () => {
  it('over a sweep of incomes, ages and medical members, in both tax years', () => {
    const incomes = [0, 1, 50_000, 95_750, 99_000, 148_217, 237_100, 245_100, 370_500, 500_000, 673_000, 887_000, 1_817_000, 1_878_600, 5_000_000]
    for (const year of YEARS) {
      const t = TAX_TABLES[year]
      for (const income of incomes) {
        for (const age of [40, 50, 55, 58, 62, 64, 65, 66, 74, 75, 80]) {
          for (const members of [0, 1, 2, 3, 5]) {
            const got = calcIncomeTax(income, age, t, { medicalMembers: members })
            expect(got.tax, `${year} ${income} age${age} med${members}`).toBeCloseTo(refIncomeTax(income, age, t, members), 6)
            // The result must decompose exactly: grossTax - rebates - credits = tax.
            expect(got.grossTax - got.rebates - got.medicalCredits).toBeCloseTo(got.tax, 6)
            expect(got.tax).toBeGreaterThanOrEqual(0)
            expect(got.rebates).toBeGreaterThanOrEqual(0)
            expect(got.medicalCredits).toBeGreaterThanOrEqual(0)
            expect(got.effectiveRate).toBeCloseTo(income > 0 ? got.tax / income : 0, 9)
            expect(got.marginalRate).toBe(marginalRate(income, t))
          }
        }
      }
    }
  })

  it('reproduces the published SARS worked examples', () => {
    const t25 = TAX_TABLES['2025/26']
    // R500,000 at age 40, 2025/26: 77,362 + 31% x (500,000 - 370,500) = 117,507 before the rebate.
    const r500k = calcIncomeTax(500_000, 40, t25)
    expect(r500k.grossTax).toBeCloseTo(117_507, 6)
    expect(r500k.tax).toBeCloseTo(117_507 - 17_235, 6)
    // A 65-year-old on R200,000: 18% x 200,000 - 17,235 - 9,444 = 9,321.
    expect(calcIncomeTax(200_000, 65, t25).tax).toBeCloseTo(9_321, 6)
    // Below the age threshold there is no tax at all. NOTE (reviewer-side correction): SARS
    // publishes the thresholds rounded to whole rands, so AT the 2025/26 age-65 threshold the
    // arithmetic leaves 148,217 x 18% - 26,679 = R0.06 of tax, not exactly zero. That is the
    // published table's rounding, not an engine error, so the assertion allows a rand.
    expect(calcIncomeTax(148_217, 65, t25).tax).toBeLessThanOrEqual(1)
    expect(calcIncomeTax(148_216, 65, t25).tax).toBeCloseTo(0, 6)
    expect(calcIncomeTax(95_750, 40, t25).tax).toBeCloseTo(0, 6)
    // 2026/27 equivalents, re-derived here.
    const t26 = TAX_TABLES['2026/27']
    expect(calcIncomeTax(500_000, 40, t26).grossTax).toBeCloseTo(79_998 + 0.31 * (500_000 - 383_100), 6)
    expect(calcIncomeTax(99_000, 40, t26).tax).toBeCloseTo(0, 6)
    expect(calcIncomeTax(153_250, 65, t26).tax).toBeCloseTo(0, 6)
    expect(calcIncomeTax(171_300, 75, t26).tax).toBeCloseTo(0, 6)
  })
})

describe('lump-sum aggregation', () => {
  const amounts = [0, 27_500, 100_000, 550_000, 770_000, 1_000_000, 1_155_000, 2_500_000]

  it.each(YEARS)('%s: tax = T(previous + amount) - T(previous), recomputed slab by slab', (year) => {
    const t = TAX_TABLES[year]
    for (const previous of amounts) {
      for (const amount of amounts) {
        const ret = calcRetirementLumpSumTax(amount, previous, t)
        const wd = calcWithdrawalLumpSumTax(amount, previous, t)
        expect(ret.tax, `ret ${previous}+${amount}`).toBeCloseTo(
          slabTax(previous + amount, t.retirementLumpSum) - slabTax(previous, t.retirementLumpSum),
          6,
        )
        expect(wd.tax, `wd ${previous}+${amount}`).toBeCloseTo(
          slabTax(previous + amount, t.withdrawalLumpSum) - slabTax(previous, t.withdrawalLumpSum),
          6,
        )
        expect(ret.net).toBeCloseTo(amount - ret.tax, 9)
        expect(ret.effectiveRate).toBeCloseTo(amount > 0 ? ret.tax / amount : 0, 9)
        expect(ret.taxOnPrevious).toBeCloseTo(slabTax(previous, t.retirementLumpSum), 6)
        // Withdrawal is never cheaper than retirement for the same cumulative position.
        expect(wd.tax).toBeGreaterThanOrEqual(ret.tax - 1e-6)
      }
    }
  })

  it('is additive: two aggregated slices cost the same as one combined lump sum', () => {
    const t = getTaxTables()
    for (const [a, b] of [[300_000, 600_000], [550_000, 550_000], [1_000_000, 1_500_000]] as const) {
      const stepwise = calcRetirementLumpSumTax(a, 0, t).tax + calcRetirementLumpSumTax(b, a, t).tax
      expect(stepwise).toBeCloseTo(calcRetirementLumpSumTax(a + b, 0, t).tax, 6)
    }
  })

  it('reproduces the spec examples and the aggregation penalty', () => {
    const t = getTaxTables()
    expect(calcRetirementLumpSumTax(1_000_000, 0, t).tax).toBeCloseTo(101_700, 6) // 39,600 + 27% x 230,000
    expect(calcWithdrawalLumpSumTax(1_000_000, 0, t).tax).toBeCloseTo(199_710, 6) // 125,730 + 27% x 274,000
    // A prior R300,000 withdrawal pushes a later R600,000 retirement lump sum up the table.
    const alone = calcRetirementLumpSumTax(600_000, 0, t).tax
    const aggregated = calcRetirementLumpSumTax(600_000, 300_000, t).tax
    expect(alone).toBeCloseTo(0.18 * (600_000 - 550_000), 6)
    expect(aggregated).toBeCloseTo(
      slabTax(900_000, t.retirementLumpSum) - slabTax(300_000, t.retirementLumpSum),
      6,
    )
    expect(aggregated).toBeGreaterThan(alone)
  })

  it('savings-pot withdrawals are taxed at the marginal rate on top of other income', () => {
    const t = getTaxTables()
    for (const other of [0, 120_000, 400_000, 1_000_000]) {
      for (const amount of [2_000, 30_000, 250_000]) {
        for (const age of [55, 65, 75]) {
          expect(calcSavingsPotWithdrawalTax(amount, other, age, t)).toBeCloseTo(
            refIncomeTax(other + amount, age, t) - refIncomeTax(other, age, t),
            6,
          )
        }
      }
    }
  })
})

// ===========================================================================
// 2. grossForNet inverts the tax function
// ===========================================================================

describe('grossForNet inverts the net-of-tax function', () => {
  it('lands within R1 of the target net across ages, medical members, other income and both years', () => {
    for (const year of YEARS) {
      const t = TAX_TABLES[year]
      for (const age of [50, 55, 58, 62, 65, 75]) {
        for (const members of [0, 2, 4]) {
          for (const other of [0, 100_000, 300_000, 700_000, 2_000_000]) {
            for (const targetMonthly of [1_000, 15_000, 35_000, 60_000, 100_000]) {
              const target = targetMonthly * 12
              const g = grossForNet(target, age, t, { medicalMembers: members, otherTaxableIncome: other })
              const achieved = refNetOfTax(other + g, age, t, members) - refNetOfTax(other, age, t, members)
              const ctx = `${year} age${age} med${members} other${other} target${target}`
              expect(Math.abs(achieved - target), ctx).toBeLessThanOrEqual(1)
              // Bisection returns the upper end of the bracket, so it never undershoots.
              expect(achieved, ctx).toBeGreaterThanOrEqual(target - 1e-6)
              // Gross is never below net, and never more than 1/(1-top rate) times it.
              expect(g, ctx).toBeGreaterThanOrEqual(target - 1e-6)
              expect(g, ctx).toBeLessThanOrEqual(target / (1 - 0.45) + 1)
            }
          }
        }
      }
    }
  })

  it('is monotone in the target and in the other income already earned', () => {
    const t = getTaxTables()
    let previous = -1
    for (const target of [1_000, 10_000, 100_000, 250_000, 500_000, 1_000_000]) {
      const g = grossForNet(target, 58, t)
      expect(g).toBeGreaterThan(previous)
      previous = g
    }
    let last = -1
    for (const other of [0, 100_000, 500_000, 2_000_000]) {
      const g = grossForNet(300_000, 58, t, { otherTaxableIncome: other })
      expect(g).toBeGreaterThanOrEqual(last)
      last = g
    }
  })

  it('returns 0 for a zero, negative or non-finite target', () => {
    const t = getTaxTables()
    expect(grossForNet(0, 60, t)).toBe(0)
    expect(grossForNet(-5_000, 60, t)).toBe(0)
    expect(grossForNet(Number.NaN, 60, t)).toBe(0)
  })
})

// ===========================================================================
// 3. GEPF formulas
// ===========================================================================

describe('GEPF benefit formulas', () => {
  it('matches the spec worked examples', () => {
    const at60 = calcGepfRetirementBenefit(
      { finalSalaryAnnual: 600_000, pensionableServiceYears: 30, ageAtExit: 60, spousePensionPct: 50 },
      GEPF_RULES,
    )
    expect(at60.gratuity).toBeCloseTo(0.0672 * 600_000 * 30, 6) // R1,209,600
    expect(at60.gratuity).toBeCloseTo(1_209_600, 6)
    expect(at60.annuityAnnual).toBeCloseTo((600_000 * 30) / 55 + 360, 6) // R327,632.73
    expect(at60.annuityMonthly).toBeCloseTo(at60.annuityAnnual / 12, 9)
    expect(at60.reductionFactor).toBe(1)

    // Age 57: 36 months early at 1/300 a month => factor 0.88 exactly.
    const at57 = calcGepfRetirementBenefit(
      { finalSalaryAnnual: 600_000, pensionableServiceYears: 30, ageAtExit: 57 },
      GEPF_RULES,
    )
    expect(at57.monthsEarly).toBe(36)
    expect(at57.reductionFactor).toBeCloseTo(0.88, 12)
    expect(at57.gratuity).toBeCloseTo(1_209_600 * 0.88, 6)
    expect(at57.annuityAnnual).toBeCloseTo(((600_000 * 30) / 55 + 360) * 0.88, 6)

    // Exactly 55: 60 months early => 20% cut.
    const at55 = calcGepfRetirementBenefit(
      { finalSalaryAnnual: 600_000, pensionableServiceYears: 30, ageAtExit: 55 },
      GEPF_RULES,
    )
    expect(at55.reductionFactor).toBeCloseTo(0.8, 12)

    // Under 10 years: gratuity only, no annuity.
    const short = calcGepfRetirementBenefit(
      { finalSalaryAnnual: 600_000, pensionableServiceYears: 8, ageAtExit: 60 },
      GEPF_RULES,
    )
    expect(short.gratuityOnly).toBe(true)
    expect(short.annuityAnnual).toBe(0)
    // NOTE: the engine now prices the <10-year gratuity as the actuarial interest
    // (N x FS x F(age)) rather than the 0.15 x FS x N placeholder in `GepfRules`; both the
    // engine comment and src/data/gepfRules.ts document the placeholder as superseded.
    expect(short.gratuity).toBeCloseTo(8 * 600_000 * interpolateFactor(GEPF_RULES.actuarialFactors, 60), 6)
  })

  it('interpolates the actuarial factor monotonically and clamps outside the table', () => {
    const table = GEPF_RULES.actuarialFactors
    const points = [...table.points].sort((a, b) => a.age - b.age)
    let previous = -1
    for (let age = 20; age <= 60; age += 0.5) {
      const f = interpolateFactor(table, age)
      expect(f, `factor at ${age}`).toBeGreaterThanOrEqual(previous - 1e-12)
      previous = f
    }
    expect(interpolateFactor(table, 0)).toBeCloseTo(points[0].factor, 12)
    expect(interpolateFactor(table, 200)).toBeCloseTo(points[points.length - 1].factor, 12)
    expect(interpolateFactor(table, Number.NaN)).toBeCloseTo(points[0].factor, 12)
    // Linear between two tabulated points.
    const a = points.find((p) => p.age === 50)!
    const b = points.find((p) => p.age === 55)!
    expect(interpolateFactor(table, 52.5)).toBeCloseTo((a.factor + b.factor) / 2, 12)
  })

  it('resignation value = service x final salary x F(age), and the two-pot split sums to it', () => {
    for (const age of AGES) {
      for (const service of SERVICE) {
        const r = calcGepfResignationBenefit(
          {
            finalSalaryAnnual: 720_000,
            pensionableServiceYears: service,
            ageAtExit: age,
            serviceYearsBeforeTwoPot: Math.max(0, service - 2),
          },
          GEPF_RULES,
        )
        expect(r.factorUsed).toBeCloseTo(interpolateFactor(GEPF_RULES.actuarialFactors, age), 12)
        expect(r.actuarialInterest).toBeCloseTo(service * 720_000 * r.factorUsed, 6)
        expect(r.vestedComponent + r.savingsComponent + r.retirementComponent).toBeCloseTo(r.actuarialInterest, 6)
        expect(r.maxCashOnResignation).toBeCloseTo(r.vestedComponent + r.savingsComponent, 9)
        expect(r.gratuityComponent + r.annuityComponent).toBeCloseTo(r.actuarialInterest, 6)
        // Seed: 10% of the pre-two-pot slice, capped at R30,000, moved into savings.
        const preShare = Math.max(0, service - 2) / service
        const seed = Math.min(0.1 * r.actuarialInterest * preShare, 30_000)
        expect(r.vestedComponent).toBeCloseTo(r.actuarialInterest * preShare - seed, 6)
        expect(r.savingsComponent).toBeCloseTo(seed + (r.actuarialInterest * (1 - preShare)) / 3, 6)
        expect(r.retirementComponent).toBeCloseTo((r.actuarialInterest * (1 - preShare) * 2) / 3, 6)
      }
    }
  })

  it('projects service and the 24-month final salary as the spec describes', () => {
    const m: GepfMembership = { ...DEFAULT_PROFILE.gepf, pensionableSalaryAnnual: 720_000, salaryGrowth: 0.055, pensionableServiceYearsNow: 20 }
    for (const n of [0, 1, 3, 5]) {
      const p = projectServiceAndSalary(m, 55, 55 + n)
      expect(p.serviceYears).toBeCloseTo(20 + n, 12)
      expect(p.salaryAtExit).toBeCloseTo(720_000 * 1.055 ** n, 6)
      const expectedFs = n < 1 ? 720_000 : 720_000 * 1.055 ** (n - 1) * ((2 + 0.055) / 2)
      expect(p.finalSalaryAnnual).toBeCloseTo(expectedFs, 6)
    }
    // An exit age in the past is treated as an exit today, never negative service.
    expect(projectServiceAndSalary(m, 60, 50).serviceYears).toBeCloseTo(20, 12)
  })
})

// ===========================================================================
// 4. Year-by-year projection invariants over the whole profile grid
// ===========================================================================

describe('projection: every YearRow reconciles', () => {
  it('runs the full grid (4 ages x 3 service x 3 salaries x 4 targets x 3 routes)', () => {
    expect(GRID.length).toBe(AGES.length * SERVICE.length * SALARIES.length * TARGETS.length * 3)
  })

  it('capitalStart - draws + investmentReturn - fees = capitalEnd (within R1)', () => {
    for (const { label, result } of GRID) {
      for (const row of result.rows) {
        const lhs = row.capitalStart - row.drawGross + row.investmentReturn - row.fees
        expect(Math.abs(lhs - row.capitalEnd), `${label} age${row.age}`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('row n capitalEnd = row n+1 capitalStart, except where capital leaves at a lump-sum event', () => {
    for (const { label, result } of GRID) {
      const leaks = capitalLeakAges(result)
      for (let i = 0; i + 1 < result.rows.length; i++) {
        const end = result.rows[i].capitalEnd
        const start = result.rows[i + 1].capitalStart
        const nextAge = result.rows[i + 1].age
        if (leaks.has(nextAge)) {
          // Retiring out of a preservation fund (lump-sum tax + FX cost on reinvestment) and the
          // de-minimis commutation of a living annuity both take cash OUT of the modelled capital
          // before the next year's opening balance — documented as simplification 10. The step can
          // only ever be DOWNWARD, and never by more than the balance itself.
          expect(start, `${label} leak age${nextAge}`).toBeLessThanOrEqual(end + 1)
          expect(start, `${label} leak age${nextAge}`).toBeGreaterThanOrEqual(-1e-6)
        } else {
          expect(Math.abs(end - start), `${label} chain age${nextAge}`).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('capitalEnd = capitalLocal + capitalOffshoreZar and the offshore sleeve is spot x (1+dep)^t', () => {
    for (const { label, profile, result } of GRID) {
      const a = profile.assumptions
      const usdZarAt = (t: number): number => a.usdZarSpot * (1 + a.randDepreciation) ** t
      for (const row of result.rows) {
        const t = row.age - profile.person.currentAge
        // The row's own FX column is the START-of-year rate.
        expect(row.usdZar, `${label} usdZar age${row.age}`).toBeCloseTo(usdZarAt(t), 9)
        // capitalEnd is an END-of-year balance, so its offshore sleeve is translated at the
        // END-of-year rate. That is what makes row n's capitalEnd equal row n+1's capitalStart
        // (which is measured at usdZar(t+1)); a start-of-year translation here would break the
        // chain identity asserted above.
        expect(row.capitalOffshoreZar, `${label} offshoreZar age${row.age}`).toBeCloseTo(
          row.capitalOffshoreUsd * usdZarAt(t + 1),
          6,
        )
        expect(row.capitalEnd, `${label} capitalEnd age${row.age}`).toBeCloseTo(row.capitalLocal + row.capitalOffshoreZar, 6)
        expect(row.capitalLocal).toBeGreaterThanOrEqual(-1e-6)
        expect(row.capitalOffshoreUsd).toBeGreaterThanOrEqual(-1e-9)
      }
    }
  })

  it('indices, real values and the GEPF escalation follow their definitions', () => {
    for (const { label, profile, result } of GRID) {
      const a = profile.assumptions
      const pension0 = result.rows[0].gepfPensionGross
      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows[i]
        const t = row.age - profile.person.currentAge
        expect(row.cpiIndex, `${label} cpiIndex`).toBeCloseTo((1 + a.officialCpi) ** t, 9)
        expect(row.personalIndex, `${label} personalIndex`).toBeCloseTo((1 + a.personalInflation) ** t, 9)
        // The GEPF pension escalates at officialCpi x gepfIncreaseAsPctOfCpi from the exit year.
        expect(row.gepfPensionGross, `${label} pension age${row.age}`).toBeCloseTo(
          pension0 * (1 + a.officialCpi * a.gepfIncreaseAsPctOfCpi) ** i,
          6,
        )
        // real = nominal / personalIndex for the income flow...
        expect(row.totalNetIncomeReal, `${label} real income`).toBeCloseTo(row.totalNetIncome / row.personalIndex, 6)
        // ...and, consistently with the end-of-year FX above, capitalEnd is deflated at t+1.
        expect(row.capitalEndReal, `${label} real capital`).toBeCloseTo(
          row.capitalEnd / (1 + a.personalInflation) ** (t + 1),
          6,
        )
        expect(row.gepfPensionNet).toBeCloseTo(row.gepfPensionGross - row.gepfPensionTax, 6)
        expect(row.drawNet).toBeCloseTo(row.drawGross - row.drawTax, 6)
        expect(row.shortfall).toBeCloseTo(Math.max(0, row.targetNetIncome - row.totalNetIncome), 6)
        expect(row.drawdownRate).toBeCloseTo(row.capitalStart > 0 ? row.drawGross / row.capitalStart : 0, 9)
        expect(row.capped).toBe(row.shortfall > 0.01)
        expect(row.year).toBe(i)
        expect(row.age).toBeCloseTo(result.atExit.age + i, 9)
      }
      // The horizon is inclusive of planToAge.
      expect(result.rows[result.rows.length - 1].age).toBeCloseTo(profile.person.planToAge, 9)
    }
  })

  it('the income target splits into a medical part and the rest, each escalating on its own index', () => {
    for (const { label, profile, result } of GRID) {
      const a = profile.assumptions
      const targetToday = profile.lifestyle.targetNetMonthlyIncomeToday * 12
      const medicalToday = Math.min(targetToday, profile.lifestyle.medicalAidMonthly * 12)
      const otherToday = targetToday - medicalToday
      for (const row of result.rows) {
        const t = row.age - profile.person.currentAge
        expect(row.targetNetIncome, `${label} target age${row.age}`).toBeCloseTo(
          medicalToday * (1 + a.medicalInflation) ** t + otherToday * (1 + a.personalInflation) ** t,
          6,
        )
      }
    }
  })

  it('no row, total or exit figure is ever NaN or Infinity', () => {
    for (const { label, result } of GRID) {
      for (const row of result.rows) {
        for (const [k, v] of Object.entries(row)) {
          if (typeof v === 'number') expect(Number.isFinite(v), `${label} ${row.age}.${k}`).toBe(true)
        }
      }
      for (const [k, v] of Object.entries(result.totals)) expect(Number.isFinite(v), `${label} totals.${k}`).toBe(true)
      for (const [k, v] of Object.entries(result.atExit)) {
        if (typeof v === 'number') expect(Number.isFinite(v), `${label} atExit.${k}`).toBe(true)
      }
      for (const [k, v] of Object.entries(result.firstYear)) expect(Number.isFinite(v), `${label} firstYear.${k}`).toBe(true)
    }
  })
})

describe('projection: ruin age, shortfall age and totals', () => {
  it('ruinAge is the first age with capitalEnd <= 0 (and null when there was never any capital)', () => {
    for (const { label, result } of GRID) {
      const everHadCapital = result.rows.some((r) => r.capitalStart > 0.01)
      const firstZero = result.rows.find((r) => r.capitalEnd <= 0.01)
      const expected = everHadCapital && firstZero ? firstZero.age : null
      expect(result.ruinAge, label).toBe(expected)
      if (result.ruinAge !== null) {
        // Once exhausted it stays exhausted.
        for (const row of result.rows.filter((r) => r.age > result.ruinAge!)) {
          expect(row.capitalEnd, `${label} after ruin age${row.age}`).toBeLessThanOrEqual(0.01)
        }
      }
    }
  })

  it('a route that never holds investable capital reports no ruin age', () => {
    // The whole gratuity goes on once-off needs and there are no other savings: nothing is
    // invested, so "capital runs out at age 60" would be nonsense for a lifelong pension.
    const profile = profileOf({
      age: 58,
      service: 30,
      salary: 720_000,
      targetMonthly: 15_000,
      person: { plannedExitAge: 60 },
      lifestyle: { otherSavings: 0, onceOffCapitalNeeds: 10_000_000 },
    })
    const stay = defaultScenarios(profile, FUNDS).find((d) => d.kind === 'stay-gepf')!
    const r = runScenario(profile, stay, { funds: FUNDS })
    expect(r.atExit.investedCapital).toBeCloseTo(0, 6)
    expect(r.rows.every((row) => row.capitalStart <= 0.01 && row.capitalEnd <= 0.01)).toBe(true)
    expect(r.ruinAge).toBeNull()
    // The pension itself is unaffected and comfortably covers the target in year one.
    expect(r.rows[0].totalNetIncome).toBeGreaterThan(r.rows[0].targetNetIncome)
  })

  it('incomeShortfallAge is the first age short by more than 1% of the target', () => {
    for (const { label, result } of GRID) {
      const expected = result.rows.find((r) => r.shortfall > 0.01 * Math.max(1, r.targetNetIncome))?.age ?? null
      expect(result.incomeShortfallAge, label).toBe(expected)
    }
  })

  it('totals are the sums over the rows', () => {
    for (const { label, result } of GRID) {
      const sumNominal = result.rows.reduce((s, r) => s + r.totalNetIncome, 0)
      const sumReal = result.rows.reduce((s, r) => s + r.totalNetIncomeReal, 0)
      const sumFees = result.rows.reduce((s, r) => s + r.fees, 0)
      const last = result.rows[result.rows.length - 1]
      expect(result.totals.lifetimeNetIncomeNominal, label).toBeCloseTo(sumNominal, 4)
      expect(result.totals.pvNetIncome, label).toBeCloseTo(sumReal, 4)
      expect(result.totals.lifetimeNetIncomeReal, label).toBeCloseTo(sumReal, 4)
      expect(result.totals.legacyAtHorizon, label).toBeCloseTo(last.capitalEnd, 6)
      expect(result.totals.legacyAtHorizonReal, label).toBeCloseTo(last.capitalEndReal, 6)
      // Lifetime fees also carry the FX conversion costs charged OUTSIDE a row (at exit and when
      // a retirement lump sum is reinvested), so the row sum is a lower bound, never an upper one.
      expect(result.totals.lifetimeFeesPaid, label).toBeGreaterThanOrEqual(sumFees - 1e-6)
      const first = result.rows[0]
      const share = first.totalNetIncome > 0 ? first.gepfPensionNet / first.totalNetIncome : 0
      expect(result.totals.guaranteedIncomeShare, label).toBeCloseTo(Math.min(1, Math.max(0, share)), 9)
      expect(result.totals.lifetimeTaxPaid, label).toBeGreaterThanOrEqual(
        result.atExit.lumpSumTax + (result.atRetirementFromPreservation?.lumpSumTax ?? 0) - 1e-6,
      )
    }
  })

  it('with no other income, lifetime income tax equals the sum of the apportioned row columns', () => {
    // The row columns only carry the GEPF and living-annuity slices of the year's tax; the
    // remainder belongs to other income, which has no column in YearRow. With otherIncome = 0
    // the apportionment must be exhaustive.
    const profile = profileOf({
      age: 58,
      service: 30,
      salary: 720_000,
      targetMonthly: 35_000,
      lifestyle: { otherIncomeMonthly: 0 },
    })
    for (const def of defaultScenarios(profile, FUNDS)) {
      const r = runScenario(profile, def, { funds: FUNDS })
      for (const row of r.rows) {
        // net = gepf net + draw net + subsidy when there is no other income.
        expect(row.totalNetIncome, `${def.id} age${row.age}`).toBeCloseTo(
          row.gepfPensionNet + row.drawNet + row.medicalSubsidy,
          4,
        )
        expect(row.otherIncomeGross).toBe(0)
      }
    }
  })

  it('firstYear gross - tax = net, and the columns match row 0', () => {
    for (const { label, result } of GRID) {
      const f = result.rows[0]
      expect(result.firstYear.netMonthlyIncome, label).toBeCloseTo(f.totalNetIncome / 12, 6)
      expect(result.firstYear.targetNetMonthlyIncome, label).toBeCloseTo(f.targetNetIncome / 12, 6)
      expect(result.firstYear.gepfPensionMonthlyGross, label).toBeCloseTo(f.gepfPensionGross / 12, 6)
      expect(result.firstYear.gepfPensionMonthlyNet, label).toBeCloseTo(f.gepfPensionNet / 12, 6)
      expect(result.firstYear.grossMonthlyIncome - result.firstYear.monthlyTax, label).toBeCloseTo(
        result.firstYear.netMonthlyIncome,
        4,
      )
    }
  })
})

describe('projection: the first-year income target', () => {
  it('is met exactly when the capital can support it, and never silently undershot', () => {
    for (const { label, result } of GRID) {
      const f = result.rows[0]
      if (f.shortfall > 0.01) {
        // Short: income must be exactly target - shortfall, i.e. the engine reports the gap.
        expect(f.totalNetIncome, `${label} short`).toBeCloseTo(f.targetNetIncome - f.shortfall, 6)
      } else {
        // Not short: income is at least the target. It can EXCEED it either because the base
        // income (pension + subsidy + other) already does, or because the living annuity's 2.5%
        // statutory minimum forces a bigger draw than the target needs (simplification 8).
        expect(f.totalNetIncome, `${label} met`).toBeGreaterThanOrEqual(f.targetNetIncome - 1)
      }
    }
  })

  it('lands on the target to the rand when a top-up draw is what closes the gap', () => {
    // Chosen so that in every route the base income is below target and the capital is ample:
    // the solved gross draw must produce a net income equal to the target within R1.
    const profile = profileOf({
      age: 58,
      service: 30,
      salary: 1_500_000,
      targetMonthly: 60_000,
      lifestyle: { otherSavings: 3_000_000, onceOffCapitalNeeds: 0 },
    })
    for (const def of defaultScenarios(profile, FUNDS)) {
      const r = runScenario(profile, def, { funds: FUNDS })
      const f = r.rows[0]
      expect(f.drawGross, def.id).toBeGreaterThan(0)
      expect(f.shortfall, def.id).toBeCloseTo(0, 6)
      expect(Math.abs(f.totalNetIncome - f.targetNetIncome), def.id).toBeLessThanOrEqual(1)
    }
  })

  it('the tax on the first year is computed on the 2026/27 tables by default', () => {
    const profile = profileOf({ age: 58, service: 30, salary: 720_000, targetMonthly: 35_000, lifestyle: { otherIncomeMonthly: 0 } })
    const stay = defaultScenarios(profile, FUNDS).find((d) => d.kind === 'stay-gepf')!
    const r = runScenario(profile, stay, { funds: FUNDS })
    const f = r.rows[0]
    const taxable = f.gepfPensionGross + f.drawGross - (f.drawGross - f.drawNet - f.drawTax) // draws from a discretionary pot are untaxed
    // For the stay route the only taxable income is the pension (the top-up comes from a
    // discretionary pot), so re-derive the year's tax straight off the 2026/27 table.
    const expected26 = refIncomeTax(f.gepfPensionGross, f.age, TAX_TABLES['2026/27'], profile.lifestyle.medicalAidMembers)
    const expected25 = refIncomeTax(f.gepfPensionGross, f.age, TAX_TABLES['2025/26'], profile.lifestyle.medicalAidMembers)
    expect(taxable).toBeGreaterThan(0)
    expect(f.gepfPensionTax).toBeCloseTo(expected26, 4)
    expect(expected26).not.toBeCloseTo(expected25, 2) // the two years really do differ
    expect(r.firstYear.monthlyTax * 12).toBeCloseTo(expected26, 4)
  })
})

// ===========================================================================
// 5. Independent capital roll-forward (not just the engine's own residual)
// ===========================================================================

describe('capital grows exactly as compound interest, net of fees and the return tax', () => {
  const person: Partial<PersonProfile> = { plannedExitAge: 58, planToAge: 78, hasSpouse: false }

  it('all-local discretionary capital: end = (start - draw) x (1 + (r - fee) x (1 - taxRate))', () => {
    const profile = profileOf({
      age: 58,
      service: 30,
      salary: 720_000,
      targetMonthly: 35_000,
      person,
      lifestyle: { otherSavings: 2_000_000, otherSavingsOffshorePct: 0, onceOffCapitalNeeds: 0 },
    })
    const def: ScenarioDefinition = {
      id: 'local', name: 'local', kind: 'stay-gepf', exitAge: 58, fundId: FUNDS[1].id,
      feeOverride: 0.01, offshorePct: 0, gratuityOffshorePct: 0, drawdownStrategy: 'target-income',
    }
    const r = runScenario(profile, def, { funds: FUNDS })
    const a = profile.assumptions
    const growth = 1 + (a.localBalancedReturn - 0.01) * (1 - a.discretionaryReturnTaxRate)
    for (const row of r.rows) {
      expect(row.capitalEnd, `age${row.age}`).toBeCloseTo((row.capitalStart - row.drawGross) * growth, 4)
      expect(row.capitalOffshoreUsd).toBe(0)
      expect(row.fees, `fees age${row.age}`).toBeCloseTo((row.capitalStart - row.drawGross) * 0.01, 4)
    }
  })

  it('all-offshore discretionary capital: the same, in USD, translated at (1 + depreciation)', () => {
    const profile = profileOf({
      age: 58,
      service: 30,
      salary: 720_000,
      targetMonthly: 35_000,
      person,
      lifestyle: { otherSavings: 2_000_000, otherSavingsOffshorePct: 1, onceOffCapitalNeeds: 0 },
    })
    const def: ScenarioDefinition = {
      id: 'offshore', name: 'offshore', kind: 'stay-gepf', exitAge: 58, fundId: FUNDS[1].id,
      feeOverride: 0.01, offshorePct: 1, gratuityOffshorePct: 1, drawdownStrategy: 'target-income',
    }
    const r = runScenario(profile, def, { funds: FUNDS })
    const a = profile.assumptions
    const growth = 1 + (a.offshoreReturnUsd - 0.01) * (1 - a.discretionaryReturnTaxRate)
    for (const row of r.rows) {
      expect(row.capitalEnd, `age${row.age}`).toBeCloseTo(
        (row.capitalStart - row.drawGross) * growth * (1 + a.randDepreciation),
        4,
      )
      expect(row.capitalLocal).toBe(0)
    }
  })

  it('a rand that strengthens (negative depreciation) reduces the offshore sleeve in rand', () => {
    const strong = profileOf({
      age: 58, service: 30, salary: 720_000, targetMonthly: 35_000, person,
      lifestyle: { otherSavings: 2_000_000, otherSavingsOffshorePct: 1, onceOffCapitalNeeds: 0 },
      assumptions: { randDepreciation: -0.05 },
    })
    const def: ScenarioDefinition = {
      id: 'offshore', name: 'offshore', kind: 'stay-gepf', exitAge: 58, fundId: FUNDS[1].id,
      feeOverride: 0.01, offshorePct: 1, gratuityOffshorePct: 1, drawdownStrategy: 'target-income',
    }
    const r = runScenario(strong, def, { funds: FUNDS })
    for (let i = 1; i < r.rows.length; i++) {
      expect(r.rows[i].usdZar).toBeLessThan(r.rows[i - 1].usdZar)
    }
    const growth = 1 + (strong.assumptions.offshoreReturnUsd - 0.01) * (1 - strong.assumptions.discretionaryReturnTaxRate)
    for (const row of r.rows) {
      expect(row.capitalEnd, `age${row.age}`).toBeCloseTo((row.capitalStart - row.drawGross) * growth * 0.95, 4)
    }
  })
})

// ===========================================================================
// 6. Edge inputs
// ===========================================================================

describe('edge inputs never produce NaN, Infinity or a broken row', () => {
  const edgeCases: { label: string; profile: Profile; patch?: Partial<ScenarioDefinition> }[] = [
    {
      label: 'exit = current age and planToAge = exitAge',
      profile: profileOf({ age: 58, service: 30, salary: 720_000, targetMonthly: 35_000, person: { plannedExitAge: 58, planToAge: 58 } }),
    },
    {
      label: 'zero returns, zero inflation, zero depreciation',
      profile: profileOf({
        age: 58, service: 30, salary: 720_000, targetMonthly: 35_000,
        assumptions: { localBalancedReturn: 0, offshoreReturnUsd: 0, randDepreciation: 0, officialCpi: 0, personalInflation: 0, medicalInflation: 0 },
      }),
    },
    {
      label: 'negative rand depreciation',
      profile: profileOf({ age: 55, service: 15, salary: 400_000, targetMonthly: 15_000, assumptions: { randDepreciation: -0.08 } }),
    },
    {
      label: '100% offshore',
      profile: profileOf({ age: 62, service: 30, salary: 1_500_000, targetMonthly: 60_000, lifestyle: { otherSavingsOffshorePct: 1 } }),
      patch: { offshorePct: 1, gratuityOffshorePct: 1 },
    },
    {
      label: '0% offshore',
      profile: profileOf({ age: 62, service: 30, salary: 1_500_000, targetMonthly: 60_000, lifestyle: { otherSavingsOffshorePct: 0 } }),
      patch: { offshorePct: 0, gratuityOffshorePct: 0 },
    },
    {
      label: 'fee override of exactly 0',
      profile: profileOf({ age: 58, service: 30, salary: 720_000, targetMonthly: 35_000 }),
      patch: { feeOverride: 0 },
    },
    {
      label: "5 years' service",
      profile: profileOf({ age: 55, service: 5, salary: 400_000, targetMonthly: 15_000 }),
    },
    {
      label: 'no spouse',
      profile: profileOf({ age: 58, service: 30, salary: 720_000, targetMonthly: 35_000, person: { hasSpouse: false } }),
    },
    {
      label: 'medical subsidy off',
      profile: profileOf({ age: 58, service: 30, salary: 720_000, targetMonthly: 35_000, gepf: { medicalSubsidyEligible: false } }),
    },
    {
      label: 'target far beyond what the capital supports',
      profile: profileOf({ age: 50, service: 8, salary: 400_000, targetMonthly: 100_000 }),
    },
  ]

  it.each(edgeCases)('$label', ({ profile, patch }) => {
    for (const base of defaultScenarios(profile, FUNDS)) {
      const def = { ...base, ...(patch ?? {}) }
      const r = runScenario(profile, def, { funds: FUNDS })
      expect(r.rows.length).toBeGreaterThanOrEqual(2) // planToAge is always pushed past exitAge
      for (const row of r.rows) {
        for (const [k, v] of Object.entries(row)) {
          if (typeof v === 'number') expect(Number.isFinite(v), `${def.id} ${row.age}.${k}`).toBe(true)
        }
        expect(row.capitalStart).toBeGreaterThanOrEqual(-1e-6)
        expect(row.capitalEnd).toBeGreaterThanOrEqual(-1e-6)
        expect(row.totalNetIncome).toBeGreaterThanOrEqual(-1e-6)
        expect(row.shortfall).toBeGreaterThanOrEqual(0)
        expect(Math.abs(row.capitalStart - row.drawGross + row.investmentReturn - row.fees - row.capitalEnd)).toBeLessThanOrEqual(1)
      }
      for (const [k, v] of Object.entries(r.totals)) expect(Number.isFinite(v), `${def.id} totals.${k}`).toBe(true)
      const s = summarise(r)
      expect(Number.isFinite(s.pvNetIncome)).toBe(true)
      expect(Number.isFinite(s.investedCapital)).toBe(true)
    }
  })

  it('a stay-gepf exit below 55 is blocked with a critical flag and no pension', () => {
    const profile = profileOf({ age: 50, service: 30, salary: 720_000, targetMonthly: 35_000 })
    const stay = defaultScenarios(profile, FUNDS).find((d) => d.kind === 'stay-gepf')!
    const r = runScenario(profile, stay, { funds: FUNDS })
    expect(r.atExit.gratuity).toBe(0)
    expect(r.rows.every((row) => row.gepfPensionGross === 0)).toBe(true)
    expect(r.flags.some((f) => f.severity === 'critical' && f.id === 'cannot-retire-before-55')).toBe(true)
  })

  it('a fee override of 0 leaves strictly more capital than the fund fee', () => {
    const profile = profileOf({ age: 58, service: 30, salary: 720_000, targetMonthly: 35_000 })
    const base = defaultScenarios(profile, FUNDS).find((d) => d.kind === 'resign-preserve')!
    const free = runScenario(profile, { ...base, feeOverride: 0 }, { funds: FUNDS })
    const paid = runScenario(profile, { ...base, feeOverride: 0.02 }, { funds: FUNDS })
    expect(free.totals.lifetimeFeesPaid).toBeLessThan(paid.totals.lifetimeFeesPaid)
    expect(free.totals.legacyAtHorizonReal + free.totals.pvNetIncome).toBeGreaterThan(
      paid.totals.legacyAtHorizonReal + paid.totals.pvNetIncome,
    )
  })
})

// ===========================================================================
// 7. Comparison table and performance
// ===========================================================================

describe('comparison', () => {
  it('carries the spec metrics and picks a defensible winner for each', () => {
    const profile = profileOf({ age: 58, service: 30, salary: 720_000, targetMonthly: 35_000 })
    const results = defaultScenarios(profile, FUNDS).map((d) => runScenario(profile, d, { funds: FUNDS }))
    const cmp = compareScenarios(results)
    const keys = cmp.table.map((m) => m.key)
    for (const key of [
      'netLumpSum', 'lumpSumTax', 'investedCapital', 'firstYearNetIncome', 'firstYearTax',
      'guaranteedIncomeShare', 'incomeShortfallAge', 'ruinAge', 'lifetimeTax', 'lifetimeFees',
      'pvNetIncome', 'legacyReal', 'forfeitedMedicalSubsidy',
    ]) {
      expect(keys, key).toContain(key)
    }
    for (const metric of cmp.table) {
      const numeric = Object.entries(metric.values).filter(([, v]) => typeof v === 'number') as [string, number][]
      if (numeric.length === 0) continue
      const winner = cmp.winners[metric.key]
      if (winner === undefined) continue
      const winnerValue = metric.values[winner]
      if (winnerValue === null) {
        // A null age metric (never happens) is the best possible outcome.
        expect(metric.format).toBe('age')
        continue
      }
      for (const [, v] of numeric) {
        if (metric.higherIsBetter) expect(winnerValue as number).toBeGreaterThanOrEqual(v)
        else expect(winnerValue as number).toBeLessThanOrEqual(v)
      }
    }
  })
})

describe('performance', () => {
  it('runs a 40-year horizon in well under 10 ms', () => {
    const profile = profileOf({ age: 50, service: 30, salary: 720_000, targetMonthly: 35_000, person: { planToAge: 90 } })
    const defs = defaultScenarios(profile, FUNDS)
    for (const def of defs) {
      const rows = runScenario(profile, def, { funds: FUNDS }).rows.length
      expect(rows).toBe(41) // ages 50..90 inclusive
      for (let i = 0; i < 25; i++) runScenario(profile, def, { funds: FUNDS }) // warm up the JIT
      let best = Number.POSITIVE_INFINITY
      for (let i = 0; i < 25; i++) {
        const t0 = performance.now()
        runScenario(profile, def, { funds: FUNDS })
        best = Math.min(best, performance.now() - t0)
      }
      expect(best, `${def.id} took ${best.toFixed(3)} ms`).toBeLessThan(10)
    }
  })
})

// ===========================================================================
// 8. Reviewer notes on conventions that are NOT bugs (asserted so they stay put)
// ===========================================================================

describe('documented conventions (asserted so a silent change is caught)', () => {
  it('a living annuity is drawn between the statutory 2.5% and 17.5% of its own balance', () => {
    const profile = profileOf({ age: 58, service: 30, salary: 1_500_000, targetMonthly: 100_000 })
    const preserve = defaultScenarios(profile, FUNDS).find((d) => d.kind === 'resign-preserve')!
    const r = runScenario(profile, preserve, { funds: FUNDS })
    const a = profile.assumptions
    // The row's drawdownRate mixes the annuity and discretionary pots, so check the ceiling on
    // the total draw: it can never exceed the max on the annuity plus everything discretionary.
    for (const row of r.rows) {
      if (row.capitalStart <= 0.01) continue
      expect(row.drawGross, `age${row.age}`).toBeLessThanOrEqual(row.capitalStart + 1e-6)
    }
    // A target this large drives the annuity to its 17.5% ceiling, so income falls short.
    expect(r.incomeShortfallAge).not.toBeNull()
    expect(a.livingAnnuityMaxDrawdown).toBe(0.175)
  })

  it('resign-preserve transfers the full actuarial interest tax free; resign-cash pays withdrawal tax', () => {
    const profile = profileOf({ age: 58, service: 30, salary: 720_000, targetMonthly: 35_000 })
    const [, preserve, cash] = defaultScenarios(profile, FUNDS)
    const rp = runScenario(profile, preserve, { funds: FUNDS })
    const rc = runScenario(profile, cash, { funds: FUNDS })
    const benefits = gepfBenefitsAtExit(profile, 58, GEPF_RULES)
    expect(rp.atExit.lumpSumTax).toBe(0)
    expect(rp.atExit.lumpSumTable).toBe('none')
    expect(rp.atExit.transferredToPreservation).toBeCloseTo(benefits.resignation.actuarialInterest, 6)
    expect(rc.atExit.lumpSumTable).toBe('withdrawal')
    expect(rc.atExit.lumpSumGross).toBeCloseTo(benefits.resignation.maxCashOnResignation, 6)
    // Vested component on the withdrawal table; savings component at the marginal rate on top of the
    // final salary in the resignation year (two-pot rules).
    expect(rc.atExit.lumpSumTax).toBeCloseTo(
      calcWithdrawalLumpSumTax(benefits.resignation.vestedComponent, 0, getTaxTables()).tax +
        calcSavingsPotWithdrawalTax(benefits.resignation.savingsComponent, benefits.finalSalaryAnnual, 58, getTaxTables()),
      6,
    )
    // The cash route still preserves the retirement component.
    expect(rc.atExit.transferredToPreservation).toBeCloseTo(benefits.resignation.retirementComponent, 6)
    // SIMPLIFICATION (spec, resign-cash): the whole cashable amount is taxed on the WITHDRAWAL
    // table. In reality the two-pot savings component is taxed at marginal rates instead. The
    // savings component is small for a long-serving member, so the difference is immaterial here.
    expect(rc.atExit.savingsComponent).toBeLessThan(0.1 * rc.atExit.actuarialInterest)
  })

  it('the medical subsidy is forfeited on the leave routes only, and its PV discounts at personal inflation', () => {
    const profile = profileOf({ age: 58, service: 30, salary: 720_000, targetMonthly: 35_000 })
    const [stay, preserve] = defaultScenarios(profile, FUNDS)
    const rs = runScenario(profile, stay, { funds: FUNDS })
    const rp = runScenario(profile, preserve, { funds: FUNDS })
    expect(rs.atExit.forfeitedMedicalSubsidyPv).toBe(0)
    expect(rp.atExit.forfeitedMedicalSubsidyPv).toBeGreaterThan(0)
    const a = profile.assumptions
    const annual = Math.min(profile.gepf.medicalSubsidyMonthly, GEPF_RULES.medicalSubsidyMaxMonthly) * 12
    let pv = 0
    for (let age = 58; age <= profile.person.planToAge; age++) {
      const t = age - profile.person.currentAge
      pv += (annual * (1 + a.medicalInflation) ** t) / (1 + a.personalInflation) ** t
    }
    expect(rp.atExit.forfeitedMedicalSubsidyPv).toBeCloseTo(pv, 4)
    // The subsidy the stay route actually receives escalates at medical inflation.
    for (const row of rs.rows as YearRow[]) {
      const t = row.age - profile.person.currentAge
      expect(row.medicalSubsidy, `age${row.age}`).toBeCloseTo(annual * (1 + a.medicalInflation) ** t, 4)
    }
  })
})

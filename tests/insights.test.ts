/**
 * Pros / cons and risk-flag tests (src/engine/insights.ts).
 *
 * The point of these functions is that the copy is SPECIFIC: every bullet and every flag must
 * quote this member's rand amounts, rates, ages and shares rather than the generic text in
 * `RISK_LIBRARY`. The assertions below check the numbers that appear in the strings against the
 * numbers in the `ScenarioResult`, so a wrong figure fails the test rather than reading well.
 *
 * Fixture: the same 60-year-old, 30 years' service, R600,000 salary member as
 * tests/projection.test.ts (see that file for the hand-computed GEPF and SARS figures).
 */
import { describe, expect, it } from 'vitest'
import type { Assumptions, GepfMembership, LifestyleInputs, PersonProfile, Profile, RiskFlag, ScenarioResult } from '../src/engine/types'
import { prosCons, riskFlags } from '../src/engine/insights'
import { defaultScenarios, runScenario } from '../src/engine/projection'
import { getGepfRules } from '../src/engine/gepf'
import { getTaxTables } from '../src/engine/tax'
import { formatRand } from '../src/engine/money'
import { RISK_LIBRARY } from '../src/data/caseStudies'
import { FUNDS } from '../src/data/funds'

const T = getTaxTables('2025/26')
const RULES = getGepfRules()

const PERSON: PersonProfile = {
  name: 'Test Member',
  currentAge: 60,
  sex: 'other',
  plannedExitAge: 60,
  planToAge: 90,
  hasSpouse: true,
  spouseAge: 58,
  spousePensionPct: 50,
}
const GEPF: GepfMembership = {
  pensionableServiceYearsNow: 30,
  pensionableSalaryAnnual: 600_000,
  salaryGrowth: 0.055,
  serviceYearsBeforeTwoPot: 25,
  medicalSubsidyEligible: true,
  medicalSubsidyMonthly: 4_000,
  statement: undefined,
  useStatementValues: false,
  previousLumpSumsWithdrawal: 0,
  previousLumpSumsRetirement: 0,
}
const LIFESTYLE: LifestyleInputs = {
  targetNetMonthlyIncomeToday: 35_000,
  essentialsMonthly: 18_000,
  discretionaryMonthly: 8_000,
  medicalAidMonthly: 6_500,
  medicalAidMembers: 2,
  housing: 'owned',
  housingCostMonthly: 2_500,
  dependants: 0,
  otherIncomeMonthly: 0,
  otherIncomeEscalation: 0.045,
  otherSavings: 500_000,
  otherSavingsOffshorePct: 0.2,
  debtOutstanding: 0,
  onceOffCapitalNeeds: 0,
  legacyGoal: 0,
  riskTolerance: 'balanced',
  spendingImportedShare: 0.3,
}
const ASSUMPTIONS: Assumptions = {
  taxYear: '2025/26',
  officialCpi: 0.05,
  personalInflation: 0.075,
  medicalInflation: 0.095,
  gepfIncreaseAsPctOfCpi: 1,
  usdZarSpot: 18,
  randDepreciation: 0.05,
  usInflation: 0.03,
  localBalancedReturn: 0.1,
  localCashReturn: 0.075,
  offshoreReturnUsd: 0.075,
  offshoreFee: 0.006,
  fxConversionCost: 0.005,
  livingAnnuityMinDrawdown: 0.025,
  livingAnnuityMaxDrawdown: 0.175,
  discretionaryReturnTaxRate: 0.12,
  returnVolatility: 0.14,
}

interface ProfilePatch {
  person?: Partial<PersonProfile>
  gepf?: Partial<GepfMembership>
  lifestyle?: Partial<LifestyleInputs>
  assumptions?: Partial<Assumptions>
}

function base(patch: ProfilePatch = {}): Profile {
  return {
    person: { ...PERSON, ...patch.person },
    gepf: { ...GEPF, ...patch.gepf },
    lifestyle: { ...LIFESTYLE, ...patch.lifestyle },
    assumptions: { ...ASSUMPTIONS, ...patch.assumptions },
  }
}

function run(profile: Profile, id: 'stay' | 'preserve' | 'cash'): ScenarioResult {
  const def = defaultScenarios(profile, FUNDS).find((d) => d.id === id)!
  return runScenario(profile, def, { tables: T, rules: RULES, funds: FUNDS })
}

/** The exact string the insights put on screen for a rand amount. */
function rand(value: number): string {
  return formatRand(value)
}

function byId(flags: RiskFlag[], id: string): RiskFlag | undefined {
  return flags.find((f) => f.id === id)
}

const PROFILE = base()
const STAY = run(PROFILE, 'stay')
const PRESERVE = run(PROFILE, 'preserve')
const CASH = run(PROFILE, 'cash')

describe('prosCons', () => {
  it('gives every route pros and cons, all of them concrete', () => {
    for (const r of [STAY, PRESERVE, CASH]) {
      const { pros, cons } = prosCons(r, PROFILE, RULES)
      expect(pros.length, r.kind).toBeGreaterThanOrEqual(3)
      expect(cons.length, r.kind).toBeGreaterThanOrEqual(3)
      for (const line of [...pros, ...cons]) {
        expect(line.length, line).toBeGreaterThan(40)
        expect(line).not.toMatch(/NaN|undefined|Infinity/)
        // Every bullet carries a number: a rand amount, a percentage or an age.
        expect(/R\s?[\d  ]+|\d+(\.\d+)?%|age \d+/.test(line), line).toBe(true)
      }
    }
  })

  it('quotes the stay route’s actual pension, PAYE and gratuity tax', () => {
    const { pros, cons } = prosCons(STAY, PROFILE, RULES)
    const text = pros.join(' | ')
    expect(text).toContain(rand(STAY.firstYear.gepfPensionMonthlyGross)) // R27 303 a month
    expect(text).toContain(rand(STAY.firstYear.gepfPensionMonthlyNet))
    expect(text).toContain(rand(STAY.atExit.lumpSumTax)) // R163 206 on the retirement table
    // The guaranteed-income share is quoted exactly as the projection computed it.
    expect(text).toContain(`${(STAY.totals.guaranteedIncomeShare * 100).toFixed(1)}%`)
    expect(text).toMatch(/spouse keeps 50%/)
    // The pension loses purchasing power because increases (5%) lag personal inflation (7.5%).
    expect(cons.join(' | ')).toMatch(/lag your personal inflation of 7\.5%/)
  })

  it('quantifies the early-retirement reduction only when there is one', () => {
    const early = run(base({ person: { currentAge: 57, plannedExitAge: 57 } }), 'stay')
    const cons = prosCons(early, base({ person: { currentAge: 57, plannedExitAge: 57 } }), RULES).cons.join(' | ')
    expect(cons).toContain('36 months before 60') // 3 years x 12
    expect(cons).toContain('88.0%') // 1 - 36/300
    expect(prosCons(STAY, PROFILE, RULES).cons.join(' | ')).not.toContain('months before 60')
  })

  it('quantifies the withdrawal tax and the medical subsidy the leave routes give up', () => {
    const cashCons = prosCons(CASH, PROFILE, RULES).cons.join(' | ')
    expect(cashCons).toContain(rand(CASH.atExit.lumpSumTax))
    expect(cashCons).toContain(rand(CASH.atExit.lumpSumGross))
    expect(cashCons).toMatch(/withdrawal table|Withdrawal tax/)
    for (const r of [PRESERVE, CASH]) {
      const cons = prosCons(r, PROFILE, RULES).cons.join(' | ')
      expect(cons).toMatch(/forfeit the post-retirement medical subsidy/)
      // The PV is quoted in compact form, e.g. "R1.34m".
      expect(cons).toContain(`R${(r.atExit.forfeitedMedicalSubsidyPv / 1_000_000).toFixed(2)}m`)
    }
  })

  it('names the 1 October 2025 factor cut with both values', () => {
    const cons = prosCons(PRESERVE, PROFILE, RULES).cons.join(' | ')
    expect(cons).toContain('1 October 2025')
    expect(cons).toContain(rand(PRESERVE.atExit.actuarialInterest))
    expect(cons).toContain('15.0%') // the 2025 factors are 85% of the 2021 factors
  })

  it('compares the drawdown rate with the 4–5% sustainable range', () => {
    const cons = prosCons(PRESERVE, PROFILE, RULES).cons.join(' | ')
    const row = PRESERVE.rows.find((r) => r.drawGross > 1 && r.capitalStart > 1)!
    expect(cons).toContain(`${(row.drawdownRate * 100).toFixed(1)}%`)
    expect(cons).toMatch(/above the 4%–5% rate usually considered sustainable/)
    // A 3% draw is described as inside the range instead.
    const easyProfile = base({ gepf: { pensionableServiceYearsNow: 35, pensionableSalaryAnnual: 900_000 }, lifestyle: { targetNetMonthlyIncomeToday: 15_000 } })
    const easy = run(easyProfile, 'preserve')
    expect(prosCons(easy, easyProfile, RULES).cons.join(' | ')).toMatch(/inside the 4%–5% sustainable range/)
  })

  it('reports the offshore share and the legacy in today’s rand', () => {
    const pros = prosCons(CASH, PROFILE, RULES).pros.join(' | ')
    expect(pros).toContain(rand(CASH.atExit.investedOffshoreZar))
    // The blended offshore share of all the capital (70% of the invested cash, 45% of the
    // preserved retirement component and 20% of other savings), rounded as shown.
    const share = CASH.atExit.investedOffshoreZar / CASH.atExit.investedCapital
    expect(pros).toContain(`${(share * 100).toFixed(0)}%`)
    expect(share).toBeGreaterThan(0.5)
    // The legacy bullet appears only when there is capital left at the horizon.
    expect(CASH.totals.legacyAtHorizon).toBeLessThanOrEqual(1)
    expect(pros).not.toMatch(/belongs to your estate/)
    const easyProfile = base({ gepf: { pensionableServiceYearsNow: 35, pensionableSalaryAnnual: 900_000 }, lifestyle: { targetNetMonthlyIncomeToday: 15_000 } })
    const easy = run(easyProfile, 'cash')
    expect(prosCons(easy, easyProfile, RULES).pros.join(' | ')).toContain(rand(easy.totals.legacyAtHorizonReal))
  })

  it('says when the income target is missed and from what age', () => {
    const greedyProfile = base({ lifestyle: { targetNetMonthlyIncomeToday: 150_000 } })
    const greedy = run(greedyProfile, 'preserve')
    const cons = prosCons(greedy, greedyProfile, RULES).cons.join(' | ')
    expect(cons).toContain(`age ${greedy.incomeShortfallAge}`)
    expect(cons).toMatch(/income target is not met/)
    // And when it is met, that is a pro.
    const easyProfile = base({ gepf: { pensionableServiceYearsNow: 35, pensionableSalaryAnnual: 900_000 }, lifestyle: { targetNetMonthlyIncomeToday: 15_000 } })
    expect(prosCons(run(easyProfile, 'preserve'), easyProfile, RULES).pros.join(' | ')).toMatch(/is met every year to age 90/)
  })
})

describe('riskFlags', () => {
  it('uses the RISK_LIBRARY ids, titles and case-study links, with a rewritten detail', () => {
    for (const r of [STAY, PRESERVE, CASH]) {
      const flags = riskFlags(r, PROFILE, RULES)
      expect(flags.length, r.kind).toBeGreaterThanOrEqual(4)
      for (const flag of flags) {
        const template = RISK_LIBRARY.find((f) => f.id === flag.id)
        if (!template) continue // computed flags such as 'income-shortfall'
        expect(flag.title).toBe(template.title)
        expect(flag.caseStudyId).toBe(template.caseStudyId)
        expect(flag.appliesTo).toEqual(template.appliesTo)
        expect(flag.detail, flag.id).not.toBe(template.detail) // personalised, not the template
        expect(flag.detail.length).toBeGreaterThan(60)
        expect(flag.detail).not.toMatch(/NaN|undefined|Infinity/)
      }
    }
  })

  it('flags the right risks per route', () => {
    const stay = riskFlags(STAY, PROFILE, RULES).map((f) => f.id)
    expect(stay).toContain('sovereign-domestic-debt')
    expect(stay).toContain('inflation-erosion')
    expect(stay).toContain('currency-collapse')
    expect(stay).not.toContain('withdrawal-tax')
    expect(stay).not.toContain('medical-subsidy-forfeit')

    const preserve = riskFlags(PRESERVE, PROFILE, RULES).map((f) => f.id)
    expect(preserve).toEqual(expect.arrayContaining(['medical-subsidy-forfeit', 'factor-revision-2025', 'sequence-risk', 'longevity-risk', 'capital-controls', 'fees-drag']))
    expect(preserve).not.toContain('withdrawal-tax')
    expect(preserve).not.toContain('sovereign-domestic-debt')

    const cash = riskFlags(CASH, PROFILE, RULES).map((f) => f.id)
    expect(cash).toContain('withdrawal-tax')
    expect(cash).toContain('rand-strength') // 70% offshore
  })

  it('puts this member’s numbers in the details', () => {
    const withdrawal = byId(riskFlags(CASH, PROFILE, RULES), 'withdrawal-tax')!
    expect(withdrawal.detail).toContain(rand(CASH.atExit.lumpSumTax))
    expect(withdrawal.detail).toContain(rand(CASH.atExit.lumpSumGross))
    expect(withdrawal.severity).toBe('critical') // > 25% effective rate

    const subsidy = byId(riskFlags(PRESERVE, PROFILE, RULES), 'medical-subsidy-forfeit')!
    expect(subsidy.detail).toContain(`R${(PRESERVE.atExit.forfeitedMedicalSubsidyPv / 1_000_000).toFixed(2)}m`)
    expect(subsidy.detail).toContain('9.5%') // medical inflation

    const factors = byId(riskFlags(PRESERVE, PROFILE, RULES), 'factor-revision-2025')!
    expect(factors.detail).toContain('1 October 2025')
    expect(factors.detail).toContain(rand(PRESERVE.atExit.actuarialInterest))

    const sequence = byId(riskFlags(PRESERVE, PROFILE, RULES), 'sequence-risk')!
    const row = PRESERVE.rows.find((r) => r.drawGross > 1 && r.capitalStart > 1)!
    expect(sequence.detail).toContain(`${(row.drawdownRate * 100).toFixed(1)}%`)
    expect(sequence.detail).toContain('10.0%') // local return assumption

    const sovereign = byId(riskFlags(STAY, PROFILE, RULES), 'sovereign-domestic-debt')!
    expect(sovereign.detail).toContain(`${(STAY.totals.guaranteedIncomeShare * 100).toFixed(1)}%`)
    expect(sovereign.detail).toContain('trillion') // GEPF assets, not "R2690.00bn"
  })

  it('raises the severity when the numbers are bad and lowers it when they are not', () => {
    const early = base({ person: { currentAge: 55, plannedExitAge: 55 } })
    const penalty = byId(riskFlags(run(early, 'stay'), early, RULES), 'early-retirement-penalty')!
    expect(penalty.severity).toBe('critical') // 60 months early -> 80% of the benefit
    expect(penalty.detail).toContain('60 months before 60')

    const greedyProfile = base({ lifestyle: { targetNetMonthlyIncomeToday: 150_000 } })
    const greedy = run(greedyProfile, 'preserve')
    expect(byId(riskFlags(greedy, greedyProfile, RULES), 'longevity-risk')!.severity).toBe('critical')
    expect(byId(riskFlags(greedy, greedyProfile, RULES), 'longevity-risk')!.detail).toContain(`age ${greedy.ruinAge}`)

    const easyProfile = base({ gepf: { pensionableServiceYearsNow: 35, pensionableSalaryAnnual: 900_000 }, lifestyle: { targetNetMonthlyIncomeToday: 15_000 } })
    const easy = run(easyProfile, 'preserve')
    expect(byId(riskFlags(easy, easyProfile, RULES), 'longevity-risk')!.severity).toBe('warning')
    expect(byId(riskFlags(easy, easyProfile, RULES), 'sequence-risk')!.severity).toBe('warning') // draw inside 4-5%
  })

  it('orders flags critical, then warning, then info', () => {
    for (const r of [STAY, PRESERVE, CASH]) {
      const rank = { critical: 0, warning: 1, info: 2 }
      const severities = riskFlags(r, PROFILE, RULES).map((f) => rank[f.severity])
      expect(severities, r.kind).toEqual([...severities].sort((a, b) => a - b))
    }
  })

  it('adds a shortfall flag with the monthly gap', () => {
    const greedyProfile = base({ lifestyle: { targetNetMonthlyIncomeToday: 150_000 } })
    const greedy = run(greedyProfile, 'preserve')
    const flag = byId(riskFlags(greedy, greedyProfile, RULES), 'income-shortfall')!
    const row = greedy.rows.find((r) => r.age === greedy.incomeShortfallAge)!
    expect(flag.severity).toBe('critical')
    expect(flag.detail).toContain(rand(row.shortfall / 12))
    expect(flag.detail).toContain(rand(row.targetNetIncome / 12))
    // No shortfall -> no flag.
    const easyProfile = base({ gepf: { pensionableServiceYearsNow: 35, pensionableSalaryAnnual: 900_000 }, lifestyle: { targetNetMonthlyIncomeToday: 15_000 } })
    expect(byId(riskFlags(run(easyProfile, 'preserve'), easyProfile, RULES), 'income-shortfall')).toBeUndefined()
  })

  it('flags that retirement is impossible below 55', () => {
    const young = base({ person: { currentAge: 50, plannedExitAge: 50 } })
    const flags = run(young, 'stay').flags
    const blocked = byId(flags, 'cannot-retire-before-55')!
    expect(blocked.severity).toBe('critical')
    expect(flags[0]!.id).toBe('cannot-retire-before-55') // critical flags come first
    expect(blocked.detail).toMatch(/only retire from age 55/)
  })
})

describe('runScenario wiring', () => {
  it('populates pros, cons and flags on every result', () => {
    for (const r of [STAY, PRESERVE, CASH]) {
      expect(r.pros, r.kind).toEqual(prosCons(r, PROFILE, RULES).pros)
      expect(r.cons, r.kind).toEqual(prosCons(r, PROFILE, RULES).cons)
      expect(r.flags.map((f) => f.id)).toEqual(expect.arrayContaining(riskFlags(r, PROFILE, RULES).map((f) => f.id)))
      expect(r.notes.length).toBeGreaterThan(2)
    }
  })

  it('never emits NaN, undefined or Infinity for degenerate inputs', () => {
    const nonsense = base({
      person: { currentAge: Number.NaN, plannedExitAge: Number.NaN, planToAge: Number.NaN, hasSpouse: false },
      gepf: { pensionableSalaryAnnual: Number.NaN, pensionableServiceYearsNow: 0, medicalSubsidyMonthly: Number.NaN },
      lifestyle: { otherSavings: 0, targetNetMonthlyIncomeToday: 0, medicalAidMonthly: Number.NaN },
      assumptions: { personalInflation: Number.POSITIVE_INFINITY, usdZarSpot: 0, localBalancedReturn: Number.NaN },
    })
    for (const id of ['stay', 'preserve', 'cash'] as const) {
      const r = run(nonsense, id)
      for (const line of [...r.pros, ...r.cons, ...r.notes, ...r.flags.map((f) => `${f.title} ${f.detail}`)]) {
        expect(line, `${id}: ${line}`).not.toMatch(/NaN|undefined|Infinity/)
      }
    }
  })
})

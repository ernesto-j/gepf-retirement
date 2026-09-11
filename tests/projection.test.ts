/**
 * Scenario simulation tests (src/engine/projection.ts).
 *
 * The fixture profile is deliberately explicit and self-contained (it does not use
 * src/data/defaults.ts) so that changes to the app defaults cannot silently move the
 * hand-computed expectations below.
 *
 * FIXTURE (`base()`): age 60 TODAY, exit at 60 (so t = 0 at exit and every inflation index is
 * exactly 1.0 in year 0), 30 years of pensionable service, R600,000 pensionable salary, no
 * salary growth to exit (n = 0 -> final salary = R600,000), plan to 90, R35,000/month net
 * target of which R6,500/month is medical aid, R500,000 of other savings, no other income,
 * no once-off capital needs and no previous lump sums.
 *
 * Hand-computed from the GEPF formulas and the SARS 2025/26 tables:
 *   gratuity     = 0.0672 x 600,000 x 30                  = R1,209,600
 *   annuity      = 600,000 x 30 / 55 + 360                 = R327,632.7272… p.a. (R27,302.73/m)
 *   gratuity tax = 143,550 + 36% x (1,209,600 - 1,155,000) = R163,206      (retirement table)
 *   gratuity net = 1,209,600 - 163,206                     = R1,046,394
 *   PAYE at 60 on the pension, 2 medical members:
 *     42,678 + 26% x (327,632.73 - 237,100) = 66,216.51 gross tax
 *     - 17,235 primary rebate - 2 x 364 x 12 medical credit = R40,245.51 tax
 *     -> net pension R287,387.22 p.a.
 *   medical subsidy = min(4,000, rules.medicalSubsidyMaxMonthly) x 12, escalating at 9.5%
 */
import { describe, expect, it } from 'vitest'
import type {
  Assumptions,
  GepfMembership,
  LifestyleInputs,
  PersonProfile,
  Profile,
  ScenarioDefinition,
  ScenarioResult,
} from '../src/engine/types'
import { compareScenarios, defaultScenarios, runScenario, summarise } from '../src/engine/projection'
import { calcIncomeTax, calcRetirementLumpSumTax, calcSavingsPotWithdrawalTax, calcWithdrawalLumpSumTax, getTaxTables } from '../src/engine/tax'
import { gepfBenefitsAtExit, getGepfRules } from '../src/engine/gepf'
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

/** The three core routes for a profile, keyed by id. */
function routes(profile: Profile): Record<string, ScenarioDefinition> {
  const out: Record<string, ScenarioDefinition> = {}
  for (const d of defaultScenarios(profile, FUNDS)) out[d.id] = d
  return out
}

function run(profile: Profile, id: 'stay' | 'preserve' | 'cash', patch: Partial<ScenarioDefinition> = {}): ScenarioResult {
  const def = { ...routes(profile)[id]!, ...patch } as ScenarioDefinition
  return runScenario(profile, def, { tables: T, rules: RULES, funds: FUNDS })
}

/** Fails with the path of the first non-finite number (or NaN-ish string) found. */
function expectAllFinite(value: unknown, path = 'result'): void {
  if (typeof value === 'number') {
    expect(Number.isFinite(value), `${path} is ${value}`).toBe(true)
    return
  }
  if (typeof value === 'string') {
    expect(value.includes('NaN') || value.includes('undefined') || value.includes('Infinity'), `${path} = ${value}`).toBe(false)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => expectAllFinite(v, `${path}[${i}]`))
    return
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) expectAllFinite(v, `${path}.${k}`)
  }
}

// ---------------------------------------------------------------------------

describe('defaultScenarios', () => {
  const defs = defaultScenarios(base(), FUNDS)

  it('returns the three core routes with the ids and names the UI keys off', () => {
    expect(defs.map((d) => d.id)).toEqual(['stay', 'preserve', 'cash'])
    expect(defs.map((d) => d.name)).toEqual([
      'Stay: retire from GEPF',
      'Leave: preserve & living annuity',
      'Leave: cash out & invest offshore',
    ])
    expect(defs.map((d) => d.kind)).toEqual(['stay-gepf', 'resign-preserve', 'resign-cash'])
  })

  it('uses the documented parameters per route', () => {
    const [stay, preserve, cash] = defs
    expect(stay!.gratuityOffshorePct).toBe(0.3)
    expect(preserve!.fundId).toBe('10x-your-future') // DEFAULT_FUND_ID
    expect(preserve!.offshorePct).toBe(0.5)
    expect(preserve!.lumpSumAtRetirementPct).toBeCloseTo(1 / 3, 12)
    expect(preserve!.drawdownStrategy).toBe('target-income')
    expect(cash!.cashOutFraction).toBe(1)
    expect(cash!.offshorePct).toBe(0.7)
    for (const d of defs) {
      expect(d.exitAge).toBe(60)
      expect(FUNDS.some((f) => f.id === d.fundId)).toBe(true)
    }
    // Retirement from a preservation fund is never before 55.
    expect(defaultScenarios(base({ person: { currentAge: 45, plannedExitAge: 45 } }), FUNDS)[1]!.retireFromPreservationAge).toBe(55)
  })
})

describe('stay-gepf at exit', () => {
  const profile = base()
  const r = run(profile, 'stay')
  const benefits = gepfBenefitsAtExit(profile, 60, RULES)

  it('pays exactly the GEPF engine annuity in year 0 (service net of the savings-component share)', () => {
    expect(r.rows[0]!.gepfPensionGross).toBeCloseTo(benefits.retirement.annuityAnnual, 9)
    // Two-pot: 5 of the 30 years fall after 1 Sept 2024; one third of those (the savings-component
    // service) is excluded from the annuity, so annuity service = 30 - 5/3 = 28.333 years.
    const annuity = (600_000 * (30 - 5 / 3)) / 55 + 360
    expect(r.rows[0]!.gepfPensionGross).toBeCloseTo(annuity, 6)
    expect(r.firstYear.gepfPensionMonthlyGross).toBeCloseTo(annuity / 12, 4)
    expect(benefits.retirement.reductionFactor).toBe(1) // no early-retirement reduction at 60
  })

  it('taxes the gratuity on the retirement table: R1,209,600 -> R163,206 tax', () => {
    expect(r.atExit.gratuity).toBeCloseTo(1_209_600, 6)
    expect(r.atExit.lumpSumGross).toBeCloseTo(1_209_600, 6)
    expect(r.atExit.lumpSumTable).toBe('retirement')
    expect(r.atExit.lumpSumTax).toBeCloseTo(163_206, 6)
    expect(r.atExit.lumpSumTax).toBeCloseTo(calcRetirementLumpSumTax(1_209_600, 0, T).tax, 9)
    expect(r.atExit.lumpSumNet).toBeCloseTo(1_046_394, 6)
    // Net gratuity + other savings are invested, less the 0.5% FX cost on the rand converted
    // offshore (30% of the gratuity and 20% of the other savings).
    const fxCost = 1_046_394 * 0.3 * 0.005 + 500_000 * 0.2 * 0.005
    expect(r.atExit.investedCapital).toBeCloseTo(1_046_394 + 500_000 - fxCost, 6)
    expect(fxCost).toBeCloseTo(2_069.591, 3)
    expect(r.atExit.transferredToPreservation).toBe(0)
    expect(r.atExit.forfeitedMedicalSubsidyPv).toBe(0)
  })

  it('applies PAYE by age and escalates the pension at CPI x gepfIncreaseAsPctOfCpi', () => {
    const tax = calcIncomeTax(benefits.retirement.annuityAnnual, 60, T, { medicalMembers: 2 })
    expect(tax.tax).toBeGreaterThan(0)
    expect(r.rows[0]!.gepfPensionTax).toBeCloseTo(tax.tax, 6)
    expect(r.rows[0]!.gepfPensionNet).toBeCloseTo(benefits.retirement.annuityAnnual - tax.tax, 3)
    // 5% CPI x 100% of CPI, compounding from year 0.
    expect(r.rows[5]!.gepfPensionGross).toBeCloseTo(r.rows[0]!.gepfPensionGross * 1.05 ** 5, 6)
    expect(r.totals.guaranteedIncomeShare).toBeCloseTo(r.rows[0]!.gepfPensionNet / r.rows[0]!.totalNetIncome, 12)
  })

  it('below 55 there is no retirement route: zero pension and a critical flag', () => {
    const young = base({ person: { currentAge: 50, plannedExitAge: 50, planToAge: 90 } })
    const r50 = run(young, 'stay')
    expect(r50.rows[0]!.gepfPensionGross).toBe(0)
    expect(r50.atExit.gratuity).toBe(0)
    expect(r50.atExit.lumpSumGross).toBe(0)
    expect(r50.totals.guaranteedIncomeShare).toBe(0)
    expect(r50.flags.some((f) => f.severity === 'critical' && f.id === 'cannot-retire-before-55')).toBe(true)
    expect(r50.notes.some((n) => n.includes('cannot retire before 55'))).toBe(true)
    expectAllFinite(r50)
  })
})

describe('resign-preserve at exit', () => {
  const profile = base()
  const r = run(profile, 'preserve')
  const benefits = gepfBenefitsAtExit(profile, 60, RULES)

  it('transfers the full actuarial interest tax-free', () => {
    expect(r.atExit.lumpSumTax).toBe(0)
    expect(r.atExit.lumpSumGross).toBe(0)
    expect(r.atExit.lumpSumTable).toBe('none')
    expect(r.atExit.transferredToPreservation).toBeCloseTo(benefits.resignation.actuarialInterest, 9)
    expect(r.atExit.actuarialInterest).toBeCloseTo(benefits.resignation.actuarialInterest, 9)
    const fxCost = benefits.resignation.actuarialInterest * T.reg28.maxOffshore * 0.005 + 500_000 * 0.2 * 0.005
    expect(r.atExit.investedCapital).toBeCloseTo(benefits.resignation.actuarialInterest + 500_000 - fxCost, 6)
  })

  it('caps the preservation fund at the Regulation 28 offshore limit, then lifts it in the living annuity', () => {
    // Flat markets: the sleeves cannot drift during the year, so the end-of-year offshore share
    // is exactly the share the yearly rebalance set.
    const flat = base({
      person: { currentAge: 55, plannedExitAge: 55 },
      lifestyle: { otherSavings: 0, targetNetMonthlyIncomeToday: 5_000, medicalAidMonthly: 0 },
      assumptions: { localBalancedReturn: 0, offshoreReturnUsd: 0, randDepreciation: 0, personalInflation: 0, medicalInflation: 0, officialCpi: 0 },
    })
    const wide = run(flat, 'preserve', { offshorePct: 0.9, retireFromPreservationAge: 60, lumpSumAtRetirementPct: 0, feeOverride: 0 })
    const inPreservation = wide.rows[0]!
    expect(inPreservation.capitalOffshoreZar / inPreservation.capitalEnd).toBeCloseTo(T.reg28.maxOffshore, 9)
    expect(wide.notes.some((n) => n.includes('Regulation 28'))).toBe(true)
    const inAnnuity = wide.rows.find((row) => row.age === 62)!
    expect(inAnnuity.capitalOffshoreZar / inAnnuity.capitalEnd).toBeCloseTo(0.9, 9)
  })

  it('takes at most one third as a lump sum at retirement, on the retirement table', () => {
    const e = r.atRetirementFromPreservation!
    expect(e.age).toBe(60)
    expect(e.lumpSumGross).toBeCloseTo(e.preservationValue / 3, 6)
    expect(e.lumpSumTax).toBeCloseTo(calcRetirementLumpSumTax(e.lumpSumGross, 0, T).tax, 6)
    expect(e.intoLivingAnnuity).toBeCloseTo(e.preservationValue - e.lumpSumGross, 6)
    // A request above one third is clamped.
    const greedy = run(profile, 'preserve', { lumpSumAtRetirementPct: 0.9 })
    expect(greedy.atRetirementFromPreservation!.lumpSumGross).toBeCloseTo(greedy.atRetirementFromPreservation!.preservationValue / 3, 6)
  })

  it('reports the forfeited medical subsidy as a present value in today’s rand', () => {
    // 31 payments (ages 60..90) of 4,029 x 12 escalating at 9.5%, discounted at 7.5%; t = 0 at exit.
    let pv = 0
    for (let i = 0; i <= 30; i++) pv += (Math.min(4_000, RULES.medicalSubsidyMaxMonthly) * 12 * 1.095 ** i) / 1.075 ** i
    expect(r.atExit.forfeitedMedicalSubsidyPv).toBeCloseTo(pv, 6)
    expect(r.atExit.forfeitedMedicalSubsidyPv).toBeGreaterThan(0)
    // Not eligible -> nothing forfeited.
    expect(run(base({ gepf: { medicalSubsidyEligible: false } }), 'preserve').atExit.forfeitedMedicalSubsidyPv).toBe(0)
  })

  it('cannot touch the preserved money in the gap years before 55', () => {
    const early = run(base({ person: { currentAge: 50, plannedExitAge: 50 }, lifestyle: { otherSavings: 0 } }), 'preserve')
    for (const row of early.rows.filter((x) => x.age < 55)) {
      expect(row.drawGross).toBe(0)
      expect(row.shortfall).toBeGreaterThan(0)
    }
    expect(early.rows.find((x) => x.age === 55)!.drawGross).toBeGreaterThan(0)
    expect(early.incomeShortfallAge).toBe(50)
  })
})

describe('resign-cash at exit', () => {
  const profile = base()
  const r = run(profile, 'cash')
  const benefits = gepfBenefitsAtExit(profile, 60, RULES)

  it('taxes the cash on the withdrawal table with aggregation', () => {
    const maxCash = benefits.resignation.maxCashOnResignation
    expect(r.atExit.lumpSumGross).toBeCloseTo(maxCash, 9) // cashOutFraction = 1
    expect(r.atExit.lumpSumTable).toBe('withdrawal')
    // Two-pot: vested component on the withdrawal table; savings component at the marginal rate on top of
    // the final salary in the resignation year.
    const vested = benefits.resignation.vestedComponent
    const savings = benefits.resignation.savingsComponent
    const expectedTax =
      calcWithdrawalLumpSumTax(vested, 0, T).tax + calcSavingsPotWithdrawalTax(savings, benefits.finalSalaryAnnual, profile.person.plannedExitAge, T)
    expect(r.atExit.lumpSumTax).toBeCloseTo(expectedTax, 6)
    expect(r.atExit.lumpSumNet).toBeCloseTo(maxCash - r.atExit.lumpSumTax, 9)
    // Withdrawal tax is far worse than the retirement table on the same amount.
    expect(r.atExit.lumpSumTax).toBeGreaterThan(calcRetirementLumpSumTax(maxCash, 0, T).tax)
  })

  it('aggregates with previous lump sums', () => {
    const withPrevious = run(base({ gepf: { previousLumpSumsWithdrawal: 300_000 } }), 'cash')
    const vested = benefits.resignation.vestedComponent
    const savings = benefits.resignation.savingsComponent
    const expectedTax =
      calcWithdrawalLumpSumTax(vested, 300_000, T).tax + calcSavingsPotWithdrawalTax(savings, benefits.finalSalaryAnnual, profile.person.plannedExitAge, T)
    expect(withPrevious.atExit.lumpSumTax).toBeCloseTo(expectedTax, 6)
    expect(withPrevious.atExit.lumpSumTax).toBeGreaterThan(r.atExit.lumpSumTax)
  })

  it('preserves the retirement component (plus any cash not taken) into a living annuity', () => {
    expect(r.atExit.transferredToPreservation).toBeCloseTo(benefits.resignation.retirementComponent, 9)
    const half = run(profile, 'cash', { cashOutFraction: 0.5 })
    expect(half.atExit.lumpSumGross).toBeCloseTo(benefits.resignation.maxCashOnResignation / 2, 9)
    expect(half.atExit.transferredToPreservation).toBeCloseTo(
      benefits.resignation.maxCashOnResignation / 2 + benefits.resignation.retirementComponent,
      9,
    )
    expect(half.atRetirementFromPreservation!.intoLivingAnnuity).toBeGreaterThan(0)
  })

  it('subtracts once-off capital needs from the cash before investing it', () => {
    const withNeeds = run(base({ lifestyle: { onceOffCapitalNeeds: 400_000 } }), 'cash')
    // R400,000 less is invested, and 70% of it is no longer converted offshore at 0.5%.
    expect(withNeeds.atExit.investedCapital).toBeCloseTo(r.atExit.investedCapital - 400_000 + 400_000 * 0.7 * 0.005, 4)
    // More than the cash available: the rest comes off other savings, the preserved retirement
    // component cannot be touched, and the unfunded remainder is noted.
    const huge = run(base({ lifestyle: { onceOffCapitalNeeds: 50_000_000 } }), 'cash')
    // Only the preserved retirement component is left, less the FX cost on its offshore slice.
    expect(huge.atExit.investedCapital).toBeCloseTo(
      huge.atExit.transferredToPreservation * (1 - T.reg28.maxOffshore * 0.005),
      6,
    )
    expect(huge.notes.some((n) => n.includes('could not be funded'))).toBe(true)
  })

  it('forfeits the medical subsidy just like resign-preserve', () => {
    expect(r.atExit.forfeitedMedicalSubsidyPv).toBeGreaterThan(0)
    expect(r.rows.every((row) => row.medicalSubsidy === 0)).toBe(true)
  })
})

describe('year-by-year mechanics', () => {
  const profile = base()

  it('totals reconcile with the rows (Σ totalNetIncome = lifetimeNetIncomeNominal)', () => {
    for (const id of ['stay', 'preserve', 'cash'] as const) {
      const r = run(profile, id)
      const sum = r.rows.reduce((s, row) => s + row.totalNetIncome, 0)
      expect(Math.abs(sum - r.totals.lifetimeNetIncomeNominal), id).toBeLessThan(1)
      const pv = r.rows.reduce((s, row) => s + row.totalNetIncome / row.personalIndex, 0)
      expect(Math.abs(pv - r.totals.pvNetIncome), id).toBeLessThan(1)
      expect(r.totals.legacyAtHorizon).toBeCloseTo(r.rows[r.rows.length - 1]!.capitalEnd, 6)
    }
  })

  it('capital rolls forward exactly: start + return - fees - draws = end', () => {
    for (const id of ['stay', 'preserve', 'cash'] as const) {
      const r = run(profile, id)
      for (const row of r.rows) {
        const end = row.capitalStart + row.investmentReturn - row.fees - row.drawGross
        expect(Math.abs(end - row.capitalEnd), `${id} age ${row.age}`).toBeLessThan(1e-6 * Math.max(1, row.capitalStart))
        expect(row.capitalEnd).toBeCloseTo(row.capitalLocal + row.capitalOffshoreZar, 6)
        expect(row.drawdownRate).toBeCloseTo(row.capitalStart > 0 ? row.drawGross / row.capitalStart : 0, 12)
      }
    }
  })

  it('runs from the exit age to the horizon with indices measured from today', () => {
    const r = run(base({ person: { currentAge: 55, plannedExitAge: 60, planToAge: 90 } }), 'stay')
    expect(r.rows[0]!.age).toBe(60)
    expect(r.rows[r.rows.length - 1]!.age).toBe(90)
    expect(r.rows).toHaveLength(31)
    // t = 5 in the exit year because the member is 55 today.
    expect(r.rows[0]!.cpiIndex).toBeCloseTo(1.05 ** 5, 12)
    expect(r.rows[0]!.personalIndex).toBeCloseTo(1.075 ** 5, 12)
    expect(r.rows[0]!.usdZar).toBeCloseTo(18 * 1.05 ** 5, 12)
  })

  it('splits the income target into a medical part and a non-medical part', () => {
    const r = run(profile, 'stay')
    // (6,500 x 12) at 9.5% medical inflation + (28,500 x 12) at 7.5% personal inflation.
    expect(r.rows[0]!.targetNetIncome).toBeCloseTo(35_000 * 12, 9)
    expect(r.rows[10]!.targetNetIncome).toBeCloseTo(6_500 * 12 * 1.095 ** 10 + 28_500 * 12 * 1.075 ** 10, 6)
    // Without medical aid the whole target escalates at personal inflation.
    const noMedical = run(base({ lifestyle: { medicalAidMonthly: 0 } }), 'stay')
    expect(noMedical.rows[10]!.targetNetIncome).toBeCloseTo(35_000 * 12 * 1.075 ** 10, 6)
  })

  it('taxes the GEPF pension, the living-annuity draw and other income, and nothing else', () => {
    // Living annuity only (no discretionary pot): every rand drawn is taxable, so the row's tax
    // is exactly the tax on pension + other income + draw, apportioned pro rata.
    const p = base({ lifestyle: { otherIncomeMonthly: 5_000, otherSavings: 0, targetNetMonthlyIncomeToday: 20_000, medicalAidMonthly: 0 } })
    const r = run(p, 'preserve', { lumpSumAtRetirementPct: 0 })
    const row = r.rows[0]!
    expect(row.otherIncomeGross).toBeCloseTo(5_000 * 12, 9)
    const expected = calcIncomeTax(row.otherIncomeGross + row.drawGross, 60, T, { medicalMembers: 2 })
    expect(row.drawTax).toBeCloseTo((expected.tax * row.drawGross) / (row.otherIncomeGross + row.drawGross), 6)
    expect(row.totalNetIncome).toBeCloseTo(row.otherIncomeGross + row.drawGross - expected.tax, 6)
    expect(row.totalNetIncome).toBeCloseTo(row.targetNetIncome, 2)
    // The medical subsidy is not taxed and only the stay route receives it.
    const stay = run(p, 'stay').rows[0]!
    expect(stay.medicalSubsidy).toBeGreaterThan(0)
    expect(stay.totalNetIncome).toBeCloseTo(
      stay.gepfPensionGross + stay.otherIncomeGross + stay.drawGross - stay.gepfPensionTax - stay.drawTax - otherIncomeTax(stay) + stay.medicalSubsidy,
      6,
    )
  })

  it('holds the offshore share exactly on target after the yearly rebalance', () => {
    // Zero returns, zero depreciation and no fee: growth cannot move the sleeves, so the share
    // seen at the end of each year is the share set by the rebalance (0.5), FX cost included.
    const flat = base({
      lifestyle: { otherSavings: 0, targetNetMonthlyIncomeToday: 10_000, medicalAidMonthly: 0 },
      assumptions: { localBalancedReturn: 0, offshoreReturnUsd: 0, randDepreciation: 0, personalInflation: 0, medicalInflation: 0, officialCpi: 0 },
    })
    const r = run(flat, 'preserve', { offshorePct: 0.5, lumpSumAtRetirementPct: 0, feeOverride: 0 })
    for (const row of r.rows) {
      if (row.capitalEnd <= 1) continue
      expect(Math.abs(row.capitalOffshoreZar / row.capitalEnd - 0.5), `age ${row.age}`).toBeLessThan(1e-6)
    }
    // 100% and 0% offshore are handled too.
    for (const share of [0, 1]) {
      const edge = run(flat, 'preserve', { offshorePct: share, lumpSumAtRetirementPct: 0, feeOverride: 0 })
      const row = edge.rows[3]!
      expect(Math.abs(row.capitalOffshoreZar / row.capitalEnd - share)).toBeLessThan(1e-6)
      expectAllFinite(edge)
    }
  })

  it('charges the FX conversion cost once, on rand converted offshore', () => {
    const noFx = run(base({ assumptions: { fxConversionCost: 0 } }), 'cash')
    const withFx = run(base({ assumptions: { fxConversionCost: 0.05 } }), 'cash')
    expect(withFx.totals.lifetimeFeesPaid).toBeGreaterThan(noFx.totals.lifetimeFeesPaid)
    // 70% of the invested cash converted at 5% is the bulk of the difference in year 0.
    expect(withFx.rows[0]!.capitalOffshoreZar).toBeLessThan(noFx.rows[0]!.capitalOffshoreZar)
  })

  it('does not tax returns inside a retirement fund but does on discretionary money', () => {
    const taxedProfile = base({ assumptions: { discretionaryReturnTaxRate: 0.4 } })
    const preserveTax = run(taxedProfile, 'preserve')
    const preserveNoTax = run(base({ assumptions: { discretionaryReturnTaxRate: 0 } }), 'preserve')
    // Some of the preserve route's capital is discretionary (other savings + the lump sum), so
    // the return tax bites; none of it applies to the living annuity itself.
    expect(preserveTax.totals.lifetimeTaxPaid).toBeGreaterThan(preserveNoTax.totals.lifetimeTaxPaid)
    const laOnly = run(base({ lifestyle: { otherSavings: 0 }, assumptions: { discretionaryReturnTaxRate: 0.4 } }), 'preserve', {
      lumpSumAtRetirementPct: 0,
    })
    const laOnlyNoTax = run(base({ lifestyle: { otherSavings: 0 }, assumptions: { discretionaryReturnTaxRate: 0 } }), 'preserve', {
      lumpSumAtRetirementPct: 0,
    })
    expect(laOnly.totals.legacyAtHorizon).toBeCloseTo(laOnlyNoTax.totals.legacyAtHorizon, 6)
  })
})

/** The part of a row's income tax that was apportioned to other income. */
function otherIncomeTax(row: { gepfPensionGross: number; drawGross: number; otherIncomeGross: number; gepfPensionTax: number; drawTax: number }): number {
  const taxable = row.gepfPensionGross + row.drawGross + row.otherIncomeGross
  if (taxable <= 0) return 0
  const perRand = (row.gepfPensionTax + row.drawTax) / Math.max(row.gepfPensionGross + row.drawGross, 1e-9)
  return row.gepfPensionGross + row.drawGross > 0 ? perRand * row.otherIncomeGross : 0
}

describe('ruin age and income shortfall', () => {
  it('is null when the target is modest (R15,000 a month = a ~3% drawdown, returns above inflation)', () => {
    const easy = base({
      gepf: { pensionableServiceYearsNow: 35, pensionableSalaryAnnual: 900_000 },
      lifestyle: { targetNetMonthlyIncomeToday: 15_000, medicalAidMonthly: 3_000 },
    })
    expect(run(easy, 'preserve').rows[0]!.drawdownRate).toBeLessThan(0.04)
    for (const id of ['stay', 'preserve', 'cash'] as const) {
      const r = run(easy, id)
      expect(r.ruinAge, id).toBeNull()
      expect(r.incomeShortfallAge, id).toBeNull()
      expect(r.rows.every((row) => row.shortfall < 1), id).toBe(true)
      expect(r.totals.legacyAtHorizon, id).toBeGreaterThan(0)
    }
  })

  it('falls inside the horizon when the target is far above what the capital supports (R150,000 a month)', () => {
    const greedy = base({ lifestyle: { targetNetMonthlyIncomeToday: 150_000, medicalAidMonthly: 6_500 } })
    for (const id of ['stay', 'preserve', 'cash'] as const) {
      const r = run(greedy, id)
      expect(r.ruinAge, id).not.toBeNull()
      expect(r.ruinAge!, id).toBeGreaterThanOrEqual(60)
      expect(r.ruinAge!, id).toBeLessThanOrEqual(90)
      expect(r.incomeShortfallAge, id).not.toBeNull()
      expect(r.rows.some((row) => row.capped), id).toBe(true)
    }
  })

  it('the 17.5% living-annuity cap forces the shortfall and sets capped', () => {
    // No other savings, no lump sum: the living annuity is the only pot, so the drawdown rate
    // is exactly the 17.5% ceiling once the target exceeds what the cap allows.
    const capped = base({ lifestyle: { targetNetMonthlyIncomeToday: 150_000, otherSavings: 0, medicalAidMonthly: 0 } })
    const r = run(capped, 'preserve', { lumpSumAtRetirementPct: 0 })
    const row = r.rows[0]!
    expect(row.drawdownRate).toBeCloseTo(0.175, 12)
    expect(row.shortfall).toBeGreaterThan(0)
    expect(row.capped).toBe(true)
    expect(r.incomeShortfallAge).toBe(60)
    // Lifting the cap removes it.
    const uncapped = run(base({ lifestyle: { targetNetMonthlyIncomeToday: 150_000, otherSavings: 0, medicalAidMonthly: 0 }, assumptions: { livingAnnuityMaxDrawdown: 1 } }), 'preserve', {
      lumpSumAtRetirementPct: 0,
    })
    expect(uncapped.rows[0]!.shortfall).toBe(0)
    expect(uncapped.rows[0]!.capped).toBe(false)
  })

  it('enforces the 2.5% minimum drawdown even when the target does not need it', () => {
    const rich = base({ lifestyle: { targetNetMonthlyIncomeToday: 1_000, otherSavings: 0, medicalAidMonthly: 0 } })
    const r = run(rich, 'preserve', { lumpSumAtRetirementPct: 0 })
    expect(r.rows[0]!.drawdownRate).toBeCloseTo(0.025, 12)
    expect(r.rows[0]!.totalNetIncome).toBeGreaterThan(r.rows[0]!.targetNetIncome)
    expect(r.rows[0]!.shortfall).toBe(0)
  })
})

describe('edge cases and guards', () => {
  const cases: { name: string; profile: Profile; ids?: ('stay' | 'preserve' | 'cash')[] }[] = [
    { name: 'exit at 55', profile: base({ person: { currentAge: 55, plannedExitAge: 55 } }) },
    { name: 'exit at 65', profile: base({ person: { currentAge: 65, plannedExitAge: 65 } }) },
    { name: 'plan only to 70', profile: base({ person: { planToAge: 70 } }) },
    { name: 'zero growth everywhere', profile: base({ assumptions: { localBalancedReturn: 0, offshoreReturnUsd: 0, randDepreciation: 0, officialCpi: 0, personalInflation: 0, medicalInflation: 0 } }) },
    { name: 'five years of service', profile: base({ gepf: { pensionableServiceYearsNow: 5, serviceYearsBeforeTwoPot: 3 } }) },
    { name: 'no other savings', profile: base({ lifestyle: { otherSavings: 0 } }) },
    { name: 'no capital at all', profile: base({ lifestyle: { otherSavings: 0, onceOffCapitalNeeds: 5_000_000 } }) },
    { name: 'negative returns', profile: base({ assumptions: { localBalancedReturn: -0.1, offshoreReturnUsd: -0.1 } }) },
    { name: 'exit age before today', profile: base({ person: { currentAge: 62, plannedExitAge: 58 } }) },
    { name: 'nonsense numbers', profile: base({ person: { currentAge: Number.NaN }, gepf: { pensionableSalaryAnnual: Number.NaN }, assumptions: { personalInflation: Number.POSITIVE_INFINITY, usdZarSpot: 0 } }) },
  ]

  for (const c of cases) {
    it(`produces finite numbers for: ${c.name}`, () => {
      for (const id of c.ids ?? (['stay', 'preserve', 'cash'] as const)) {
        for (const offshorePct of [0, 0.5, 1]) {
          const r = run(c.profile, id, { offshorePct, gratuityOffshorePct: offshorePct })
          expectAllFinite(r, `${c.name}/${id}/${offshorePct}`)
          expect(r.rows.length).toBeGreaterThan(1)
          expect(r.rows.every((row) => row.capitalEnd >= 0)).toBe(true)
        }
      }
    })
  }

  it('extends a planning horizon that is not after the exit age, with a note', () => {
    const r = run(base({ person: { currentAge: 60, plannedExitAge: 60, planToAge: 58 } }), 'stay')
    expect(r.rows.map((row) => row.age)).toEqual([60, 61])
    expect(r.notes.some((n) => n.includes('extended to 61'))).toBe(true)
  })

  it('never throws for a fund id that does not exist', () => {
    const r = run(base(), 'preserve', { fundId: 'no-such-fund' })
    expect(r.notes.some((n) => n.includes('was not found'))).toBe(true)
    expectAllFinite(r)
  })

  it('runs a 40-year horizon in well under 10 ms', () => {
    const profile = base({ person: { currentAge: 55, plannedExitAge: 55, planToAge: 95 } })
    const def = { ...routes(profile).preserve!, retireFromPreservationAge: 60 }
    const deps = { tables: T, rules: RULES, funds: FUNDS }
    for (let i = 0; i < 20; i++) runScenario(profile, def, deps) // warm up the JIT
    const iterations = 50
    const start = performance.now()
    for (let i = 0; i < iterations; i++) runScenario(profile, def, deps)
    const perRun = (performance.now() - start) / iterations
    expect(runScenario(profile, def, deps).rows).toHaveLength(41)
    expect(perRun, `${perRun.toFixed(2)} ms per run`).toBeLessThan(10)
  })
})

describe('compareScenarios and summarise', () => {
  const profile = base()
  const results = defaultScenarios(profile, FUNDS).map((d) => runScenario(profile, d, { tables: T, rules: RULES, funds: FUNDS }))
  const comparison = compareScenarios(results)

  it('builds every documented metric row for every scenario', () => {
    expect(comparison.table.map((m) => m.key)).toEqual([
      'netLumpSum',
      'lumpSumTax',
      'investedCapital',
      'firstYearNetIncome',
      'firstYearTax',
      'guaranteedIncomeShare',
      'incomeShortfallAge',
      'ruinAge',
      'lifetimeTax',
      'lifetimeFees',
      'pvNetIncome',
      'legacyReal',
      'forfeitedMedicalSubsidy',
    ])
    for (const metric of comparison.table) {
      expect(Object.keys(metric.values).sort()).toEqual(['cash', 'preserve', 'stay'])
      expect(metric.label.length).toBeGreaterThan(3)
    }
    expect(comparison.scenarios).toHaveLength(3)
  })

  it('counts lump-sum tax across every event and picks winners by direction', () => {
    const taxRow = comparison.table.find((m) => m.key === 'lumpSumTax')!
    expect(taxRow.higherIsBetter).toBe(false)
    for (const r of results) {
      expect(taxRow.values[r.definition.id]).toBeCloseTo(r.atExit.lumpSumTax + (r.atRetirementFromPreservation?.lumpSumTax ?? 0), 6)
    }
    // The winner is whichever route pays the least in total; cash (withdrawal table) pays the most.
    const lowest = results.reduce((best, r) => ((taxRow.values[r.definition.id] as number) < (taxRow.values[best] as number) ? r.definition.id : best), results[0]!.definition.id)
    expect(comparison.winners.lumpSumTax).toBe(lowest)
    expect(results.find((r) => r.definition.id === 'preserve')!.atExit.lumpSumTax).toBe(0)
    expect(comparison.winners.guaranteedIncomeShare).toBe('stay')
    expect(comparison.winners.forfeitedMedicalSubsidy).toBe('stay')
  })

  it('treats a null ruin age as the best outcome', () => {
    const easy = base({ gepf: { pensionableServiceYearsNow: 35, pensionableSalaryAnnual: 900_000 }, lifestyle: { targetNetMonthlyIncomeToday: 15_000 } })
    const mixed = [run(easy, 'preserve'), run(base({ lifestyle: { targetNetMonthlyIncomeToday: 150_000 } }), 'cash')]
    const cmp = compareScenarios(mixed)
    expect(cmp.table.find((m) => m.key === 'ruinAge')!.values.preserve).toBeNull()
    expect(cmp.winners.ruinAge).toBe('preserve')
  })

  it('summarise mirrors the result', () => {
    const s = summarise(results[0]!)
    expect(s.id).toBe('stay')
    expect(s.kind).toBe('stay-gepf')
    expect(s.exitAge).toBe(60)
    expect(s.lumpSumNet).toBeCloseTo(results[0]!.atExit.lumpSumNet, 9)
    expect(s.pvNetIncome).toBeCloseTo(results[0]!.totals.pvNetIncome, 9)
    expect(s.ruinAge).toBe(results[0]!.ruinAge)
    expect(s.flags).toEqual(results[0]!.flags.map((f) => f.id))
    expectAllFinite(s)
  })

  it('is stable: the same inputs give the same numbers', () => {
    const again = compareScenarios(defaultScenarios(profile, FUNDS).map((d) => runScenario(profile, d, { tables: T, rules: RULES, funds: FUNDS })))
    expect(JSON.stringify(again.table)).toBe(JSON.stringify(comparison.table))
  })
})

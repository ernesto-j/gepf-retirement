/**
 * DPSA "Incentivised Early Retirement Programme (ERP) without pension penalisation and
 * Voluntary Exit Programme (VEP)" — DPSA Circular 38 of 2025 with the Determination and
 * Directive of October 2025 (s16(6) and s5(5) of the Public Service Act).
 *
 * Rules under test (src/data/gepfRules.ts -> GEPF_RULES.exitProgramme):
 *   ERP, ages 55-59 at exit: retirement WITHOUT the 1/3%-per-month early-retirement reduction,
 *     plus 2 weeks' basic salary per year for the first 20 years of pensionable service and
 *     1 week per completed year thereafter.
 *   VEP, ages 60-63 at exit: normal retirement (no reduction applies anyway) plus 2 weeks per
 *     year for the first 10 years and 1 week per completed year thereafter.
 *   Both: 10+ years' pensionable service; incentive = weeks / 52 x annual basic salary at exit;
 *     the incentive is an employer termination lump sum at 55+, i.e. a "severance benefit" taxed
 *     on the RETIREMENT lump-sum table and aggregated with the other lump sums.
 *
 * Every expected value is hand-computed; the arithmetic is in the comment above each assertion.
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
import { exitProgrammeIncentive, gepfBenefitsAtExit, getGepfRules } from '../src/engine/gepf'
import { compareScenarios, defaultScenarios, runScenario } from '../src/engine/projection'
import { calcRetirementLumpSumTax, getTaxTables } from '../src/engine/tax'
import { FUNDS } from '../src/data/funds'

const RULES = getGepfRules()
const T = getTaxTables('2025/26')

// ---------------------------------------------------------------------------
// exitProgrammeIncentive
// ---------------------------------------------------------------------------

describe('exitProgrammeIncentive', () => {
  it('ERP at 57 with 30 years on R600k: 2 x 20 + 1 x 10 = 50 weeks = R576,923.08', () => {
    // weeks = 2 x 20 (first 20 years) + 1 x 10 (the remaining completed years) = 50
    // gross = 50 / 52 x 600,000 = 0.961538461… x 600,000 = 576,923.0769…
    const r = exitProgrammeIncentive(RULES, 'erp', 57, 30, 600_000)
    expect(r.eligible).toBe(true)
    expect(r.weeks).toBe(50)
    expect(r.gross).toBeCloseTo(576_923.08, 2)
    expect(r.reason).toBeUndefined()
  })

  it('VEP at 62 with 26 years: 2 x 10 + 1 x 16 = 36 weeks', () => {
    // weeks = 2 x 10 (first 10 years) + 1 x 16 = 36; gross = 36 / 52 x 600,000 = 415,384.6153…
    const r = exitProgrammeIncentive(RULES, 'vep', 62, 26, 600_000)
    expect(r.eligible).toBe(true)
    expect(r.weeks).toBe(36)
    expect(r.gross).toBeCloseTo((36 / 52) * 600_000, 6)
    expect(r.gross).toBeCloseTo(415_384.62, 2)
  })

  it('VEP at 64 is outside the 60-63 band: not eligible, no incentive', () => {
    const r = exitProgrammeIncentive(RULES, 'vep', 64, 26, 600_000)
    expect(r.eligible).toBe(false)
    expect(r.weeks).toBe(0)
    expect(r.gross).toBe(0)
    expect(r.reason).toContain('60')
  })

  it('9 years of service fails the 10-year service test on both programmes', () => {
    for (const programme of ['erp', 'vep'] as const) {
      const r = exitProgrammeIncentive(RULES, programme, programme === 'erp' ? 57 : 62, 9, 600_000)
      expect(r.eligible).toBe(false)
      expect(r.gross).toBe(0)
      expect(r.reason).toContain('10')
    }
  })

  it('the ERP band stops at 60 and the VEP band starts there; "none"/undefined never pays', () => {
    expect(exitProgrammeIncentive(RULES, 'erp', 60, 30, 600_000).eligible).toBe(false)
    expect(exitProgrammeIncentive(RULES, 'erp', 54, 30, 600_000).eligible).toBe(false)
    // 59 years 11 months is still "59 at exit".
    expect(exitProgrammeIncentive(RULES, 'erp', 59.9, 30, 600_000).eligible).toBe(true)
    expect(exitProgrammeIncentive(RULES, 'vep', 60, 30, 600_000).eligible).toBe(true)
    expect(exitProgrammeIncentive(RULES, 'none', 57, 30, 600_000).eligible).toBe(false)
    expect(exitProgrammeIncentive(RULES, undefined, 57, 30, 600_000).eligible).toBe(false)
  })

  it('part-years count only when completed, and a NaN input never produces NaN', () => {
    // 29.9 years -> 29 completed: 2 x 20 + 1 x 9 = 49 weeks.
    expect(exitProgrammeIncentive(RULES, 'erp', 57, 29.9, 600_000).weeks).toBe(49)
    const bad = exitProgrammeIncentive(RULES, 'erp', Number.NaN, Number.NaN, Number.NaN)
    expect(bad.eligible).toBe(false)
    expect(Number.isFinite(bad.gross)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Fixture: 57 today, exiting today, 30 years' service, R600k, no salary growth
// ---------------------------------------------------------------------------

const PERSON: PersonProfile = {
  name: 'ERP Member',
  currentAge: 57,
  sex: 'other',
  plannedExitAge: 57,
  planToAge: 90,
  hasSpouse: true,
  spouseAge: 55,
  spousePensionPct: 50,
}

const GEPF: GepfMembership = {
  pensionableServiceYearsNow: 30,
  pensionableSalaryAnnual: 600_000,
  salaryGrowth: 0, // n = 0 -> final salary = salary at exit = R600,000
  serviceYearsBeforeTwoPot: 25,
  medicalSubsidyEligible: true,
  medicalSubsidyMonthly: 4_000,
  statement: undefined,
  useStatementValues: false,
  previousLumpSumsWithdrawal: 0,
  previousLumpSumsRetirement: 0,
  exitProgramme: 'none',
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

function base(gepfPatch: Partial<GepfMembership> = {}, personPatch: Partial<PersonProfile> = {}): Profile {
  return {
    person: { ...PERSON, ...personPatch },
    gepf: { ...GEPF, ...gepfPatch },
    lifestyle: LIFESTYLE,
    assumptions: ASSUMPTIONS,
  }
}

function run(profile: Profile, id: 'stay' | 'preserve' | 'cash'): ScenarioResult {
  const def = defaultScenarios(profile, FUNDS).find((d) => d.id === id) as ScenarioDefinition
  return runScenario(profile, def, { tables: T, rules: RULES, funds: FUNDS })
}

/** gratuity = 0.0672 x 600,000 x 30 = R1,209,600 (unreduced, i.e. with the ERP waiver). */
const FULL_GRATUITY = 0.0672 * 600_000 * 30
/** 50 weeks of R600,000 / 52. */
const INCENTIVE = (50 / 52) * 600_000

// ---------------------------------------------------------------------------
// gepfBenefitsAtExit: the ERP waives the early-retirement reduction
// ---------------------------------------------------------------------------

describe('gepfBenefitsAtExit with an approved ERP exit', () => {
  it('retires a 57-year-old with no reduction at all (factor 1) and reports the incentive', () => {
    const withErp = gepfBenefitsAtExit(base({ exitProgramme: 'erp' }), 57, RULES)
    expect(withErp.retirement.monthsEarly).toBe(36) // (60 - 57) x 12
    expect(withErp.retirement.reductionFactor).toBe(1)
    expect(withErp.retirement.gratuity).toBeCloseTo(FULL_GRATUITY, 6) // R1,209,600 in full
    expect(withErp.incentive.eligible).toBe(true)
    expect(withErp.incentive.weeks).toBe(50)
    expect(withErp.incentive.gross).toBeCloseTo(576_923.08, 2)
    expect(withErp.salaryAtExit).toBeCloseTo(600_000, 6)
  })

  it('without a programme the same exit is cut to 88% (36 x 1/300) and pays nothing', () => {
    const plain = gepfBenefitsAtExit(base(), 57, RULES)
    expect(plain.retirement.reductionFactor).toBeCloseTo(1 - 36 / 300, 10) // 0.88
    expect(plain.retirement.gratuity).toBeCloseTo(FULL_GRATUITY * 0.88, 6)
    expect(plain.incentive.eligible).toBe(false)
    expect(plain.incentive.gross).toBe(0)
  })

  it('the VEP does not touch the reduction (there is none at 60+) but still pays', () => {
    const vep = gepfBenefitsAtExit(base({ exitProgramme: 'vep' }, { currentAge: 62, plannedExitAge: 62 }), 62, RULES)
    expect(vep.retirement.monthsEarly).toBe(0)
    expect(vep.retirement.reductionFactor).toBe(1)
    // 30 years of service (this member is already 62, so no further service accrues):
    // 2 x 10 + 1 x 20 = 40 weeks.
    expect(vep.incentive.weeks).toBe(40)
  })

  it('an explicit deps.exemptFromEarlyReduction override still wins', () => {
    const forcedOff = gepfBenefitsAtExit(base({ exitProgramme: 'erp' }), 57, RULES, { exemptFromEarlyReduction: false })
    expect(forcedOff.retirement.reductionFactor).toBeCloseTo(0.88, 10)
    const forcedOn = gepfBenefitsAtExit(base(), 57, RULES, { exemptFromEarlyReduction: true })
    expect(forcedOn.retirement.reductionFactor).toBe(1)
  })

  it('an ERP member with only 9 years of service gets neither the waiver nor the incentive', () => {
    const short = gepfBenefitsAtExit(base({ exitProgramme: 'erp', pensionableServiceYearsNow: 9 }), 57, RULES)
    expect(short.incentive.eligible).toBe(false)
    expect(short.retirement.reductionFactor).toBeCloseTo(0.88, 10)
  })
})

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

describe('runScenario: stay-gepf with an approved ERP exit', () => {
  const erp = run(base({ exitProgramme: 'erp' }), 'stay')
  const plain = run(base(), 'stay')

  it('taxes the incentive on the retirement table aggregated AFTER the gratuity', () => {
    // T_ret(gratuity + incentive) - T_ret(gratuity), both on the 2025/26 retirement table.
    const expectedTax =
      calcRetirementLumpSumTax(FULL_GRATUITY + INCENTIVE, 0, T).tax - calcRetirementLumpSumTax(FULL_GRATUITY, 0, T).tax
    expect(erp.atExit.incentiveWeeks).toBe(50)
    expect(erp.atExit.incentiveGross).toBeCloseTo(INCENTIVE, 6)
    expect(erp.atExit.incentiveTax).toBeCloseTo(expectedTax, 6)
    expect(erp.atExit.incentiveNet).toBeCloseTo(INCENTIVE - expectedTax, 6)
    // Identical to calcRetirementLumpSumTax with the gratuity as the previous lump sum.
    expect(erp.atExit.incentiveTax).toBeCloseTo(calcRetirementLumpSumTax(INCENTIVE, FULL_GRATUITY, T).tax, 6)
    // The gratuity itself is unchanged by the incentive and is NOT reduced for early retirement.
    expect(erp.atExit.gratuity).toBeCloseTo(FULL_GRATUITY, 6)
    expect(erp.atExit.lumpSumGross).toBeCloseTo(FULL_GRATUITY, 6)
    expect(erp.atExit.lumpSumTax).toBeCloseTo(calcRetirementLumpSumTax(FULL_GRATUITY, 0, T).tax, 6)
    // ...and the incentive tax is part of the lifetime tax bill.
    expect(erp.totals.lifetimeTaxPaid).toBeGreaterThan(plain.totals.lifetimeTaxPaid)
  })

  it('invests the net incentive: capital at exit rises by exactly the net amount', () => {
    const noProgrammeButExempt = runScenario(
      base(),
      defaultScenarios(base(), FUNDS).find((d) => d.id === 'stay') as ScenarioDefinition,
      { tables: T, rules: RULES, funds: FUNDS },
    )
    expect(noProgrammeButExempt.atExit.incentiveGross).toBeUndefined()
    // The ERP route has the unreduced gratuity AND the net incentive on top.
    const gratuityNetGain =
      calcRetirementLumpSumTax(FULL_GRATUITY, 0, T).net - calcRetirementLumpSumTax(FULL_GRATUITY * 0.88, 0, T).net
    const incentiveNet = erp.atExit.incentiveNet ?? 0
    // 30% of the gratuity pot is converted offshore at a 0.5% FX spread, so the extra cash lands
    // in the pots at (1 - 0.3 x 0.005) of its face value.
    const afterFx = 1 - 0.3 * 0.005
    expect(erp.atExit.investedCapital - plain.atExit.investedCapital).toBeCloseTo((gratuityNetGain + incentiveNet) * afterFx, 4)
  })

  it('explains itself in a note and raises the exit-programme info flag', () => {
    expect(erp.notes.some((n) => n.includes('ERP') && n.includes('50 weeks') && n.includes('severance benefit'))).toBe(true)
    expect(erp.notes.some((n) => n.includes('no early-retirement reduction applied'))).toBe(true)
    expect(erp.notes.some((n) => n.includes('IRP3(a)'))).toBe(true)
    const flag = erp.flags.find((f) => f.id === 'exit-programme')
    expect(flag?.severity).toBe('info')
    expect(flag?.appliesTo).toEqual(['stay-gepf'])
    // The "you are giving up the ERP" warning is only for members who have not applied.
    expect(erp.flags.some((f) => f.id === 'exit-programme-available')).toBe(false)
    expect(plain.flags.some((f) => f.id === 'exit-programme-available')).toBe(true)
    expect(plain.atExit.incentiveGross).toBeUndefined()
  })

  it('adds a pro naming the waived penalty and the incentive', () => {
    const pro = erp.pros.find((p) => p.includes('ERP'))
    expect(pro).toBeDefined()
    expect(pro).toContain('50 weeks')
    expect(pro).toContain('NO early-retirement reduction')
  })

  it('never produces NaN anywhere in the result', () => {
    const json = JSON.stringify(erp)
    expect(json.includes('null,"incentiveGross"')).toBe(false)
    expect(json).not.toContain('NaN')
    expect(json).not.toContain('Infinity')
  })
})

describe('runScenario: the resign routes are unaffected', () => {
  for (const id of ['preserve', 'cash'] as const) {
    it(`"${id}" pays no incentive and is numerically identical with and without the ERP`, () => {
      const withErp = run(base({ exitProgramme: 'erp' }), id)
      const without = run(base(), id)
      expect(withErp.atExit.incentiveGross).toBeUndefined()
      expect(withErp.atExit.incentiveNet).toBeUndefined()
      expect(withErp.atExit.lumpSumNet).toBeCloseTo(without.atExit.lumpSumNet, 6)
      expect(withErp.atExit.lumpSumTax).toBeCloseTo(without.atExit.lumpSumTax, 6)
      expect(withErp.atExit.investedCapital).toBeCloseTo(without.atExit.investedCapital, 6)
      expect(withErp.totals.pvNetIncome).toBeCloseTo(without.totals.pvNetIncome, 6)
      expect(withErp.flags.some((f) => f.id === 'exit-programme')).toBe(false)
      expect(withErp.notes.some((n) => n.includes('applies to RETIREMENT, not resignation'))).toBe(true)
      expect(without.notes.some((n) => n.includes('applies to RETIREMENT, not resignation'))).toBe(false)
    })
  }
})

// ---------------------------------------------------------------------------
// Comparison table
// ---------------------------------------------------------------------------

describe('compareScenarios with an ERP exit', () => {
  const profile = base({ exitProgramme: 'erp' })
  const results = defaultScenarios(profile, FUNDS).map((d) => runScenario(profile, d, { tables: T, rules: RULES, funds: FUNDS }))
  const comparison = compareScenarios(results)
  const stay = results.find((r) => r.kind === 'stay-gepf') as ScenarioResult
  const row = (key: string) => comparison.table.find((m) => m.key === key)

  it('"Net lump sum at exit" adds the net incentive to the net gratuity', () => {
    const value = row('netLumpSum')?.values['stay']
    expect(value).toBeCloseTo(stay.atExit.lumpSumNet + (stay.atExit.incentiveNet ?? 0), 6)
    expect(value).toBeCloseTo(
      calcRetirementLumpSumTax(FULL_GRATUITY, 0, T).net + (INCENTIVE - calcRetirementLumpSumTax(INCENTIVE, FULL_GRATUITY, T).tax),
      4,
    )
  })

  it('"Tax on lump sums" adds the tax on the incentive', () => {
    const value = row('lumpSumTax')?.values['stay']
    expect(value).toBeCloseTo(stay.atExit.lumpSumTax + (stay.atExit.incentiveTax ?? 0), 6)
    expect(value).toBeCloseTo(calcRetirementLumpSumTax(FULL_GRATUITY + INCENTIVE, 0, T).tax, 4)
  })

  it('the resign routes still report only their own lump sums', () => {
    const preserve = results.find((r) => r.definition.id === 'preserve') as ScenarioResult
    expect(row('lumpSumTax')?.values['preserve']).toBeCloseTo(
      preserve.atExit.lumpSumTax + (preserve.atRetirementFromPreservation?.lumpSumTax ?? 0),
      6,
    )
  })
})

/**
 * Tests for `returnBasis: 'fund-history'` (docs/SPEC.md "src/engine/projection.ts" and
 * "src/engine/funds.ts"): a scenario can grow its LOCAL sleeve at the chosen fund's own
 * historic return instead of the global `localBalancedReturn` assumption.
 */
import { describe, expect, it } from 'vitest'
import type {
  Assumptions,
  FundInfo,
  GepfMembership,
  LifestyleInputs,
  PersonProfile,
  Profile,
  ScenarioDefinition,
} from '../src/engine/types'
import { fundGrossReturn } from '../src/engine/funds'
import { runScenario } from '../src/engine/projection'
import { gepfBenefitsAtExit, getGepfRules } from '../src/engine/gepf'
import { getTaxTables } from '../src/engine/tax'

const RULES = getGepfRules()
const TABLES = getTaxTables('2025/26')

function testFund(overrides: Partial<FundInfo> & { id: string }): FundInfo {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    manager: 'Test Manager',
    type: 'index',
    category: 'Test',
    ter: 0,
    tc: 0,
    tic: 0,
    platformFee: 0,
    adviceFee: 0,
    allInFee: 0.01,
    returns: { y1: null, y3: null, y5: null, y10: null },
    maxOffshore: 1,
    reg28: true,
    asOf: '2025-01-01',
    source: 'https://example.test/',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// fundGrossReturn
// ---------------------------------------------------------------------------

describe('fundGrossReturn', () => {
  it('grosses the net 10-year fact-sheet return back up by TER: 9.9% + 0.52% = 10.42%', () => {
    const f = testFund({ id: 'x10', ter: 0.0052, returns: { y1: null, y3: 0.08, y5: 0.09, y10: 0.099 } })
    expect(fundGrossReturn(f)).toBeCloseTo(0.1042, 10)
  })

  it('falls back to y5, then y3, when the longer horizons are missing', () => {
    const f5 = testFund({ id: 'x5', ter: 0.01, returns: { y1: null, y3: 0.08, y5: 0.09, y10: null } })
    expect(fundGrossReturn(f5)).toBeCloseTo(0.1, 10) // 0.09 + 0.01

    const f3 = testFund({ id: 'x3', ter: 0.01, returns: { y1: null, y3: 0.08, y5: null, y10: null } })
    expect(fundGrossReturn(f3)).toBeCloseTo(0.09, 10) // 0.08 + 0.01
  })

  it('returns null when the fund has no historic return at all', () => {
    const f = testFund({ id: 'none', returns: { y1: null, y3: null, y5: null, y10: null } })
    expect(fundGrossReturn(f)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// runScenario with returnBasis: 'fund-history'
// ---------------------------------------------------------------------------

const PERSON: PersonProfile = {
  currentAge: 60,
  sex: 'other',
  plannedExitAge: 60,
  planToAge: 61,
  hasSpouse: false,
  spousePensionPct: 50,
}

const GEPF: GepfMembership = {
  pensionableServiceYearsNow: 30,
  pensionableSalaryAnnual: 600_000,
  salaryGrowth: 0.055,
  serviceYearsBeforeTwoPot: 25,
  medicalSubsidyEligible: false,
  medicalSubsidyMonthly: 0,
  statement: undefined,
  useStatementValues: false,
  previousLumpSumsWithdrawal: 0,
  previousLumpSumsRetirement: 0,
}

const LIFESTYLE: LifestyleInputs = {
  targetNetMonthlyIncomeToday: 0,
  essentialsMonthly: 0,
  discretionaryMonthly: 0,
  medicalAidMonthly: 0,
  medicalAidMembers: 0,
  housing: 'owned',
  housingCostMonthly: 0,
  dependants: 0,
  otherIncomeMonthly: 0,
  otherIncomeEscalation: 0,
  otherSavings: 0,
  otherSavingsOffshorePct: 0,
  debtOutstanding: 0,
  onceOffCapitalNeeds: 0,
  legacyGoal: 0,
  riskTolerance: 'balanced',
  spendingImportedShare: 0,
}

const ASSUMPTIONS: Assumptions = {
  taxYear: '2025/26',
  officialCpi: 0.05,
  personalInflation: 0.075,
  medicalInflation: 0.075,
  gepfIncreaseAsPctOfCpi: 1,
  usdZarSpot: 18,
  randDepreciation: 0.05,
  usInflation: 0.03,
  localBalancedReturn: 0.09, // the "global assumption" this test contrasts against fund history
  localCashReturn: 0.075,
  offshoreReturnUsd: 0.07,
  offshoreFee: 0.006,
  fxConversionCost: 0.005,
  livingAnnuityMinDrawdown: 0.025,
  livingAnnuityMaxDrawdown: 0.175,
  discretionaryReturnTaxRate: 0.12,
  returnVolatility: 0.12,
}

function base(): Profile {
  return { person: PERSON, gepf: GEPF, lifestyle: LIFESTYLE, assumptions: ASSUMPTIONS }
}

/**
 * A 'resign-preserve' route with gap years (retires from preservation well after the horizon
 * this test checks) and no income target, no other income, no once-off needs and no other
 * savings: the ONLY thing happening in year 0 is the actuarial-interest transfer growing for a
 * year inside a single preservation pot, wholly local (offshorePct 0). That isolates the return
 * basis from every other moving part (draws, tax, FX) so `investmentReturn` in year 0 is exactly
 * `local x effectiveLocalReturn` (see the identity proven in the projection.ts docstring).
 */
function scenario(overrides: Partial<ScenarioDefinition>): ScenarioDefinition {
  return {
    id: 'preserve-test',
    name: 'Preserve test',
    kind: 'resign-preserve',
    exitAge: 60,
    retireFromPreservationAge: 65,
    fundId: 'test-fund',
    offshorePct: 0,
    lumpSumAtRetirementPct: 1 / 3,
    drawdownStrategy: 'target-income',
    ...overrides,
  }
}

/**
 * 'stay-gepf' with the gratuity invested 100% offshore: the gratuity pot ends up wholly in the
 * offshore sleeve (local 0), so its growth depends only on `offshoreReturnUsd` — never on
 * `effectiveLocalReturn` — regardless of `returnBasis`.
 */
function stayScenarioFullyOffshore(overrides: Partial<ScenarioDefinition>): ScenarioDefinition {
  return {
    id: 'stay-test',
    name: 'Stay test',
    kind: 'stay-gepf',
    exitAge: 60,
    fundId: 'test-fund',
    offshorePct: 0,
    gratuityOffshorePct: 1,
    drawdownStrategy: 'target-income',
    ...overrides,
  }
}

describe('runScenario with returnBasis', () => {
  const historicFund = testFund({ id: 'test-fund', ter: 0.0052, allInFee: 0.01, returns: { y1: null, y3: 0.08, y5: 0.09, y10: 0.099 } })
  const noHistoryFund = testFund({ id: 'test-fund', ter: 0.0052, allInFee: 0.01, returns: { y1: null, y3: null, y5: null, y10: null } })

  const profile = base()
  const localAtExit = gepfBenefitsAtExit(profile, 60, RULES).resignation.actuarialInterest

  it('defaults to the global assumption when returnBasis is omitted', () => {
    const r = runScenario(profile, scenario({}), { tables: TABLES, rules: RULES, funds: [historicFund] })
    expect(r.rows[0]!.investmentReturn).toBeCloseTo(localAtExit * ASSUMPTIONS.localBalancedReturn, 2)
    expect(r.notes.some((n) => n.includes('historic return'))).toBe(false)
  })

  it("uses the fund's own historic gross return (10y 9.9% + TER 0.52% = 10.42%) when available", () => {
    const r = runScenario(profile, scenario({ returnBasis: 'fund-history' }), { tables: TABLES, rules: RULES, funds: [historicFund] })
    const gross = fundGrossReturn(historicFund)
    expect(gross).toBeCloseTo(0.1042, 10)
    // investmentReturn = local x effectiveLocalReturn exactly (no draws, single wholly-local pot).
    expect(r.rows[0]!.investmentReturn).toBeCloseTo(localAtExit * 0.1042, 2)
    expect(r.notes.some((n) => n.includes("own historic return") && n.includes('not a forecast'))).toBe(true)
  })

  it('falls back to the global assumption, with a note, when the fund has no historic return', () => {
    const r = runScenario(profile, scenario({ returnBasis: 'fund-history' }), { tables: TABLES, rules: RULES, funds: [noHistoryFund] })
    expect(r.rows[0]!.investmentReturn).toBeCloseTo(localAtExit * ASSUMPTIONS.localBalancedReturn, 2)
    expect(r.notes.some((n) => n.includes('no historic return on record') && n.includes('falls back'))).toBe(true)
  })

  it('never changes the offshore sleeve: a fully offshore pot grows identically under both bases', () => {
    const withAssumption = runScenario(profile, stayScenarioFullyOffshore({ returnBasis: 'assumption' }), {
      tables: TABLES,
      rules: RULES,
      funds: [historicFund],
    })
    const withHistory = runScenario(profile, stayScenarioFullyOffshore({ returnBasis: 'fund-history' }), {
      tables: TABLES,
      rules: RULES,
      funds: [historicFund],
    })
    expect(withHistory.rows[0]!.capitalLocal).toBeCloseTo(0, 2)
    expect(withHistory.rows[0]!.capitalOffshoreUsd).toBeCloseTo(withAssumption.rows[0]!.capitalOffshoreUsd, 6)
    expect(withHistory.rows[0]!.investmentReturn).toBeCloseTo(withAssumption.rows[0]!.investmentReturn, 2)
  })
})

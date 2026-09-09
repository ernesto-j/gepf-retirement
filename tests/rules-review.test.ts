/**
 * Adversarial rules-review regression tests.
 *
 * Documents a data bug found while auditing src/data/taxTables.ts against
 * research/tax-rules.md and independent verification (see the review notes below), and pins
 * the fix so it cannot silently regress.
 *
 * BUG FOUND: `TaxTables.deMinimisAnnuitisation` is used in exactly one place — the year loop
 * in src/engine/projection.ts — to decide when an EXISTING living annuity, already in payment,
 * is worth so little that it may be commuted to cash in full (see the "De minimis" comment
 * directly above that code). That is the SARS "living annuity commutation" prescribed amount:
 * R125,000 up to 28 February 2026, raised to R150,000 from 1 March 2026 (Government Gazette
 * 54399, 23 Mar 2026) — confirmed independently via WebSearch (Sanlam Consultant Toolkit,
 * "Key Retirement Fund Values and Changes Effective 1 March 2026") and already recorded
 * correctly elsewhere in this codebase at
 * `LIVING_ANNUITY_FACTS.commutationThreshold` (src/data/funds.ts).
 *
 * Before this fix, src/data/taxTables.ts instead carried R165,000 (2025/26) and R360,000
 * (2026/27) — two OTHER, related-but-different SARS "de minimis" figures (the two-pot
 * "annuitisable portion" restatement, and the headline "full cash at retirement on the whole
 * retirement interest" threshold respectively; see research/tax-rules.md section 9). Using
 * R360,000 as the year-on-year commutation trigger instead of R150,000 would let a living
 * annuity survive far longer, in "small pot" limbo, than the real rule allows once its value
 * fell below the true threshold, and — since it is the ONLY mechanism by which a living annuity
 * balance draws down to exactly zero at a capped 17.5% drawdown — measurably (if modestly)
 * distorts `ruinAge` and `legacyAtHorizon` in scenarios where capital gets low.
 *
 * Fix: src/data/taxTables.ts `deMinimisAnnuitisation` set to 125,000 (2025/26) / 150,000
 * (2026/27), matching `LIVING_ANNUITY_FACTS.commutationThreshold` and its source.
 */
import { describe, expect, it } from 'vitest'
import { TAX_TABLES } from '../src/data/taxTables'
import { LIVING_ANNUITY_FACTS } from '../src/data/funds'
import { getTaxTables } from '../src/engine/tax'
import { gepfBenefitsAtExit, getGepfRules } from '../src/engine/gepf'
import { runScenario } from '../src/engine/projection'
import type { GepfMembership, LifestyleInputs, PersonProfile, Profile, ScenarioDefinition } from '../src/engine/types'

describe('deMinimisAnnuitisation (living-annuity commutation threshold)', () => {
  it('2025/26 table uses the correct R125,000 prescribed amount (pre 1 March 2026), not R165,000 or R360,000', () => {
    expect(TAX_TABLES['2025/26'].deMinimisAnnuitisation).toBe(125_000)
  })

  it('2026/27 table uses the correct R150,000 prescribed amount (from 1 March 2026), not R165,000 or R360,000', () => {
    expect(TAX_TABLES['2026/27'].deMinimisAnnuitisation).toBe(150_000)
  })

  it('matches the independently researched LIVING_ANNUITY_FACTS.commutationThreshold values in src/data/funds.ts', () => {
    expect(TAX_TABLES['2026/27'].deMinimisAnnuitisation).toBe(LIVING_ANNUITY_FACTS.commutationThreshold.amountRand)
    expect(TAX_TABLES['2025/26'].deMinimisAnnuitisation).toBe(LIVING_ANNUITY_FACTS.commutationThreshold.previousAmountRand)
  })
})

// ---------------------------------------------------------------------------
// Projection-level regression: the living annuity must commute at the right balance.
// ---------------------------------------------------------------------------

const PERSON: PersonProfile = {
  name: 'De minimis regression',
  currentAge: 70,
  sex: 'other',
  plannedExitAge: 70,
  planToAge: 95,
  hasSpouse: false,
  spousePensionPct: 50,
}

const GEPF: GepfMembership = {
  pensionableServiceYearsNow: 5,
  pensionableSalaryAnnual: 400_000,
  salaryGrowth: 0.05,
  serviceYearsBeforeTwoPot: 5,
  medicalSubsidyEligible: false,
  medicalSubsidyMonthly: 0,
  statement: undefined,
  useStatementValues: false,
  previousLumpSumsWithdrawal: 0,
  previousLumpSumsRetirement: 0,
}

const LIFESTYLE: LifestyleInputs = {
  targetNetMonthlyIncomeToday: 1_000,
  essentialsMonthly: 1_000,
  discretionaryMonthly: 0,
  medicalAidMonthly: 0,
  medicalAidMembers: 1,
  housing: 'owned',
  housingCostMonthly: 0,
  dependants: 0,
  otherIncomeMonthly: 0,
  otherIncomeEscalation: 0.045,
  otherSavings: 0,
  otherSavingsOffshorePct: 0,
  debtOutstanding: 0,
  onceOffCapitalNeeds: 0,
  legacyGoal: 0,
  riskTolerance: 'balanced',
  spendingImportedShare: 0.2,
}

function profile(): Profile {
  return {
    person: PERSON,
    gepf: GEPF,
    lifestyle: LIFESTYLE,
    assumptions: {
      taxYear: '2026/27',
      officialCpi: 0.05,
      personalInflation: 0.05,
      medicalInflation: 0.08,
      gepfIncreaseAsPctOfCpi: 1,
      usdZarSpot: 18,
      randDepreciation: 0.05,
      usInflation: 0.025,
      localBalancedReturn: 0,
      localCashReturn: 0,
      offshoreReturnUsd: 0,
      offshoreFee: 0.005,
      fxConversionCost: 0,
      livingAnnuityMinDrawdown: 0.025,
      livingAnnuityMaxDrawdown: 0.175,
      discretionaryReturnTaxRate: 0,
      returnVolatility: 0,
    },
  }
}

const SCENARIO: ScenarioDefinition = {
  id: 'preserve-de-minimis',
  name: 'Preserve (de minimis check)',
  kind: 'resign-preserve',
  exitAge: 70,
  retireFromPreservationAge: 70,
  fundId: 'no-such-fund',
  feeOverride: 0, // isolate the de-minimis effect from fee drag
  offshorePct: 0,
  lumpSumAtRetirementPct: 0, // no lump sum taken -> the whole actuarial interest becomes a single living-annuity pot
  drawdownStrategy: 'fixed-pct',
  drawdownPct: 0.175, // draw the maximum every year so the annuity runs down towards the threshold
}

describe('living annuity commutes at the correct de-minimis balance (0% returns, 17.5% draw)', () => {
  it('commutes once the balance falls below the CURRENT R150,000 threshold, not the old R165,000/R360,000 ones', () => {
    const rules = getGepfRules()
    const tables = getTaxTables('2026/27')
    const p = profile()

    // Ground truth for the starting balance: with lumpSumAtRetirementPct 0 and no other
    // savings, the single living-annuity pot at exit equals the resignation actuarial interest
    // exactly (no fees/FX cost: offshorePct 0, feeOverride 0).
    const { resignation } = gepfBenefitsAtExit(p, 70, rules)
    const startingBalance = resignation.actuarialInterest
    // Sanity-check the fixture actually exercises the interesting range: comfortably above the
    // current R150,000 threshold, so the scenario draws down as a real annuity for a few years
    // before commuting (if it were already below R150,000 at inception this test would prove
    // nothing about WHEN the commutation threshold bites).
    expect(startingBalance).toBeGreaterThan(200_000)

    const result = runScenario(p, SCENARIO, { tables, rules })

    // Year 0 must be a genuine annuity drawdown at the configured 17.5%, not an immediate
    // commutation. This is the key regression: the old (wrong) 2026/27 value of R360,000 would
    // have commuted the annuity in year 0 already whenever the starting balance is below
    // R360,000 (as it is here), long before any real drawdown happened.
    expect(result.rows[0].capitalStart).toBeCloseTo(startingBalance, 0)
    expect(result.rows[0].drawdownRate).toBeCloseTo(0.175, 2)

    // With a 17.5%/year draw and 0% growth, the balance decays until it eventually falls below
    // the CURRENT threshold (escalated with personal inflation) and is commuted — proving the
    // engine is applying R150,000 (this scenario's tables.deMinimisAnnuitisation), not R165,000
    // or R360,000.
    const commutationNote = result.notes.find((n) => n.includes('de-minimis commutation amount'))
    expect(commutationNote).toBeDefined()
    expect(commutationNote).toContain('R150k')
    expect(commutationNote).not.toContain('R360k')
    expect(commutationNote).not.toContain('R165k')

    // The commutation is a mid-drawdown event (not day one): capital is still being drawn as an
    // annuity for at least one full year after exit.
    expect(result.rows.length).toBeGreaterThan(1)
    expect(result.rows[1].capitalStart).toBeGreaterThan(0)
  })
})

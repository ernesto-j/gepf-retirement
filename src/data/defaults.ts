import type { Assumptions, GepfMembership, LifestyleInputs, PersonProfile, Profile } from '../engine/types'
import { DEFAULT_TAX_YEAR } from './taxTables'

/**
 * Default inputs: a 57-year-old public servant with 30 years' service on R720k p.a.,
 * planning to leave at 60 and plan to age 90. All values are editable in the Profile page.
 */
export const DEFAULT_PERSON: PersonProfile = {
  name: '',
  currentAge: 57,
  sex: 'other',
  plannedExitAge: 60,
  planToAge: 90,
  hasSpouse: true,
  spouseAge: 55,
  spousePensionPct: 50,
}

export const DEFAULT_GEPF: GepfMembership = {
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
  // DPSA ERP / VEP (Circular 38 of 2025): opt in only once the Executive Authority has approved.
  exitProgramme: 'none',
}

export const DEFAULT_LIFESTYLE: LifestyleInputs = {
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
  onceOffCapitalNeeds: 150_000,
  legacyGoal: 0,
  riskTolerance: 'balanced',
  spendingImportedShare: 0.3,
}

/**
 * Presets for the assumptions panel. "sarb-target" uses the SARB's 3% point target with a
 * realistic retiree basket; "recent-history" uses ~2015–2025 averages; "pessimistic" is a
 * stagflation / weak-rand case.
 */
export const ASSUMPTION_PRESETS: Record<'sarb-target' | 'recent-history' | 'pessimistic', Assumptions> = {
  'sarb-target': {
    taxYear: DEFAULT_TAX_YEAR,
    officialCpi: 0.035,
    personalInflation: 0.06,
    medicalInflation: 0.085,
    gepfIncreaseAsPctOfCpi: 1.0,
    usdZarSpot: 16.2,
    randDepreciation: 0.03,
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
  },
  'recent-history': {
    taxYear: DEFAULT_TAX_YEAR,
    officialCpi: 0.05,
    personalInflation: 0.075,
    medicalInflation: 0.095,
    gepfIncreaseAsPctOfCpi: 1.0,
    usdZarSpot: 16.2,
    randDepreciation: 0.05,
    usInflation: 0.03,
    localBalancedReturn: 0.10,
    localCashReturn: 0.075,
    offshoreReturnUsd: 0.075,
    offshoreFee: 0.006,
    fxConversionCost: 0.005,
    livingAnnuityMinDrawdown: 0.025,
    livingAnnuityMaxDrawdown: 0.175,
    discretionaryReturnTaxRate: 0.12,
    returnVolatility: 0.14,
  },
  pessimistic: {
    taxYear: DEFAULT_TAX_YEAR,
    officialCpi: 0.065,
    personalInflation: 0.09,
    medicalInflation: 0.11,
    gepfIncreaseAsPctOfCpi: 0.75,
    usdZarSpot: 16.2,
    randDepreciation: 0.07,
    usInflation: 0.03,
    localBalancedReturn: 0.09,
    localCashReturn: 0.08,
    offshoreReturnUsd: 0.065,
    offshoreFee: 0.006,
    fxConversionCost: 0.007,
    livingAnnuityMinDrawdown: 0.025,
    livingAnnuityMaxDrawdown: 0.175,
    discretionaryReturnTaxRate: 0.12,
    returnVolatility: 0.18,
  },
}

export const DEFAULT_ASSUMPTIONS: Assumptions = ASSUMPTION_PRESETS['recent-history']

export const DEFAULT_PROFILE: Profile = {
  person: DEFAULT_PERSON,
  gepf: DEFAULT_GEPF,
  lifestyle: DEFAULT_LIFESTYLE,
  assumptions: DEFAULT_ASSUMPTIONS,
}

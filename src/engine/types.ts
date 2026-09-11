/**
 * Domain model for the South African Pension Planner.
 *
 * All monetary values are in South African rand (ZAR) unless the name says otherwise
 * (…Usd). All rates are decimals (0.045 = 4.5%). All amounts are ANNUAL unless the
 * name says …Monthly. Ages are in years (fractional allowed).
 *
 * This file is the single source of truth for the shapes shared by the calculation
 * engine (src/engine), the data files (src/data), the store (src/store), the UI
 * (src/pages, src/components) and the AI layer (src/ai, server/). Keep it framework-free.
 */

// ---------------------------------------------------------------------------
// Tax
// ---------------------------------------------------------------------------

export type TaxYear = '2025/26' | '2026/27'

/** A progressive bracket: `threshold` is the lower bound (inclusive, R). */
export interface TaxBracket {
  /** Lower bound of the bracket (R). The first bracket has threshold 0. */
  threshold: number
  /** Marginal rate applied above `threshold`. */
  rate: number
  /** Cumulative tax on income up to `threshold` (R). */
  base: number
}

export interface TaxTables {
  taxYear: TaxYear
  /** Ascending by threshold. */
  brackets: TaxBracket[]
  rebates: { primary: number; secondary: number; tertiary: number }
  /** Tax thresholds (income below which no tax is payable) for information. */
  thresholds: { under65: number; age65to74: number; age75plus: number }
  /** Medical scheme fees tax credit per MONTH. */
  medicalCredit: { firstTwo: number; additional: number }
  /** Retirement / death / severance lump sum table (aggregated since 1 Mar 2009). */
  retirementLumpSum: TaxBracket[]
  /** Withdrawal (resignation) lump sum table (aggregated since 1 Mar 2009 / 1 Oct 2007). */
  withdrawalLumpSum: TaxBracket[]
  interestExemption: { under65: number; age65plus: number }
  cgt: { inclusionRate: number; annualExclusion: number }
  dividendsTax: number
  /** Below this amount per fund the full benefit may be taken as cash at retirement. */
  deMinimisAnnuitisation: number
  /** Two-pot: minimum savings withdrawal. */
  savingsPotMinWithdrawal: number
  /** Estate duty basics. */
  estateDuty: { abatement: number; rate: number; higherRate: number; higherRateThreshold: number }
  /** Reg 28 limits applying to preservation funds / RAs (not living annuities). */
  reg28: { maxOffshore: number; maxEquity: number }
  livingAnnuity: { minDrawdown: number; maxDrawdown: number }
  sources: string[]
}

export interface IncomeTaxResult {
  taxableIncome: number
  grossTax: number
  rebates: number
  medicalCredits: number
  /** Tax payable after rebates and credits (never negative). */
  tax: number
  effectiveRate: number
  marginalRate: number
}

export interface LumpSumTaxResult {
  amount: number
  previousLumpSums: number
  tax: number
  /** Tax that would be due on previous lump sums alone (subtracted under aggregation). */
  taxOnPrevious: number
  net: number
  effectiveRate: number
  table: 'retirement' | 'withdrawal'
}

// ---------------------------------------------------------------------------
// GEPF
// ---------------------------------------------------------------------------

/**
 * Actuarial interest factor table: age -> F(Z). Per GEPF Rule 14.4, the resignation benefit
 * (actuarial interest) = pensionable service (years) x final salary x F(Z), where Z is the member's
 * age. The GEPF FAQ example gives F(40) = 0.2036 (10 years x R300,000 x 0.2036 = R610,800).
 */
export interface ActuarialFactorTable {
  /** Human label, e.g. 'GEPF factors effective 1 Oct 2025'. */
  label: string
  effectiveFrom: string
  /** Sorted ascending by age. Interpolate linearly between points, clamp outside. */
  points: { age: number; factor: number }[]
  source: string
  confidence: 'high' | 'medium' | 'low'
  note?: string
}

/**
 * Terms of one DPSA exit programme (see `GepfRules.exitProgramme`). The once-off incentive is
 * `weeksFirstYears` weeks of basic salary for each of the first `firstYears` completed years of
 * pensionable service and `weeksThereafter` weeks for every completed year after that.
 */
export interface ExitProgrammeTerms {
  /** Youngest age at exit that qualifies (whole years, inclusive). */
  minAge: number
  /** Oldest age at exit that qualifies (whole years, inclusive: 59 means "up to your 60th birthday"). */
  maxAge: number
  weeksFirstYears: number
  firstYears: number
  weeksThereafter: number
}

/** Which DPSA exit programme the member has been approved for (default `'none'`). */
export type ExitProgrammeChoice = 'none' | 'erp' | 'vep'

/** Result of the ERP / VEP incentive calculation (see `exitProgrammeIncentive` in src/engine/gepf.ts). */
export interface ExitProgrammeIncentive {
  eligible: boolean
  /** Weeks of basic salary payable (0 when not eligible). */
  weeks: number
  /** weeks / 52 x annual basic salary at exit (R, before tax). */
  gross: number
  /** Why the member does not qualify (only when `eligible` is false). */
  reason?: string
}

export interface GepfRules {
  /** Gratuity = gratuityFactor x finalSalary x serviceYears. (0.0672) */
  gratuityFactor: number
  /** Annuity = finalSalary x serviceYears / annuityDivisor + annuityFixedAddition. (55, 360) */
  annuityDivisor: number
  annuityFixedAddition: number
  /** Gratuity for < 10 years service = shortServiceGratuityFactor x finalSalary x serviceYears (0.15). */
  shortServiceGratuityFactor: number
  minServiceYearsForPension: number
  normalRetirementAge: number
  earlyRetirementMinAge: number
  /** Reduction per month before normal retirement age (1/3 of 1% = 0.003333). */
  earlyRetirementReductionPerMonth: number
  /** Default spouse pension fraction (0.5) and the optional higher election (0.75). */
  spousePensionDefault: number
  spousePensionEnhanced: number
  /** Approx. cost of electing the enhanced spouse pension as a reduction of the member's pension. */
  spousePensionEnhancedCostPct: number
  /** Minimum annual increase as a fraction of CPI per the rules (0.75). */
  minIncreaseAsPctOfCpi: number
  /** Guarantee period on pension in years (5). */
  guaranteeYears: number
  /** Two-pot go-live date. */
  twoPotStartDate: string
  twoPotSeedPct: number
  twoPotSeedCap: number
  /** Post-retirement employer medical subsidy rule of thumb. */
  medicalSubsidyMinServiceYears: number
  medicalSubsidyMaxMonthly: number
  /**
   * DPSA Incentivised Early Retirement Programme (ERP, ages 55-59: retirement without the
   * early-retirement reduction plus a once-off incentive) and Voluntary Exit Programme (VEP,
   * ages 60-63: normal retirement plus a once-off incentive), per DPSA Circular 38 of 2025.
   * Both need 10+ years' pensionable service (`minServiceYearsForPension`), are open to
   * permanent employees only and are approved at the Executive Authority's discretion.
   */
  exitProgramme: {
    erp: ExitProgrammeTerms
    vep: ExitProgrammeTerms
    /** Last date on which an approved exit may take effect (end of the implementation period). */
    implementationEnd: string
    source: string
  }
  actuarialFactors: ActuarialFactorTable
  /** Previous (2021) factors for comparison, if known. */
  previousActuarialFactors?: ActuarialFactorTable
  /** Fund status facts for display. */
  status: {
    fundingLevel: number
    valuationDate: string
    assetsRand: number
    memberCount: number
    pensionerCount: number
    offshoreAllocation: number
    lastIncreases: { year: number; increase: number; cpi: number }[]
  }
  sources: string[]
}

export interface GepfBenefitInput {
  /** Average pensionable salary over the last 24 months, annual (R). */
  finalSalaryAnnual: number
  pensionableServiceYears: number
  ageAtExit: number
  /** Employer-initiated / ill-health etc. avoid the early-retirement reduction. */
  exemptFromEarlyReduction?: boolean
  spousePensionPct?: number
}

export interface GepfRetirementBenefit {
  gratuity: number
  /** Annual pension in first year (before tax), after early-retirement reduction. */
  annuityAnnual: number
  annuityMonthly: number
  reductionFactor: number
  monthsEarly: number
  /** True if < 10 years: gratuity only, no annuity. */
  gratuityOnly: boolean
  spousePensionAnnual: number
}

export interface GepfResignationBenefit {
  /** Actuarial interest = serviceYears x finalSalary x F(age). */
  actuarialInterest: number
  /** F(Z) used (interpolated). */
  factorUsed: number
  /** For information: the unreduced gratuity the member would get on retirement. */
  gratuityComponent: number
  /** For information: actuarialInterest - gratuityComponent, i.e. the implied value placed on the annuity. */
  annuityComponent: number
  /** Two-pot split of the actuarial interest. */
  vestedComponent: number
  savingsComponent: number
  retirementComponent: number
  /** Cash that may be taken on resignation (vested + savings). */
  maxCashOnResignation: number
  /** Comparison: value under the previous factors, if available. */
  actuarialInterestPreviousFactors?: number
}

// ---------------------------------------------------------------------------
// Profile (user inputs)
// ---------------------------------------------------------------------------

export interface PersonProfile {
  name?: string
  currentAge: number
  sex?: 'male' | 'female' | 'other'
  /** Age at which the member leaves GEPF (resign or retire). */
  plannedExitAge: number
  /** Planning horizon. Default 90. */
  planToAge: number
  hasSpouse: boolean
  spouseAge?: number
  /** Percentage of the member's pension continuing to a spouse (50 or 75). */
  spousePensionPct: 50 | 75
}

export interface GepfStatementValues {
  statementDate?: string
  memberNumber?: string
  employer?: string
  pensionableServiceYears?: number
  finalSalaryAnnual?: number
  /** Cash value on resignation (actuarial interest). */
  resignationBenefit?: number
  retirementGratuity?: number
  retirementAnnuityAnnual?: number
  deathBenefitLumpSum?: number
  vestedComponent?: number
  savingsComponent?: number
  retirementComponent?: number
  /** Free-text notes extracted from the statement. */
  notes?: string
  /** Low confidence fields as reported by the extractor. */
  uncertainFields?: string[]
}

export interface GepfMembership {
  /** Total pensionable service (including purchased service) at TODAY. */
  pensionableServiceYearsNow: number
  /** Current annual pensionable salary (R). */
  pensionableSalaryAnnual: number
  /** Expected nominal salary growth p.a. until exit. */
  salaryGrowth: number
  /** Years of service completed before 1 Sept 2024 (for two-pot). If omitted, derived from service years. */
  serviceYearsBeforeTwoPot?: number
  /** Whether the member qualifies for the post-retirement medical subsidy on retirement (not resignation). */
  medicalSubsidyEligible: boolean
  medicalSubsidyMonthly: number
  /** Optional values from a benefit statement; when present they override formula estimates. */
  statement?: GepfStatementValues
  useStatementValues: boolean
  /** Previously received retirement-fund lump sums (for aggregation), R. */
  previousLumpSumsWithdrawal: number
  previousLumpSumsRetirement: number
  /**
   * DPSA exit programme the member has been APPROVED for (Circular 38 of 2025): `'erp'`
   * (Incentivised Early Retirement, ages 55-59, no early-retirement reduction + incentive),
   * `'vep'` (Voluntary Exit, ages 60-63, incentive only) or `'none'` (the default).
   * Approval is at the Executive Authority's discretion, so this is an input, not a derivation.
   */
  exitProgramme?: ExitProgrammeChoice
}

export type HousingStatus = 'owned' | 'bonded' | 'renting'
export type RiskTolerance = 'conservative' | 'balanced' | 'aggressive'

export interface LifestyleInputs {
  /** Desired AFTER-TAX monthly income at retirement, in today's rand. */
  targetNetMonthlyIncomeToday: number
  essentialsMonthly: number
  discretionaryMonthly: number
  medicalAidMonthly: number
  medicalAidMembers: number
  housing: HousingStatus
  housingCostMonthly: number
  dependants: number
  /** Other pre-tax income in retirement, monthly, today's rand (rental, part-time, other annuity). */
  otherIncomeMonthly: number
  otherIncomeEscalation: number
  /** Discretionary savings outside GEPF (R) and share already offshore. */
  otherSavings: number
  otherSavingsOffshorePct: number
  debtOutstanding: number
  /** Once-off capital needs at exit (car, home, debt settlement, travel). */
  onceOffCapitalNeeds: number
  /** Desired capital to leave to heirs, today's rand. */
  legacyGoal: number
  riskTolerance: RiskTolerance
  /** Fraction of spending that is rand-based (vs. imported/USD-linked like medicine, tech, travel). */
  spendingImportedShare: number
}

export interface Assumptions {
  taxYear: TaxYear
  /** Official CPI (SARB target-ish). */
  officialCpi: number
  /** "True"/personal inflation for a retiree basket. */
  personalInflation: number
  medicalInflation: number
  /** GEPF annual increase as a fraction of official CPI (1.0 = full CPI, 0.75 = rule minimum). */
  gepfIncreaseAsPctOfCpi: number
  usdZarSpot: number
  /** Expected nominal rand depreciation vs USD p.a. */
  randDepreciation: number
  usInflation: number
  /** Nominal gross returns before fees. */
  localBalancedReturn: number
  localCashReturn: number
  offshoreReturnUsd: number
  /** Fee drag p.a. used for the offshore sleeve if no fund selected (ETF + platform). */
  offshoreFee: number
  /** Cost of converting rand to USD (spread) as a fraction. */
  fxConversionCost: number
  /** Living annuity drawdown limits. */
  livingAnnuityMinDrawdown: number
  livingAnnuityMaxDrawdown: number
  /** Effective tax drag on returns of discretionary (non-retirement-fund) investments: blended CGT/dividends/interest. */
  discretionaryReturnTaxRate: number
  /** Annual return volatility used for the optional stress test. */
  returnVolatility: number
  /**
   * Spot rand per unit of other hard currencies (USD uses usdZarSpot). All hard currencies are assumed to
   * appreciate against the rand at `randDepreciation`; there is no separate USD/AUD path.
   */
  fxSpots?: { AUD: number; GBP: number; EUR: number }
}

// ---------------------------------------------------------------------------
// Custom investments (the member's own holdings: an index ETF, a property with a loan, a fixed-term deposit)
// ---------------------------------------------------------------------------

export type InvestmentCurrency = 'ZAR' | 'USD' | 'AUD' | 'GBP' | 'EUR'
export type CustomInvestmentKind = 'equity-index' | 'residential-property' | 'commercial-property' | 'fixed-term' | 'other'

export interface CustomInvestmentLoan {
  /** Loan amount in the investment's currency, drawn at purchase. */
  amount: number
  /** Nominal interest rate p.a. */
  rate: number
  termYears: number
  /** Interest-only: no capital repayments; the balance is settled from sale proceeds. */
  interestOnly: boolean
}

/**
 * A holding the member sets up themselves. Value, income, costs and the loan are tracked in `currency`
 * and converted to rand at the scenario's FX path. Net cash (income - costs - loan service - tax) counts
 * toward the income target when `incomeUse` is 'spend'; negative carry is funded from discretionary savings.
 * At the end of `termYears` (or the horizon) the asset is sold, the loan settled and the net proceeds
 * (after selling costs and CGT) move to the discretionary pot in the same currency sleeve.
 */
export interface CustomInvestment {
  id: string
  name: string
  kind: CustomInvestmentKind
  enabled: boolean
  currency: InvestmentCurrency
  /** Age at which the investment is bought. If below the exit age it is treated as already owned (fundedFrom 'external'). */
  startAge: number
  /** Fixed holding period in years; undefined = held to the planning horizon. */
  termYears?: number
  /** 'exit-capital' takes the cash from the scenario's discretionary pot; 'external' is money outside the plan. */
  fundedFrom: 'exit-capital' | 'external'
  /** Cash put in (deposit / purchase amount less the loan), in `currency`. */
  deposit: number
  /** Once-off purchase costs (stamp duty, FIRB, transfer, brokerage) as a fraction of the purchase price. */
  purchaseCostPct: number
  loan?: CustomInvestmentLoan
  /** Capital growth p.a. in `currency`. */
  growth: number
  /** Gross income yield p.a. on value (rent, dividends, interest). */
  incomeYield: number
  /** Running costs p.a. as a fraction of value (rates, levies, management, vacancy, TER). */
  costsPct: number
  /** Effective tax rate on net income (SA marginal, or foreign non-resident rate with SA credit). */
  incomeTaxRate: number
  /** Effective tax rate on the gain at sale. */
  cgtRate: number
  /** Selling costs as a fraction of the sale price. */
  sellingCostPct: number
  /** 'spend' counts net cash toward income; 'reinvest' adds it to the discretionary pot. */
  incomeUse: 'spend' | 'reinvest'
  notes?: string
}

/** One projected year of a custom investment (currency amounts plus rand conversions). */
export interface CustomInvestmentYear {
  age: number
  year: number
  /** Rand per unit of the investment's currency in this year. */
  fx: number
  valueCcy: number
  loanBalanceCcy: number
  grossIncomeCcy: number
  costsCcy: number
  interestCcy: number
  principalCcy: number
  taxCcy: number
  /** Income - costs - interest - principal - tax (can be negative = cash the member must put in). */
  netCashCcy: number
  netCashZar: number
  /** Value - loan balance, in rand. */
  equityZar: number
  /** Net proceeds in rand when sold this year (after selling costs, loan settlement and CGT). */
  saleProceedsZar?: number
  event?: 'buy' | 'sell' | 'loan-repaid'
}

export interface Profile {
  person: PersonProfile
  gepf: GepfMembership
  lifestyle: LifestyleInputs
  assumptions: Assumptions
  /** The member's own investments, applied to every scenario. */
  investments: CustomInvestment[]
}

// ---------------------------------------------------------------------------
// Funds
// ---------------------------------------------------------------------------

export type FundType = 'index' | 'active' | 'full-service' | 'gepf'

export interface FundInfo {
  id: string
  name: string
  manager: string
  type: FundType
  category: string
  /** Total expense ratio, transaction costs, total investment charge (fund level), decimals. */
  ter: number
  tc: number
  tic: number
  /** Typical platform/admin fee for a living annuity or preservation fund holding this fund. */
  platformFee: number
  /** Typical advice fee (may be 0 for DIY). */
  adviceFee: number
  /** All-in effective annual cost = tic + platformFee + adviceFee. */
  allInFee: number
  /** Annualised returns (nominal, net of TER), decimals; null if unavailable. */
  returns: {
    y1: number | null
    y3: number | null
    y5: number | null
    y10: number | null
    /** Long-run annualised returns where the fund is old enough; null/undefined otherwise. */
    y15?: number | null
    y20?: number | null
    y30?: number | null
    sinceInception?: number | null
  }
  /** ISO launch date of the class, to say how long the track record is. */
  inceptionDate?: string
  /**
   * 'verified' = taken from a dated fact sheet in research/; 'approximate' = a labelled estimate used only so
   * the fund-history comparison can run (fact sheets could not be fetched). The UI marks approximate figures with ≈.
   */
  returnsConfidence?: 'verified' | 'approximate'
  /** Maximum offshore exposure available in a living annuity holding this fund (1 = 100%). */
  maxOffshore: number
  /** Regulation 28 compliant (usable in a preservation fund). */
  reg28: boolean
  asOf: string
  source: string
  notes?: string
}

// ---------------------------------------------------------------------------
// Scenarios and projection
// ---------------------------------------------------------------------------

export type ScenarioKind =
  /** Stay in GEPF, retire at exit age: gratuity + lifelong pension. Gratuity invested. */
  | 'stay-gepf'
  /** Resign, transfer the full actuarial interest tax-free to a preservation fund, retire from it later into a living annuity. */
  | 'resign-preserve'
  /** Resign, cash out the maximum allowed (vested + savings), pay withdrawal tax, invest the net (retirement component preserved). */
  | 'resign-cash'

export interface ScenarioDefinition {
  id: string
  name: string
  kind: ScenarioKind
  /** Age at which the member leaves GEPF. */
  exitAge: number
  /** For resign routes: age at which the preserved money is retired into a living annuity (>= 55). */
  retireFromPreservationAge?: number
  /** Fund used for the invested capital. */
  fundId: string
  /** Override the fund's all-in fee (decimal) if provided. */
  feeOverride?: number
  /** Share of invested capital held offshore (0..1). Capped by fund/product rules. */
  offshorePct: number
  /** For 'stay-gepf': share of the gratuity invested offshore. */
  gratuityOffshorePct?: number
  /** At retirement from a preservation fund: share (0..1/3) taken as a lump sum. */
  lumpSumAtRetirementPct?: number
  /** For 'resign-cash': fraction (0..1) of the allowed cash actually withdrawn. */
  cashOutFraction?: number
  /** How the living annuity is drawn. */
  drawdownStrategy: 'target-income' | 'fixed-pct'
  /** For fixed-pct: annual drawdown as a fraction of capital. */
  drawdownPct?: number
  /** Optional overrides of global assumptions for this scenario. */
  overrides?: Partial<Assumptions>
  /**
   * Where the LOCAL sleeve's gross investment return comes from. `'assumption'` (the default
   * when omitted) uses `Assumptions.localBalancedReturn`; `'fund-history'` uses the selected
   * fund's own historic return (`fundGrossReturn` in src/engine/funds.ts) when the fund has one
   * on record, falling back to the assumption (with a note) otherwise. Never changes the
   * offshore sleeve's return.
   */
  returnBasis?: 'assumption' | 'fund-history'
}

export interface YearRow {
  year: number
  age: number
  /** Index of official CPI (1.0 in the base year) and personal inflation. */
  cpiIndex: number
  personalIndex: number
  usdZar: number
  /** GEPF pension (annual, gross), PAYE on it and net. */
  gepfPensionGross: number
  gepfPensionTax: number
  gepfPensionNet: number
  medicalSubsidy: number
  /** Living annuity / investment drawings (gross), tax, net. */
  drawGross: number
  drawTax: number
  drawNet: number
  /** Other income (gross) and its tax. */
  otherIncomeGross: number
  /** Total net income for the year across sources. */
  totalNetIncome: number
  /** Net income expressed in today's rand using personal inflation. */
  totalNetIncomeReal: number
  /** Income target for the year (nominal, net). */
  targetNetIncome: number
  /** Shortfall (positive when income is below target). */
  shortfall: number
  /** Capital at start/end of year: total, local sleeve, offshore sleeve (in ZAR and USD). */
  capitalStart: number
  capitalEnd: number
  capitalLocal: number
  capitalOffshoreZar: number
  capitalOffshoreUsd: number
  capitalEndReal: number
  investmentReturn: number
  fees: number
  /** Effective drawdown rate used this year (draw / capitalStart). */
  drawdownRate: number
  /** True when the 17.5% cap (or capital exhaustion) forced the income below target. */
  capped: boolean
  /** Custom investments: net spendable cash (after tax) counted in totalNetIncome, equity value in rand, cash put in to fund negative carry or purchases. */
  customIncomeNet: number
  customEquityZar: number
  customCashIn: number
}

export interface RiskFlag {
  id: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  detail: string
  /** Which scenario kinds this flag applies to (empty = all). */
  appliesTo: ScenarioKind[]
  /** Optional case study id from src/data/caseStudies.ts. */
  caseStudyId?: string
}

export interface ScenarioResult {
  definition: ScenarioDefinition
  kind: ScenarioKind
  /** Capital events at exit. */
  atExit: {
    age: number
    finalSalaryAnnual: number
    serviceYears: number
    gratuity: number
    actuarialInterest: number
    vestedComponent: number
    savingsComponent: number
    retirementComponent: number
    /** Lump sum taken in cash at exit (gross), the tax on it and net. */
    lumpSumGross: number
    lumpSumTax: number
    lumpSumNet: number
    lumpSumTable: 'retirement' | 'withdrawal' | 'none'
    /** Money transferred tax-free to a preservation fund. */
    transferredToPreservation: number
    /** Capital actually invested at exit (after once-off needs and FX costs). */
    investedCapital: number
    investedOffshoreZar: number
    forfeitedMedicalSubsidyPv: number
    /**
     * DPSA ERP / VEP once-off incentive at exit (retirement routes only, absent when no
     * programme applies): weeks of basic salary, the gross amount, the tax expected on it
     * (retirement lump-sum table, aggregated after the gratuity) and the net.
     */
    incentiveWeeks?: number
    incentiveGross?: number
    incentiveTax?: number
    incentiveNet?: number
  }
  /** Second lump-sum event when retiring from the preservation fund (resign routes). */
  atRetirementFromPreservation?: {
    age: number
    preservationValue: number
    lumpSumGross: number
    lumpSumTax: number
    lumpSumNet: number
    intoLivingAnnuity: number
  }
  firstYear: {
    grossMonthlyIncome: number
    monthlyTax: number
    netMonthlyIncome: number
    targetNetMonthlyIncome: number
    gepfPensionMonthlyGross: number
    gepfPensionMonthlyTax: number
    gepfPensionMonthlyNet: number
  }
  /** Age at which investable capital is exhausted, or null if it lasts to the horizon. */
  ruinAge: number | null
  /** Age from which the income target can no longer be met (cap or exhaustion), or null. */
  incomeShortfallAge: number | null
  rows: YearRow[]
  totals: {
    lifetimeNetIncomeNominal: number
    lifetimeNetIncomeReal: number
    lifetimeTaxPaid: number
    lifetimeFeesPaid: number
    /** Present value (today's rand, discounted at personal inflation) of all net income. */
    pvNetIncome: number
    legacyAtHorizon: number
    legacyAtHorizonReal: number
    /** Guaranteed lifelong income component (GEPF) as a share of first-year net income. */
    guaranteedIncomeShare: number
  }
  pros: string[]
  cons: string[]
  flags: RiskFlag[]
  /** Human-readable assumptions used. */
  notes: string[]
  /** Per custom investment: what it did in this scenario. */
  customInvestments?: {
    id: string
    name: string
    startAge: number
    endAge: number
    purchaseCashZar: number
    totalNetIncomeZar: number
    saleProceedsZar: number
    peakEquityZar: number
  }[]
}

export interface ComparisonResult {
  scenarios: ScenarioResult[]
  /** Key metrics side by side, keyed by scenario id. */
  table: ComparisonMetric[]
  /** Which scenario id 'wins' on each metric. */
  winners: Record<string, string>
}

export interface ComparisonMetric {
  key: string
  label: string
  /** Formatting hint. */
  format: 'currency' | 'currencyMonthly' | 'age' | 'percent' | 'years' | 'text'
  higherIsBetter: boolean
  values: Record<string, number | string | null>
}

// ---------------------------------------------------------------------------
// Macro / FX / inflation
// ---------------------------------------------------------------------------

export interface MacroSeriesPoint {
  year: number
  value: number
}

export interface MacroHistory {
  usdZarAnnualAvg: MacroSeriesPoint[]
  saCpi: MacroSeriesPoint[]
  usCpi: MacroSeriesPoint[]
  /** Optional additional series for "true inflation". */
  medicalAidInflation: MacroSeriesPoint[]
  electricityTariffIncrease: MacroSeriesPoint[]
  /** Long-run annualised nominal returns in ZAR by asset class, with the period. */
  assetReturns: { asset: string; years: number; nominalZar: number; realZar: number; source: string }[]
  asOf: string
  sources: string[]
}

export interface HedgeProjectionRow {
  year: number
  usdZar: number
  cpiIndex: number
  personalIndex: number
  /** Nominal ZAR values of R1 invested (or a capital amount) under different offshore shares. */
  unhedgedNominal: number
  hedgedNominal: number
  /** Purchasing-power (real, personal inflation) values. */
  unhedgedReal: number
  hedgedReal: number
  /** Value of the same capital in USD terms. */
  unhedgedUsd: number
  hedgedUsd: number
}

// ---------------------------------------------------------------------------
// Risk case studies
// ---------------------------------------------------------------------------

export interface CaseStudy {
  id: string
  country: string
  period: string
  title: string
  summary: string
  whatHappenedToSavers: string
  /** e.g. 'Pension values fell >95% in USD terms' */
  lossEstimate: string
  whatProtectedSavers: string
  lessons: string[]
  sources: string[]
}

export interface SaRiskIndicator {
  id: string
  label: string
  value: string
  trend: 'improving' | 'stable' | 'worsening'
  detail: string
  source: string
  asOf: string
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

export type AppPage =
  | 'profile'
  | 'compare'
  | 'planner'
  | 'funds'
  | 'rand'
  | 'risks'
  | 'ask'

export interface AiContext {
  page: AppPage
  profile: Profile
  /** Compact summaries of the scenarios currently on screen. */
  scenarios: ScenarioSummary[]
  /** Extra page-specific context (e.g. selected fund ids, chart settings). */
  pageContext?: Record<string, unknown>
}

export interface ScenarioSummary {
  id: string
  name: string
  kind: ScenarioKind
  exitAge: number
  fundId: string
  offshorePct: number
  lumpSumNet: number
  lumpSumTax: number
  investedCapital: number
  firstYearNetMonthlyIncome: number
  firstYearMonthlyTax: number
  ruinAge: number | null
  incomeShortfallAge: number | null
  legacyAtHorizonReal: number
  pvNetIncome: number
  flags: string[]
}

export interface AiChatMessage {
  role: 'user' | 'assistant'
  content: string
}

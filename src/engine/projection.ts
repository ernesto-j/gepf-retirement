/**
 * Scenario simulation engine: turns a `Profile` + `ScenarioDefinition` into a year-by-year
 * projection (`ScenarioResult`), and compares results side by side.
 *
 * Pure TypeScript, no React, no I/O. Data (tax tables, GEPF rules, funds) is passed in and
 * only defaulted from `src/data` for convenience. Nothing throws for ordinary bad input:
 * values are clamped and a human-readable note is pushed onto `result.notes`.
 *
 * ---------------------------------------------------------------------------
 * How a year is simulated (annual steps, year 0 = the exit year, ages exitAge…planToAge)
 * ---------------------------------------------------------------------------
 * `t` is measured from TODAY (`person.currentAge`), not from the exit, so the inflation and
 * currency indices are comparable across scenarios with different exit ages:
 *
 *   cpiIndex      = (1 + officialCpi)^t
 *   personalIndex = (1 + personalInflation)^t
 *   medicalIndex  = (1 + medicalInflation)^t
 *   usdZar        = usdZarSpot x (1 + randDepreciation)^t
 *
 * 1. Income target (net, nominal): the target is split into a MEDICAL part
 *    (`lifestyle.medicalAidMonthly`, capped at the target) escalating at `medicalInflation`
 *    and the remainder escalating at `personalInflation`.
 * 2. Income sources: the GEPF pension (escalating at `officialCpi x gepfIncreaseAsPctOfCpi`),
 *    the employer medical subsidy (non-taxable, escalating at `medicalInflation`), other
 *    income (taxable, escalating at `otherIncomeEscalation`) and draws from the capital pots.
 * 3. Capital lives in POTS. Each pot has a local (ZAR) and an offshore (USD) sleeve, a fee,
 *    a target offshore share and a tax flag:
 *      - 'living-annuity' / 'preservation' : retirement-fund money, returns untaxed,
 *        the living annuity is subject to the [min, max] drawdown limits;
 *      - 'discretionary' : the invested gratuity, cash-out proceeds and `otherSavings`;
 *        the year's return is taxed at `discretionaryReturnTaxRate` and there is no
 *        drawdown limit.
 *    Every pot runs through the same yearly loop: draw -> rebalance to the target offshore
 *    share -> grow -> pay fees (and return tax).
 * 4. Draw: the gross draw that makes total net income equal the target is solved with
 *    `grossForNet(target, age, tables, { otherTaxableIncome })`. The living annuity is drawn
 *    first (clamped to [min, max] x capitalStart), then the discretionary pots (unclamped,
 *    and not taxable — see simplification 4). Anything still missing is a `shortfall`.
 * 5. Tax: taxable income = GEPF pension + living-annuity draw + other income, taxed with
 *    `calcIncomeTax` at the member's age that year, then apportioned pro rata to the row's
 *    columns. Discretionary withdrawals and the medical subsidy are not taxed.
 * 6. Capital roll-forward, exactly (this identity is asserted in the tests):
 *      capitalEnd = capitalStart - draws + investmentReturn - fees
 *    `investmentReturn` is net of the discretionary return tax and INCLUDES the currency
 *    translation gain on the offshore sleeve; `fees` includes the FX conversion cost paid
 *    when rand is converted offshore.
 *
 * ---------------------------------------------------------------------------
 * Simplifications (all deliberate; the material ones are also pushed to `result.notes`)
 * ---------------------------------------------------------------------------
 *  1. Annual steps with a beginning-of-year draw: the whole year's income is taken out
 *     first and the remaining balance grows for the full year. Real life is monthly, so
 *     capital lasts marginally longer than modelled.
 *  2. Deterministic returns: `localBalancedReturn` and `offshoreReturnUsd` every year, no
 *     volatility and therefore no sequence-of-returns modelling (flagged as a risk instead).
 *  3. The GEPF increase is granted once a year on the full pension (in reality on 1 April,
 *     pro-rated in the first year), and the medical subsidy is treated as non-taxable income
 *     (it is an employer contribution to the scheme, not cash in hand).
 *  4. Withdrawals from discretionary capital are not taxed: the blended CGT / dividends /
 *     interest drag is charged on the RETURN each year via `discretionaryReturnTaxRate`
 *     instead. This overstates tax slightly for a buy-and-hold portfolio and understates the
 *     capital-gain event on a large withdrawal.
 *  5. The offshore sleeve is rebalanced back to its target share every year (an FX cost is
 *     charged only on rand converted TO foreign currency, never on repatriation).
 *  6. Fees are charged on the balance after the draw at the start of the year.
 *  7. Once-off capital needs are funded from the cash lump sum first and then from other
 *     savings, in every route (the spec only spells this out for the stay and cash routes;
 *     doing it everywhere keeps the routes comparable).
 *  8. Living-annuity minimum drawdown (2.5%) is enforced even when the target does not need
 *     it, so a low-spending member can show income ABOVE target; the surplus is treated as
 *     spent, not reinvested.
 *  9. The GEPF pension has no capital value at the horizon: the spouse pension (50% or 75%)
 *     continues while the spouse lives but is not capitalised into `legacyAtHorizon`.
 * 10. When money is retired out of a preservation fund the lump-sum tax leaves the system in
 *     that year: `capitalStart` for that year is measured AFTER the event, so the capital
 *     line steps down by the tax paid.
 */
import type {
  Assumptions,
  ComparisonMetric,
  ComparisonResult,
  FundInfo,
  GepfRules,
  Profile,
  RiskFlag,
  ScenarioDefinition,
  ScenarioResult,
  ScenarioSummary,
  TaxTables,
  YearRow,
} from './types'
import { DEFAULT_FUND_ID, FUNDS } from '../data/funds'
import { gepfBenefitsAtExit, getGepfRules } from './gepf'
import { clamp } from './money'
import { prosCons, riskFlags } from './insights'
import { calcIncomeTax, calcRetirementLumpSumTax, calcSavingsPotWithdrawalTax, calcWithdrawalLumpSumTax, getTaxTables, grossForNet } from './tax'

// ---------------------------------------------------------------------------
// Numeric guards (the engine never throws and never emits NaN / Infinity)
// ---------------------------------------------------------------------------

const CENT = 0.01

function num(value: number | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function nonNeg(value: number | undefined, fallback = 0): number {
  const v = num(value, fallback)
  return v > 0 ? v : 0
}

/** A growth/inflation rate clamped to something a projection can survive. */
function safeRate(value: number | undefined, fallback: number): number {
  return clamp(num(value, fallback), -0.9, 1)
}

/** A share clamped to [0, 1]. */
function fraction(value: number | undefined, fallback = 0): number {
  return clamp(num(value, fallback), 0, 1)
}

/** Guards a final output number so a pathological input can never put NaN on screen. */
function finite(value: number): number {
  return Number.isFinite(value) ? value : 0
}

// ---------------------------------------------------------------------------
// Assumptions
// ---------------------------------------------------------------------------

function mergeAssumptions(base: Assumptions, overrides: Partial<Assumptions> | undefined): Assumptions {
  const a = { ...base, ...(overrides ?? {}) }
  const minDraw = clamp(num(a.livingAnnuityMinDrawdown, 0.025), 0, 0.175)
  const maxDraw = clamp(num(a.livingAnnuityMaxDrawdown, 0.175), minDraw, 1)
  return {
    ...a,
    officialCpi: safeRate(a.officialCpi, 0.05),
    personalInflation: safeRate(a.personalInflation, 0.07),
    medicalInflation: safeRate(a.medicalInflation, safeRate(a.personalInflation, 0.07)),
    gepfIncreaseAsPctOfCpi: clamp(num(a.gepfIncreaseAsPctOfCpi, 1), 0, 2),
    usdZarSpot: Math.max(0.01, num(a.usdZarSpot, 18)),
    randDepreciation: safeRate(a.randDepreciation, 0.05),
    usInflation: safeRate(a.usInflation, 0.025),
    localBalancedReturn: safeRate(a.localBalancedReturn, 0.09),
    localCashReturn: safeRate(a.localCashReturn, 0.07),
    offshoreReturnUsd: safeRate(a.offshoreReturnUsd, 0.07),
    offshoreFee: fraction(a.offshoreFee, 0.006),
    fxConversionCost: clamp(num(a.fxConversionCost, 0.005), 0, 0.25),
    livingAnnuityMinDrawdown: minDraw,
    livingAnnuityMaxDrawdown: maxDraw,
    discretionaryReturnTaxRate: fraction(a.discretionaryReturnTaxRate, 0.12),
    returnVolatility: fraction(a.returnVolatility, 0.12),
  }
}

// ---------------------------------------------------------------------------
// Capital pots
// ---------------------------------------------------------------------------

interface Pot {
  name: string
  kind: 'living-annuity' | 'discretionary' | 'preservation'
  /** ZAR sleeve. */
  local: number
  /** Offshore sleeve, held in USD. */
  offshoreUsd: number
  /** All-in annual fee (decimal) charged on both sleeves. */
  fee: number
  targetOffshoreShare: number
  /** True for discretionary money: the year's return is taxed at `discretionaryReturnTaxRate`. */
  taxedReturns: boolean
}

function potValue(pot: Pot, usdZar: number): number {
  return pot.local + pot.offshoreUsd * usdZar
}

function totalValue(pots: Pot[], usdZar: number): number {
  let total = 0
  for (const p of pots) total += potValue(p, usdZar)
  return total
}

/**
 * Creates a pot from a rand amount, converting `offshoreShare` of it to USD and paying the
 * FX conversion cost on the converted rand (the cost is returned so the caller can book it
 * as a fee). Returns a pot with a zero balance for a zero/negative amount.
 */
function makePot(
  name: string,
  kind: Pot['kind'],
  amountZar: number,
  offshoreShare: number,
  usdZar: number,
  fxConversionCost: number,
  fee: number,
  taxedReturns: boolean,
): { pot: Pot; fxCost: number } {
  const amount = nonNeg(amountZar)
  const share = fraction(offshoreShare)
  const toOffshore = amount * share
  const fxCost = toOffshore * fxConversionCost
  return {
    pot: {
      name,
      kind,
      local: amount - toOffshore,
      offshoreUsd: usdZar > 0 ? (toOffshore - fxCost) / usdZar : 0,
      fee,
      targetOffshoreShare: share,
      taxedReturns,
    },
    fxCost,
  }
}

/**
 * Rebalances a pot to its target offshore share at the current rate and returns the FX cost.
 * Buying offshore costs `fxConversionCost` on the rand converted; the amount converted is
 * solved so that the share AFTER the cost is exactly the target (which is what the tests
 * assert). Repatriating costs nothing (simplification 5).
 */
function rebalance(pot: Pot, usdZar: number, fxConversionCost: number): number {
  const total = potValue(pot, usdZar)
  if (!(total > 0) || usdZar <= 0) {
    pot.local = Math.max(0, pot.local)
    pot.offshoreUsd = Math.max(0, pot.offshoreUsd)
    return 0
  }
  const share = pot.targetOffshoreShare
  const currentOffshore = pot.offshoreUsd * usdZar
  const targetOffshore = total * share
  if (targetOffshore > currentOffshore + 1e-9) {
    const c = fxConversionCost
    // (currentOffshore + d(1-c)) = share x (total - d x c)  ->  solve for the rand converted d.
    const denominator = 1 - c + share * c
    const d = denominator > 0 ? Math.min(pot.local, (targetOffshore - currentOffshore) / denominator) : 0
    if (d <= 0) return 0
    const cost = d * c
    pot.local -= d
    pot.offshoreUsd += (d - cost) / usdZar
    return cost
  }
  if (currentOffshore > targetOffshore + 1e-9) {
    const sell = currentOffshore - targetOffshore
    pot.offshoreUsd -= sell / usdZar
    pot.local += sell
  }
  return 0
}

/** Removes `amount` (ZAR) from a pot, taking it pro rata from the two sleeves. Returns what was taken. */
function withdraw(pot: Pot, amount: number, usdZar: number): number {
  const total = potValue(pot, usdZar)
  if (!(total > 0) || amount <= 0) return 0
  const take = Math.min(total, amount)
  const factor = take / total
  pot.local -= pot.local * factor
  pot.offshoreUsd -= pot.offshoreUsd * factor
  if (pot.local < 1e-9) pot.local = 0
  if (pot.offshoreUsd < 1e-12) pot.offshoreUsd = 0
  return take
}

// ---------------------------------------------------------------------------
// Default scenarios
// ---------------------------------------------------------------------------

/** The fund used for invested capital: the requested id, else the default index fund, else the first non-GEPF fund. */
function pickFundId(funds: FundInfo[]): string {
  if (funds.some((f) => f.id === DEFAULT_FUND_ID)) return DEFAULT_FUND_ID
  const investable = funds.find((f) => f.type !== 'gepf')
  return investable?.id ?? DEFAULT_FUND_ID
}

/**
 * The three core routes for a profile: stay in the GEPF, resign and preserve, resign and cash out.
 * Ids are stable ('stay' | 'preserve' | 'cash') because the store, the compare page and the
 * chart colours key off them.
 */
export function defaultScenarios(profile: Profile, funds: FundInfo[] = FUNDS): ScenarioDefinition[] {
  const list = funds.length > 0 ? funds : FUNDS
  const fundId = pickFundId(list)
  const exitAge = num(profile.person.plannedExitAge, num(profile.person.currentAge, 60))
  const retireFromPreservationAge = Math.max(55, exitAge)
  return [
    {
      id: 'stay',
      name: 'Stay: retire from GEPF',
      kind: 'stay-gepf',
      exitAge,
      fundId,
      offshorePct: 0.3,
      gratuityOffshorePct: 0.3,
      drawdownStrategy: 'target-income',
    },
    {
      id: 'preserve',
      name: 'Leave: preserve & living annuity',
      kind: 'resign-preserve',
      exitAge,
      retireFromPreservationAge,
      fundId: funds.some((f) => f.id === DEFAULT_FUND_ID) ? DEFAULT_FUND_ID : fundId,
      offshorePct: 0.5,
      lumpSumAtRetirementPct: 1 / 3,
      drawdownStrategy: 'target-income',
    },
    {
      id: 'cash',
      name: 'Leave: cash out & invest offshore',
      kind: 'resign-cash',
      exitAge,
      retireFromPreservationAge,
      fundId,
      offshorePct: 0.7,
      cashOutFraction: 1,
      lumpSumAtRetirementPct: 1 / 3,
      drawdownStrategy: 'target-income',
    },
  ]
}

// ---------------------------------------------------------------------------
// runScenario
// ---------------------------------------------------------------------------

export interface RunScenarioDeps {
  tables?: TaxTables
  rules?: GepfRules
  funds?: FundInfo[]
}

/** Everything the year loop needs that does not change from year to year. */
interface Setup {
  a: Assumptions
  tables: TaxTables
  rules: GepfRules
  currentAge: number
  exitAge: number
  planToAge: number
  medicalMembers: number
  /** Annual net income target at exit, split into the two escalating parts (today's rand). */
  medicalTargetToday: number
  otherTargetToday: number
  otherIncomeToday: number
  otherIncomeEscalation: number
}

/**
 * Runs one scenario end to end. Never throws: bad inputs are clamped and explained in
 * `result.notes`. Typical run time is well under 1 ms for a 30–40 year horizon.
 */
export function runScenario(profile: Profile, def: ScenarioDefinition, deps?: RunScenarioDeps): ScenarioResult {
  const notes: string[] = []
  const extraFlags: RiskFlag[] = []

  const a = mergeAssumptions(profile.assumptions, def.overrides)
  const tables = deps?.tables ?? getTaxTables(a.taxYear)
  const rules = deps?.rules ?? getGepfRules()
  const funds = deps?.funds ?? FUNDS
  if (def.overrides && Object.keys(def.overrides).length > 0) {
    notes.push(`This scenario overrides the global assumptions: ${Object.keys(def.overrides).join(', ')}.`)
  }

  const lifestyle = profile.lifestyle
  const gepf = profile.gepf
  const currentAge = Math.max(0, num(profile.person.currentAge, 55))

  let exitAge = num(def.exitAge, num(profile.person.plannedExitAge, currentAge))
  if (exitAge < currentAge) {
    notes.push(`The exit age of ${exitAge} is before your current age; it has been treated as an exit today at ${currentAge}.`)
    exitAge = currentAge
  }
  let planToAge = num(profile.person.planToAge, 90)
  if (planToAge <= exitAge) {
    notes.push(`The planning horizon (${planToAge}) is not after the exit age (${exitAge}); it has been extended to ${exitAge + 1}.`)
    planToAge = exitAge + 1
  }
  if (planToAge > 120) {
    notes.push(`The planning horizon has been capped at 120.`)
    planToAge = 120
  }

  const FALLBACK_FEE = 0.01
  const fund = funds.find((f) => f.id === def.fundId)
  if (!fund) notes.push(`Fund "${def.fundId}" was not found; a ${(FALLBACK_FEE * 100).toFixed(1)}% all-in fee has been assumed.`)
  const fee = fraction(def.feeOverride ?? fund?.allInFee, FALLBACK_FEE)
  const fundMaxOffshore = fund && fund.type !== 'gepf' ? fraction(fund.maxOffshore, 1) : 1

  const benefits = gepfBenefitsAtExit(profile, exitAge, rules)
  const { retirement, resignation, serviceYears, finalSalaryAnnual } = benefits
  if (benefits.source === 'statement') notes.push('GEPF values come from your benefit statement, grown to the exit age at your salary-growth assumption.')
  if (rules.actuarialFactors.confidence !== 'high') {
    notes.push(`Resignation values use ${rules.actuarialFactors.label} (confidence: ${rules.actuarialFactors.confidence}). Override them with your benefit statement.`)
  }

  const setup: Setup = {
    a,
    tables,
    rules,
    currentAge,
    exitAge,
    planToAge,
    medicalMembers: Math.max(0, Math.floor(nonNeg(lifestyle.medicalAidMembers))),
    medicalTargetToday: 0,
    otherTargetToday: 0,
    otherIncomeToday: nonNeg(lifestyle.otherIncomeMonthly) * 12,
    otherIncomeEscalation: safeRate(lifestyle.otherIncomeEscalation, a.officialCpi),
  }
  const targetToday = nonNeg(lifestyle.targetNetMonthlyIncomeToday) * 12
  setup.medicalTargetToday = Math.min(targetToday, nonNeg(lifestyle.medicalAidMonthly) * 12)
  setup.otherTargetToday = targetToday - setup.medicalTargetToday

  const usdZarAt = (t: number): number => a.usdZarSpot * (1 + a.randDepreciation) ** t
  const exitT = exitAge - currentAge
  const usdZarAtExit = usdZarAt(exitT)

  // --- Exit events --------------------------------------------------------
  const pots: Pot[] = []
  let fxCostAtExit = 0
  let previousLumpSums = nonNeg(gepf.previousLumpSumsWithdrawal) + nonNeg(gepf.previousLumpSumsRetirement)
  if (previousLumpSums > 0) notes.push(`Lump-sum tax is aggregated with ${formatNote(previousLumpSums)} of previous retirement-fund lump sums.`)

  let lumpSumGross = 0
  let lumpSumTax = 0
  let lumpSumNet = 0
  let lumpSumTable: ScenarioResult['atExit']['lumpSumTable'] = 'none'
  let transferredToPreservation = 0
  let pensionYear0 = 0
  let medicalSubsidyToday = 0
  let blockedBelow55 = false

  const subsidyEligible =
    gepf.medicalSubsidyEligible === true && serviceYears >= nonNeg(rules.medicalSubsidyMinServiceYears, 0) - 1e-9
  const subsidyMonthly = Math.min(nonNeg(gepf.medicalSubsidyMonthly), nonNeg(rules.medicalSubsidyMaxMonthly, Number.MAX_VALUE))

  let onceOffOutstanding = nonNeg(lifestyle.onceOffCapitalNeeds)
  /** Applies a rand amount to the outstanding once-off needs and returns what is left to invest. */
  const afterOnceOff = (amount: number): number => {
    const used = Math.min(amount, onceOffOutstanding)
    onceOffOutstanding -= used
    return amount - used
  }

  const addPot = (
    name: string,
    kind: Pot['kind'],
    amount: number,
    offshoreShare: number,
    potFee: number,
    taxedReturns: boolean,
  ): void => {
    if (!(amount > 0)) return
    const made = makePot(name, kind, amount, offshoreShare, usdZarAtExit, a.fxConversionCost, potFee, taxedReturns)
    fxCostAtExit += made.fxCost
    pots.push(made.pot)
  }

  const preservationOffshore = Math.min(fraction(def.offshorePct), fraction(tables.reg28.maxOffshore, 0.45), fundMaxOffshore)
  const livingAnnuityOffshore = Math.min(fraction(def.offshorePct), fundMaxOffshore)
  if (def.kind !== 'stay-gepf' && fraction(def.offshorePct) > preservationOffshore + 1e-9) {
    notes.push(
      `While the money sits in a preservation fund the offshore share is capped at ${(preservationOffshore * 100).toFixed(0)}% by Regulation 28; it moves to ${(livingAnnuityOffshore * 100).toFixed(0)}% in the living annuity.`,
    )
  }

  if (def.kind === 'stay-gepf') {
    if (exitAge < rules.earlyRetirementMinAge - 1e-9) {
      blockedBelow55 = true
      notes.push(
        `A GEPF member cannot retire before ${rules.earlyRetirementMinAge}: at ${exitAge} the only way out is resignation, so this route shows no gratuity and no pension.`,
      )
      extraFlags.push({
        id: 'cannot-retire-before-55',
        severity: 'critical',
        title: `Retirement is not available at ${Math.round(exitAge)}`,
        detail: `GEPF members may only retire from age ${rules.earlyRetirementMinAge}. Leaving at ${Math.round(exitAge)} is a resignation: you would receive the actuarial interest (about ${formatNote(resignation.actuarialInterest)}) instead of a gratuity of ${formatNote(retirement.gratuity)} and a pension of ${formatNote(retirement.annuityAnnual / 12)} a month. Compare the "leave" routes instead, or move the exit age to ${rules.earlyRetirementMinAge}+.`,
        appliesTo: ['stay-gepf'],
      })
    } else {
      lumpSumGross = nonNeg(retirement.gratuity)
      const lst = calcRetirementLumpSumTax(lumpSumGross, previousLumpSums, tables)
      lumpSumTax = lst.tax
      lumpSumNet = lst.net
      lumpSumTable = 'retirement'
      previousLumpSums += lumpSumGross
      pensionYear0 = nonNeg(retirement.annuityAnnual)
      medicalSubsidyToday = subsidyEligible ? subsidyMonthly * 12 : 0
      if (retirement.gratuityOnly) notes.push(`With ${serviceYears.toFixed(1)} years of service (less than ${rules.minServiceYearsForPension}) the GEPF pays a gratuity only — there is no monthly pension.`)
      if (retirement.monthsEarly > 0) {
        notes.push(
          `Retiring ${retirement.monthsEarly} months before ${rules.normalRetirementAge} reduces the gratuity and pension to ${(retirement.reductionFactor * 100).toFixed(1)}% of the full benefit.`,
        )
      }
      if (!subsidyEligible && gepf.medicalSubsidyEligible) {
        notes.push(`The medical subsidy needs ${rules.medicalSubsidyMinServiceYears} years of service; this exit has ${serviceYears.toFixed(1)}.`)
      }
    }
    addPot('Invested gratuity', 'discretionary', afterOnceOff(lumpSumNet), fraction(def.gratuityOffshorePct ?? def.offshorePct), fee, true)
  } else if (def.kind === 'resign-preserve') {
    transferredToPreservation = nonNeg(resignation.actuarialInterest)
    lumpSumTable = 'none'
    addPot('Preservation fund', 'preservation', transferredToPreservation, preservationOffshore, fee, false)
    notes.push('The full actuarial interest is transferred to a preservation fund: no tax is payable on the transfer.')
  } else {
    const cashFraction = fraction(def.cashOutFraction, 1)
    // Two-pot: the vested component is a withdrawal benefit (withdrawal lump-sum table, aggregated);
    // the savings component is taxed at the member's marginal rate on top of their income in the year
    // of resignation (approximated by the final pensionable salary).
    const vestedCash = nonNeg(resignation.vestedComponent) * cashFraction
    const savingsCash = nonNeg(resignation.savingsComponent) * cashFraction
    lumpSumGross = vestedCash + savingsCash
    const lst = calcWithdrawalLumpSumTax(vestedCash, previousLumpSums, tables)
    const savingsTax = calcSavingsPotWithdrawalTax(savingsCash, nonNeg(finalSalaryAnnual), exitAge, tables)
    lumpSumTax = lst.tax + savingsTax
    lumpSumNet = lumpSumGross - lumpSumTax
    lumpSumTable = 'withdrawal'
    previousLumpSums += vestedCash
    if (savingsCash > CENT) {
      notes.push(
        `Savings component cash of ${formatNote(savingsCash)} is taxed at your marginal rate (${formatNote(savingsTax)}) on top of your salary in the year you resign; the vested component ${formatNote(vestedCash)} is taxed on the withdrawal table.`,
      )
    }
    transferredToPreservation = nonNeg(resignation.maxCashOnResignation) - lumpSumGross + nonNeg(resignation.retirementComponent)
    addPot('Invested cash', 'discretionary', afterOnceOff(lumpSumNet), fraction(def.offshorePct), fee, true)
    addPot('Preservation fund', 'preservation', transferredToPreservation, preservationOffshore, fee, false)
    notes.push(
      `Only the vested and savings components (${formatNote(resignation.maxCashOnResignation)}) may be taken in cash; the retirement component must be preserved.`,
    )
  }

  // Other savings are part of every route.
  const otherSavings = afterOnceOff(nonNeg(lifestyle.otherSavings))
  addPot('Other savings', 'discretionary', otherSavings, fraction(lifestyle.otherSavingsOffshorePct), fee, true)
  if (onceOffOutstanding > CENT) {
    notes.push(`Once-off capital needs of ${formatNote(onceOffOutstanding)} could not be funded at exit and are assumed to be deferred or borrowed.`)
  }

  const forfeitedMedicalSubsidyPv =
    def.kind === 'stay-gepf' || !subsidyEligible
      ? 0
      : pvOfSubsidy(subsidyMonthly * 12, exitAge, planToAge, currentAge, a.medicalInflation, a.personalInflation)

  const investedCapital = totalValue(pots, usdZarAtExit)
  const investedOffshoreZar = pots.reduce((s, p) => s + p.offshoreUsd * usdZarAtExit, 0)

  // --- Year loop ----------------------------------------------------------
  const retireFromPreservationAge = Math.max(
    rules.earlyRetirementMinAge,
    num(def.retireFromPreservationAge, Math.max(rules.earlyRetirementMinAge, exitAge)),
    exitAge,
  )
  let atRetirementFromPreservation: ScenarioResult['atRetirementFromPreservation']

  const rows: YearRow[] = []
  /** Total income tax per year (the rows only carry the apportioned parts). */
  const incomeTaxByYear: number[] = []
  let lifetimeIncomeTax = 0
  let lifetimeReturnTax = 0
  let commutationTax = 0
  let lifetimeFees = fxCostAtExit
  let ruinAge: number | null = null
  /**
   * True once the scenario has actually held investable capital. `ruinAge` means "the capital
   * ran out", so a route that never had any capital to begin with (e.g. a GEPF pension where the
   * whole gratuity went on once-off needs and there are no other savings) must report `null`,
   * not the exit age: nothing was exhausted, and the comparison table's "capital runs out at age"
   * would otherwise rank a lifelong pension worst on a metric that does not apply to it.
   */
  let capitalEverPositive = false
  let incomeShortfallAge: number | null = null
  const horizonYears = Math.round(planToAge - exitAge)

  for (let i = 0; i <= horizonYears; i++) {
    const age = exitAge + i
    const t = age - currentAge
    const cpiIndex = (1 + a.officialCpi) ** t
    const personalIndex = (1 + a.personalInflation) ** t
    const medicalIndex = (1 + a.medicalInflation) ** t
    const usdZar = usdZarAt(t)
    const usdZarNext = usdZarAt(t + 1)
    const personalIndexNext = (1 + a.personalInflation) ** (t + 1)

    // Retire the preserved money into a living annuity (and take the lump sum) at the chosen age.
    const preservation = pots.find((p) => p.kind === 'preservation')
    if (preservation && age >= retireFromPreservationAge - 1e-9) {
      const preservationValue = potValue(preservation, usdZar)
      const lumpPct = clamp(num(def.lumpSumAtRetirementPct, 1 / 3), 0, 1 / 3)
      const gross = preservationValue * lumpPct
      const lst = calcRetirementLumpSumTax(gross, previousLumpSums, tables)
      previousLumpSums += gross
      const intoLivingAnnuity = preservationValue - gross
      atRetirementFromPreservation = {
        age,
        preservationValue,
        lumpSumGross: gross,
        lumpSumTax: lst.tax,
        lumpSumNet: lst.net,
        intoLivingAnnuity,
      }
      // The fund itself becomes the living annuity: the sleeves carry over (so the offshore
      // money already held is not converted a second time) and the yearly rebalance moves the
      // offshore share from the Regulation 28 cap up to the living annuity's target.
      withdraw(preservation, gross, usdZar)
      preservation.kind = 'living-annuity'
      preservation.name = 'Living annuity'
      preservation.targetOffshoreShare = livingAnnuityOffshore
      pots.splice(pots.indexOf(preservation), 1)
      pots.unshift(preservation)
      if (lst.net > 0) {
        const cashPot = makePot('Retirement lump sum invested', 'discretionary', lst.net, fraction(def.offshorePct), usdZar, a.fxConversionCost, fee, true)
        lifetimeFees += cashPot.fxCost
        pots.push(cashPot.pot)
      }
      if (num(def.lumpSumAtRetirementPct, 1 / 3) > 1 / 3 + 1e-9) notes.push('The lump sum at retirement is capped at one third of the fund value.')
    }

    // De minimis: once a living annuity is worth less than the amount that may be commuted in
    // full (`tables.deMinimisAnnuitisation` in today's rand, escalated with personal inflation),
    // the member takes it in cash on the retirement table and the balance becomes ordinary
    // discretionary savings. Without this rule a living annuity capped at 17.5% a year would
    // mathematically never reach zero, so `ruinAge` could never be reached.
    const annuityPot = pots.find((p) => p.kind === 'living-annuity')
    if (annuityPot) {
      const value = potValue(annuityPot, usdZar)
      const deMinimis = nonNeg(tables.deMinimisAnnuitisation, 150_000) * personalIndex
      if (value > 0 && value < deMinimis) {
        const lst = calcRetirementLumpSumTax(value, previousLumpSums, tables)
        previousLumpSums += value
        commutationTax += lst.tax
        withdraw(annuityPot, lst.tax, usdZar)
        annuityPot.kind = 'discretionary'
        annuityPot.taxedReturns = true
        annuityPot.name = 'Commuted living annuity'
        notes.push(
          `At age ${age} the living annuity is worth less than the de-minimis commutation amount (${formatNote(
            nonNeg(tables.deMinimisAnnuitisation, 150_000),
          )} in today's rand), so it is taken in full as a lump sum and the balance is treated as discretionary savings.`,
        )
      }
    }

    const capitalStart = totalValue(pots, usdZar)
    if (capitalStart > CENT) capitalEverPositive = true

    // --- Income sources -----------------------------------------------------
    const gepfPensionGross = pensionYear0 * (1 + a.officialCpi * a.gepfIncreaseAsPctOfCpi) ** i
    const medicalSubsidy = medicalSubsidyToday * medicalIndex
    const otherIncomeGross = setup.otherIncomeToday * (1 + setup.otherIncomeEscalation) ** t
    const targetNetIncome = setup.medicalTargetToday * medicalIndex + setup.otherTargetToday * personalIndex

    const taxOpts = { medicalMembers: setup.medicalMembers }
    const netOfTax = (taxable: number): number => taxable - calcIncomeTax(taxable, age, tables, taxOpts).tax
    const baseTaxable = gepfPensionGross + otherIncomeGross
    let needed = Math.max(0, targetNetIncome - (netOfTax(baseTaxable) + medicalSubsidy))

    // --- Draws: living annuity first (clamped), then discretionary pots ------
    let laDraw = 0
    const la = pots.find((p) => p.kind === 'living-annuity')
    if (la) {
      const laCapital = potValue(la, usdZar)
      const wanted =
        def.drawdownStrategy === 'fixed-pct'
          ? laCapital * fraction(def.drawdownPct, a.livingAnnuityMinDrawdown)
          : needed > 0
            ? grossForNet(needed, age, tables, { medicalMembers: setup.medicalMembers, otherTaxableIncome: baseTaxable })
            : 0
      const minDraw = laCapital * a.livingAnnuityMinDrawdown
      const maxDraw = laCapital * a.livingAnnuityMaxDrawdown
      laDraw = Math.min(clamp(wanted, minDraw, maxDraw), laCapital)
      laDraw = withdraw(la, laDraw, usdZar)
      needed = Math.max(0, targetNetIncome - (netOfTax(baseTaxable + laDraw) + medicalSubsidy))
    }

    let discretionaryDraw = 0
    if (needed > CENT) {
      for (const pot of pots) {
        if (needed <= CENT) break
        if (pot.kind !== 'discretionary') continue
        const taken = withdraw(pot, needed, usdZar)
        discretionaryDraw += taken
        needed -= taken
      }
    }

    // --- Tax and net income --------------------------------------------------
    const taxable = baseTaxable + laDraw
    const taxResult = calcIncomeTax(taxable, age, tables, taxOpts)
    const totalTax = taxResult.tax
    const gepfPensionTax = taxable > 0 ? (totalTax * gepfPensionGross) / taxable : 0
    const laTax = taxable > 0 ? (totalTax * laDraw) / taxable : 0
    const drawGross = laDraw + discretionaryDraw
    const totalNetIncome = taxable - totalTax + medicalSubsidy + discretionaryDraw
    const shortfall = Math.max(0, targetNetIncome - totalNetIncome)
    lifetimeIncomeTax += totalTax
    incomeTaxByYear.push(totalTax)

    // --- Rebalance, grow, pay fees ------------------------------------------
    let feesThisYear = 0
    let returnTaxThisYear = 0
    for (const pot of pots) {
      feesThisYear += rebalance(pot, usdZar, a.fxConversionCost)
      const localFee = pot.local * pot.fee
      const localGain = pot.local * a.localBalancedReturn - localFee
      const offshoreFeeUsd = pot.offshoreUsd * pot.fee
      const offshoreGainUsd = pot.offshoreUsd * a.offshoreReturnUsd - offshoreFeeUsd
      const localTax = pot.taxedReturns ? Math.max(0, localGain) * a.discretionaryReturnTaxRate : 0
      const offshoreTaxUsd = pot.taxedReturns ? Math.max(0, offshoreGainUsd) * a.discretionaryReturnTaxRate : 0
      pot.local = Math.max(0, pot.local + localGain - localTax)
      pot.offshoreUsd = Math.max(0, pot.offshoreUsd + offshoreGainUsd - offshoreTaxUsd)
      feesThisYear += localFee + offshoreFeeUsd * usdZarNext
      returnTaxThisYear += localTax + offshoreTaxUsd * usdZarNext
    }
    lifetimeFees += feesThisYear
    lifetimeReturnTax += returnTaxThisYear

    const capitalLocal = pots.reduce((s, p) => s + p.local, 0)
    const capitalOffshoreUsd = pots.reduce((s, p) => s + p.offshoreUsd, 0)
    const capitalOffshoreZar = capitalOffshoreUsd * usdZarNext
    const capitalEnd = capitalLocal + capitalOffshoreZar
    // Residual so that capitalStart - draws + investmentReturn - fees === capitalEnd exactly.
    // It is net of the discretionary return tax and includes the currency translation gain.
    const investmentReturn = capitalEnd - (capitalStart - drawGross) + feesThisYear

    const row: YearRow = {
      year: i,
      age,
      cpiIndex: finite(cpiIndex),
      personalIndex: finite(personalIndex),
      usdZar: finite(usdZar),
      gepfPensionGross: finite(gepfPensionGross),
      gepfPensionTax: finite(gepfPensionTax),
      gepfPensionNet: finite(gepfPensionGross - gepfPensionTax),
      medicalSubsidy: finite(medicalSubsidy),
      drawGross: finite(drawGross),
      drawTax: finite(laTax),
      drawNet: finite(drawGross - laTax),
      otherIncomeGross: finite(otherIncomeGross),
      totalNetIncome: finite(totalNetIncome),
      totalNetIncomeReal: finite(personalIndex > 0 ? totalNetIncome / personalIndex : totalNetIncome),
      targetNetIncome: finite(targetNetIncome),
      shortfall: finite(shortfall),
      capitalStart: finite(capitalStart),
      capitalEnd: finite(capitalEnd),
      capitalLocal: finite(capitalLocal),
      capitalOffshoreZar: finite(capitalOffshoreZar),
      capitalOffshoreUsd: finite(capitalOffshoreUsd),
      capitalEndReal: finite(personalIndexNext > 0 ? capitalEnd / personalIndexNext : capitalEnd),
      investmentReturn: finite(investmentReturn),
      fees: finite(feesThisYear),
      drawdownRate: finite(capitalStart > 0 ? drawGross / capitalStart : 0),
      capped: shortfall > CENT,
    }
    rows.push(row)
    if (ruinAge === null && capitalEverPositive && row.capitalEnd <= CENT) ruinAge = age
    if (incomeShortfallAge === null && shortfall > 0.01 * Math.max(1, targetNetIncome)) incomeShortfallAge = age
  }

  // --- Totals ---------------------------------------------------------------
  const first = rows[0]
  let lifetimeNetIncomeNominal = 0
  let pvNetIncome = 0
  for (const r of rows) {
    lifetimeNetIncomeNominal += r.totalNetIncome
    pvNetIncome += r.totalNetIncomeReal
  }
  const last = rows[rows.length - 1]
  const lumpSumTaxAtRetirement = atRetirementFromPreservation?.lumpSumTax ?? 0
  const guaranteedIncomeShare = first && first.totalNetIncome > 0 ? first.gepfPensionNet / first.totalNetIncome : 0

  const result: ScenarioResult = {
    definition: def,
    kind: def.kind,
    atExit: {
      age: exitAge,
      finalSalaryAnnual: finite(finalSalaryAnnual),
      serviceYears: finite(serviceYears),
      gratuity: finite(blockedBelow55 ? 0 : retirement.gratuity),
      actuarialInterest: finite(resignation.actuarialInterest),
      vestedComponent: finite(resignation.vestedComponent),
      savingsComponent: finite(resignation.savingsComponent),
      retirementComponent: finite(resignation.retirementComponent),
      lumpSumGross: finite(lumpSumGross),
      lumpSumTax: finite(lumpSumTax),
      lumpSumNet: finite(lumpSumNet),
      lumpSumTable,
      transferredToPreservation: finite(transferredToPreservation),
      investedCapital: finite(investedCapital),
      investedOffshoreZar: finite(investedOffshoreZar),
      forfeitedMedicalSubsidyPv: finite(forfeitedMedicalSubsidyPv),
    },
    atRetirementFromPreservation,
    firstYear: {
      grossMonthlyIncome: finite(((first?.gepfPensionGross ?? 0) + (first?.drawGross ?? 0) + (first?.otherIncomeGross ?? 0) + (first?.medicalSubsidy ?? 0)) / 12),
      monthlyTax: finite((incomeTaxByYear[0] ?? 0) / 12),
      netMonthlyIncome: finite((first?.totalNetIncome ?? 0) / 12),
      targetNetMonthlyIncome: finite((first?.targetNetIncome ?? 0) / 12),
      gepfPensionMonthlyGross: finite((first?.gepfPensionGross ?? 0) / 12),
      gepfPensionMonthlyTax: finite((first?.gepfPensionTax ?? 0) / 12),
      gepfPensionMonthlyNet: finite((first?.gepfPensionNet ?? 0) / 12),
    },
    ruinAge,
    incomeShortfallAge,
    rows,
    totals: {
      lifetimeNetIncomeNominal: finite(lifetimeNetIncomeNominal),
      lifetimeNetIncomeReal: finite(pvNetIncome),
      lifetimeTaxPaid: finite(lifetimeIncomeTax + lifetimeReturnTax + commutationTax + lumpSumTax + lumpSumTaxAtRetirement),
      lifetimeFeesPaid: finite(lifetimeFees),
      pvNetIncome: finite(pvNetIncome),
      legacyAtHorizon: finite(last?.capitalEnd ?? 0),
      legacyAtHorizonReal: finite(last?.capitalEndReal ?? 0),
      guaranteedIncomeShare: finite(clamp(guaranteedIncomeShare, 0, 1)),
    },
    pros: [],
    cons: [],
    flags: [],
    notes,
  }

  notes.push(
    `Capital is drawn at the start of each year and grows for the rest of it; returns are ${(a.localBalancedReturn * 100).toFixed(1)}% locally and ${(a.offshoreReturnUsd * 100).toFixed(1)}% in US dollars before a ${(fee * 100).toFixed(2)}% all-in fee, with no volatility.`,
    'Discretionary withdrawals are not taxed as income; the CGT / dividends / interest drag is charged on the return each year instead.',
    'The GEPF pension has no capital value at the horizon: the spouse pension continues while your spouse lives but is not included in the legacy figure.',
  )

  const insight = prosCons(result, profile, rules)
  result.pros = insight.pros
  result.cons = insight.cons
  result.flags = [...extraFlags, ...riskFlags(result, profile, rules)]
  return result
}

/** PV in TODAY's rand of the medical subsidy stream from exit to the horizon. */
function pvOfSubsidy(
  annualToday: number,
  exitAge: number,
  planToAge: number,
  currentAge: number,
  medicalInflation: number,
  personalInflation: number,
): number {
  if (!(annualToday > 0)) return 0
  let pv = 0
  for (let age = exitAge; age <= planToAge + 1e-9; age++) {
    const t = age - currentAge
    pv += (annualToday * (1 + medicalInflation) ** t) / (1 + personalInflation) ** t
  }
  return pv
}

/** Compact rand for notes (the UI formats properly; notes are plain strings). */
function formatNote(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `R${(value / 1_000_000).toFixed(2)}m`
  if (abs >= 1_000) return `R${Math.round(value / 1_000)}k`
  return `R${Math.round(value)}`
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

interface MetricSpec {
  key: string
  label: string
  format: ComparisonMetric['format']
  higherIsBetter: boolean
  /** null means "not applicable / never happens", which is the BEST outcome for the age metrics. */
  value: (r: ScenarioResult) => number | string | null
  nullIsBest?: boolean
}

const METRICS: MetricSpec[] = [
  {
    key: 'netLumpSum',
    label: 'Net lump sum at exit',
    format: 'currency',
    higherIsBetter: true,
    value: (r) => r.atExit.lumpSumNet + (r.atRetirementFromPreservation?.lumpSumNet ?? 0),
  },
  {
    key: 'lumpSumTax',
    label: 'Tax on lump sums',
    format: 'currency',
    higherIsBetter: false,
    value: (r) => r.atExit.lumpSumTax + (r.atRetirementFromPreservation?.lumpSumTax ?? 0),
  },
  { key: 'investedCapital', label: 'Capital invested at exit', format: 'currency', higherIsBetter: true, value: (r) => r.atExit.investedCapital },
  { key: 'firstYearNetIncome', label: 'Net income, first year', format: 'currencyMonthly', higherIsBetter: true, value: (r) => r.firstYear.netMonthlyIncome },
  { key: 'firstYearTax', label: 'Income tax, first year', format: 'currencyMonthly', higherIsBetter: false, value: (r) => r.firstYear.monthlyTax },
  { key: 'guaranteedIncomeShare', label: 'Guaranteed income share', format: 'percent', higherIsBetter: true, value: (r) => r.totals.guaranteedIncomeShare },
  { key: 'incomeShortfallAge', label: 'Income falls short from age', format: 'age', higherIsBetter: true, value: (r) => r.incomeShortfallAge, nullIsBest: true },
  { key: 'ruinAge', label: 'Capital runs out at age', format: 'age', higherIsBetter: true, value: (r) => r.ruinAge, nullIsBest: true },
  { key: 'lifetimeTax', label: 'Lifetime tax paid', format: 'currency', higherIsBetter: false, value: (r) => r.totals.lifetimeTaxPaid },
  { key: 'lifetimeFees', label: 'Lifetime fees paid', format: 'currency', higherIsBetter: false, value: (r) => r.totals.lifetimeFeesPaid },
  { key: 'pvNetIncome', label: 'Lifetime net income (today’s rand)', format: 'currency', higherIsBetter: true, value: (r) => r.totals.pvNetIncome },
  { key: 'legacyReal', label: 'Legacy at horizon (today’s rand)', format: 'currency', higherIsBetter: true, value: (r) => r.totals.legacyAtHorizonReal },
  { key: 'forfeitedMedicalSubsidy', label: 'Medical subsidy given up (PV)', format: 'currency', higherIsBetter: false, value: (r) => r.atExit.forfeitedMedicalSubsidyPv },
]

/** Side-by-side metric table plus the winning scenario id per metric. */
export function compareScenarios(results: ScenarioResult[]): ComparisonResult {
  const table: ComparisonMetric[] = []
  const winners: Record<string, string> = {}

  for (const spec of METRICS) {
    const values: Record<string, number | string | null> = {}
    for (const r of results) values[r.definition.id] = spec.value(r)
    table.push({ key: spec.key, label: spec.label, format: spec.format, higherIsBetter: spec.higherIsBetter, values })

    let bestId: string | undefined
    let bestScore: number | undefined
    for (const r of results) {
      const raw = values[r.definition.id]
      let score: number
      if (raw === null || raw === undefined) {
        if (!spec.nullIsBest) continue
        score = Number.POSITIVE_INFINITY
      } else if (typeof raw === 'string') {
        continue
      } else if (!Number.isFinite(raw)) {
        continue
      } else {
        score = spec.higherIsBetter ? raw : -raw
      }
      if (bestScore === undefined || score > bestScore) {
        bestScore = score
        bestId = r.definition.id
      }
    }
    if (bestId !== undefined) winners[spec.key] = bestId
  }

  return { scenarios: results, table, winners }
}

// ---------------------------------------------------------------------------
// Summary (for the AI context and compact cards)
// ---------------------------------------------------------------------------

export function summarise(result: ScenarioResult): ScenarioSummary {
  return {
    id: result.definition.id,
    name: result.definition.name,
    kind: result.kind,
    exitAge: result.atExit.age,
    fundId: result.definition.fundId,
    offshorePct: result.definition.offshorePct,
    lumpSumNet: result.atExit.lumpSumNet + (result.atRetirementFromPreservation?.lumpSumNet ?? 0),
    lumpSumTax: result.atExit.lumpSumTax + (result.atRetirementFromPreservation?.lumpSumTax ?? 0),
    investedCapital: result.atExit.investedCapital,
    firstYearNetMonthlyIncome: result.firstYear.netMonthlyIncome,
    firstYearMonthlyTax: result.firstYear.monthlyTax,
    ruinAge: result.ruinAge,
    incomeShortfallAge: result.incomeShortfallAge,
    legacyAtHorizonReal: result.totals.legacyAtHorizonReal,
    pvNetIncome: result.totals.pvNetIncome,
    flags: result.flags.map((f) => f.id),
  }
}

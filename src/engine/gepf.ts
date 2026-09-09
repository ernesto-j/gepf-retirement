/**
 * GEPF benefit engine: retirement benefit (gratuity + life annuity), early-retirement
 * reduction, resignation benefit (actuarial interest) and its two-pot split, plus the
 * profile-level helper `gepfBenefitsAtExit` that projects service and salary to the exit
 * age and applies benefit-statement overrides.
 *
 * Pure TypeScript, no React. Every function takes its data (`GepfRules`) as a parameter.
 * Nothing here throws for ordinary bad input: NaN / negative inputs are clamped and the
 * simplification is documented next to the code.
 *
 * Formulas (GEPF Rules, unchanged since 1996 — see research/gepf-benefit-rules.md):
 *   10+ years:  gratuity = 0.0672 x FS x N        annuity = FS x N / 55 + R360 p.a.
 *   < 10 years: gratuity = 0.15 x FS x N (proxy for the actuarial interest), no annuity
 *   early retirement (55-59, no exemption): x (1 - months before 60 x 1/300)
 *   resignation: actuarial interest = N x FS x F(age)   (GEPF Rule 14.4; FAQ example F(40) = 0.2036)
 * where FS = average pensionable salary over the last 24 months and N = pensionable service.
 * `gratuityComponent` reports the unreduced gratuity and `annuityComponent` the remainder, i.e. the
 * value the factor implicitly places on the annuity.
 */
import type {
  ActuarialFactorTable,
  GepfBenefitInput,
  GepfMembership,
  GepfResignationBenefit,
  GepfRetirementBenefit,
  GepfRules,
  GepfStatementValues,
  Profile,
} from './types'
import { GEPF_RULES } from '../data/gepfRules'
import { clamp, yearsBetween } from './money'

/**
 * Reference "today" (ISO date) used to derive service completed before the two-pot start
 * date and to age benefit-statement values. A constant rather than `new Date()` so that
 * results are reproducible; callers may override it through the `deps` argument of
 * `gepfBenefitsAtExit`. SIMPLIFICATION: if the app runs long after this date the derived
 * pre-two-pot service is overstated by the elapsed time (the member can enter
 * `serviceYearsBeforeTwoPot` explicitly, which takes precedence).
 */
export const TODAY = '2026-09-09'

/** Optional dependencies for `gepfBenefitsAtExit` (kept optional so the spec signature still holds). */
export interface GepfBenefitsDeps {
  /** ISO date treated as today (default `TODAY`). */
  today?: string
  /** Employer-initiated / ill-health retirement: no early-retirement reduction. */
  exemptFromEarlyReduction?: boolean
}

// ---------------------------------------------------------------------------
// Small numeric guards
// ---------------------------------------------------------------------------

/** Finite number or the fallback (NaN / Infinity / undefined from a blank input never propagate). */
function num(value: number | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** Finite, strictly positive number or undefined. Used for optional statement values. */
function positive(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

/** Finite, non-negative number or undefined. */
function nonNegative(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

/** The ISO date if it parses, else undefined. */
function validIsoDate(value: string | undefined): string | undefined {
  if (!value) return undefined
  return Number.isNaN(new Date(value).getTime()) ? undefined : value
}

function isBefore(isoA: string, isoB: string): boolean {
  const a = new Date(isoA).getTime()
  const b = new Date(isoB).getTime()
  return Number.isFinite(a) && Number.isFinite(b) && a < b
}

// ---------------------------------------------------------------------------
// Rules and factor table
// ---------------------------------------------------------------------------

export function getGepfRules(): GepfRules {
  return GEPF_RULES
}

/**
 * Actuarial interest factor at `age`: linear interpolation between the table points,
 * clamped to the first/last point outside the table. The points are sorted defensively
 * (the data file is expected to be ascending already) and non-finite points are ignored.
 * An empty table yields 0 (i.e. the actuarial interest collapses to the gratuity) rather
 * than throwing; a NaN age is treated as the youngest tabulated age.
 */
export function interpolateFactor(table: ActuarialFactorTable, age: number): number {
  const points = (table.points ?? [])
    .filter((p) => Number.isFinite(p.age) && Number.isFinite(p.factor))
    .slice()
    .sort((a, b) => a.age - b.age)
  if (points.length === 0) return 0
  const first = points[0]
  const last = points[points.length - 1]
  if (!Number.isFinite(age) || age <= first.age) return first.factor
  if (age >= last.age) return last.factor
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (age >= a.age && age <= b.age) {
      const span = b.age - a.age
      if (span <= 0) return a.factor // duplicate age: take the first point
      return a.factor + ((b.factor - a.factor) * (age - a.age)) / span
    }
  }
  return last.factor // unreachable given the clamps above; keeps the function total
}

// ---------------------------------------------------------------------------
// Service and salary projection
// ---------------------------------------------------------------------------

/**
 * Service and salary at the exit age.
 * - `serviceYears = serviceNow + n` where `n = exitAge - currentAge` clamped to >= 0 (an exit
 *   age in the past is treated as "exit now").
 * - `salaryAtExit = salaryNow x (1+g)^n`.
 * - Final salary = average pensionable salary over the last 24 months, approximated by the
 *   mean of the salary in the last two years: `salaryNow x (1+g)^(n-1) x (2+g)/2`. For n < 1
 *   the current salary is used as-is (per spec; note the small step at n = 1, which is the
 *   (2+g)/2 averaging kicking in).
 * SIMPLIFICATION: salary is assumed to grow smoothly at `salaryGrowth` (no notch increases,
 * promotions or the 30 April 1997 floor); growth below -99% is clamped.
 */
export function projectServiceAndSalary(
  m: GepfMembership,
  currentAge: number,
  exitAge: number,
): { serviceYears: number; finalSalaryAnnual: number; salaryAtExit: number } {
  const salaryNow = Math.max(0, num(m.pensionableSalaryAnnual))
  const g = Math.max(-0.99, num(m.salaryGrowth))
  const n = Math.max(0, num(exitAge) - num(currentAge))
  const serviceYears = Math.max(0, num(m.pensionableServiceYearsNow) + n)
  const salaryAtExit = salaryNow * (1 + g) ** n
  const finalSalaryAnnual = n < 1 ? salaryNow : salaryNow * (1 + g) ** (n - 1) * ((2 + g) / 2)
  return { serviceYears, finalSalaryAnnual, salaryAtExit }
}

// ---------------------------------------------------------------------------
// Retirement benefit
// ---------------------------------------------------------------------------

/** Formula benefit before any early-retirement reduction or spouse-pension cost. */
interface UnreducedBenefit {
  gratuity: number
  annuity: number
  gratuityOnly: boolean
  /** Inputs kept for the actuarial-interest formula (N x FS x F(Z)). */
  finalSalary: number
  serviceYears: number
}

function unreducedBenefit(finalSalaryAnnual: number, serviceYears: number, rules: GepfRules): UnreducedBenefit {
  const fs = Math.max(0, num(finalSalaryAnnual))
  const years = Math.max(0, num(serviceYears))
  if (years < rules.minServiceYearsForPension) {
    // < 10 years: GEPF pays the actuarial interest as a gratuity. The spec models this as
    // 0.15 x FS x years (a proxy; the true value is age-dependent).
    return { gratuity: rules.shortServiceGratuityFactor * fs * years, annuity: 0, gratuityOnly: true, finalSalary: fs, serviceYears: years }
  }
  return {
    gratuity: rules.gratuityFactor * fs * years,
    annuity: (fs * years) / rules.annuityDivisor + rules.annuityFixedAddition,
    gratuityOnly: false,
    finalSalary: fs,
    serviceYears: years,
  }
}

/**
 * Whole months between the exit age and the normal retirement age (0 if at/after it).
 * SIMPLIFICATION: fractional ages are rounded to the nearest whole month; GEPF counts the
 * calendar months between the retirement date and the 60th birthday.
 */
function monthsBeforeNormalRetirement(ageAtExit: number, rules: GepfRules): number {
  return Math.max(0, Math.round((rules.normalRetirementAge - ageAtExit) * 12))
}

/**
 * Applies the early-retirement reduction and the spouse-pension election to unreduced
 * amounts. Shared by the formula path and the statement path.
 */
function finaliseRetirement(
  u: UnreducedBenefit,
  ageAtExit: number,
  exemptFromEarlyReduction: boolean | undefined,
  spousePensionPct: number | undefined,
  rules: GepfRules,
): GepfRetirementBenefit {
  const monthsEarly = monthsBeforeNormalRetirement(ageAtExit, rules)
  // 1/3 of 1% per month before 60. The formula keeps running below 55 (and is clamped at 0
  // for very early ages) even though the member cannot actually retire before 55: the
  // scenario builder must not offer a stay-gepf route below `earlyRetirementMinAge`.
  // SIMPLIFICATION: the reduction is also applied to the < 10-year gratuity (which in
  // reality is an age-based actuarial interest rather than a penalised formula benefit).
  const reductionFactor = exemptFromEarlyReduction
    ? 1
    : clamp(1 - monthsEarly * rules.earlyRetirementReductionPerMonth, 0, 1)
  const gratuity = u.gratuity * reductionFactor
  let annuityAnnual = u.annuity * reductionFactor

  // Spouse pension: 50% is included at no cost; electing 75% costs a reduction of the
  // member's own pension (rules.spousePensionEnhancedCostPct, an estimate: GEPF quotes the
  // actual percentage per member based on both ages and genders). The spouse pension is a
  // percentage of the member's (post-cost) pension.
  const spouseFraction = Math.max(0, num(spousePensionPct, rules.spousePensionDefault * 100) / 100)
  if (spouseFraction > rules.spousePensionDefault + 1e-9) {
    annuityAnnual *= 1 - rules.spousePensionEnhancedCostPct
  }
  const spousePensionAnnual = annuityAnnual * spouseFraction

  return {
    gratuity,
    annuityAnnual,
    annuityMonthly: annuityAnnual / 12,
    reductionFactor,
    monthsEarly,
    gratuityOnly: u.gratuityOnly,
    spousePensionAnnual,
  }
}

/**
 * Retirement benefit from the formula inputs (final salary, service, age at exit).
 * See the module header for the formulas; `spousePensionPct` defaults to the rules'
 * default (50) when omitted and may be 0 for a member without a spouse.
 */
export function calcGepfRetirementBenefit(input: GepfBenefitInput, rules: GepfRules): GepfRetirementBenefit {
  const u = unreducedBenefit(input.finalSalaryAnnual, input.pensionableServiceYears, rules)
  const ageAtExit = num(input.ageAtExit, rules.normalRetirementAge)
  return finaliseRetirement(u, ageAtExit, input.exemptFromEarlyReduction, input.spousePensionPct, rules)
}

// ---------------------------------------------------------------------------
// Resignation benefit (actuarial interest) and two-pot split
// ---------------------------------------------------------------------------

/** Share of the actuarial interest that accrued before the two-pot start date, clamped to [0, 1]. */
export function twoPotPreShare(serviceYearsBeforeTwoPot: number, serviceYears: number): number {
  const years = num(serviceYears)
  if (years <= 0) return 0
  return clamp(num(serviceYearsBeforeTwoPot) / years, 0, 1)
}

/**
 * Two-pot split of an actuarial interest given the pre-two-pot share of service.
 *   vestedBeforeSeed = AI x preShare
 *   seed             = min(seedPct x vestedBeforeSeed, seedCap)   (moved to the savings component)
 *   vested           = vestedBeforeSeed - seed
 *   post             = AI x (1 - preShare)  ->  1/3 savings, 2/3 retirement
 *   maxCash          = vested + savings
 * SIMPLIFICATION: the 10% / R30 000 seed was actually calculated on the actuarial interest at
 * 31 August 2024; here it is applied to the pre-two-pot share of the AI at exit (which has
 * grown with salary since then), so the seed is slightly overstated for small benefits and
 * the R30 000 cap binds for most long-serving members either way.
 */
export function splitTwoPot(
  actuarialInterest: number,
  preShare: number,
  rules: GepfRules,
): Pick<GepfResignationBenefit, 'vestedComponent' | 'savingsComponent' | 'retirementComponent' | 'maxCashOnResignation'> {
  const ai = Math.max(0, num(actuarialInterest))
  const share = clamp(num(preShare), 0, 1)
  const vestedBeforeSeed = ai * share
  const seed = Math.min(rules.twoPotSeedPct * vestedBeforeSeed, rules.twoPotSeedCap)
  const vestedComponent = vestedBeforeSeed - seed
  const post = ai * (1 - share)
  const savingsComponent = seed + post / 3
  const retirementComponent = (post * 2) / 3
  return {
    vestedComponent,
    savingsComponent,
    retirementComponent,
    maxCashOnResignation: vestedComponent + savingsComponent,
  }
}

/** Actuarial interest from unreduced amounts plus the two-pot split. */
function resignationFromUnreduced(u: UnreducedBenefit, ageAtExit: number, preShare: number, rules: GepfRules): GepfResignationBenefit {
  const factorUsed = interpolateFactor(rules.actuarialFactors, ageAtExit)
  // GEPF Rule 14.4: actuarial interest = pensionable service x final salary x F(Z).
  const actuarialInterest = u.serviceYears * u.finalSalary * factorUsed
  const gratuityComponent = Math.min(u.gratuity, actuarialInterest)
  const annuityComponent = actuarialInterest - gratuityComponent
  const result: GepfResignationBenefit = {
    actuarialInterest,
    factorUsed,
    gratuityComponent,
    annuityComponent,
    ...splitTwoPot(actuarialInterest, preShare, rules),
  }
  const prev = rules.previousActuarialFactors
  if (prev) {
    result.actuarialInterestPreviousFactors = u.serviceYears * u.finalSalary * interpolateFactor(prev, ageAtExit)
  }
  return result
}

/**
 * Resignation benefit at any age and any length of service:
 *   actuarialInterest = unreduced gratuity + unreduced annuity x factor(age)
 * using the current (1 Oct 2025) factor table, plus the same value on the previous (2021)
 * table when the rules carry it, and the two-pot split (see `splitTwoPot`).
 * NOTE: because the < 10-year benefit is modelled as 0.15 x FS x N with no annuity, the
 * actuarial interest steps up at exactly 10 years of service; this follows the spec and is
 * flagged as an estimate. The early-retirement reduction never applies to resignation.
 */
export function calcGepfResignationBenefit(
  input: GepfBenefitInput & { serviceYearsBeforeTwoPot: number },
  rules: GepfRules,
): GepfResignationBenefit {
  const u = unreducedBenefit(input.finalSalaryAnnual, input.pensionableServiceYears, rules)
  const ageAtExit = num(input.ageAtExit, rules.normalRetirementAge)
  const preShare = twoPotPreShare(input.serviceYearsBeforeTwoPot, Math.max(0, num(input.pensionableServiceYears)))
  return resignationFromUnreduced(u, ageAtExit, preShare, rules)
}

// ---------------------------------------------------------------------------
// Profile-level helper (formula path and statement path)
// ---------------------------------------------------------------------------

/**
 * Service completed before the two-pot start date, as at the exit:
 *   min(serviceYearsAtExit, gepf.serviceYearsBeforeTwoPot ?? (serviceNow - yearsSince(twoPotStart, today)))
 * clamped to >= 0.
 */
export function deriveServiceYearsBeforeTwoPot(m: GepfMembership, serviceYearsAtExit: number, rules: GepfRules, today: string = TODAY): number {
  const explicit = nonNegative(m.serviceYearsBeforeTwoPot)
  // BUGFIX: `today` is part of the public signature and was used unvalidated, so an invalid
  // ISO string (e.g. from a bad statement date) produced NaN via yearsBetween -> Math.max(0, NaN)
  // -> NaN all the way through the clamp below, contradicting this module's own "never NaN" rule.
  // Every other date here goes through `validIsoDate` first; this one now does too.
  const safeToday = validIsoDate(today) ?? TODAY
  const yearsSinceTwoPot = Math.max(0, yearsBetween(rules.twoPotStartDate, safeToday))
  const derived = explicit ?? Math.max(0, num(m.pensionableServiceYearsNow) - yearsSinceTwoPot)
  return clamp(derived, 0, Math.max(0, num(serviceYearsAtExit)))
}

/** Two-pot split shares carried by a statement (normalised so they sum to 1), or undefined. */
function statementTwoPotShares(st: GepfStatementValues): { vested: number; savings: number; retirement: number } | undefined {
  const v = nonNegative(st.vestedComponent)
  const s = nonNegative(st.savingsComponent)
  const r = nonNegative(st.retirementComponent)
  if (v === undefined && s === undefined && r === undefined) return undefined
  const total = (v ?? 0) + (s ?? 0) + (r ?? 0)
  if (total <= 0) return undefined
  return { vested: (v ?? 0) / total, savings: (s ?? 0) / total, retirement: (r ?? 0) / total }
}

/**
 * GEPF retirement and resignation benefits for the profile at `exitAge`.
 *
 * Formula path (`source: 'formula'`): projects service and salary to the exit age with
 * `projectServiceAndSalary`, derives the pre-two-pot service (see
 * `deriveServiceYearsBeforeTwoPot`) and applies the formula functions above. The spouse
 * pension uses `person.spousePensionPct` (0 when `hasSpouse` is false).
 *
 * Statement path (`source: 'statement'`), when `gepf.useStatementValues` and the statement
 * carries at least one of `resignationBenefit`, `retirementGratuity`,
 * `retirementAnnuityAnnual`:
 * - Statement values are as at the statement date (or today when undated) and are grown
 *   to the exit age at `salaryGrowth` for the years in between. SIMPLIFICATION (per spec):
 *   this captures salary growth only; the service that still accrues until exit
 *   (N_exit / N_statement) is NOT added, so the projection is conservative for members who
 *   keep working for several more years. Statement values are treated as unreduced
 *   (normal-retirement basis): the early-retirement reduction and the 75% spouse-pension
 *   cost are applied on top for exits before 60.
 * - Any of the three values missing on the statement falls back to the formula estimate.
 *   The resignation value, when absent, is rebuilt as statement gratuity + statement
 *   annuity x factor(exit age).
 * - A statement dated before the current factor table's `effectiveFrom` was computed on the
 *   previous factors: its resignation value is rebased by factor_new / factor_previous at the
 *   member's age on the statement date (the GEPF's own guidance: ~15% lower on average).
 *   `actuarialInterestPreviousFactors` is always filled by the same ratio when both tables
 *   exist.
 * - The two-pot split uses the statement's components when present (their shares are
 *   applied to the grown actuarial interest so the components always sum to it), otherwise
 *   the derived pre-two-pot share. SIMPLIFICATION: statement shares are held constant to the
 *   exit even though further service accrues to the savings/retirement components.
 * - `gratuityComponent` / `annuityComponent` of a statement resignation value are split
 *   pro rata to the formula components (the statement does not show the split).
 */
export function gepfBenefitsAtExit(
  profile: Profile,
  exitAge: number,
  rules: GepfRules,
  deps?: GepfBenefitsDeps,
): { retirement: GepfRetirementBenefit; resignation: GepfResignationBenefit; serviceYears: number; finalSalaryAnnual: number; source: 'formula' | 'statement' } {
  const today = validIsoDate(deps?.today) ?? TODAY
  const m = profile.gepf
  const person = profile.person
  const currentAge = num(person.currentAge)
  const yearsToExit = Math.max(0, num(exitAge, currentAge) - currentAge)
  const ageAtExit = currentAge + yearsToExit

  const { serviceYears, finalSalaryAnnual } = projectServiceAndSalary(m, currentAge, ageAtExit)
  const serviceYearsBeforeTwoPot = deriveServiceYearsBeforeTwoPot(m, serviceYears, rules, today)
  const preShare = twoPotPreShare(serviceYearsBeforeTwoPot, serviceYears)
  const spousePensionPct = person.hasSpouse ? num(person.spousePensionPct, rules.spousePensionDefault * 100) : 0
  const exempt = deps?.exemptFromEarlyReduction

  const formula = unreducedBenefit(finalSalaryAnnual, serviceYears, rules)

  const st = m.useStatementValues ? m.statement : undefined
  const stResignation = st ? positive(st.resignationBenefit) : undefined
  const stGratuity = st ? positive(st.retirementGratuity) : undefined
  const stAnnuity = st ? positive(st.retirementAnnuityAnnual) : undefined
  const useStatement = st !== undefined && (stResignation !== undefined || stGratuity !== undefined || stAnnuity !== undefined)

  if (!useStatement) {
    return {
      retirement: finaliseRetirement(formula, ageAtExit, exempt, spousePensionPct, rules),
      resignation: resignationFromUnreduced(formula, ageAtExit, preShare, rules),
      serviceYears,
      finalSalaryAnnual,
      source: 'formula',
    }
  }

  // --- Statement path -------------------------------------------------------
  const statement = st as GepfStatementValues
  const statementDate = validIsoDate(statement.statementDate) ?? today
  const yearsSinceStatement = yearsBetween(statementDate, today) // negative for a future-dated statement
  const growthYears = Math.max(0, yearsToExit + yearsSinceStatement)
  const g = Math.max(-0.99, num(m.salaryGrowth))
  const growth = (1 + g) ** growthYears
  const ageAtStatement = currentAge - yearsSinceStatement

  // Retirement: statement gratuity / annuity (grown) with formula fallbacks.
  const unreduced: UnreducedBenefit = {
    gratuity: stGratuity !== undefined ? stGratuity * growth : formula.gratuity,
    annuity: stAnnuity !== undefined ? stAnnuity * growth : formula.annuity,
    gratuityOnly: formula.gratuityOnly && stAnnuity === undefined,
    finalSalary: formula.finalSalary,
    serviceYears: formula.serviceYears,
  }
  const retirement = finaliseRetirement(unreduced, ageAtExit, exempt, spousePensionPct, rules)

  // Resignation.
  const shares = statementTwoPotShares(statement)
  let resignation: GepfResignationBenefit
  if (stResignation === undefined) {
    // No resignation value on the statement: rebuild it from the (statement-based) unreduced amounts.
    resignation = resignationFromUnreduced(unreduced, ageAtExit, preShare, rules)
  } else {
    const prev = rules.previousActuarialFactors
    const factorNewAtStatement = interpolateFactor(rules.actuarialFactors, ageAtStatement)
    const factorPrevAtStatement = prev ? interpolateFactor(prev, ageAtStatement) : undefined
    let aiCurrent = stResignation
    let aiPrevious: number | undefined
    if (factorPrevAtStatement !== undefined && factorPrevAtStatement > 0 && factorNewAtStatement > 0) {
      if (isBefore(statementDate, rules.actuarialFactors.effectiveFrom)) {
        // Statement predates the current factors: its value is on the previous basis.
        aiPrevious = stResignation
        aiCurrent = (stResignation * factorNewAtStatement) / factorPrevAtStatement
      } else {
        aiPrevious = (stResignation * factorPrevAtStatement) / factorNewAtStatement
      }
    }
    const actuarialInterest = aiCurrent * growth
    const factorUsed = interpolateFactor(rules.actuarialFactors, ageAtExit)
    // Report the unreduced gratuity as the gratuity part; the remainder is the implied annuity value.
    const gratuityComponent = Math.min(unreduced.gratuity, actuarialInterest)
    const annuityComponent = actuarialInterest - gratuityComponent
    resignation = {
      actuarialInterest,
      factorUsed,
      gratuityComponent,
      annuityComponent,
      ...splitTwoPot(actuarialInterest, preShare, rules),
    }
    if (aiPrevious !== undefined) resignation.actuarialInterestPreviousFactors = aiPrevious * growth
  }

  if (shares) {
    const ai = resignation.actuarialInterest
    resignation.vestedComponent = ai * shares.vested
    resignation.savingsComponent = ai * shares.savings
    resignation.retirementComponent = ai * shares.retirement
    resignation.maxCashOnResignation = resignation.vestedComponent + resignation.savingsComponent
  }

  return { retirement, resignation, serviceYears, finalSalaryAnnual, source: 'statement' }
}

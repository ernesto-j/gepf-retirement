/**
 * SARS personal income tax engine (pure TypeScript, no React).
 *
 * Everything here is driven by the `TaxTables` passed in (defaults come from
 * `src/data/taxTables.ts`), so a new tax year is a data change, not a code change.
 *
 * Rules implemented (see docs/SPEC.md "src/engine/tax.ts"):
 *  - Progressive brackets: find the highest bracket with `threshold <= income`;
 *    tax = `base + rate * (income - threshold)`.
 *  - Rebates: primary always, secondary from age 65, tertiary from age 75. The age passed
 *    in is used as-is (the caller decides whether it is the age at the end of the tax year).
 *  - Medical scheme fees tax credit (s6A): `firstTwo` per month for members 1-2 and
 *    `additional` per month for each further member, x 12. Rebates and credits are applied
 *    in that order and can never push tax below zero.
 *  - Lump sums (Second Schedule aggregation): `tax = T(previous + amount) - T(previous)`
 *    where `T` applies the retirement or withdrawal table to the CUMULATIVE amount.
 *    `previous` must include every retirement-fund lump sum (withdrawal, retirement,
 *    severance) received since the aggregation start dates (1 Oct 2007 / 1 Mar 2009 /
 *    1 Mar 2011); the notional tax on the previous amounts is recomputed on the current
 *    table, not the tax actually paid at the time.
 *  - Two-pot savings withdrawals are ordinary income: `tax = T_income(other + amount) -
 *    T_income(other)` (rebates included, because the withdrawal lands in the same year's
 *    assessment as the other income).
 *  - `grossForNet` inverts the net-of-tax function by bisection, on top of other taxable
 *    income that already uses up the lower brackets.
 *
 * Simplifications (all deliberate, all noted again in the function docs):
 *  1. The additional medical expenses tax credit (s6B: 33.3% of contributions above
 *     3 x MTC and of out-of-pocket costs for 65+) is out of scope - only the s6A scheme
 *     fees credit is applied. Real tax for a 65+ member with high medical spend is lower.
 *  2. Interest / dividend / CGT exemptions are not applied here: the caller passes
 *     `taxableIncome` already net of any exemptions.
 *  3. The GEPF pre-1 March 1998 service exemption ("Formula C") on lump sums is not
 *     modelled - the caller may reduce `amount` for the exempt portion if known.
 *  4. Monthly PAYE is simply the annual liability / 12 (what GPAA withholds on a constant
 *     pension). The SARS "fixed PAYE rate" directive for multiple income sources changes
 *     the timing of withholding, not the annual liability, so it is ignored.
 *  5. Inputs are sanitised rather than thrown on: NaN / negative money amounts become 0,
 *     NaN ages are treated as under 65, member counts are floored to a whole number >= 0.
 *  6. `marginalRate` is the statutory BRACKET rate (18% from the first rand). Below the tax
 *     threshold the true marginal rate is 0% because the rebates are not yet used up; the
 *     spec defines it as the bracket rate and that is what the UI shows as "your bracket".
 */
import type { IncomeTaxResult, LumpSumTaxResult, TaxBracket, TaxTables, TaxYear } from './types'
import { DEFAULT_TAX_YEAR, TAX_TABLES } from '../data/taxTables'

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/** Tables for a tax year; falls back to the default year for unknown keys (e.g. stale localStorage). */
export function getTaxTables(taxYear: TaxYear = DEFAULT_TAX_YEAR): TaxTables {
  return TAX_TABLES[taxYear] ?? TAX_TABLES[DEFAULT_TAX_YEAR]
}

// ---------------------------------------------------------------------------
// Small pure helpers (exported so the UI can show a transparent breakdown)
// ---------------------------------------------------------------------------

/** NaN, undefined, Infinity and negatives become 0 (engine never throws on bad input). */
function nonNegative(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * The bracket that applies to `amount`: the one with the highest `threshold <= amount`.
 * Order-independent so a mis-sorted table still works. `undefined` only for an empty table
 * or an amount below every threshold (never for a well-formed table starting at 0).
 */
export function findBracket(amount: number, brackets: TaxBracket[]): TaxBracket | undefined {
  let found: TaxBracket | undefined
  for (const b of brackets) {
    if (b.threshold <= amount && (found === undefined || b.threshold >= found.threshold)) found = b
  }
  return found
}

/** Progressive bracket tax on `amount` (before any rebate): `base + rate * (amount - threshold)`. */
export function bracketTax(amount: number, brackets: TaxBracket[]): number {
  const x = nonNegative(amount)
  const b = findBracket(x, brackets)
  if (!b) return 0
  return b.base + b.rate * (x - b.threshold)
}

/** Statutory bracket rate applying to the next rand of income (see simplification 6). */
export function marginalRate(taxableIncome: number, tables: TaxTables): number {
  const b = findBracket(nonNegative(taxableIncome), tables.brackets)
  return b ? b.rate : 0
}

/** Primary rebate always; + secondary from age 65; + tertiary from age 75. NaN age -> primary only. */
export function rebatesForAge(age: number, tables: TaxTables): number {
  const a = Number.isFinite(age) ? age : 0
  let rebate = tables.rebates.primary
  if (a >= 65) rebate += tables.rebates.secondary
  if (a >= 75) rebate += tables.rebates.tertiary
  return rebate
}

/**
 * Annual medical scheme fees tax credit (s6A) for `members` people on the scheme
 * (main member + dependants): `firstTwo` per month for members 1-2, `additional` per month
 * for each further member, x 12. Fractions are floored, negatives / NaN count as 0 members.
 * The additional medical expenses credit (s6B) is NOT included (simplification 1).
 */
export function annualMedicalCredit(members: number | undefined, tables: TaxTables): number {
  const n = Math.floor(nonNegative(members))
  const firstTwo = Math.min(n, 2)
  const additional = Math.max(n - 2, 0)
  return (firstTwo * tables.medicalCredit.firstTwo + additional * tables.medicalCredit.additional) * 12
}

// ---------------------------------------------------------------------------
// Income tax and PAYE
// ---------------------------------------------------------------------------

/**
 * Normal tax on `taxableIncome` for a person of `age` (rebates by age, then the medical
 * scheme fees credit for `opts.medicalMembers` members), floored at zero.
 *
 * `rebates` and `medicalCredits` in the result are the amounts ACTUALLY APPLIED (each capped
 * so the running total never goes negative), so `grossTax - rebates - medicalCredits === tax`
 * always holds exactly. Use `rebatesForAge` / `annualMedicalCredit` for the full entitlements.
 * `marginalRate` is the bracket rate (simplification 6); `effectiveRate = tax / taxableIncome`
 * (0 for zero income).
 */
export function calcIncomeTax(
  taxableIncome: number,
  age: number,
  tables: TaxTables,
  opts?: { medicalMembers?: number },
): IncomeTaxResult {
  const income = nonNegative(taxableIncome)
  const grossTax = bracketTax(income, tables.brackets)

  const rebatesApplied = Math.min(grossTax, rebatesForAge(age, tables))
  const afterRebates = grossTax - rebatesApplied

  const creditsApplied = Math.min(afterRebates, annualMedicalCredit(opts?.medicalMembers, tables))
  const tax = Math.max(0, afterRebates - creditsApplied)

  return {
    taxableIncome: income,
    grossTax,
    rebates: rebatesApplied,
    medicalCredits: creditsApplied,
    tax,
    effectiveRate: income > 0 ? tax / income : 0,
    marginalRate: marginalRate(income, tables),
  }
}

/**
 * Monthly PAYE on a level annual income: the annual liability spread evenly over 12 months
 * (simplification 4). `monthlyNet = (annualTaxableIncome - tax) / 12`.
 */
export function calcMonthlyPaye(
  annualTaxableIncome: number,
  age: number,
  tables: TaxTables,
  opts?: { medicalMembers?: number },
): { monthlyTax: number; monthlyNet: number; annual: IncomeTaxResult } {
  const annual = calcIncomeTax(annualTaxableIncome, age, tables, opts)
  return {
    monthlyTax: annual.tax / 12,
    monthlyNet: (annual.taxableIncome - annual.tax) / 12,
    annual,
  }
}

// ---------------------------------------------------------------------------
// Lump sums
// ---------------------------------------------------------------------------

/**
 * Tax per a lump-sum table on a CUMULATIVE amount (`T` in the aggregation formula).
 * Pass `tables.retirementLumpSum` or `tables.withdrawalLumpSum`. No rebates apply to lump sums.
 */
export function taxOnCumulativeLumpSum(amount: number, table: TaxBracket[]): number {
  return bracketTax(amount, table)
}

function aggregatedLumpSumTax(
  amount: number,
  previousLumpSums: number,
  table: TaxBracket[],
  name: LumpSumTaxResult['table'],
): LumpSumTaxResult {
  const amt = nonNegative(amount)
  const prev = nonNegative(previousLumpSums)
  const taxOnPrevious = taxOnCumulativeLumpSum(prev, table)
  // T is non-decreasing so this is >= 0 for a well-formed table; the floor guards odd data.
  const tax = Math.max(0, taxOnCumulativeLumpSum(prev + amt, table) - taxOnPrevious)
  return {
    amount: amt,
    previousLumpSums: prev,
    tax,
    taxOnPrevious,
    net: amt - tax,
    effectiveRate: amt > 0 ? tax / amt : 0,
    table: name,
  }
}

/**
 * Retirement / death / severance lump sum: `T_ret(previous + amount) - T_ret(previous)`.
 * `previousLumpSums` = all withdrawal AND retirement lump sums already received (aggregation).
 * The GEPF pre-1998 service exemption is not applied (simplification 3).
 */
export function calcRetirementLumpSumTax(amount: number, previousLumpSums: number, tables: TaxTables): LumpSumTaxResult {
  return aggregatedLumpSumTax(amount, previousLumpSums, tables.retirementLumpSum, 'retirement')
}

/**
 * Resignation (withdrawal) cash lump sum: `T_wd(previous + amount) - T_wd(previous)`.
 * `previousLumpSums` = all withdrawal AND retirement lump sums already received (aggregation).
 */
export function calcWithdrawalLumpSumTax(amount: number, previousLumpSums: number, tables: TaxTables): LumpSumTaxResult {
  return aggregatedLumpSumTax(amount, previousLumpSums, tables.withdrawalLumpSum, 'withdrawal')
}

/**
 * Two-pot savings-component withdrawal, taxed as ordinary income at the marginal rate on top
 * of `otherTaxableIncome` for the year: `T_income(other + amount) - T_income(other)` with the
 * age rebates (and the medical credit if `opts.medicalMembers` is given) included.
 * If other income is below the tax threshold, the unused rebate shelters part of the
 * withdrawal - this is the annual-assessment outcome; SARS's directive may withhold more
 * up front and refund on assessment.
 */
export function calcSavingsPotWithdrawalTax(
  amount: number,
  otherTaxableIncome: number,
  age: number,
  tables: TaxTables,
  opts?: { medicalMembers?: number },
): number {
  const amt = nonNegative(amount)
  const other = nonNegative(otherTaxableIncome)
  const withWithdrawal = calcIncomeTax(other + amt, age, tables, opts).tax
  const withoutWithdrawal = calcIncomeTax(other, age, tables, opts).tax
  return Math.max(0, withWithdrawal - withoutWithdrawal)
}

// ---------------------------------------------------------------------------
// Gross-for-net (inverse of the net-of-tax function)
// ---------------------------------------------------------------------------

/** Bisection stops when the bracket is this narrow (R); spec asks for R1, we do better. */
const GROSS_FOR_NET_TOLERANCE = 0.01
/** Hard caps so malformed tables (e.g. a rate >= 1) can never spin forever. */
const MAX_DOUBLINGS = 64
const MAX_BISECTIONS = 200

/**
 * The gross draw `g` such that the EXTRA net income it produces on top of
 * `opts.otherTaxableIncome` equals `targetNet`:
 *
 *   net(other + g) - net(other) = targetNet,   net(x) = x - calcIncomeTax(x).tax
 *
 * Other income already occupies the lower brackets and uses the rebates/credits, so the same
 * net target needs a larger gross when other income is present. Solved by bisection: `net` is
 * strictly increasing (marginal rates are below 100%), so the root is unique. The returned
 * value is the UPPER end of the final bracket (width <= R0.01), i.e. it never undershoots the
 * target by more than floating-point noise. Returns 0 for a zero/negative/NaN target.
 */
export function grossForNet(
  targetNet: number,
  age: number,
  tables: TaxTables,
  opts?: { medicalMembers?: number; otherTaxableIncome?: number },
): number {
  const target = nonNegative(targetNet)
  if (target === 0) return 0
  const other = nonNegative(opts?.otherTaxableIncome)
  const taxOpts = { medicalMembers: opts?.medicalMembers }

  const netOf = (total: number): number => total - calcIncomeTax(total, age, tables, taxOpts).tax
  const baseNet = netOf(other)
  /** Extra net income produced by a gross draw of `g` on top of the other income. */
  const extraNet = (g: number): number => netOf(other + g) - baseNet

  // Upper bound: net <= gross, so start at the target and double until it is enough.
  let lo = 0
  let hi = target
  for (let i = 0; i < MAX_DOUBLINGS && extraNet(hi) < target; i++) hi *= 2

  for (let i = 0; i < MAX_BISECTIONS && hi - lo > GROSS_FOR_NET_TOLERANCE; i++) {
    const mid = (lo + hi) / 2
    if (extraNet(mid) < target) lo = mid
    else hi = mid
  }
  return hi
}

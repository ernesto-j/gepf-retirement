/**
 * Custom investments: a holding the member sets up themselves — an index ETF in dollars, a
 * house in Australia with a mortgage, a five-year fixed deposit in rand.
 *
 * Pure TypeScript, no React, no I/O, and NOTHING here ever throws: every input is coerced,
 * clamped and guarded so a pathological profile produces zeros rather than NaN on screen.
 *
 * ---------------------------------------------------------------------------
 * How one year of an investment is simulated (annual steps, one row per year HELD)
 * ---------------------------------------------------------------------------
 * Everything is tracked in the investment's own `currency` and translated to rand on the
 * scenario's FX path (`fxRateFor`). `t` is measured from TODAY, exactly as in projection.ts,
 * so the two engines share one currency path.
 *
 *   price          = deposit + (loan?.amount ?? 0)          (the purchase price, in currency)
 *   purchaseCosts  = purchaseCostPct x price                (stamp duty / FIRB / transfer / brokerage)
 *   purchase cash  = (deposit + purchaseCosts) x fx(t)      (paid once, in the 'buy' year)
 *
 * Then, for each year held, on the value at the START of the year:
 *
 *   grossIncome = value x incomeYield          (rent, dividends, interest)
 *   costs       = value x costsPct             (rates, levies, management, vacancy, TER)
 *   interest    = loanBalance x loan.rate
 *   principal   = 0 when interestOnly, else min(loanBalance, annualPayment - interest) where
 *                 annualPayment is the standard annuity payment over loan.termYears
 *   netBeforeTax = grossIncome - costs - interest
 *   tax          = max(0, netBeforeTax) x incomeTaxRate     (a loss carries no credit here)
 *   netCash      = netBeforeTax - tax - principal           (negative = cash the member puts in)
 *
 * and at the END of the year the value grows once: `value <- value x (1 + growth)`. The loan
 * balance falls by `principal`; the year the balance reaches zero is marked 'loan-repaid'.
 *
 * Sale — at the end of the last year held (the end of `termYears`, of the planning horizon, or
 * of `toAge`, whichever comes first):
 *
 *   salePrice    = value (already grown)
 *   sellingCosts = sellingCostPct x salePrice
 *   gain         = salePrice - (price + purchaseCosts)      (base cost = price paid + entry costs)
 *   cgt          = max(0, gain) x cgtRate
 *   proceeds     = salePrice - sellingCosts - loanBalance - cgt
 *   saleProceedsZar = proceeds x fx(t + 1)
 *
 * FX convention (the same one projection.ts uses for capital): flows DURING a year — income,
 * costs, interest, tax, net cash, the purchase — are translated at the START-of-year rate,
 * which is the row's `fx` column. Balances at the END of a year — `equityZar` and
 * `saleProceedsZar` — are translated at the END-of-year rate `fx(t + 1)`. That is what makes
 * one row's closing `equityZar` equal to the next row's `openingEquityZar`, so the scenario's
 * capital chain does not jump on a currency move.
 *
 * ---------------------------------------------------------------------------
 * Simplifications (deliberate; projection.ts pushes the material ones to `result.notes`)
 * ---------------------------------------------------------------------------
 *  1. Annual steps. Income, costs and loan service are settled once a year; the value grows
 *     once, at year end, so the first year's income is earned on the purchase price.
 *  2. One flat `incomeTaxRate` on net income and one flat `cgtRate` on the gain. No brackets,
 *     no annual exclusion, no foreign tax credit arithmetic and no inflation indexation of the
 *     base cost: the presets carry effective rates instead (see INVESTMENT_PRESETS).
 *  3. A loss in a year produces no tax credit and is not carried forward.
 *  4. The CGT base cost is the purchase price plus the entry costs in the investment's own
 *     currency, so the rand gain from a weakening rand is NOT taxed. SA residents are taxed on
 *     the rand gain (para 43 of the Eighth Schedule uses the spot rate at disposal for assets
 *     bought in foreign currency); the presets' effective rates are set with that in mind.
 *  5. All hard currencies follow ONE path: their spot rate times (1 + randDepreciation)^t.
 *     There is no separate AUD/USD or GBP/USD cross-rate view.
 *  6. `termYears` is the holding period from `startAge`; `loan.termYears` is the amortisation
 *     period. A loan that has not amortised away by the sale is settled from the proceeds.
 *  7. An investment bought before the projection window (`startAge < fromAge`) is treated as
 *     already owned: its value is grown and its loan amortised from `startAge` to the first
 *     projected year, and no purchase cash is charged inside the window.
 */
import type {
  Assumptions,
  CustomInvestment,
  CustomInvestmentKind,
  CustomInvestmentYear,
  InvestmentCurrency,
} from './types'
import { clamp } from './money'

// ---------------------------------------------------------------------------
// Numeric guards (nothing in this file throws and nothing emits NaN / Infinity)
// ---------------------------------------------------------------------------

function num(value: number | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function nonNeg(value: number | undefined, fallback = 0): number {
  const v = num(value, fallback)
  return v > 0 ? v : 0
}

/** A growth rate clamped to something a projection can survive. */
function safeRate(value: number | undefined, fallback: number): number {
  return clamp(num(value, fallback), -0.9, 1)
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0
}

// ---------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------

/** Spot rand per unit used when `Assumptions.fxSpots` is missing (mid-2026 levels). */
export const DEFAULT_FX_SPOTS: Record<'AUD' | 'GBP' | 'EUR', number> = { AUD: 10.8, GBP: 21.5, EUR: 18.8 }

/**
 * Rand per ONE unit of `currency`, `t` years from today. Rand is always 1. USD uses
 * `assumptions.usdZarSpot`; AUD / GBP / EUR use `assumptions.fxSpots` (falling back to
 * `DEFAULT_FX_SPOTS`). Every foreign currency appreciates against the rand at
 * `assumptions.randDepreciation` — one path for all of them (simplification 5).
 */
export function fxRateFor(currency: InvestmentCurrency, assumptions: Assumptions, t: number): number {
  if (currency === 'ZAR') return 1
  const spot =
    currency === 'USD'
      ? Math.max(0.01, num(assumptions?.usdZarSpot, 18))
      : Math.max(0.01, num(assumptions?.fxSpots?.[currency], DEFAULT_FX_SPOTS[currency]))
  const dep = safeRate(assumptions?.randDepreciation, 0.05)
  const years = num(t, 0)
  const rate = spot * (1 + dep) ** years
  return Number.isFinite(rate) && rate > 0 ? rate : spot
}

// ---------------------------------------------------------------------------
// Loan
// ---------------------------------------------------------------------------

/**
 * The level annual payment that amortises `principal` over `termYears` at `rate`:
 * `P x r / (1 - (1 + r)^-n)`, and `P / n` when the rate is zero. Returns 0 for a
 * non-positive principal and never returns NaN.
 */
export function annuityPayment(principal: number, rate: number, termYears: number): number {
  const p = nonNeg(principal)
  if (!(p > 0)) return 0
  const n = Math.max(1, Math.round(num(termYears, 1)))
  const r = clamp(num(rate, 0), 0, 1)
  if (r <= 0) return finite(p / n)
  const discount = (1 + r) ** -n
  const denominator = 1 - discount
  if (!(denominator > 1e-12)) return finite(p / n)
  return finite((p * r) / denominator)
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

export interface ProjectInvestmentOpts {
  /** The member's age TODAY: the FX path is measured from here, exactly as in projection.ts. */
  currentAge: number
  /** First projected age (the scenario's exit age). */
  fromAge: number
  /** Last projected age (the scenario's planning horizon). */
  toAge: number
}

/**
 * Projects one custom investment year by year over the ages it is actually HELD, which is a
 * sub-range of `[fromAge, toAge]`:
 *
 *  - the purchase happens at `max(startAge, fromAge)`, snapped up to the projection's yearly
 *    grid (`fromAge + k`), and is marked with `event: 'buy'` and a `purchaseCashZar`;
 *  - `startAge < fromAge` means the member already owns it: the value is grown and the loan
 *    amortised from `startAge` to `fromAge`, the first row carries no purchase cash, and the
 *    caller must treat the holding as funded from OUTSIDE the plan;
 *  - the last row is the sale (`event: 'sell'`, `saleProceedsZar` set, `equityZar` 0 because
 *    the equity has become proceeds).
 *
 * Returns `[]` — never throws — when the investment has no price, is bought after `toAge`, or
 * has already been sold before `fromAge`.
 */
export function projectCustomInvestment(
  inv: CustomInvestment,
  assumptions: Assumptions,
  opts: ProjectInvestmentOpts,
): CustomInvestmentYear[] {
  const rows: CustomInvestmentYear[] = []
  if (!inv) return rows

  const currentAge = num(opts?.currentAge, 0)
  const fromAge = num(opts?.fromAge, currentAge)
  const toAge = num(opts?.toAge, fromAge)
  if (!(toAge >= fromAge)) return rows
  const kMax = Math.min(120, Math.max(0, Math.floor(toAge - fromAge + 1e-9)))

  const currency: InvestmentCurrency = inv.currency ?? 'ZAR'
  const growth = safeRate(inv.growth, 0)
  const incomeYield = clamp(num(inv.incomeYield, 0), -1, 1)
  const costsPct = clamp(num(inv.costsPct, 0), 0, 1)
  const incomeTaxRate = clamp(num(inv.incomeTaxRate, 0), 0, 1)
  const cgtRate = clamp(num(inv.cgtRate, 0), 0, 1)
  const purchaseCostPct = clamp(num(inv.purchaseCostPct, 0), 0, 1)
  const sellingCostPct = clamp(num(inv.sellingCostPct, 0), 0, 1)

  const deposit = nonNeg(inv.deposit)
  const loanAmount = nonNeg(inv.loan?.amount)
  const price = deposit + loanAmount
  if (!(price > 0)) return rows
  const purchaseCosts = price * purchaseCostPct

  // --- When is it bought, and for how long is it held? ----------------------
  const startAge = num(inv.startAge, fromAge)
  const alreadyOwned = startAge < fromAge - 1e-9
  const yearsAlreadyHeld = alreadyOwned ? clamp(Math.round(fromAge - startAge), 0, 120) : 0
  const kBuy = alreadyOwned ? 0 : Math.max(0, Math.ceil(startAge - fromAge - 1e-9))
  if (kBuy > kMax) return rows

  const rawTerm = num(inv.termYears, 0)
  const termYears = inv.termYears !== undefined && rawTerm > 0 ? clamp(Math.round(rawTerm), 1, 120) : undefined
  let kLast = kMax
  if (termYears !== undefined) {
    const remaining = termYears - yearsAlreadyHeld
    if (remaining <= 0) return rows
    kLast = Math.min(kMax, kBuy + remaining - 1)
  }
  if (kLast < kBuy) return rows

  // --- Loan ----------------------------------------------------------------
  const hasLoan = loanAmount > 0
  const loanRate = hasLoan ? clamp(num(inv.loan?.rate, 0), 0, 1) : 0
  const loanTerm = hasLoan ? clamp(Math.round(num(inv.loan?.termYears, 20)), 1, 60) : 0
  const interestOnly = inv.loan?.interestOnly === true
  const payment = hasLoan && !interestOnly ? annuityPayment(loanAmount, loanRate, loanTerm) : 0

  // --- Opening state (grown / amortised forward when already owned) ---------
  let value = price * (1 + growth) ** yearsAlreadyHeld
  if (!Number.isFinite(value) || value < 0) value = 0
  let loanBalance = loanAmount
  if (hasLoan && !interestOnly) {
    for (let y = 0; y < yearsAlreadyHeld && loanBalance > 1e-9; y++) {
      const interest = loanBalance * loanRate
      loanBalance = Math.max(0, loanBalance - clamp(payment - interest, 0, loanBalance))
    }
  }

  for (let k = kBuy; k <= kLast; k++) {
    const age = fromAge + k
    const t = age - currentAge
    const fx = fxRateFor(currency, assumptions, t)
    const fxEnd = fxRateFor(currency, assumptions, t + 1)

    const openingValue = value
    const openingLoan = loanBalance
    const openingEquityZar = (openingValue - openingLoan) * fx

    const grossIncomeCcy = openingValue * incomeYield
    const costsCcy = openingValue * costsPct
    const interestCcy = openingLoan * loanRate
    const principalCcy = hasLoan && !interestOnly && openingLoan > 0 ? clamp(payment - interestCcy, 0, openingLoan) : 0
    const netBeforeTax = grossIncomeCcy - costsCcy - interestCcy
    const taxCcy = Math.max(0, netBeforeTax) * incomeTaxRate
    const netCashCcy = netBeforeTax - taxCcy - principalCcy

    loanBalance = Math.max(0, openingLoan - principalCcy)
    value = Math.max(0, openingValue * (1 + growth))

    const isSale = k === kLast
    const isBuy = k === kBuy && !alreadyOwned
    const justRepaid = hasLoan && openingLoan > 1e-9 && loanBalance <= 1e-9

    let equityZar = (value - loanBalance) * fxEnd
    let saleProceedsZar: number | undefined
    let cgtCcy: number | undefined
    if (isSale) {
      const salePrice = value
      const sellingCosts = salePrice * sellingCostPct
      const gain = salePrice - (price + purchaseCosts)
      const cgt = Math.max(0, gain) * cgtRate
      cgtCcy = cgt
      // The loan is settled out of the proceeds; `proceeds` may be negative when the asset is
      // worth less than the debt, which the scenario funds from discretionary capital.
      saleProceedsZar = finite((salePrice - sellingCosts - loanBalance - cgt) * fxEnd)
      equityZar = 0
    }

    const row: CustomInvestmentYear = {
      age: finite(age),
      year: k - kBuy,
      fx: finite(fx),
      valueCcy: finite(value),
      loanBalanceCcy: finite(loanBalance),
      grossIncomeCcy: finite(grossIncomeCcy),
      costsCcy: finite(costsCcy),
      interestCcy: finite(interestCcy),
      principalCcy: finite(principalCcy),
      taxCcy: finite(taxCcy),
      netCashCcy: finite(netCashCcy),
      netCashZar: finite(netCashCcy * fx),
      equityZar: finite(equityZar),
      openingEquityZar: finite(openingEquityZar),
      ...(saleProceedsZar !== undefined ? { saleProceedsZar } : {}),
      ...(cgtCcy !== undefined ? { cgtCcy: finite(cgtCcy) } : {}),
      ...(isBuy ? { purchaseCashZar: finite((deposit + purchaseCosts) * fx) } : {}),
      // One event per row: a sale outranks the purchase, which outranks the loan being repaid.
      ...(isSale ? { event: 'sell' as const } : isBuy ? { event: 'buy' as const } : justRepaid ? { event: 'loan-repaid' as const } : {}),
    }
    rows.push(row)
  }

  return rows
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export interface InvestmentSummary {
  /** Cash paid at purchase (deposit + entry costs) in rand at the purchase year's rate; 0 when already owned. */
  purchaseCashZar: number
  /** Sum of `netCashZar` over every year held — negative years (a geared property) included. */
  totalNetIncomeZar: number
  /** Net rand proceeds at the sale, after selling costs, loan settlement and CGT. */
  saleProceedsZar: number
  /** Highest rand equity (value less the loan) reached over the holding period. */
  peakEquityZar: number
  startAge: number
  endAge: number
}

/** Rolls the yearly rows up into the figures `ScenarioResult.customInvestments` reports. */
export function summariseInvestment(rows: CustomInvestmentYear[]): InvestmentSummary {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { purchaseCashZar: 0, totalNetIncomeZar: 0, saleProceedsZar: 0, peakEquityZar: 0, startAge: 0, endAge: 0 }
  }
  let purchaseCashZar = 0
  let totalNetIncomeZar = 0
  let saleProceedsZar = 0
  let peakEquityZar = 0
  for (const row of rows) {
    purchaseCashZar += nonNeg(row?.purchaseCashZar)
    totalNetIncomeZar += num(row?.netCashZar)
    saleProceedsZar += num(row?.saleProceedsZar)
    // The sale row reports zero closing equity, so the peak also looks at the opening equity.
    peakEquityZar = Math.max(peakEquityZar, num(row?.equityZar), num(row?.openingEquityZar))
  }
  return {
    purchaseCashZar: finite(purchaseCashZar),
    totalNetIncomeZar: finite(totalNetIncomeZar),
    saleProceedsZar: finite(saleProceedsZar),
    peakEquityZar: finite(peakEquityZar),
    startAge: finite(num(rows[0]?.age)),
    endAge: finite(num(rows[rows.length - 1]?.age)),
  }
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/**
 * Starting points for each kind of holding, at 2026 levels. They are DEFAULTS, not advice:
 * every field is editable, and the `notes` string says where the number comes from so the
 * member can argue with it. `id`, `startAge` and `termYears` (where the holding period is a
 * choice) are left to the caller.
 *
 * Tax rates are EFFECTIVE rates, not statutory ones, because the engine applies one flat rate
 * to net income and one to the gain (simplification 2).
 */
export const INVESTMENT_PRESETS: Record<CustomInvestmentKind, Partial<CustomInvestment>> = {
  'equity-index': {
    name: 'S&P 500 index ETF',
    kind: 'equity-index',
    enabled: true,
    currency: 'USD',
    fundedFrom: 'exit-capital',
    deposit: 100_000,
    purchaseCostPct: 0.002,
    growth: 0.06,
    incomeYield: 0.013,
    costsPct: 0.001,
    incomeTaxRate: 0.2,
    cgtRate: 0.18,
    sellingCostPct: 0.002,
    incomeUse: 'reinvest',
    notes:
      'A USD-denominated S&P 500 UCITS ETF (Irish domiciled) bought on an offshore platform. 6.0% price growth + 1.3% dividend yield is the long-run US large-cap total return of about 7.3% in dollars split into its two parts; 0.10% running cost is a typical UCITS TER (0.07% fund + platform). Entry and exit at 0.2% cover brokerage and the bid/offer spread. Income tax 20%: SA taxes foreign dividends at an effective 20% (section 10B partial exemption, 25/45 of the dividend included, so 45% x 44.4% ≈ 20%), with the 15% US treaty withholding credited. CGT 18%: the SA maximum effective rate for an individual (40% inclusion x 45% marginal). No loan — a margin loan against an equity portfolio is a margin-call risk, not a mortgage.',
  },
  'residential-property': {
    name: 'Australian house (rented out)',
    kind: 'residential-property',
    enabled: true,
    currency: 'AUD',
    fundedFrom: 'exit-capital',
    deposit: 200_000,
    loan: { amount: 300_000, rate: 0.065, termYears: 25, interestOnly: false },
    termYears: 10,
    purchaseCostPct: 0.07,
    growth: 0.045,
    incomeYield: 0.038,
    costsPct: 0.015,
    incomeTaxRate: 0.325,
    cgtRate: 0.325,
    sellingCostPct: 0.025,
    incomeUse: 'spend',
    notes:
      'A A$500,000 house bought with a 60% loan (A$300,000 at 6.5% over 25 years, principal and interest — roughly the standard variable investor rate). 4.5% capital growth and a 3.8% gross rental yield are close to the long-run national average for Australian capital-city houses; 1.5% of value a year covers council rates, insurance, maintenance, letting fees and an allowance for vacancy. Entry costs of 7% are the big one for a foreign buyer: state stamp duty (including the foreign-purchaser surcharge), the FIRB application fee and conveyancing. Selling costs 2.5% (agent plus legals). Income tax 32.5%: a non-resident pays the foreign-resident rate from the FIRST dollar — there is no tax-free threshold — and there is no Medicare levy. CGT 32.5% as well: the 50% discount was removed for foreign residents in 2012, and foreign-resident capital-gains withholding applies on the sale. Confirm the SA/Australia double-tax agreement treatment with a cross-border adviser before relying on this.',
  },
  'commercial-property': {
    name: 'Australian commercial unit',
    kind: 'commercial-property',
    enabled: true,
    currency: 'AUD',
    fundedFrom: 'exit-capital',
    deposit: 500_000,
    loan: { amount: 500_000, rate: 0.07, termYears: 20, interestOnly: false },
    termYears: 10,
    purchaseCostPct: 0.06,
    growth: 0.03,
    incomeYield: 0.06,
    costsPct: 0.01,
    incomeTaxRate: 0.325,
    cgtRate: 0.325,
    sellingCostPct: 0.025,
    incomeUse: 'spend',
    notes:
      'A A$1,000,000 strata unit or small industrial property bought with a 50% loan (A$500,000 at 7% over 20 years) — commercial lenders rarely go past 50-65% LVR for a non-resident and price a little above the housing rate. 3% growth with a 6% gross yield is the usual commercial trade-off: more income, less capital growth, and the tenant carries most outgoings under a net lease, so only 1% of value a year is left with the owner. Entry costs 6% (stamp duty, FIRB, legals; no residential foreign-purchaser surcharge) and 2.5% to sell. Non-resident income tax and CGT are the same 32.5% as for residential. Vacancy risk is materially higher than for a house and is NOT modelled beyond the 1% cost allowance.',
  },
  'fixed-term': {
    name: 'Five-year fixed deposit',
    kind: 'fixed-term',
    enabled: true,
    currency: 'ZAR',
    fundedFrom: 'exit-capital',
    deposit: 1_000_000,
    termYears: 5,
    purchaseCostPct: 0,
    growth: 0,
    incomeYield: 0.095,
    costsPct: 0,
    incomeTaxRate: 0.36,
    cgtRate: 0,
    sellingCostPct: 0,
    incomeUse: 'spend',
    notes:
      'A five-year fixed deposit with a South African bank at 9.5% a year, interest paid out. Capital does not grow (the deposit returns at face value), there are no costs and no capital gain, so no CGT. Income tax 36% is a retiree marginal rate on interest; the annual interest exemption (R23,800 under 65, R34,500 from 65) is IGNORED, so the tax here is slightly overstated for a small deposit. Rates above 9% are usually for 60-month money and are not guaranteed to be available at reinvestment.',
  },
  other: {
    name: 'Other investment',
    kind: 'other',
    enabled: true,
    currency: 'ZAR',
    fundedFrom: 'exit-capital',
    deposit: 500_000,
    purchaseCostPct: 0,
    growth: 0.05,
    incomeYield: 0.03,
    costsPct: 0.005,
    incomeTaxRate: 0.3,
    cgtRate: 0.18,
    sellingCostPct: 0,
    incomeUse: 'reinvest',
    notes:
      'A neutral rand-denominated placeholder for anything that is not one of the other kinds — a unit trust, a business interest, a share of a family asset. 5% growth plus a 3% income yield is a middle-of-the-road balanced return in rand; 0.5% a year of running cost; income taxed at 30% and the gain at the 18% SA maximum effective CGT rate for an individual. Replace every number with the real ones for your holding.',
  },
}

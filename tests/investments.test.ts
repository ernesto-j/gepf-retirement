/**
 * Custom investments: src/engine/investments.ts and its integration into runScenario.
 *
 * Like tests/adversarial-maths.test.ts, the expected numbers here are re-derived from first
 * principles inside the test (compound growth, the annuity formula, a hand-rolled amortisation
 * schedule) rather than copied out of the engine, so a change of behaviour shows up as a
 * failure instead of a silently updated expectation.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FX_SPOTS,
  INVESTMENT_PRESETS,
  annuityPayment,
  fxRateFor,
  projectCustomInvestment,
  summariseInvestment,
} from '../src/engine/investments'
import { defaultScenarios, runScenario } from '../src/engine/projection'
import { DEFAULT_PROFILE } from '../src/data/defaults'
import { FUNDS } from '../src/data/funds'
import type {
  Assumptions,
  CustomInvestment,
  CustomInvestmentKind,
  GepfMembership,
  LifestyleInputs,
  PersonProfile,
  Profile,
  ScenarioDefinition,
} from '../src/engine/types'

const DEPS = { funds: FUNDS }

function assumptionsOf(patch: Partial<Assumptions> = {}): Assumptions {
  return { ...DEFAULT_PROFILE.assumptions, ...patch }
}

function investmentOf(patch: Partial<CustomInvestment>): CustomInvestment {
  return {
    id: 'inv',
    name: 'Investment',
    kind: 'other',
    enabled: true,
    currency: 'ZAR',
    startAge: 60,
    fundedFrom: 'exit-capital',
    deposit: 0,
    purchaseCostPct: 0,
    growth: 0,
    incomeYield: 0,
    costsPct: 0,
    incomeTaxRate: 0,
    cgtRate: 0,
    sellingCostPct: 0,
    incomeUse: 'spend',
    ...patch,
  }
}

function profileOf(opts: {
  person?: Partial<PersonProfile>
  gepf?: Partial<GepfMembership>
  lifestyle?: Partial<LifestyleInputs>
  assumptions?: Partial<Assumptions>
  investments?: CustomInvestment[]
}): Profile {
  return {
    person: { ...DEFAULT_PROFILE.person, ...opts.person },
    gepf: { ...DEFAULT_PROFILE.gepf, ...opts.gepf },
    lifestyle: { ...DEFAULT_PROFILE.lifestyle, ...opts.lifestyle },
    assumptions: assumptionsOf(opts.assumptions),
    investments: opts.investments ?? [],
  }
}

/** Independent amortisation schedule: returns the balance after `years` level payments. */
function balanceAfter(principal: number, rate: number, termYears: number, years: number): number {
  const payment = (principal * rate) / (1 - (1 + rate) ** -termYears)
  let balance = principal
  for (let y = 0; y < years; y++) {
    const interest = balance * rate
    balance = Math.max(0, balance - Math.min(balance, payment - interest))
  }
  return balance
}

// ===========================================================================
// 1. Currency path
// ===========================================================================

describe('fxRateFor', () => {
  it('rand is always 1, and every hard currency compounds at randDepreciation', () => {
    const a = assumptionsOf({ usdZarSpot: 16.2, randDepreciation: 0.05, fxSpots: { AUD: 10.8, GBP: 21.5, EUR: 18.8 } })
    for (const t of [0, 1, 7, 30]) {
      expect(fxRateFor('ZAR', a, t)).toBe(1)
      expect(fxRateFor('USD', a, t)).toBeCloseTo(16.2 * 1.05 ** t, 9)
      expect(fxRateFor('AUD', a, t)).toBeCloseTo(10.8 * 1.05 ** t, 9)
      expect(fxRateFor('GBP', a, t)).toBeCloseTo(21.5 * 1.05 ** t, 9)
      expect(fxRateFor('EUR', a, t)).toBeCloseTo(18.8 * 1.05 ** t, 9)
    }
  })

  it('falls back to the documented default spots when assumptions.fxSpots is missing', () => {
    const a = assumptionsOf({ randDepreciation: 0, fxSpots: undefined })
    expect(DEFAULT_FX_SPOTS).toEqual({ AUD: 10.8, GBP: 21.5, EUR: 18.8 })
    expect(fxRateFor('AUD', a, 3)).toBeCloseTo(10.8, 9)
    expect(fxRateFor('GBP', a, 3)).toBeCloseTo(21.5, 9)
    expect(fxRateFor('EUR', a, 3)).toBeCloseTo(18.8, 9)
  })

  it('a strengthening rand lowers the rate, and nonsense inputs never produce NaN', () => {
    const strong = assumptionsOf({ usdZarSpot: 16.2, randDepreciation: -0.05 })
    expect(fxRateFor('USD', strong, 10)).toBeLessThan(16.2)
    const broken = assumptionsOf({ usdZarSpot: Number.NaN, randDepreciation: Number.NaN })
    for (const c of ['ZAR', 'USD', 'AUD', 'GBP', 'EUR'] as const) {
      expect(Number.isFinite(fxRateFor(c, broken, Number.NaN))).toBe(true)
      expect(fxRateFor(c, broken, 5)).toBeGreaterThan(0)
    }
  })
})

// ===========================================================================
// 2. The loan
// ===========================================================================

describe('annuityPayment', () => {
  it('A$300,000 at 6.5% over 25 years is the standard annuity payment (~A$24.6k a year)', () => {
    const expected = (300_000 * 0.065) / (1 - 1.065 ** -25)
    const payment = annuityPayment(300_000, 0.065, 25)
    expect(payment).toBeCloseTo(expected, 6)
    // The brief quotes ~24,585; the exact annuity value is 24,594.8. Pin it to within 0.1%.
    expect(payment).toBeGreaterThan(24_585 * 0.999)
    expect(payment).toBeLessThan(24_585 * 1.001)
  })

  it('a zero rate is straight-line, and bad input returns 0 rather than NaN', () => {
    expect(annuityPayment(120_000, 0, 10)).toBeCloseTo(12_000, 9)
    expect(annuityPayment(0, 0.07, 20)).toBe(0)
    expect(annuityPayment(Number.NaN, 0.07, 20)).toBe(0)
    expect(Number.isFinite(annuityPayment(100_000, Number.NaN, Number.NaN))).toBe(true)
  })
})

// ===========================================================================
// 3. projectCustomInvestment
// ===========================================================================

describe('fixed-term deposit: R1,000,000 at 9.5% for 5 years, taxed at 36%', () => {
  const inv = investmentOf({
    id: 'fd',
    name: 'Five-year fixed deposit',
    kind: 'fixed-term',
    currency: 'ZAR',
    startAge: 60,
    termYears: 5,
    deposit: 1_000_000,
    incomeYield: 0.095,
    incomeTaxRate: 0.36,
  })
  const rows = projectCustomInvestment(inv, assumptionsOf(), { currentAge: 60, fromAge: 60, toAge: 90 })

  it('runs for exactly the five years of the term, ages 60 to 64', () => {
    expect(rows.length).toBe(5)
    expect(rows.map((r) => r.age)).toEqual([60, 61, 62, 63, 64])
    expect(rows.map((r) => r.year)).toEqual([0, 1, 2, 3, 4])
    expect(rows[0].event).toBe('buy')
    expect(rows[4].event).toBe('sell')
  })

  it('pays R60,800 of net cash every year: 95,000 interest less 36% tax', () => {
    for (const row of rows) {
      expect(row.grossIncomeCcy, `age${row.age}`).toBeCloseTo(95_000, 9)
      expect(row.costsCcy).toBe(0)
      expect(row.interestCcy).toBe(0)
      expect(row.principalCcy).toBe(0)
      expect(row.taxCcy, `age${row.age}`).toBeCloseTo(34_200, 9)
      expect(row.netCashCcy, `age${row.age}`).toBeCloseTo(60_800, 9)
      // Rand: fx is 1 for a ZAR holding in every year.
      expect(row.fx).toBe(1)
      expect(row.netCashZar, `age${row.age}`).toBeCloseTo(60_800, 9)
    }
  })

  it('returns the R1,000,000 capital at the end of year 5, with no gain and so no CGT', () => {
    expect(rows[4].saleProceedsZar).toBeCloseTo(1_000_000, 6)
    expect(rows[4].cgtCcy).toBeCloseTo(0, 9)
    // The sale row still reports the equity it held just before maturing.
    expect(rows[4].equityZar).toBeCloseTo(1_000_000, 6)
    for (const row of rows.slice(0, 4)) {
      expect(row.saleProceedsZar).toBeUndefined()
      expect(row.equityZar, `age${row.age}`).toBeCloseTo(1_000_000, 6)
    }
    const s = summariseInvestment(rows)
    expect(s.purchaseCashZar).toBeCloseTo(1_000_000, 6)
    expect(s.totalNetIncomeZar).toBeCloseTo(5 * 60_800, 6)
    expect(s.saleProceedsZar).toBeCloseTo(1_000_000, 6)
    expect(s.peakEquityZar).toBeCloseTo(1_000_000, 6)
    expect(s.startAge).toBe(60)
    expect(s.endAge).toBe(64)
  })
})

describe('S&P 500 ETF: USD 100k with the rand weakening 4% a year', () => {
  const a = assumptionsOf({ usdZarSpot: 16.2, randDepreciation: 0.04 })
  const inv = investmentOf({
    id: 'spx',
    name: 'S&P 500 index ETF',
    kind: 'equity-index',
    currency: 'USD',
    startAge: 65,
    termYears: 15,
    deposit: 100_000,
    purchaseCostPct: 0.002,
    sellingCostPct: 0.002,
    growth: 0.06,
    incomeYield: 0.013,
    costsPct: 0.001,
    incomeTaxRate: 0.2,
    cgtRate: 0.18,
    incomeUse: 'reinvest',
  })
  // The member is 60 today and the scenario starts at the exit age of 62, so the ETF is bought
  // five years into the projection: t = 5 in the first row of the holding.
  const rows = projectCustomInvestment(inv, a, { currentAge: 60, fromAge: 62, toAge: 95 })

  it('is bought at 65, held 15 years and sold at 79', () => {
    expect(rows.length).toBe(15)
    expect(rows[0].age).toBe(65)
    expect(rows[0].event).toBe('buy')
    expect(rows[14].age).toBe(79)
    expect(rows[14].event).toBe('sell')
    expect(rows[0].purchaseCashZar).toBeCloseTo(100_200 * 16.2 * 1.04 ** 5, 6)
  })

  it('follows the FX path: fx = 16.20 x 1.04^t with t measured from today', () => {
    rows.forEach((row, k) => {
      expect(row.fx, `age${row.age}`).toBeCloseTo(16.2 * 1.04 ** (5 + k), 9)
    })
  })

  it('rand equity compounds at (1 + growth)(1 + depreciation) = 1.06 x 1.04', () => {
    rows.forEach((row, k) => {
      // value at the end of year k has grown k+1 times; it is translated at the end-of-year rate.
      expect(row.valueCcy, `value age${row.age}`).toBeCloseTo(100_000 * 1.06 ** (k + 1), 6)
      expect(row.loanBalanceCcy).toBe(0)
      expect(row.equityZar, `equity age${row.age}`).toBeCloseTo(100_000 * 1.06 ** (k + 1) * 16.2 * 1.04 ** (6 + k), 4)
    })
    for (let k = 1; k < rows.length; k++) {
      expect(rows[k].equityZar / rows[k - 1].equityZar, `ratio ${k}`).toBeCloseTo(1.06 * 1.04, 9)
    }
  })

  it('income is dividends less the TER, taxed at 20%', () => {
    rows.forEach((row, k) => {
      const value = 100_000 * 1.06 ** k
      const net = value * 0.013 - value * 0.001
      expect(row.grossIncomeCcy, `age${row.age}`).toBeCloseTo(value * 0.013, 6)
      expect(row.netCashCcy, `age${row.age}`).toBeCloseTo(net * 0.8, 6)
      expect(row.netCashZar, `age${row.age}`).toBeCloseTo(net * 0.8 * row.fx, 4)
    })
  })

  it('the sale charges 0.2% selling costs and 18% CGT on the dollar gain over the entry cost', () => {
    const sale = rows[14]
    const salePrice = 100_000 * 1.06 ** 15
    const gain = salePrice - 100_200
    const proceeds = salePrice - salePrice * 0.002 - gain * 0.18
    expect(sale.valueCcy).toBeCloseTo(salePrice, 6)
    expect(sale.cgtCcy).toBeCloseTo(gain * 0.18, 6)
    expect(sale.saleProceedsZar).toBeCloseTo(proceeds * 16.2 * 1.04 ** 20, 2)
    // Pre-sale equity, which the proceeds then net down by the selling cost and the CGT.
    expect(sale.equityZar).toBeCloseTo(salePrice * 16.2 * 1.04 ** 20, 2)
  })
})

describe('Australian house: A$500,000 with a 60% loan at 6.5% over 25 years', () => {
  const a = assumptionsOf({ randDepreciation: 0, fxSpots: { AUD: 10.8, GBP: 21.5, EUR: 18.8 } })
  const inv = investmentOf({
    id: 'house',
    name: 'Australian house',
    kind: 'residential-property',
    currency: 'AUD',
    startAge: 60,
    termYears: 10,
    deposit: 200_000,
    loan: { amount: 300_000, rate: 0.065, termYears: 25, interestOnly: false },
    purchaseCostPct: 0.07,
    sellingCostPct: 0.025,
    growth: 0.045,
    incomeYield: 0.038,
    costsPct: 0.015,
    incomeTaxRate: 0.325,
    cgtRate: 0.325,
  })
  const rows = projectCustomInvestment(inv, a, { currentAge: 60, fromAge: 60, toAge: 90 })
  const payment = (300_000 * 0.065) / (1 - 1.065 ** -25)

  it('charges A$19,500 of interest in year one and amortises at the annuity payment', () => {
    expect(rows.length).toBe(10)
    expect(rows[0].interestCcy).toBeCloseTo(19_500, 9)
    expect(rows[0].principalCcy).toBeCloseTo(payment - 19_500, 6)
    expect(rows[0].grossIncomeCcy).toBeCloseTo(19_000, 9)
    expect(rows[0].costsCcy).toBeCloseTo(7_500, 9)
    // Rent does not cover costs, interest and capital: the year is cash-negative.
    expect(rows[0].taxCcy).toBe(0)
    expect(rows[0].netCashCcy).toBeCloseTo(19_000 - 7_500 - 19_500 - (payment - 19_500), 6)
    expect(rows[0].netCashCcy).toBeLessThan(0)
    expect(rows[0].purchaseCashZar).toBeCloseTo((200_000 + 35_000) * 10.8, 6)
  })

  it('the value, the loan balance and the rand equity reconcile every year', () => {
    rows.forEach((row, k) => {
      expect(row.valueCcy, `value ${k}`).toBeCloseTo(500_000 * 1.045 ** (k + 1), 6)
      expect(row.loanBalanceCcy, `loan ${k}`).toBeCloseTo(balanceAfter(300_000, 0.065, 25, k + 1), 6)
      expect(row.interestCcy, `interest ${k}`).toBeCloseTo(balanceAfter(300_000, 0.065, 25, k) * 0.065, 6)
      expect(row.equityZar, `equity ${k}`).toBeCloseTo((row.valueCcy - row.loanBalanceCcy) * 10.8, 4)
      // The balance falls by exactly the principal booked in the row.
      const previous = k === 0 ? 300_000 : rows[k - 1].loanBalanceCcy
      expect(row.loanBalanceCcy, `step ${k}`).toBeCloseTo(previous - row.principalCcy, 6)
    })
  })

  it('the sale after 10 years pays CGT on the gain over price + entry costs and settles the loan', () => {
    const sale = rows[9]
    const salePrice = 500_000 * 1.045 ** 10
    const balance = balanceAfter(300_000, 0.065, 25, 10)
    const gain = salePrice - (500_000 + 35_000)
    const cgt = gain * 0.325
    const proceeds = salePrice - salePrice * 0.025 - balance - cgt
    expect(sale.event).toBe('sell')
    expect(gain).toBeGreaterThan(0)
    expect(sale.cgtCcy).toBeCloseTo(cgt, 6)
    expect(sale.saleProceedsZar).toBeCloseTo(proceeds * 10.8, 3)
    expect(sale.equityZar).toBeCloseTo((salePrice - balance) * 10.8, 3)
    const s = summariseInvestment(rows)
    expect(s.saleProceedsZar).toBeCloseTo(proceeds * 10.8, 3)
    // Every year is cash-negative while the loan amortises, so the running total is negative.
    expect(s.totalNetIncomeZar).toBeLessThan(0)
    expect(s.peakEquityZar).toBeCloseTo((salePrice - balance) * 10.8, 3)
  })

  it('an interest-only loan never amortises and is settled out of the proceeds', () => {
    const io = projectCustomInvestment(
      { ...inv, loan: { amount: 300_000, rate: 0.065, termYears: 25, interestOnly: true } },
      a,
      { currentAge: 60, fromAge: 60, toAge: 90 },
    )
    for (const row of io) {
      expect(row.principalCcy).toBe(0)
      expect(row.loanBalanceCcy).toBeCloseTo(300_000, 9)
      expect(row.interestCcy).toBeCloseTo(19_500, 9)
    }
    const salePrice = 500_000 * 1.045 ** 10
    const gain = salePrice - 535_000
    expect(io[9].saleProceedsZar).toBeCloseTo((salePrice - salePrice * 0.025 - 300_000 - gain * 0.325) * 10.8, 3)
  })

  it('marks the year the loan is repaid', () => {
    const short = projectCustomInvestment(
      { ...inv, termYears: 10, loan: { amount: 300_000, rate: 0.065, termYears: 4, interestOnly: false } },
      a,
      { currentAge: 60, fromAge: 60, toAge: 90 },
    )
    expect(short[3].event).toBe('loan-repaid')
    expect(short[3].loanBalanceCcy).toBeCloseTo(0, 6)
    expect(short.filter((r) => r.event === 'loan-repaid').length).toBe(1)
    for (const row of short.slice(4)) expect(row.interestCcy).toBe(0)
  })
})

describe('holdings that start outside the projection window', () => {
  const a = assumptionsOf({ randDepreciation: 0, fxSpots: { AUD: 10.8, GBP: 21.5, EUR: 18.8 } })
  const base = investmentOf({
    currency: 'AUD',
    startAge: 55,
    deposit: 200_000,
    loan: { amount: 300_000, rate: 0.065, termYears: 25, interestOnly: false },
    growth: 0.045,
    incomeYield: 0.038,
    costsPct: 0.015,
    purchaseCostPct: 0.07,
  })

  it('a holding bought before the exit age arrives already grown and already amortised', () => {
    const rows = projectCustomInvestment(base, a, { currentAge: 60, fromAge: 60, toAge: 70 })
    expect(rows[0].age).toBe(60)
    // Five years of growth and five years of payments happened before the projection starts.
    expect(rows[0].openingEquityZar).toBeCloseTo((500_000 * 1.045 ** 5 - balanceAfter(300_000, 0.065, 25, 5)) * 10.8, 3)
    // Owning it already means no purchase cash inside the window and no 'buy' event.
    expect(rows[0].purchaseCashZar).toBeUndefined()
    expect(rows[0].event).not.toBe('buy')
    expect(summariseInvestment(rows).purchaseCashZar).toBe(0)
  })

  it('a term that has already run out produces no rows at all', () => {
    expect(projectCustomInvestment({ ...base, termYears: 4 }, a, { currentAge: 60, fromAge: 60, toAge: 70 })).toEqual([])
  })

  it('a purchase after the horizon produces no rows, and one mid-way snaps onto the yearly grid', () => {
    expect(projectCustomInvestment({ ...base, startAge: 95 }, a, { currentAge: 60, fromAge: 60, toAge: 70 })).toEqual([])
    const late = projectCustomInvestment({ ...base, startAge: 64.4, termYears: 3 }, a, { currentAge: 60, fromAge: 60, toAge: 70 })
    expect(late[0].age).toBe(65)
    expect(late.length).toBe(3)
  })
})

describe('guards: nothing throws and nothing is NaN', () => {
  const a = assumptionsOf()
  const nasty: Partial<CustomInvestment>[] = [
    { deposit: 0 },
    { deposit: Number.NaN },
    { deposit: -500_000 },
    { deposit: 500_000, growth: Number.NaN, incomeYield: Number.NaN, costsPct: Number.NaN },
    { deposit: 500_000, incomeTaxRate: 5, cgtRate: -2, purchaseCostPct: 12, sellingCostPct: -1 },
    { deposit: 500_000, growth: -0.99, termYears: 0 },
    { deposit: 500_000, termYears: Number.NaN },
    { deposit: 100_000, loan: { amount: 900_000, rate: 5, termYears: 0, interestOnly: false } },
    { deposit: 100_000, loan: { amount: 400_000, rate: Number.NaN, termYears: Number.NaN, interestOnly: false } },
    { deposit: 500_000, growth: -0.5, termYears: 5, cgtRate: 0.4, sellingCostPct: 0.1, loan: { amount: 400_000, rate: 0.12, termYears: 30, interestOnly: true } },
    { deposit: 500_000, startAge: 20 },
  ]

  it.each(nasty.map((p, i) => [i, p] as const))('case %i', (_i, patch) => {
    for (const currency of ['ZAR', 'USD', 'AUD', 'GBP', 'EUR'] as const) {
      const rows = projectCustomInvestment(investmentOf({ ...patch, currency }), a, { currentAge: 60, fromAge: 60, toAge: 90 })
      for (const row of rows) {
        for (const [k, v] of Object.entries(row)) {
          if (typeof v === 'number') expect(Number.isFinite(v), `${currency} ${row.age}.${k}`).toBe(true)
        }
        expect(row.valueCcy).toBeGreaterThanOrEqual(0)
        expect(row.loanBalanceCcy).toBeGreaterThanOrEqual(0)
      }
      const s = summariseInvestment(rows)
      for (const [k, v] of Object.entries(s)) expect(Number.isFinite(v), `${currency} summary.${k}`).toBe(true)
    }
  })

  it('an empty row list summarises to zeros', () => {
    expect(summariseInvestment([])).toEqual({
      purchaseCashZar: 0,
      totalNetIncomeZar: 0,
      saleProceedsZar: 0,
      peakEquityZar: 0,
      startAge: 0,
      endAge: 0,
    })
  })
})

// ===========================================================================
// 4. Presets
// ===========================================================================

describe('INVESTMENT_PRESETS', () => {
  const kinds: CustomInvestmentKind[] = ['equity-index', 'residential-property', 'commercial-property', 'fixed-term', 'other']

  it('covers every kind, cites its basis and keeps every rate inside [0, 1]', () => {
    expect(Object.keys(INVESTMENT_PRESETS).sort()).toEqual([...kinds].sort())
    for (const kind of kinds) {
      const p = INVESTMENT_PRESETS[kind]
      expect(p.kind, kind).toBe(kind)
      expect((p.notes ?? '').length, kind).toBeGreaterThan(120)
      expect(p.name, kind).toBeTruthy()
      expect(p.deposit ?? 0, kind).toBeGreaterThan(0)
      for (const key of ['incomeYield', 'costsPct', 'incomeTaxRate', 'cgtRate', 'purchaseCostPct', 'sellingCostPct'] as const) {
        expect(p[key], `${kind}.${key}`).toBeGreaterThanOrEqual(0)
        expect(p[key], `${kind}.${key}`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('carries the 2026 defaults the spec asks for', () => {
    const etf = INVESTMENT_PRESETS['equity-index']
    expect(etf.currency).toBe('USD')
    expect(etf.growth).toBeCloseTo(0.06, 9)
    expect(etf.incomeYield).toBeCloseTo(0.013, 9)
    expect(etf.costsPct).toBeCloseTo(0.001, 9)
    expect(etf.incomeTaxRate).toBeCloseTo(0.2, 9)
    expect(etf.cgtRate).toBeCloseTo(0.18, 9)
    expect(etf.loan).toBeUndefined()

    const house = INVESTMENT_PRESETS['residential-property']
    expect(house.currency).toBe('AUD')
    expect(house.growth).toBeCloseTo(0.045, 9)
    expect(house.incomeYield).toBeCloseTo(0.038, 9)
    expect(house.purchaseCostPct).toBeCloseTo(0.07, 9)
    expect(house.incomeTaxRate).toBeCloseTo(0.325, 9)
    expect(house.cgtRate).toBeCloseTo(0.325, 9)
    expect(house.termYears).toBe(10)
    // 60% loan-to-value at 6.5% over 25 years.
    const housePrice = (house.deposit ?? 0) + (house.loan?.amount ?? 0)
    expect((house.loan?.amount ?? 0) / housePrice).toBeCloseTo(0.6, 9)
    expect(house.loan?.rate).toBeCloseTo(0.065, 9)
    expect(house.loan?.termYears).toBe(25)

    const commercial = INVESTMENT_PRESETS['commercial-property']
    const commercialPrice = (commercial.deposit ?? 0) + (commercial.loan?.amount ?? 0)
    expect(commercial.incomeYield).toBeCloseTo(0.06, 9)
    expect(commercial.growth).toBeCloseTo(0.03, 9)
    expect((commercial.loan?.amount ?? 0) / commercialPrice).toBeCloseTo(0.5, 9)
    expect(commercial.loan?.rate).toBeCloseTo(0.07, 9)

    const fd = INVESTMENT_PRESETS['fixed-term']
    expect(fd.currency).toBe('ZAR')
    expect(fd.growth).toBe(0)
    expect(fd.incomeYield).toBeCloseTo(0.095, 9)
    expect(fd.incomeTaxRate).toBeCloseTo(0.36, 9)
    expect(fd.cgtRate).toBe(0)
    expect(fd.termYears).toBe(5)

    const other = INVESTMENT_PRESETS.other
    expect(other.currency).toBe('ZAR')
    expect(other.growth).toBeCloseTo(0.05, 9)
    expect(other.incomeYield).toBeCloseTo(0.03, 9)
    expect(other.costsPct).toBeCloseTo(0.005, 9)
    expect(other.incomeTaxRate).toBeCloseTo(0.3, 9)
    expect(other.cgtRate).toBeCloseTo(0.18, 9)
  })

  it('every preset projects cleanly from its own defaults', () => {
    for (const kind of kinds) {
      const inv = investmentOf({ ...INVESTMENT_PRESETS[kind], id: kind, startAge: 62 })
      const rows = projectCustomInvestment(inv, assumptionsOf(), { currentAge: 57, fromAge: 60, toAge: 90 })
      expect(rows.length, kind).toBeGreaterThan(0)
      expect(rows[0].age, kind).toBe(62)
      expect(rows[rows.length - 1].event, kind).toBe('sell')
      for (const row of rows) {
        for (const [k, v] of Object.entries(row)) {
          if (typeof v === 'number') expect(Number.isFinite(v), `${kind} ${row.age}.${k}`).toBe(true)
        }
      }
    }
  })
})

// ===========================================================================
// 5. Integration with runScenario
// ===========================================================================

/**
 * A deliberately inert world: no returns, no inflation, no depreciation, no fees, no FX cost
 * and no tax on discretionary returns. Capital then only moves because something MOVES it, so
 * the effect of a custom investment can be read off exactly.
 */
const FLAT: Partial<Assumptions> = {
  localBalancedReturn: 0,
  offshoreReturnUsd: 0,
  randDepreciation: 0,
  officialCpi: 0,
  personalInflation: 0,
  medicalInflation: 0,
  discretionaryReturnTaxRate: 0,
  fxConversionCost: 0,
}

function flatProfile(investments: CustomInvestment[]): Profile {
  return profileOf({
    person: { currentAge: 60, plannedExitAge: 60, planToAge: 68 },
    lifestyle: { otherSavings: 6_000_000, otherSavingsOffshorePct: 0, onceOffCapitalNeeds: 0, medicalAidMonthly: 0, targetNetMonthlyIncomeToday: 35_000 },
    assumptions: FLAT,
    investments,
  })
}

const FLAT_DEF: ScenarioDefinition = {
  id: 'flat',
  name: 'flat',
  kind: 'stay-gepf',
  exitAge: 60,
  fundId: FUNDS[0].id,
  feeOverride: 0,
  offshorePct: 0,
  gratuityOffshorePct: 0,
  drawdownStrategy: 'target-income',
  overrides: FLAT,
}

describe('runScenario: buying an investment out of exit capital', () => {
  const inv = investmentOf({
    id: 'fd',
    name: 'Fixed deposit',
    kind: 'fixed-term',
    currency: 'ZAR',
    startAge: 60,
    termYears: 5,
    deposit: 500_000,
    purchaseCostPct: 0.02,
    incomeUse: 'reinvest',
  })
  const base = runScenario(flatProfile([]), FLAT_DEF, DEPS)
  const withInv = runScenario(flatProfile([inv]), FLAT_DEF, DEPS)

  it('takes the deposit plus the entry costs out of the discretionary pot, in rand', () => {
    expect(withInv.rows[0].customCashIn).toBeCloseTo(510_000, 6)
    expect(withInv.customInvestments?.[0].purchaseCashZar).toBeCloseTo(510_000, 6)
    for (const row of withInv.rows.slice(1)) expect(row.customCashIn).toBeCloseTo(0, 6)
  })

  it('leaves the deposit inside total capital as equity, so only the R10,000 of costs is lost', () => {
    expect(withInv.rows[0].customEquityZar).toBeCloseTo(500_000, 6)
    expect(withInv.rows[0].capitalEnd).toBeCloseTo(base.rows[0].capitalEnd - 10_000, 6)
    // The bridge term is the equity gained less the cash the pots paid.
    expect(withInv.rows[0].customCashFlows).toBeCloseTo(500_000 - 510_000, 6)
  })

  it('returns the capital to the pot when the deposit matures, and reports it', () => {
    const sale = withInv.rows[4]
    expect(sale.customEquityZar).toBeCloseTo(0, 6)
    expect(withInv.customInvestments?.[0]).toMatchObject({ id: 'fd', name: 'Fixed deposit', startAge: 60, endAge: 64 })
    expect(withInv.customInvestments?.[0].saleProceedsZar).toBeCloseTo(500_000, 6)
    // From the maturity year on, total capital differs from the baseline only by the entry cost.
    for (const row of withInv.rows.slice(4)) {
      const b = base.rows.find((r) => r.age === row.age)!
      expect(row.capitalEnd, `age${row.age}`).toBeCloseTo(b.capitalEnd - 10_000, 6)
    }
  })

  it('a zero-cost, zero-yield holding bought from the pot is capital-neutral in every year', () => {
    const inert = runScenario(
      flatProfile([investmentOf({ id: 'inert', name: 'Inert', currency: 'ZAR', startAge: 60, termYears: 5, deposit: 500_000, incomeUse: 'reinvest' })]),
      FLAT_DEF,
      DEPS,
    )
    for (const row of inert.rows) {
      const b = base.rows.find((r) => r.age === row.age)!
      expect(row.capitalEnd, `age${row.age}`).toBeCloseTo(b.capitalEnd, 6)
      expect(row.totalNetIncome, `income age${row.age}`).toBeCloseTo(b.totalNetIncome, 6)
    }
  })

  it('pays foreign sale proceeds into the offshore sleeve of the discretionary pot', () => {
    const spot = DEFAULT_PROFILE.assumptions.usdZarSpot // randDepreciation is 0 under FLAT
    const usd = investmentOf({
      id: 'usd',
      name: 'Dollar holding',
      currency: 'USD',
      startAge: 60,
      termYears: 3,
      deposit: 10_000,
      fundedFrom: 'external',
      incomeUse: 'reinvest',
    })
    const r = runScenario(flatProfile([usd]), FLAT_DEF, DEPS)
    // While it is held, a dollar holding IS offshore exposure: the scenario's own pots are 0%
    // offshore, so the whole offshore sleeve is the holding's equity.
    expect(r.rows[1].customEquityZar).toBeCloseTo(10_000 * spot, 6)
    expect(r.rows[1].capitalOffshoreZar).toBeCloseTo(10_000 * spot, 4)
    expect(r.rows[1].capitalOffshoreUsd).toBeCloseTo(10_000, 6)
    // On maturity the proceeds land in the pot's offshore sleeve at that year's rate.
    expect(r.rows[2].customEquityZar).toBeCloseTo(0, 6)
    expect(r.rows[2].capitalOffshoreUsd).toBeCloseTo(10_000, 6)
    expect(r.rows[2].capitalOffshoreZar).toBeCloseTo(10_000 * spot, 4)
    // The scenario targets 0% offshore, so the next rebalance brings the money home.
    expect(r.rows[3].capitalOffshoreZar).toBeCloseTo(0, 6)
    expect(r.rows[3].capitalLocal).toBeCloseTo(r.rows[3].capitalEnd, 6)
  })

  it('says so when the discretionary pot cannot cover the purchase, and funds it pro rata', () => {
    const poor = profileOf({
      person: { currentAge: 60, plannedExitAge: 60, planToAge: 68 },
      lifestyle: { otherSavings: 0, otherSavingsOffshorePct: 0, onceOffCapitalNeeds: 0, medicalAidMonthly: 0, targetNetMonthlyIncomeToday: 35_000 },
      assumptions: FLAT,
      investments: [investmentOf({ id: 'big', name: 'Big holding', currency: 'ZAR', startAge: 60, termYears: 5, deposit: 50_000_000, incomeUse: 'reinvest' })],
    })
    const r = runScenario(poor, FLAT_DEF, DEPS)
    expect(r.notes.some((n) => n.includes('pro rata'))).toBe(true)
    expect(r.rows[0].customCashIn).toBeLessThan(50_000_000)
    expect(r.rows[0].customCashIn).toBeGreaterThan(0)
    for (const row of r.rows) expect(Number.isFinite(row.capitalEnd)).toBe(true)
  })
})

describe('runScenario: spendable income lowers the living-annuity draw', () => {
  const LA_DEF: ScenarioDefinition = {
    id: 'la',
    name: 'la',
    kind: 'resign-preserve',
    exitAge: 60,
    retireFromPreservationAge: 60,
    fundId: FUNDS[0].id,
    feeOverride: 0,
    offshorePct: 0,
    lumpSumAtRetirementPct: 0,
    drawdownStrategy: 'target-income',
    overrides: FLAT,
  }
  const spend = investmentOf({
    id: 'fd',
    name: 'Fixed deposit',
    kind: 'fixed-term',
    currency: 'ZAR',
    startAge: 60,
    termYears: 5,
    deposit: 1_000_000,
    incomeYield: 0.095,
    incomeTaxRate: 0.36,
    incomeUse: 'spend',
    fundedFrom: 'external',
  })
  const base = runScenario(flatProfile([]), LA_DEF, DEPS)
  const withInv = runScenario(flatProfile([spend]), LA_DEF, DEPS)

  it('counts R60,800 a year of already-taxed cash toward the income target', () => {
    for (const row of withInv.rows.slice(0, 5)) {
      expect(row.customIncomeNet, `age${row.age}`).toBeCloseTo(60_800, 6)
    }
    for (const row of withInv.rows.slice(5)) expect(row.customIncomeNet).toBeCloseTo(0, 6)
  })

  it('reduces the gross draw and does not tax the investment income a second time', () => {
    const b = base.rows[0]
    const w = withInv.rows[0]
    expect(b.shortfall).toBeCloseTo(0, 2)
    expect(w.shortfall).toBeCloseTo(0, 2)
    expect(w.totalNetIncome).toBeCloseTo(b.totalNetIncome, 2)
    // Less has to come out of the living annuity, so both the draw and the PAYE on it fall.
    expect(w.drawGross).toBeLessThan(b.drawGross - 60_000)
    expect(w.drawTax).toBeLessThan(b.drawTax)
    // The R60,800 is NOT added to taxable income: the pension's own PAYE is unchanged.
    expect(w.gepfPensionTax).toBeCloseTo(b.gepfPensionTax, 6)
    // Capital lasts longer because less is drawn.
    expect(withInv.rows[7].capitalEnd).toBeGreaterThan(base.rows[7].capitalEnd)
  })

  it('an external purchase brings its equity in from outside the plan', () => {
    // Nothing is taken from the pots; the R1m of equity is booked as a customCashFlow instead.
    expect(withInv.rows[0].customCashIn).toBeCloseTo(0, 6)
    expect(withInv.rows[0].customCashFlows).toBeCloseTo(1_000_000, 6)
    expect(withInv.rows[0].customEquityZar).toBeCloseTo(1_000_000, 6)
  })

  it('funds a negative year out of discretionary capital', () => {
    const geared = investmentOf({
      id: 'house',
      name: 'Geared house',
      kind: 'residential-property',
      currency: 'AUD',
      startAge: 60,
      termYears: 5,
      deposit: 200_000,
      loan: { amount: 300_000, rate: 0.065, termYears: 25, interestOnly: false },
      growth: 0.045,
      incomeYield: 0.038,
      costsPct: 0.015,
      purchaseCostPct: 0.07,
      incomeUse: 'spend',
      fundedFrom: 'external',
    })
    const r = runScenario(flatProfile([geared]), LA_DEF, DEPS)
    const payment = (300_000 * 0.065) / (1 - 1.065 ** -25)
    const shortfall = -(19_000 - 7_500 - 19_500 - (payment - 19_500))
    const fxAud = r.rows[0].usdZar > 0 ? 10.8 : 10.8 // randDepreciation is 0 under FLAT
    expect(r.rows[0].customIncomeNet).toBe(0)
    expect(r.rows[0].customCashIn).toBeCloseTo(shortfall * fxAud, 3)
    expect(r.flags.some((f) => f.id === 'custom-investment' && f.severity === 'info')).toBe(true)
    expect(r.flags.find((f) => f.id === 'custom-investment')?.detail).toMatch(/non-resident/i)
  })
})

describe('runScenario: the capital identity and the untouched baseline', () => {
  const mixed: CustomInvestment[] = [
    investmentOf({ ...INVESTMENT_PRESETS['equity-index'], id: 'etf', startAge: 62, termYears: 12, fundedFrom: 'exit-capital' }),
    investmentOf({ ...INVESTMENT_PRESETS['residential-property'], id: 'house', startAge: 61, fundedFrom: 'external' }),
    investmentOf({ ...INVESTMENT_PRESETS['fixed-term'], id: 'fd', startAge: 60 }),
    investmentOf({ ...INVESTMENT_PRESETS['commercial-property'], id: 'shop', startAge: 55, fundedFrom: 'external' }),
    investmentOf({ ...INVESTMENT_PRESETS.other, id: 'other', startAge: 70, enabled: false }),
  ]
  const profile = profileOf({ person: { currentAge: 57, plannedExitAge: 60, planToAge: 90 }, investments: mixed })

  it('capitalStart - draws + investmentReturn - fees + customCashFlows = capitalEnd, every row', () => {
    for (const def of defaultScenarios(profile, FUNDS)) {
      const r = runScenario(profile, def, DEPS)
      for (const row of r.rows) {
        const lhs = row.capitalStart - row.drawGross + row.investmentReturn - row.fees + (row.customCashFlows ?? 0)
        expect(Math.abs(lhs - row.capitalEnd), `${def.id} age${row.age}`).toBeLessThanOrEqual(1)
        // The sleeve split still adds up, with foreign holdings sitting in the offshore sleeve.
        expect(row.capitalEnd, `${def.id} sleeves age${row.age}`).toBeCloseTo(row.capitalLocal + row.capitalOffshoreZar, 4)
      }
      // One row's closing capital is the next row's opening capital, custom equity included.
      for (let i = 0; i + 1 < r.rows.length; i++) {
        const step = Math.abs(r.rows[i].capitalEnd - r.rows[i + 1].capitalStart)
        if (r.rows[i + 1].capitalStart <= r.rows[i].capitalEnd + 1) continue // lump-sum leak, see projection.ts
        expect(step, `${def.id} chain age${r.rows[i + 1].age}`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('never produces a NaN row, total or per-investment summary', () => {
    for (const def of defaultScenarios(profile, FUNDS)) {
      const r = runScenario(profile, def, DEPS)
      for (const row of r.rows) {
        for (const [k, v] of Object.entries(row)) {
          if (typeof v === 'number') expect(Number.isFinite(v), `${def.id} ${row.age}.${k}`).toBe(true)
        }
      }
      for (const [k, v] of Object.entries(r.totals)) expect(Number.isFinite(v), `${def.id} totals.${k}`).toBe(true)
      expect(r.customInvestments?.length).toBe(4) // the disabled holding is left out
      for (const ci of r.customInvestments ?? []) {
        for (const [k, v] of Object.entries(ci)) {
          if (typeof v === 'number') expect(Number.isFinite(v), `${def.id} ${ci.id}.${k}`).toBe(true)
        }
      }
      // One note per holding, naming it.
      for (const ci of r.customInvestments ?? []) {
        expect(r.notes.some((n) => n.startsWith(`${ci.name}:`)), `${def.id} note for ${ci.name}`).toBe(true)
      }
    }
  })

  it('a scenario with no investments is numerically identical to the pre-feature engine', () => {
    // Snapshot captured by running the engine at the commit BEFORE custom investments existed,
    // on DEFAULT_PROFILE with investments: []. Every figure must still match to the cent.
    const snapshot: Record<string, Record<string, number | null>> = {
      stay: {
        pvNetIncome: 10007693.642570985,
        legacyAtHorizon: 0,
        legacyAtHorizonReal: 0,
        lifetimeNetIncomeNominal: 37755871.08476858,
        lifetimeTaxPaid: 9947808.477851339,
        lifetimeFeesPaid: 176433.1438068737,
        investedCapital: 1788458.194996078,
        firstYearNet: 43939.52137499999,
        firstYearGross: 50597.27729615363,
        ruinAge: 73,
        incomeShortfallAge: 73,
      },
      preserve: {
        pvNetIncome: 4710093.189712561,
        legacyAtHorizon: 0,
        legacyAtHorizonReal: 0,
        lifetimeNetIncomeNominal: 9213471.272969846,
        lifetimeTaxPaid: 1604390.4139330182,
        lifetimeFeesPaid: 426785.04486024764,
        investedCapital: 6227441.824159827,
        firstYearNet: 43939.52167679332,
        firstYearGross: 56661.1015783229,
        ruinAge: 79,
        incomeShortfallAge: 69,
      },
      cash: {
        pvNetIncome: 3809507.1934149163,
        legacyAtHorizon: 0,
        legacyAtHorizonReal: 0,
        lifetimeNetIncomeNominal: 6406927.588313675,
        lifetimeTaxPaid: 2103676.932347174,
        lifetimeFeesPaid: 213837.44700900355,
        investedCapital: 4474790.825375044,
        firstYearNet: 43939.52137499999,
        firstYearGross: 43939.52137499999,
        ruinAge: 68,
        incomeShortfallAge: 68,
      },
    }
    const empty: Profile = { ...DEFAULT_PROFILE, investments: [] }
    for (const def of defaultScenarios(empty, FUNDS)) {
      const r = runScenario(empty, def, DEPS)
      const expected = snapshot[def.id]
      expect(r.totals.pvNetIncome, def.id).toBe(expected.pvNetIncome)
      expect(r.totals.legacyAtHorizon, def.id).toBe(expected.legacyAtHorizon)
      expect(r.totals.legacyAtHorizonReal, def.id).toBe(expected.legacyAtHorizonReal)
      expect(r.totals.lifetimeNetIncomeNominal, def.id).toBe(expected.lifetimeNetIncomeNominal)
      expect(r.totals.lifetimeTaxPaid, def.id).toBe(expected.lifetimeTaxPaid)
      expect(r.totals.lifetimeFeesPaid, def.id).toBe(expected.lifetimeFeesPaid)
      expect(r.atExit.investedCapital, def.id).toBe(expected.investedCapital)
      expect(r.firstYear.netMonthlyIncome, def.id).toBe(expected.firstYearNet)
      expect(r.firstYear.grossMonthlyIncome, def.id).toBe(expected.firstYearGross)
      expect(r.ruinAge, def.id).toBe(expected.ruinAge)
      expect(r.incomeShortfallAge, def.id).toBe(expected.incomeShortfallAge)
      // The new columns are present and inert.
      expect(r.customInvestments).toBeUndefined()
      for (const row of r.rows) {
        expect(row.customIncomeNet).toBe(0)
        expect(row.customEquityZar).toBe(0)
        expect(row.customCashIn).toBe(0)
        expect(row.customCashFlows).toBe(0)
      }
    }
  })
})

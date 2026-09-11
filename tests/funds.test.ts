/**
 * Funds engine tests: fee-impact simulation and fund ranking/lookup.
 * Expected values are hand-computed from the formulas in docs/SPEC.md "src/engine/funds.ts"
 * (comments show the arithmetic).
 */
import { describe, expect, it, vi } from 'vitest'
import { feeImpact, fundById, fundLongRunReturn, growthOfCapital, rankFunds } from '../src/engine/funds'
import { FUNDS } from '../src/data/funds'
import type { FundInfo } from '../src/engine/types'

function fund(overrides: Partial<FundInfo> & { id: string }): FundInfo {
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
    allInFee: 0,
    returns: { y1: null, y3: null, y5: null, y10: null },
    maxOffshore: 1,
    reg28: true,
    asOf: '2025-01-01',
    source: 'https://example.test/',
    ...overrides,
  }
}

describe('feeImpact', () => {
  it('R1m, 20 years, 10% gross, 1% fee, no drawdown -> ~5,604,411 vs ~6,727,500, ~16.7% income loss', () => {
    // finalCapital = 1,000,000 x 1.09^20 (9% net return)
    // finalCapitalNoFee = 1,000,000 x 1.10^20 (10% gross return)
    const withFee = 1_000_000 * 1.09 ** 20
    const noFee = 1_000_000 * 1.1 ** 20
    const r = feeImpact({ capital: 1_000_000, years: 20, grossReturn: 0.1, fee: 0.01 })
    expect(withFee).toBeCloseTo(5_604_411, 0)
    expect(noFee).toBeCloseTo(6_727_500, 0)
    expect(r.finalCapital).toBeCloseTo(withFee, 6)
    expect(r.finalCapitalNoFee).toBeCloseTo(noFee, 6)
    expect(r.incomeLossPct).toBeCloseTo(1 - withFee / noFee, 10)
    expect(r.incomeLossPct).toBeCloseTo(0.167, 3) // ~16.7%
  })

  it('feesPaid = fee x average balance each year, drawdown withdrawn before growth (2-year hand-computed example)', () => {
    // capital 100,000, 10% gross, 2% fee (8% net), 5% annual drawdown.
    // Year 1: start = 100,000 x 0.95 = 95,000; end = 95,000 x 1.08 = 102,600.
    //         fee1 = 0.02 x (95,000 + 102,600)/2 = 0.02 x 98,800 = 1,976.
    // Year 2: start = 102,600 x 0.95 = 97,470; end = 97,470 x 1.08 = 105,267.6.
    //         fee2 = 0.02 x (97,470 + 105,267.6)/2 = 0.02 x 101,368.8 = 2,027.376.
    // feesPaid = 1,976 + 2,027.376 = 4,003.376; finalCapital = 105,267.6.
    // No-fee run (10% gross, same drawdown): 100,000 -> 95,000 -> 104,500 -> 99,275 -> 109,202.5.
    const r = feeImpact({ capital: 100_000, years: 2, grossReturn: 0.1, fee: 0.02, drawdown: 0.05 })
    expect(r.finalCapital).toBeCloseTo(105_267.6, 6)
    expect(r.feesPaid).toBeCloseTo(4_003.376, 6)
    expect(r.finalCapitalNoFee).toBeCloseTo(109_202.5, 6)
    expect(r.incomeLossPct).toBeCloseTo(1 - 105_267.6 / 109_202.5, 10)
  })

  it('zero years returns the starting capital unchanged and no fees', () => {
    const r = feeImpact({ capital: 50_000, years: 0, grossReturn: 0.08, fee: 0.01 })
    expect(r.finalCapital).toBe(50_000)
    expect(r.finalCapitalNoFee).toBe(50_000)
    expect(r.feesPaid).toBe(0)
    expect(r.incomeLossPct).toBe(0)
  })

  it('NaN guards: bad inputs never produce NaN', () => {
    const r = feeImpact({
      capital: Number.NaN,
      years: -5,
      grossReturn: Number.NaN,
      fee: Number.NaN,
      drawdown: Number.NaN,
    })
    expect(Number.isNaN(r.finalCapital)).toBe(false)
    expect(Number.isNaN(r.feesPaid)).toBe(false)
    expect(Number.isNaN(r.finalCapitalNoFee)).toBe(false)
    expect(Number.isNaN(r.incomeLossPct)).toBe(false)
    expect(r.finalCapital).toBe(0)
    expect(r.incomeLossPct).toBe(0) // finalCapitalNoFee is 0 too -> guarded, not 0/0
  })
})

describe('rankFunds', () => {
  it('scores (10y ?? 5y ?? 3y ?? 0) - allInFee, sorts descending, excludes gepf', () => {
    const funds: FundInfo[] = [
      fund({ id: 'gepf', returns: { y1: null, y3: null, y5: null, y10: null }, allInFee: 0 }), // must be excluded
      fund({ id: 'a-10y', returns: { y1: null, y3: 0.05, y5: 0.06, y10: 0.09 }, allInFee: 0.01 }), // 0.09-0.01=0.08
      fund({ id: 'b-5y-only', returns: { y1: null, y3: 0.05, y5: 0.11, y10: null }, allInFee: 0.02 }), // 0.11-0.02=0.09
      fund({ id: 'c-3y-only', returns: { y1: null, y3: 0.2, y5: null, y10: null }, allInFee: 0.05 }), // 0.2-0.05=0.15
      fund({ id: 'd-no-returns', returns: { y1: null, y3: null, y5: null, y10: null }, allInFee: 0.03 }), // 0-0.03=-0.03
    ]
    const ranked = rankFunds(funds)
    expect(ranked.map((f) => f.id)).toEqual(['c-3y-only', 'b-5y-only', 'a-10y', 'd-no-returns'])
    expect(ranked.find((f) => f.id === 'gepf')).toBeUndefined()
    expect(ranked.find((f) => f.id === 'a-10y')!.score).toBeCloseTo(0.08, 10)
    expect(ranked.find((f) => f.id === 'b-5y-only')!.score).toBeCloseTo(0.09, 10)
    expect(ranked.find((f) => f.id === 'c-3y-only')!.score).toBeCloseTo(0.15, 10)
    expect(ranked.find((f) => f.id === 'd-no-returns')!.score).toBeCloseTo(-0.03, 10)
  })

  it('ranks the real fund data set without throwing and always excludes gepf', () => {
    const ranked = rankFunds(FUNDS)
    expect(ranked.find((f) => f.id === 'gepf')).toBeUndefined()
    expect(ranked.length).toBe(FUNDS.length - 1)
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.score).toBeGreaterThanOrEqual(ranked[i]!.score)
    }
  })
})

describe('fundById', () => {
  it('returns the matching fund', () => {
    const found = fundById(FUNDS, 'sygnia-skeleton-70')
    expect(found.id).toBe('sygnia-skeleton-70')
  })

  it('warns and falls back to the first non-gepf fund when the id is missing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fallback = fundById(FUNDS, 'does-not-exist')
    expect(fallback.id).not.toBe('gepf')
    expect(fallback.id).toBe(FUNDS.find((f) => f.id !== 'gepf')!.id)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    warnSpy.mockRestore()
  })
})

describe('fundLongRunReturn', () => {
  it('returns null/—  when the fund has no long-run figure at all', () => {
    const f = fund({ id: 'none', returns: { y1: null, y3: null, y5: null, y10: null } })
    expect(fundLongRunReturn(f)).toEqual({ rate: null, years: null, label: '—' })
  })

  it('picks the longest available fixed bucket (y10 < y20) when there is no sinceInception', () => {
    const f = fund({ id: 'buckets', returns: { y1: null, y3: null, y5: null, y10: 0.08, y20: 0.09 } })
    expect(fundLongRunReturn(f)).toEqual({ rate: 0.09, years: 20, label: '20-yr' })
  })

  it('falls back to y10 when it is the only figure on record', () => {
    const f = fund({ id: 'y10-only', returns: { y1: null, y3: null, y5: null, y10: 0.0991 } })
    expect(fundLongRunReturn(f)).toEqual({ rate: 0.0991, years: 10, label: '10-yr' })
  })

  it('prefers sinceInception over a shorter fixed bucket when the fund is old enough (PSG Balanced-style: y20 only, ~27 yrs since launch)', () => {
    const f = fund({
      id: 'psg-like',
      inceptionDate: '1999-06-01',
      returns: { y1: null, y3: null, y5: null, y10: null, y20: 0.105, sinceInception: 0.107 },
    })
    expect(fundLongRunReturn(f, { today: '2026-09-11' })).toEqual({ rate: 0.107, years: 27, label: 'since 1999 (27 yrs)' })
  })

  it('keeps a fixed bucket over sinceInception on an exact tie in years', () => {
    const f = fund({
      id: 'tie',
      inceptionDate: '1996-08-01', // floors to exactly 30 years before the `today` override below
      returns: { y1: null, y3: null, y5: null, y10: null, y30: 0.125, sinceInception: 0.13 },
    })
    expect(fundLongRunReturn(f, { today: '2026-09-11' })).toEqual({ rate: 0.125, years: 30, label: '30-yr' })
  })

  it('ignores sinceInception without an inceptionDate (nothing to compute years from)', () => {
    const f = fund({
      id: 'no-inception-date',
      returns: { y1: null, y3: null, y5: null, y10: null, y15: 0.1, sinceInception: 0.2 },
    })
    expect(fundLongRunReturn(f)).toEqual({ rate: 0.1, years: 15, label: '15-yr' })
  })

  it('the real PSG Balanced fund data resolves to its since-inception figure with a ~27-year label', () => {
    const psg = FUNDS.find((f) => f.id === 'psg-balanced')!
    const r = fundLongRunReturn(psg)
    expect(r.label).toMatch(/^since 1999 \(\d+ yrs\)$/)
    expect(r.rate).toBeCloseTo(0.107, 10)
  })

  it('runs the whole real fund data set without throwing', () => {
    for (const f of FUNDS) expect(() => fundLongRunReturn(f)).not.toThrow()
  })
})

describe('growthOfCapital', () => {
  it('R1m at 10% net for 30 years compounds to 1,000,000 x 1.1^30', () => {
    const expected = 1_000_000 * 1.1 ** 30
    expect(growthOfCapital(0.12, 0.02, 30)).toBeCloseTo(expected, 4)
  })

  it('defaults capital to R1,000,000', () => {
    expect(growthOfCapital(0.1, 0, 10)).toBeCloseTo(1_000_000 * 1.1 ** 10, 4)
  })

  it('a null rate returns the starting capital unchanged (no guessed growth path)', () => {
    expect(growthOfCapital(null, 0.02, 30)).toBe(1_000_000)
    expect(growthOfCapital(null, 0.02, 30, 500_000)).toBe(500_000)
  })

  it('zero years returns the starting capital unchanged', () => {
    expect(growthOfCapital(0.1, 0.02, 0)).toBe(1_000_000)
  })

  it('NaN guards: bad inputs never produce NaN', () => {
    const r = growthOfCapital(Number.NaN, Number.NaN, Number.NaN, Number.NaN)
    expect(Number.isNaN(r)).toBe(false)
  })
})

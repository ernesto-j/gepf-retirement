import type { ActuarialFactorTable, GepfRules } from '../engine/types'

/**
 * GEPF rules and status, verified against research/gepf-benefit-rules.md (researched 2026-09-09).
 * Formula constants come from the GEPF Rules (Government Employees Pension Law 21 of 1996 and its
 * Rules); the 6.72% gratuity factor, the 1/55 annuity divisor and the R360 fixed addition have been
 * unchanged since the Fund's inception in 1996.
 *
 * Actuarial interest (resignation value) per Rule 14.4: AI = pensionable service x final salary x
 * F(Z), where F(Z) is an age-dependent factor set by the Board on the actuary's advice after
 * consulting the Minister of Finance and employee organisations. The GEPF Fund revised its factors
 * effective 1 October 2025 following the 31 March 2024 statutory valuation; GEPF states the new
 * factors are on average 15% lower than the 2021 factors (high confidence — GEPF's own
 * clarification notice). Two real, dated factor values are known from GEPF FAQ examples:
 * F(40) = 0.2036 (10 yrs x R300,000 x 0.2036 = R610,800) and F(41) = 0.20431 (10 yrs x R315,000 x
 * 0.20431 = R643,576.50). Both examples' dating (1 Sep 2024 and 1 Sep 2025, i.e. both before the
 * 1 Oct 2025 revision) suggests they belong to the 2021 factor basis — not confirmed, per
 * research/gepf-benefit-rules.md open question 1. The full factor table (Appendix 8 of the 2024
 * valuation report) was not retrievable, so the curves below remain ESTIMATES, but both are now
 * anchored to real benefit statements: one dated 31 May 2025 (2021 basis) and one dated
 * 31 March 2026 (2025 basis). See the calibration block below. Use your own benefit statement value
 * when available: it overrides these estimates.
 */
function actuarialCurve(
  ages: number[],
  factorAt60: number,
  decayRate: number,
): { age: number; factor: number }[] {
  return ages.map((age) => {
    const f = factorAt60 * Math.exp(decayRate * (Math.min(age, 65) - 60))
    return { age, factor: Math.round(f * 10000) / 10000 }
  })
}

const AGES = [20, 25, 30, 35, 40, 41, 45, 50, 55, 58, 60, 62, 65]

// --- 2021 basis. Two independent anchors: -----------------------------------------------------
//  * F(40) = 0.2036 from the GEPF FAQ example (10 yrs x R300,000 x 0.2036 = R610,800).
//  * F(63.42) = 0.26290 back-solved from a real GEPF "Estimate of Benefits" dated 31 May 2025 (i.e. on
//    the 2021 factors): total resignation benefit R7,189,401.44 with 25 years 2 months' pensionable
//    service and a final average salary of R1,086,619.08 -> 7,189,401.44 / (25.1667 x 1,086,619.08) =
//    0.26290, the member (born 29 Dec 1961) being 63.42 at the statement date. This is a much flatter
//    curve than an extrapolation from the two FAQ points (40 and 41) implied, so this anchor takes
//    precedence for the slope; the FAQ's F(41) = 0.20431 is then reproduced to within 1% (0.2058).
// The curve is an exponential through the two anchors, continued above 60 (both statement anchors sit
// above 60) and capped at 65, where compulsory retirement applies.
const ANCHOR_AGE_LOW = 40
const ANCHOR_FACTOR_LOW = 0.2036
const ANCHOR_AGE_HIGH = 63.42
const ANCHOR_FACTOR_HIGH = 0.2629
const DECAY_RATE = Math.log(ANCHOR_FACTOR_HIGH / ANCHOR_FACTOR_LOW) / (ANCHOR_AGE_HIGH - ANCHOR_AGE_LOW)
const FACTOR_AT_60_2021 = ANCHOR_FACTOR_LOW * Math.exp(DECAY_RATE * (60 - ANCHOR_AGE_LOW))

// --- 2025 basis (effective 1 Oct 2025). Fitted to two facts, both real: ------------------------
//  * F(64.25) = 0.24674, back-solved from a real "Estimate of Benefits" dated 31 March 2026 — the
//    first statement seen on the revised basis: resignation benefit R7,358,306.34 with 26 years'
//    pensionable service and a final average salary of R1,146,998.90, the member being 64.25 at the
//    statement date. Against the 2021 curve above (0.26525 at that age) that is a reduction of only
//    7.0%, NOT the 15% previously assumed.
//  * GEPF's own statement that the revised factors are "on average 15% lower" than the 2021 factors.
// A uniform haircut cannot satisfy both, so the 2025 curve is a second exponential fitted to do so:
// it passes through the observed point and its mean ratio to the 2021 curve, across the ages in
// `AGES`, is 0.85. The resulting curve is steeper than the 2021 one — the reduction runs from about
// 17% at 40 to 7% at 64 — which is the shape a discount-rate change produces, since a younger
// member's deferred pension is discounted over more years. That shape is INFERRED, not published:
// the reduction near retirement is evidence-based, the reduction for members well under 55 is not.
const ANCHOR_AGE_2025 = 64.25
const ANCHOR_FACTOR_2025 = 0.24674
const TARGET_MEAN_RATIO = 0.85
const factor2021At = (age: number) => FACTOR_AT_60_2021 * Math.exp(DECAY_RATE * (Math.min(age, 65) - 60))

/**
 * Solves for the 2025 curve's decay rate: the rate at which an exponential through
 * (ANCHOR_AGE_2025, ANCHOR_FACTOR_2025) has a mean ratio of TARGET_MEAN_RATIO to the 2021 curve over
 * `AGES`. The mean ratio falls monotonically as the rate rises, so a bisection converges.
 */
function solveDecayRate2025(): number {
  const meanRatio = (rate: number): number => {
    const at60 = ANCHOR_FACTOR_2025 / Math.exp(rate * (Math.min(ANCHOR_AGE_2025, 65) - 60))
    const ratios = AGES.map((age) => (at60 * Math.exp(rate * (Math.min(age, 65) - 60))) / factor2021At(age))
    return ratios.reduce((a, b) => a + b, 0) / ratios.length
  }
  let lo = DECAY_RATE // same shape as 2021 (a uniform haircut): mean ratio above the target
  let hi = DECAY_RATE + 0.2 // far steeper than needed: mean ratio below the target
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (meanRatio(mid) > TARGET_MEAN_RATIO) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

const DECAY_RATE_2025 = solveDecayRate2025()
const FACTOR_AT_60_2025 = ANCHOR_FACTOR_2025 / Math.exp(DECAY_RATE_2025 * (ANCHOR_AGE_2025 - 60))

const FACTORS_2021: ActuarialFactorTable = {
  label: 'GEPF actuarial interest factors, 2021 basis (effective 1 Nov 2022) — anchored to a FAQ example and a real May 2025 statement',
  effectiveFrom: '2022-11-01',
  points: actuarialCurve(AGES, FACTOR_AT_60_2021, DECAY_RATE),
  source: 'https://www.gepf.co.za/frequently-asked-questions/',
  confidence: 'medium',
  note:
    'Anchored at the GEPF FAQ example F(40) = 0.2036 and at F(63.42) = 0.2629 back-solved from a real 31 May 2025 benefit statement (2021 basis); the FAQ F(41) = 0.20431 is reproduced within 1%. The shape between and beyond the anchors is an exponential estimate — the published Appendix 8 table was not retrievable. Replace with the full table if it becomes available.',
}

const FACTORS_2025: ActuarialFactorTable = {
  label: 'GEPF actuarial interest factors effective 1 Oct 2025 — anchored to a real March 2026 statement',
  effectiveFrom: '2025-10-01',
  points: actuarialCurve(AGES, FACTOR_AT_60_2025, DECAY_RATE_2025),
  source:
    'https://gepf.co.za/clarification-on-the-implementation-of-revised-actuarialinterest-factors-as-at-1-october-2025/',
  confidence: 'medium',
  note:
    'Fitted to two real facts: F(64.25) = 0.24674 back-solved from a 31 March 2026 benefit statement (the first seen on the revised basis, a 7.0% reduction at that age, not 15%), and GEPF\'s own "on average 15% lower" statement, which the curve reproduces as a mean across the tabulated ages. The reduction therefore runs from about 17% at 40 to 7% at 64. Near retirement this is evidence-based; below 55 the shape is inferred, not published. Use your own benefit statement value when available — it overrides this estimate.',
}

export const GEPF_RULES: GepfRules = {
  // Gratuity = 6.72% x final salary x pensionable service years (10+ years' service). Unchanged
  // since the Fund's 1996 inception.
  gratuityFactor: 0.0672,
  // Annuity = final salary x service years / 55 + R360 p.a. (10+ years' service). Unchanged since 1996.
  annuityDivisor: 55,
  annuityFixedAddition: 360,
  // NOTE (simplification, see research/gepf-benefit-rules.md §1): the real rule for under-10-years
  // service is "gratuity only, equal to the member's actuarial interest" (service x salary x F(Z)),
  // not a fixed percentage of salary. The engine (src/engine/gepf.ts, out of this file's scope)
  // currently models it as a flat factor; 0.15 is a rough placeholder pending an engine change to
  // use the actuarial-interest formula for this case too.
  shortServiceGratuityFactor: 0.15,
  minServiceYearsForPension: 10,
  normalRetirementAge: 60,
  earlyRetirementMinAge: 55,
  // One third of one percent per month before age 60 (~4% p.a.; ~19.9% at exactly 55). Waived for
  // employer-initiated retirement under s16(6) of the Public Service Act (employer pays the
  // penalty), ill-health, injury-on-duty and restructuring/abolition-of-post exits.
  earlyRetirementReductionPerMonth: 1 / 300,
  spousePensionDefault: 0.5,
  spousePensionEnhanced: 0.75,
  // The GEPF quotes the cost of electing 75% individually (age- and gender-based); no public table
  // was found (open question in research/gepf-benefit-rules.md §3.8). 0.05 remains a rough estimate.
  spousePensionEnhancedCostPct: 0.05,
  // GEP Law: annual increase (1 April) of at least 75% of Nov y/y CPI, plus catch-up to keep the
  // pension at 75% of its original purchasing power; Board practice is 100% of CPI where affordable.
  minIncreaseAsPctOfCpi: 0.75,
  guaranteeYears: 5,
  twoPotStartDate: '2024-09-01',
  twoPotSeedPct: 0.1,
  twoPotSeedCap: 30_000,
  medicalSubsidyMinServiceYears: 15,
  // DPSA 2026 determination: single-member cap R2,004/month from 1 Jan 2026, R2,014 from 1 Apr 2026
  // (+4.5% then +0.5%). The with-dependants cap (used here, since most retirees have a dependant on
  // their scheme) is derived at ~R4,009 (Jan) / ~R4,029 (Apr) — medium confidence, not read directly
  // off the determination.
  medicalSubsidyMaxMonthly: 4_029,
  // DPSA "Incentivised Early Retirement Programme (ERP) without pension penalisation and
  // Voluntary Exit Programme (VEP)", Circular 38 of 2025 with the Determination and Directive of
  // October 2025 made under s16(6) and s5(5) of the Public Service Act. Implementation period
  // 1 Oct 2025 - 31 Mar 2027: phase 1 applications 15 Oct - 30 Nov 2025 for exits by 31 Mar 2026,
  // phase 2 applications 1 Apr - 30 Sep 2026 for exits by 31 Mar 2027. Permanent employees with
  // 10+ years' pensionable service; approval is at the Executive Authority's discretion and is NOT
  // automatic; National Treasury funds the penalty waiver and the incentives; accepting precludes
  // re-employment in the public service; the post-retirement medical subsidy continues per the
  // DPSA medical assistance determination.
  //   ERP (55-59): retirement WITHOUT the 1/3% per month reduction, plus 2 weeks' basic salary per
  //   year for the first 20 years of pensionable service and 1 week per completed year thereafter.
  //   VEP (60-63): normal retirement (no reduction applies anyway) plus 2 weeks per year for the
  //   first 10 years and 1 week per completed year thereafter.
  exitProgramme: {
    erp: { minAge: 55, maxAge: 59, weeksFirstYears: 2, firstYears: 20, weeksThereafter: 1 },
    vep: { minAge: 60, maxAge: 63, weeksFirstYears: 2, firstYears: 10, weeksThereafter: 1 },
    implementationEnd: '2027-03-31',
    source: 'https://www.dpsa.gov.za/dpsa2g/documents/cos/2025/Circular%2038%20of%202025.pdf',
  },
  actuarialFactors: FACTORS_2025,
  previousActuarialFactors: FACTORS_2021,
  status: {
    fundingLevel: 1.19, // 31 Mar 2024 statutory valuation, before contingency reserves (110.1% at 2021 valuation)
    valuationDate: '2024-03-31',
    // Assets as at 31 Mar 2025 (2024/25 annual report; audited, high confidence). GEPF told the
    // NCOP Select Committee on Finance (26 May 2026) that assets had passed R3 trillion during
    // 2025/26 (unaudited) — not used here pending an audited figure.
    assetsRand: 2_690_000_000_000,
    memberCount: 1_267_539, // active members, 31 Mar 2025 annual report
    pensionerCount: 565_221, // pensioners and beneficiaries, 31 Mar 2025 annual report
    offshoreAllocation: 0.137, // R319bn = 13.7% of assets at 31 Mar 2024 (up from 9.3% in 2021); 15% policy limit
    // Actual annual pension increases (1 April) vs the CPI they were benchmarked against. Where the
    // research gives the CPI directly (2023, 2024, 2025, 2026) it is used; 2019-2022 CPI figures are
    // not separately confirmed in the source and are assumed close to the increase itself (Board
    // practice is ~100% of CPI where affordable) — medium confidence for those four years.
    lastIncreases: [
      { year: 2019, increase: 0.052, cpi: 0.052 },
      { year: 2020, increase: 0.036, cpi: 0.036 }, // 100% of CPI (confirmed)
      { year: 2021, increase: 0.032, cpi: 0.032 },
      { year: 2022, increase: 0.055, cpi: 0.055 },
      { year: 2023, increase: 0.0555, cpi: 0.074 }, // 75% of 7.4% CPI (confirmed)
      { year: 2024, increase: 0.06, cpi: 0.055 }, // 109.1% of 5.5% CPI (confirmed)
      { year: 2025, increase: 0.029, cpi: 0.029 }, // 100% of CPI (confirmed)
      { year: 2026, increase: 0.035, cpi: 0.035 }, // 100% of Nov 2025 CPI (confirmed)
    ],
  },
  sources: [
    'https://www.gepf.co.za/',
    'https://www.gepf.co.za/frequently-asked-questions/',
    'https://gepf.co.za/wp-content/uploads/2024/12/GEPF-Membership-Guide.pdf',
    'https://gateway.gepf.gov.za/portal/BenefitCalculator/reports/Interpretation_Fund_96_GEPF.pdf',
    'https://www.dpsa.gov.za/dpsa2g/documents/cos/2019/faq%20on%20early%20retirement.pdf',
    'https://gepf.co.za/clarification-on-the-implementation-of-revised-actuarialinterest-factors-as-at-1-october-2025/',
    'https://gepf.co.za/the-government-employees-pension-fund-releases-its-lateststatutory-actuarial-valuation-results/',
    'https://gepf.co.za/wp-content/uploads/2025/11/GEPF_AR_2025_digital.pdf',
    'https://www.dpsa.gov.za/dpsa2g/documents/cos/2025/17_12_P_12_12_2025_A%20REVISED%20DETERMINATION%20AND%20DIRECTIVE%20ON%20MEDICAL%20ASSISTANCE%20FOR%20EMPLOYEES%20IN%20THE%20PUBLIC%20SERVICE%20-%202026.pdf',
    'https://www.gepf.co.za/the-government-employees-pension-fund-pensioners-will-receive-a-3-5-annual-pension-increase-as-of-1-april-2026/',
    'https://www.gepf.co.za/wp-content/uploads/2023/03/GEPF-Rules.pdf',
    'https://www.dpsa.gov.za/dpsa2g/documents/cos/2025/Circular%2038%20of%202025.pdf',
  ],
}

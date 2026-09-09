import type { ActuarialFactorTable, GepfRules } from '../engine/types'

/**
 * GEPF rules and status. Values pending final verification by research/gepf*.md.
 * Formula constants come from the GEPF Rules (Government Employees Pension Law, 1996, Schedule 1).
 *
 * Actuarial interest (resignation value) per Rule 14.4: AI = pensionable service x final salary x F(Z),
 * where F(Z) is an age factor set by the Board on the actuary's advice. The GEPF FAQ example gives
 * F(40) = 0.2036 (10 years x R300,000 x 0.2036 = R610,800). The Fund revised its factors effective
 * 1 October 2025 following the 31 March 2024 statutory valuation; the new factors give values on average
 * ~15% lower than the 2021 factors. The full table (Appendix 8 of the valuation report) was not retrievable,
 * so the curves below are ESTIMATES (confidence: low): the 2021 curve is anchored at F(40) = 0.2036 and
 * shaped as F(z) = F(60) x 0.98^(60 - z) (a 2% p.a. net discount for the deferral to 60), which implies
 * F(60) ≈ 0.305; the 2025 curve is 0.85 x the 2021 curve. Use your benefit statement value when available:
 * it overrides these estimates.
 */
function curve(ages: number[], f60: number): { age: number; factor: number }[] {
  return ages.map((age) => {
    const f = age <= 60 ? f60 * 0.98 ** (60 - age) : f60 * 0.99 ** (age - 60)
    return { age, factor: Math.round(f * 10000) / 10000 }
  })
}

const AGES = [20, 25, 30, 35, 40, 45, 50, 55, 58, 60, 62, 65]

const FACTORS_2021: ActuarialFactorTable = {
  label: 'GEPF actuarial interest factors, 2021 basis (effective 1 Nov 2022) — estimated curve',
  effectiveFrom: '2022-11-01',
  points: curve(AGES, 0.305),
  source: 'https://www.gepf.co.za/frequently-asked-questions/',
  confidence: 'low',
  note: 'Anchored at the GEPF FAQ example F(40) = 0.2036; shape is an estimate. Replace with the published Appendix 8 table if available.',
}

const FACTORS_2025: ActuarialFactorTable = {
  label: 'GEPF actuarial interest factors effective 1 Oct 2025 — estimated (≈15% below 2021)',
  effectiveFrom: '2025-10-01',
  points: curve(AGES, 0.305 * 0.85),
  source: 'https://gepf.co.za/clarification-on-the-implementation-of-revised-actuarialinterest-factors-as-at-1-october-2025/',
  confidence: 'low',
  note: 'GEPF states the revised factors are on average 15% lower than the 2021 factors. Use your benefit statement value when available.',
}

export const GEPF_RULES: GepfRules = {
  gratuityFactor: 0.0672,
  annuityDivisor: 55,
  annuityFixedAddition: 360,
  shortServiceGratuityFactor: 0.15,
  minServiceYearsForPension: 10,
  normalRetirementAge: 60,
  earlyRetirementMinAge: 55,
  earlyRetirementReductionPerMonth: 1 / 300, // one third of one percent per month
  spousePensionDefault: 0.5,
  spousePensionEnhanced: 0.75,
  spousePensionEnhancedCostPct: 0.05,
  minIncreaseAsPctOfCpi: 0.75,
  guaranteeYears: 5,
  twoPotStartDate: '2024-09-01',
  twoPotSeedPct: 0.1,
  twoPotSeedCap: 30_000,
  medicalSubsidyMinServiceYears: 15,
  medicalSubsidyMaxMonthly: 6_000,
  actuarialFactors: FACTORS_2025,
  previousActuarialFactors: FACTORS_2021,
  status: {
    fundingLevel: 1.19,
    valuationDate: '2024-03-31',
    assetsRand: 2_400_000_000_000,
    memberCount: 1_270_000,
    pensionerCount: 520_000,
    offshoreAllocation: 0.1,
    lastIncreases: [
      { year: 2020, increase: 0.045, cpi: 0.041 },
      { year: 2021, increase: 0.032, cpi: 0.033 },
      { year: 2022, increase: 0.055, cpi: 0.055 },
      { year: 2023, increase: 0.07, cpi: 0.072 },
      { year: 2024, increase: 0.06, cpi: 0.055 },
      { year: 2025, increase: 0.06, cpi: 0.03 },
      { year: 2026, increase: 0.035, cpi: 0.035 },
    ],
  },
  sources: [
    'https://www.gepf.co.za/',
    'https://www.gepf.co.za/frequently-asked-questions/',
    'https://gepf.co.za/wp-content/uploads/2025/09/Actuarial-Interest-Factors-FAQs.pdf',
    'https://www.gepf.co.za/wp-content/uploads/2023/03/GEPF-Rules.pdf',
  ],
}

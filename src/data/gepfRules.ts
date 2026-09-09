import type { ActuarialFactorTable, GepfRules } from '../engine/types'

/**
 * GEPF rules and status. PRELIMINARY values pending verification by research/gepf.verified.md.
 * Formula constants come from the GEPF Rules (Government Employees Pension Law, 1996, Schedule 1).
 *
 * Actuarial interest factors: the GEPF revised its factors effective 1 October 2025 following the
 * 31 March 2024 statutory valuation; the Fund stated the new factors give values on average ~15% lower
 * than the 2021 factors. The point values below are ESTIMATES (confidence: low) used only when the member
 * has not entered the resignation value from their benefit statement. Replace with the published table.
 */
const FACTORS_2025: ActuarialFactorTable = {
  label: 'GEPF actuarial interest factors effective 1 Oct 2025 (estimated)',
  effectiveFrom: '2025-10-01',
  points: [
    { age: 20, factor: 8.4 },
    { age: 25, factor: 8.9 },
    { age: 30, factor: 9.4 },
    { age: 35, factor: 9.9 },
    { age: 40, factor: 10.4 },
    { age: 45, factor: 10.9 },
    { age: 50, factor: 11.4 },
    { age: 55, factor: 11.8 },
    { age: 58, factor: 11.8 },
    { age: 60, factor: 11.6 },
    { age: 62, factor: 11.2 },
    { age: 65, factor: 10.6 },
  ],
  source: 'https://gepf.co.za/the-government-employees-pension-fund-gepf-to-implement-revised-actuarial-factors-following-statutory-actuarial-valuation/',
  confidence: 'low',
  note: 'Estimated shape; GEPF states revised factors are ~15% lower on average than the 2021 factors. Use your benefit statement value when available.',
}

const FACTORS_2021: ActuarialFactorTable = {
  label: 'GEPF actuarial interest factors 2021 (estimated)',
  effectiveFrom: '2021-04-01',
  points: FACTORS_2025.points.map((p) => ({ age: p.age, factor: Math.round((p.factor / 0.85) * 100) / 100 })),
  source: 'https://gepf.co.za/wp-content/uploads/2025/09/Actuarial-Interest-Factors-FAQs.pdf',
  confidence: 'low',
  note: 'Back-calculated from the 2025 estimate using the ~15% average reduction.',
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
    fundingLevel: 1.10,
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
    'https://gepf.co.za/wp-content/uploads/2025/09/Actuarial-Interest-Factors-FAQs.pdf',
    'https://www.gepf.co.za/wp-content/uploads/2023/03/GEPF-Rules.pdf',
  ],
}

import type { TaxTables, TaxYear } from '../engine/types'

/**
 * SARS individual tax tables. 2025/26 (1 March 2025 – 28 February 2026) — brackets and rebates were
 * left unchanged from 2024/25 in the 2025 Budget (no inflation adjustment; "bracket creep").
 * Source: https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/
 * and https://www.sars.gov.za/tax-rates/income-tax/retirement-lump-sum-benefits/
 *
 * The 2026/27 entry is a copy of 2025/26 pending confirmation of the February 2026 Budget;
 * see research/tax.md for verification notes and update if the tables changed.
 */
const TABLE_2025_26: TaxTables = {
  taxYear: '2025/26',
  brackets: [
    { threshold: 0, rate: 0.18, base: 0 },
    { threshold: 237_100, rate: 0.26, base: 42_678 },
    { threshold: 370_500, rate: 0.31, base: 77_362 },
    { threshold: 512_800, rate: 0.36, base: 121_475 },
    { threshold: 673_000, rate: 0.39, base: 179_147 },
    { threshold: 857_900, rate: 0.41, base: 251_258 },
    { threshold: 1_817_000, rate: 0.45, base: 644_489 },
  ],
  rebates: { primary: 17_235, secondary: 9_444, tertiary: 3_145 },
  thresholds: { under65: 95_750, age65to74: 148_217, age75plus: 165_689 },
  medicalCredit: { firstTwo: 364, additional: 246 },
  retirementLumpSum: [
    { threshold: 0, rate: 0, base: 0 },
    { threshold: 550_000, rate: 0.18, base: 0 },
    { threshold: 770_000, rate: 0.27, base: 39_600 },
    { threshold: 1_155_000, rate: 0.36, base: 143_550 },
  ],
  withdrawalLumpSum: [
    { threshold: 0, rate: 0, base: 0 },
    { threshold: 27_500, rate: 0.18, base: 0 },
    { threshold: 726_000, rate: 0.27, base: 125_730 },
    { threshold: 1_089_000, rate: 0.36, base: 223_740 },
  ],
  interestExemption: { under65: 23_800, age65plus: 34_500 },
  cgt: { inclusionRate: 0.4, annualExclusion: 40_000 },
  dividendsTax: 0.2,
  deMinimisAnnuitisation: 165_000,
  savingsPotMinWithdrawal: 2_000,
  estateDuty: { abatement: 3_500_000, rate: 0.2, higherRate: 0.25, higherRateThreshold: 30_000_000 },
  reg28: { maxOffshore: 0.45, maxEquity: 0.75 },
  livingAnnuity: { minDrawdown: 0.025, maxDrawdown: 0.175 },
  sources: [
    'https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/',
    'https://www.sars.gov.za/tax-rates/income-tax/retirement-lump-sum-benefits/',
    'https://www.sars.gov.za/tax-rates/income-tax/medical-tax-credit-rates/',
  ],
}

const TABLE_2026_27: TaxTables = {
  ...TABLE_2025_26,
  taxYear: '2026/27',
  sources: [...TABLE_2025_26.sources],
}

export const TAX_TABLES: Record<TaxYear, TaxTables> = {
  '2025/26': TABLE_2025_26,
  '2026/27': TABLE_2026_27,
}

export const DEFAULT_TAX_YEAR: TaxYear = '2025/26'

/** Two-pot system facts used by the engine and the UI. */
export const TWO_POT = {
  startDate: '2024-09-01',
  seedPct: 0.1,
  seedCap: 30_000,
  savingsShare: 1 / 3,
  retirementShare: 2 / 3,
  minSavingsWithdrawal: 2_000,
  source: 'https://www.sars.gov.za/individuals/two-pot-retirement-system/',
}

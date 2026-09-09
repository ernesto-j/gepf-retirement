import type { TaxTables, TaxYear } from '../engine/types'

/**
 * SARS individual tax tables. 2025/26 (1 March 2025 – 28 February 2026) — brackets and rebates were
 * left unchanged from 2024/25 in the 2025 Budget (no inflation adjustment; "bracket creep").
 * Source: https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/
 * and https://www.sars.gov.za/tax-rates/income-tax/retirement-lump-sum-benefits/
 *
 * The 2026/27 table below is confirmed from the February 2026 Budget (delivered 25 Feb 2026) —
 * see research/tax-rules.md for full verification notes, arithmetic re-derivation and sources.
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
  // Living-annuity commutation threshold (prescribed amount below which an existing living
  // annuity may be commuted to cash in full — this is what `deMinimisAnnuitisation` is used
  // for in projection.ts). R125,000 up to 28 Feb 2026, raised to R150,000 from 1 March 2026
  // (Government Gazette 54399, 23 Mar 2026) — see research/tax-rules.md §9. Not to be confused
  // with the separate "full cash at retirement" de minimis on the whole retirement interest
  // (R247,500 -> R360,000) or its two-pot "annuitisable portion" restatement (R165,000 ->
  // R240,000); this field models the living-annuity-in-payment commutation rule specifically.
  deMinimisAnnuitisation: 125_000,
  savingsPotMinWithdrawal: 2_000,
  estateDuty: { abatement: 3_500_000, rate: 0.2, higherRate: 0.25, higherRateThreshold: 30_000_000 },
  reg28: { maxOffshore: 0.45, maxEquity: 0.75 },
  livingAnnuity: { minDrawdown: 0.025, maxDrawdown: 0.175 },
  sources: [
    'https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/',
    'https://www.sars.gov.za/tax-rates/income-tax/retirement-lump-sum-benefits/',
    'https://www.sars.gov.za/tax-rates/income-tax/medical-tax-credit-rates/',
    'https://seb-news.sanlam.co.za/consultant-toolkit/key-retirement-fund-values-and-changes-effective-1-march-2026/',
  ],
}

/**
 * 2026/27 (1 March 2026 – 28 February 2027). Delivered in the February 2026 Budget: brackets,
 * all three rebates and the three age thresholds rose 3.4% (the first inflation adjustment since
 * 2023/24); the medical scheme fees tax credit, CGT annual exclusion and the living-annuity
 * commutation threshold also rose. Every "base" (cumulative tax at each threshold) below was
 * re-derived arithmetically from the marginal rate and the prior bracket's base and reconciles
 * exactly, e.g. 245,100 x 18% = 44,118; 44,118 + 26% x (383,100 - 245,100) = 79,998; and so on up
 * to 259,783 + 41% x (1,878,600 - 887,000) = 666,339. The three thresholds are like-for-like checks:
 * 99,000 x 18% = 17,820 = primary rebate; 153,250 x 18% = 27,585 = primary + secondary; 171,300 x
 * 18% = 30,834 = primary + secondary + tertiary.
 * Lump-sum tables, interest exemptions, CGT inclusion rate, dividends tax, estate duty, Reg 28 and
 * living-annuity drawdown limits are UNCHANGED for 2026/27 (confirmed in research/tax-rules.md).
 * Sources:
 * https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/
 * https://www.sars.gov.za/wp-content/uploads/Docs/Budget/Budget2026/Budget-tax-guide-2026-online-version-for-printing.pdf
 * https://www.sars.gov.za/tax-rates/medical-tax-credit-rates/
 * https://www.sars.gov.za/types-of-tax/capital-gains-tax/proceeds/calculation-of-taxable-capital-gains-and-assessed-capital-losses/annual-exclusion/
 * https://helfin.co.za/sars-implements-budget-speech-2026-increases-to-the-de-minimis-thresholds-for-retirement-benefits/
 */
const TABLE_2026_27: TaxTables = {
  taxYear: '2026/27',
  brackets: [
    { threshold: 0, rate: 0.18, base: 0 },
    { threshold: 245_100, rate: 0.26, base: 44_118 },
    { threshold: 383_100, rate: 0.31, base: 79_998 },
    { threshold: 530_200, rate: 0.36, base: 125_599 },
    { threshold: 695_800, rate: 0.39, base: 185_215 },
    { threshold: 887_000, rate: 0.41, base: 259_783 },
    { threshold: 1_878_600, rate: 0.45, base: 666_339 },
  ],
  rebates: { primary: 17_820, secondary: 9_765, tertiary: 3_249 },
  thresholds: { under65: 99_000, age65to74: 153_250, age75plus: 171_300 },
  medicalCredit: { firstTwo: 376, additional: 254 },
  // Lump-sum tables unchanged since 1 March 2023 — same brackets as 2025/26.
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
  cgt: { inclusionRate: 0.4, annualExclusion: 50_000 },
  dividendsTax: 0.2,
  // See the 2025/26 table above for what this field represents (living-annuity commutation
  // threshold, not the "full cash at retirement" de minimis) — R150,000 from 1 March 2026.
  deMinimisAnnuitisation: 150_000,
  savingsPotMinWithdrawal: 2_000,
  estateDuty: { abatement: 3_500_000, rate: 0.2, higherRate: 0.25, higherRateThreshold: 30_000_000 },
  reg28: { maxOffshore: 0.45, maxEquity: 0.75 },
  livingAnnuity: { minDrawdown: 0.025, maxDrawdown: 0.175 },
  sources: [
    'https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/',
    'https://www.sars.gov.za/wp-content/uploads/Docs/Budget/Budget2026/Budget-tax-guide-2026-online-version-for-printing.pdf',
    'https://www.sars.gov.za/tax-rates/medical-tax-credit-rates/',
    'https://www.sars.gov.za/tax-rates/income-tax/retirement-lump-sum-benefits/',
    'https://www.sars.gov.za/types-of-tax/capital-gains-tax/proceeds/calculation-of-taxable-capital-gains-and-assessed-capital-losses/annual-exclusion/',
    'https://helfin.co.za/sars-implements-budget-speech-2026-increases-to-the-de-minimis-thresholds-for-retirement-benefits/',
    'https://seb-news.sanlam.co.za/consultant-toolkit/key-retirement-fund-values-and-changes-effective-1-march-2026/',
  ],
}

export const TAX_TABLES: Record<TaxYear, TaxTables> = {
  '2025/26': TABLE_2025_26,
  '2026/27': TABLE_2026_27,
}

/** Today (see research/tax-rules.md) falls in the 2026/27 tax year (1 Mar 2026 – 28 Feb 2027). */
export const DEFAULT_TAX_YEAR: TaxYear = '2026/27'

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

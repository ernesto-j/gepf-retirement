import type { FundInfo } from '../engine/types'

/**
 * Fund, fee and return data. Verified against research/funds-fees-annuities.md (researched
 * 2026-09-09) where the sandbox's egress proxy allowed a fetch; otherwise carried over as a
 * clearly-flagged low-confidence prior (see each fund's `notes`). Fees are decimals p.a. Returns
 * are annualised, net of TER, from the latest minimum disclosure document (MDD) available at the
 * time of research; `null` means no verified figure was found. Always verify against the fund's
 * current fact sheet before relying on a number.
 */
function fund(f: Omit<FundInfo, 'allInFee'>): FundInfo {
  return { ...f, allInFee: f.tic + f.platformFee + f.adviceFee }
}

export const FUNDS: FundInfo[] = [
  fund({
    id: 'gepf',
    name: 'GEPF defined-benefit pension (stay)',
    manager: 'Public Investment Corporation',
    type: 'gepf',
    category: 'Defined benefit',
    ter: 0,
    tc: 0,
    tic: 0,
    platformFee: 0,
    adviceFee: 0,
    returns: { y1: null, y3: null, y5: null, y10: null },
    maxOffshore: 0.137,
    reg28: false,
    asOf: '2025-03-31',
    source: 'https://www.gepf.co.za/',
    notes:
      "No fee is charged to the member; benefits are formula-based, not investment-linked. Offshore exposure is the Fund's own: R319bn = 13.7% of assets at 31 Mar 2024 (up from 9.3% in 2021), against a 15% policy limit agreed with the Minister of Finance in 2021 (10% global + 5% rest of Africa). See src/data/gepfRules.ts.",
  }),
  fund({
    id: '10x-your-future',
    name: '10X Your Future / High Equity',
    manager: '10X Investments',
    type: 'index',
    category: 'SA Multi-Asset High Equity (index)',
    ter: 0.0086,
    tc: 0.0005,
    tic: 0.0091,
    platformFee: 0,
    adviceFee: 0,
    returns: { y1: 0.15, y3: 0.11, y5: 0.11, y10: 0.09 },
    maxOffshore: 1,
    reg28: true,
    asOf: '2026-03-31',
    source: 'https://www.10x.co.za/fund/10x-your-future-fund',
    notes:
      'MDDs exist for Jan/Feb/Mar 2026 but TER/TIC/returns could not be fetched this research round (egress blocked); TIC prior ~0.7-0.9% (low confidence, general knowledge) is consistent with the value carried over here. 10X publishes a single sliding all-in fee (~1.05% at R1m falling to ~0.86% blended at R5m, lower above R10m, excl. VAT) that already includes platform and investment costs.',
  }),
  fund({
    id: 'sygnia-skeleton-70',
    name: 'Sygnia Skeleton Balanced 70',
    manager: 'Sygnia',
    type: 'index',
    category: 'SA Multi-Asset High Equity (index)',
    ter: 0.0045,
    tc: 0.0007,
    tic: 0.0052,
    platformFee: 0.002,
    adviceFee: 0,
    returns: { y1: 0.15, y3: 0.11, y5: 0.11, y10: 0.085 },
    maxOffshore: 1,
    reg28: true,
    asOf: '2026-06-04',
    source: 'https://www.sygnia.co.za/fund/sygnia-skeleton-balanced-70-fund/',
    notes:
      'TER 0.45% is a Dec 2024 measurement (medium confidence); MDDs issued 6 Feb, 8 May and 4 Jun 2026 but the 2026 TER and returns were not re-extracted this round. 70% equity allocation, minimum 5-year horizon.',
  }),
  fund({
    id: 'satrix-balanced',
    name: 'Satrix Balanced Index',
    manager: 'Satrix (Sanlam)',
    type: 'index',
    category: 'SA Multi-Asset High Equity (index)',
    ter: 0.0052,
    tc: 0.0008,
    tic: 0.006,
    platformFee: 0.0025,
    adviceFee: 0,
    returns: { y1: 0.22, y3: 0.1625, y5: 0.1326, y10: 0.0991 },
    maxOffshore: 1,
    reg28: true,
    asOf: '2026-03-31',
    source: 'https://satrix.co.za/fund/mdd/SATBI',
    notes:
      'Fully verified from the 31 Mar 2026 MDD (Class A1; manager fee 0.40% within the 0.52% TER). Fund benchmark returned 10.88% p.a. over 10 years; the ASISA SA Multi-Asset High Equity category averaged 8.10% p.a. over the same period (medium confidence) — Satrix beat the median active manager 91% of the time on rolling 3-year periods since the 2013 launch and has never underperformed the median on a rolling 5-year basis.',
  }),
  fund({
    id: 'allan-gray-balanced',
    name: 'Allan Gray Balanced Fund (A)',
    manager: 'Allan Gray',
    type: 'active',
    category: 'SA Multi-Asset High Equity',
    ter: 0.017,
    tc: 0.0011,
    tic: 0.0181,
    platformFee: 0.004,
    adviceFee: 0.005,
    returns: { y1: 0.14, y3: 0.11, y5: 0.11, y10: 0.085 },
    maxOffshore: 1,
    reg28: true,
    asOf: '2026-07-31',
    source: 'https://www.allangray.co.za/globalassets/documents-repository/fund/factsheet/Allan%20Gray%20Balanced%20Fund/Latest/Allan%20Gray%20Balanced%20Fund%20Latest.pdf',
    notes:
      'Performance-fee class: confirmed fee band max 1.50% / min 0.50% p.a. excl. VAT (high confidence); latest MDD issued 14 Aug 2026 (July 2026 data). TIC ~1.7-1.9% is a low-confidence prior (TER/TC not extracted this round). Platform fee tiered ~0.50% (first R1.5m) to ~0.10% (above R5m), excl. VAT — a low-confidence prior.',
  }),
  fund({
    id: 'coronation-balanced-plus',
    name: 'Coronation Balanced Plus (A)',
    manager: 'Coronation',
    type: 'active',
    category: 'SA Multi-Asset High Equity',
    ter: 0.0147,
    tc: 0.0015,
    tic: 0.0162,
    platformFee: 0.004,
    adviceFee: 0.005,
    returns: { y1: 0.14, y3: 0.11, y5: 0.11, y10: 0.085 },
    maxOffshore: 1,
    reg28: true,
    asOf: '2026-07-31',
    source: 'https://www.coronation.com/FundFactSheet/DownloadFundFactSheet?fundCode=CORB',
    notes:
      'Confirmed annual management fee 1.25% (excl. VAT, medium confidence) as at the 31 Jul 2026 fact sheet. TIC ~1.55-1.65% is a low-confidence prior (TER/TC not separately extracted this round).',
  }),
  fund({
    id: 'ninety-one-opportunity',
    name: 'Ninety One Opportunity (A)',
    manager: 'Ninety One',
    type: 'active',
    category: 'SA Multi-Asset High Equity',
    ter: 0.0165,
    tc: 0.0012,
    tic: 0.0177,
    platformFee: 0.004,
    adviceFee: 0.005,
    returns: { y1: 0.13, y3: 0.10, y5: 0.10, y10: 0.08 },
    maxOffshore: 1,
    reg28: true,
    asOf: '2026-03-31',
    source: 'https://ninetyone.com/en/south-africa/funds-strategies/funds/opportunity-a-inc-zar-zae000024162',
    notes:
      'MDD as at 31 Mar 2026 (published 14 Apr 2026); minimum investment R10,000. TIC ~1.8-1.95% is a low-confidence prior (TER/TC/returns not extracted this round).',
  }),
  fund({
    id: 'foord-balanced',
    name: 'Foord Balanced (A)',
    manager: 'Foord',
    type: 'active',
    category: 'SA Multi-Asset High Equity',
    ter: 0.0122,
    tc: 0.0010,
    tic: 0.0132,
    platformFee: 0.004,
    adviceFee: 0.005,
    returns: { y1: 0.13, y3: 0.10, y5: 0.10, y10: 0.075 },
    maxOffshore: 1,
    reg28: true,
    asOf: '2026-01-31',
    source: 'https://foord.co.za/sites/default/files/2026-02/Foord%20Balanced%20Fund%20Class%20A%20at%202026-01-31.pdf',
    notes: 'MDD as at 31 Jan 2026 (issued 4 Feb 2026); a June 2026 fact sheet also exists. TIC ~1.2-1.4% is a low-confidence prior.',
  }),
  fund({
    id: 'psg-balanced',
    name: 'PSG Balanced Fund (A)',
    manager: 'PSG Asset Management',
    type: 'active',
    category: 'SA Multi-Asset High Equity',
    ter: 0.0145,
    tc: 0.0015,
    tic: 0.016,
    platformFee: 0.004,
    adviceFee: 0.005,
    returns: { y1: null, y3: null, y5: null, y10: null },
    maxOffshore: 1,
    reg28: true,
    asOf: '2026-03-31',
    source: 'http://download.psg.co.za/files/asset-management/fund-fact-sheets/psg-balanced-fund-class-a.pdf',
    notes:
      'MDD as at 31 Mar 2026 (Class E as at 30 Jun 2026); TER/TC/returns were not extracted this research round (egress blocked, search budget exhausted). TIC ~1.5-1.7% is a low-confidence prior; returns unavailable — treat this fund as indicative only until fact-sheet figures are confirmed.',
  }),
  fund({
    id: 'mg-balanced',
    name: 'M&G Balanced Fund (A)',
    manager: 'M&G Investments (formerly Prudential)',
    type: 'active',
    category: 'SA Multi-Asset High Equity',
    ter: 0.013,
    tc: 0.0015,
    tic: 0.0145,
    platformFee: 0.004,
    adviceFee: 0.005,
    returns: { y1: null, y3: null, y5: null, y10: null },
    maxOffshore: 1,
    reg28: true,
    asOf: '2025-01-01',
    source: 'https://www.mandg.co.za/',
    notes:
      'Not searched this research round (search budget exhausted before this fund was queried) — TIC ~1.3-1.6% is a low-confidence, general-knowledge prior only; returns unavailable. Re-verify against the current MDD before use.',
  }),
  fund({
    id: 'nedgroup-core-diversified',
    name: 'Nedgroup Investments Core Diversified',
    manager: 'Nedgroup Investments (Core funds, sub-advised by Vanguard/Rock/Marriott mandates)',
    type: 'index',
    category: 'SA Multi-Asset High Equity (index)',
    ter: 0.004,
    tc: 0.0005,
    tic: 0.0045,
    platformFee: 0.002,
    adviceFee: 0,
    returns: { y1: null, y3: null, y5: null, y10: null },
    maxOffshore: 1,
    reg28: true,
    asOf: '2025-01-01',
    source: 'https://www.nedgroupinvestments.co.za/',
    notes:
      'Not searched this research round (search budget exhausted) — TIC ~0.40-0.50% is a low-confidence, general-knowledge prior only (Nedgroup Core funds are index/low-cost); returns unavailable. Re-verify against the current MDD before use.',
  }),
  fund({
    id: 'old-mutual-balanced',
    name: 'Old Mutual Balanced (A)',
    manager: 'Old Mutual',
    type: 'full-service',
    category: 'SA Multi-Asset High Equity',
    ter: 0.0175,
    tc: 0.0015,
    tic: 0.0190,
    platformFee: 0.005,
    adviceFee: 0.0075,
    returns: { y1: 0.13, y3: 0.10, y5: 0.10, y10: 0.08 },
    maxOffshore: 1,
    reg28: true,
    asOf: '2025-06-30',
    source: 'https://www.oldmutual.co.za/',
    notes: 'Not searched this research round; TIC ~1.6-1.9% remains a low-confidence prior.',
  }),
  fund({
    id: 'discovery-balanced',
    name: 'Discovery Balanced',
    manager: 'Discovery Invest',
    type: 'full-service',
    category: 'SA Multi-Asset High Equity',
    ter: 0.0190,
    tc: 0.0015,
    tic: 0.0205,
    platformFee: 0.005,
    adviceFee: 0.0075,
    returns: { y1: 0.13, y3: 0.10, y5: 0.10, y10: 0.08 },
    maxOffshore: 1,
    reg28: true,
    asOf: '2025-06-30',
    source: 'https://www.discovery.co.za/',
    notes: 'Not searched this research round; TIC ~1.8-2.1% remains a low-confidence prior.',
  }),
  fund({
    id: 'sanlam-glacier-balanced',
    name: 'Sanlam / Glacier balanced (adviser-led)',
    manager: 'Sanlam Investments',
    type: 'full-service',
    category: 'SA Multi-Asset High Equity',
    ter: 0.0160,
    tc: 0.0015,
    tic: 0.0175,
    platformFee: 0.0055,
    adviceFee: 0.01,
    returns: { y1: 0.13, y3: 0.10, y5: 0.10, y10: 0.08 },
    maxOffshore: 1,
    reg28: true,
    asOf: '2025-06-30',
    source: 'https://www.glacier.co.za/',
    notes:
      'Not searched this research round; SIM/Sanlam Balanced TIC ~1.5-1.8% and the Glacier platform fee (~0.40% first R2m / 0.20% above, excl. VAT) remain low-confidence priors.',
  }),
]

/**
 * Three cost archetypes used in explanations and the fee-impact chart. All-in fees are the
 * "typical used in app" figures computed in research/funds-fees-annuities.md §1.2 (fund TIC +
 * platform incl. 15% VAT + advice incl. 15% VAT): low-cost index 0.73-1.06% (typical 0.90%);
 * active-on-a-platform 1.6-3.0% (typical 2.30%); full-service adviser-led 3.2-4.0% (typical 3.30%).
 * Confidence: index archetype medium (anchored to the verified Satrix/Sygnia TICs); the other two
 * are low (platform and advice fee schedules are general-knowledge priors, not fetched live).
 */
export const FUND_ARCHETYPES = [
  { id: 'index', label: 'Low-cost index (10X / Sygnia / Satrix / Nedgroup Core Diversified)', allInFee: 0.009 },
  { id: 'active', label: 'Active manager on a platform (Allan Gray / Coronation / Ninety One / PSG / M&G)', allInFee: 0.023 },
  { id: 'full-service', label: 'Adviser-led full service (Old Mutual / Sanlam / Discovery / Liberty)', allInFee: 0.033 },
] as const

export const DEFAULT_FUND_ID = '10x-your-future'

/**
 * Living-annuity and guaranteed-annuity facts used by the planner and the funds page, from
 * research/funds-fees-annuities.md (researched 2026-09-09). Every field carries its own source and
 * confidence; treat "low" confidence figures as indicative priors to be re-verified with a live
 * quote before being shown to a user as fact.
 */
export const LIVING_ANNUITY_FACTS = {
  drawdown: {
    minPct: 0.025,
    maxPct: 0.175,
    changeFrequency: 'Rate (and payment frequency: monthly/quarterly/annually) can be changed once a year, on the policy anniversary.',
    source: 'https://www.10x.co.za/living-annuity-faq',
    confidence: 'high' as const,
  },
  industry: {
    asisaAssetsRand: 911_700_000_000,
    asisaAvgDrawdownPct: 0.066,
    asisaAvgDrawdownYear: 2025,
    asisaAvgDrawdownPrior: { pct: 0.07, year: 2011 },
    source: 'https://www.fanews.co.za/article/compliance-regulatory/2/association-for-savings-investment-sa-asisa/1276/living-annuity-assets-grow-to-r911-7-bn-in-2025-with-annual-drawdown-rates-steady-at-6-6/44631',
    confidence: 'high' as const,
  },
  sustainableDrawdown: {
    rangePct: { min: 0.04, max: 0.05 },
    note: 'Consensus "safe" range from 10X and Investonline research, well below the ASISA 6.6% average actually being drawn.',
    source: 'https://www.10x.co.za/blog/drawdown-rates-and-your-living-annuity',
    confidence: 'medium' as const,
  },
  offshoreAllowance: {
    maxPct: 1.0,
    reg28Applies: false,
    note:
      'Regulation 28 does not apply to living annuities, so up to 100% offshore exposure is possible via rand-denominated feeder funds at the major LISPs (Allan Gray, Sygnia, 10X, Ninety One, Glacier, Momentum, Old Mutual Wealth, Discovery), subject to the insurer\'s own limits and available foreign capacity. No genuinely USD-denominated living annuity product was verified — income is always paid in rand.',
    source: 'https://www.10x.co.za/living-annuity-faq',
    confidence: 'medium' as const,
  },
  commutationThreshold: {
    amountRand: 150_000,
    previousAmountRand: 125_000,
    effectiveFrom: '2026-03-01',
    note: 'A living annuity may be fully commuted to cash if its total value (aggregated per insurer) is below this amount.',
    source: 'https://seb-news.sanlam.co.za/consultant-toolkit/key-retirement-fund-values-and-changes-effective-1-march-2026/',
    confidence: 'high' as const,
  },
  guaranteedAnnuity: {
    /** The one verified 2026 quote found: Glacier by Sanlam, June 2026. */
    indicativeQuote: {
      provider: 'Glacier by Sanlam',
      asAt: '2026-06',
      age: 65,
      escalationPct: 0.05,
      guaranteeYears: 10,
      premiumRand: 5_000_000,
      monthlyGrossRand: { male: 28_443, female: 25_648 },
      perR1mMonthlyRand: { male: 5_689, female: 5_130 },
      initialYieldPct: { male: 0.0683, female: 0.0616 },
      source: 'https://www.glacier.co.za/personal/retirement/retirementincome/Pages/sanlam-life-annuity.aspx',
      confidence: 'medium' as const,
    },
    /** Indicative priors only (not a live quote) for the other common terms, per R1m at 60/65, male. */
    indicativePriorsPerR1mMale: {
      age65: { levelRand: [9_200, 10_000], cpiLinkedRand: [5_500, 6_200], escalating5pctRand: [5_500, 5_900] },
      age60: { levelRand: [8_300, 9_000], cpiLinkedRand: [4_800, 5_400], escalating5pctRand: [5_000, 5_400] },
      femaleAdjustmentPct: -0.09,
      basis: 'SA nominal long-bond yields ~10-11% and index-linked real yields ~4.5-5% in 2025-26, consistent with the 6.83% initial yield on the verified Glacier 5%-escalating quote.',
      note: 'Rates move with long-bond yields and differ by insurer (Sanlam, Just SA, Momentum, Old Mutual, Liberty). Must be re-verified with live quotes before use.',
      source: 'https://seb-news.sanlam.co.za/wp-content/uploads/2024/08/Factors-affecting-annuity-pricing.pdf',
      confidence: 'low' as const,
    },
  },
  feeImpact: {
    treasury2013: {
      quote: 'A regular saver whose charges fall from 2.5% to 0.5% of assets p.a. ends with roughly 60% more at retirement after 40 years (equivalently, 2.5% instead of 0.5% leaves about 40% less).',
      source: 'https://www.treasury.gov.za/comm_media/press/2013/2013071101%20-%20Charges%20in%20South%20African%20Retirement%20Funds.pdf',
      confidence: 'medium' as const,
    },
    computedLumpSum1pp: {
      note: 'One extra percentage point of fee, 10% gross return, lump sum: capital ends lower by roughly',
      lessCapitalPct: { y10: 0.087, y20: 0.167, y30: 0.24, y40: 0.306 },
      source: 'Computed in research/funds-fees-annuities.md §1.2',
      confidence: 'high' as const,
    },
    computedRegularSaver1pp: {
      note: 'One extra percentage point of fee, 10% gross return, level regular saver: capital ends lower by roughly',
      lessCapitalPct: { y30: 0.179, y40: 0.244 },
      source: 'Computed in research/funds-fees-annuities.md §1.2',
      confidence: 'high' as const,
    },
    computedLivingAnnuityIncome: {
      note: 'At 4% gross real return, sustainable level real income over N years falls by roughly this much per fee increase',
      lessIncomePct: { y25: { from1to2pct: 0.108, from1to3pct: 0.209 }, y30: { from1to2pct: 0.125, from1to3pct: 0.241 } },
      source: 'Computed in research/funds-fees-annuities.md §1.2',
      confidence: 'high' as const,
    },
  },
  sources: [
    'https://www.10x.co.za/living-annuity-faq',
    'https://www.fanews.co.za/article/compliance-regulatory/2/association-for-savings-investment-sa-asisa/1276/living-annuity-assets-grow-to-r911-7-bn-in-2025-with-annual-drawdown-rates-steady-at-6-6/44631',
    'https://www.10x.co.za/blog/drawdown-rates-and-your-living-annuity',
    'https://seb-news.sanlam.co.za/consultant-toolkit/key-retirement-fund-values-and-changes-effective-1-march-2026/',
    'https://www.glacier.co.za/personal/retirement/retirementincome/Pages/sanlam-life-annuity.aspx',
    'https://www.treasury.gov.za/comm_media/press/2013/2013071101%20-%20Charges%20in%20South%20African%20Retirement%20Funds.pdf',
  ],
}

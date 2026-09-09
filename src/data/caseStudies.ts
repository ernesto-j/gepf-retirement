import type { CaseStudy, RiskFlag, SaRiskIndicator } from '../engine/types'

/**
 * Sovereign / pension-system failure case studies and SA risk indicators.
 * Verified against public sources as at 2026-09-09 — see research/risks.md for the full narrative,
 * dates, figures and per-fact sourcing/confidence notes (a small number of loss-percentage estimates
 * are ranges from secondary sources rather than a single primary figure; flagged there explicitly).
 */
export const CASE_STUDIES: CaseStudy[] = [
  {
    id: 'zimbabwe',
    country: 'Zimbabwe',
    period: '2000–2009, 2019–2024',
    title: 'Hyperinflation wiped out pensions; dollarisation and re-conversion did it twice',
    summary:
      'Monthly inflation reached an estimated 79.6 billion percent in November 2008 (Hanke-Kwok estimate). Zimbabwe-dollar pensions, annuities and insurance policies became worthless; the Feb 2009 switch to a multi-currency (US dollar) system converted them at values close to zero. The Justice Smith Commission of Inquiry (2015-2017) found the losses were caused mainly by macroeconomic and regulatory failure, not fund malpractice. In 2019, Statutory Instrument 33 converted US-dollar RTGS/FCA balances 1:1 into a new local currency that quickly lost most of its value; a sixth currency, the gold-backed ZiG, was introduced on 5 April 2024 (SI 60 of 2024, at 2,498.72 ZWL : 1 ZiG).',
    whatHappenedToSavers:
      'The Smith Commission (report published March 2017, covering 11 life insurers, 9 funeral insurers, 15 pension funds, NSSA and the Government Pension Agency) found pensioners and policyholders were left with a small fraction of the value they had contributed; many received once-off payouts worth a few US dollars. Savings held onshore in local currency, and even US-dollar bank deposits held onshore, were lost or forcibly converted by decree (SI 33 of 2019).',
    lossEstimate: 'Local-currency pension values effectively fell to zero (>95% loss in USD terms).',
    whatProtectedSavers: 'Hard assets and foreign-currency assets held outside the country.',
    lessons: [
      'A defined-benefit promise in local currency is only as good as the currency.',
      'Onshore foreign-currency accounts can be converted by decree (SI 33 of 2019); offshore custody matters.',
      'Inflation-linking that lags true inflation erodes income quickly.',
    ],
    sources: [
      'https://www.imf.org/en/Publications/WP/Issues/2016/12/31/Hyperinflation-in-Zimbabwe',
      'https://www.veritaszim.net/node/2403',
      'https://www.rbz.co.zw/documents/acts/SIs/RTGS--S.I.-33of-2019.pdf',
      'https://en.m.wikipedia.org/wiki/Zimbabwean_ZiG',
      'https://www.ipec.co.zw/',
    ],
  },
  {
    id: 'argentina',
    country: 'Argentina',
    period: '2001–2002, 2008, 2023',
    title: 'Default, deposit freeze, forced pesification and pension nationalisation',
    summary:
      'In December 2001 Argentina defaulted on about US$95bn of debt, froze bank deposits (the "corralito", initially ~250 pesos/week) and, in January 2002, converted dollar deposits into pesos at 1.40 while the market rate moved above 4 (dollar loans were pesified at a more favourable 1:1 - "asymmetric pesification"). In Oct-Nov 2008 the government nationalised the private, individually-funded pension funds (AFJPs, ~US$24bn of member assets - already down ~17.5% that year) into the state pay-as-you-go system; the Senate approved this on 20-21 Nov 2008. Inflation reached 211% in 2023.',
    whatHappenedToSavers:
      'Dollar savings held in Argentine banks lost roughly 60-70% of their real value through pesification at 1.40 versus a market rate above 4; private pension balances (individual property under the AFJP system) were absorbed into a state pay-as-you-go system whose benefits were later eroded by inflation.',
    lossEstimate: 'Onshore USD depositors lost an estimated ~60-70%; private pension accounts (~US$24bn) were expropriated outright.',
    whatProtectedSavers: 'Assets held abroad, and real assets; onshore dollar accounts did not help.',
    lessons: [
      'Governments in distress reach for pension assets and captive savings first.',
      'Currency of denomination is not enough; jurisdiction of custody matters.',
      'Restructurings tend to hit domestic creditors and pension funds hardest.',
    ],
    sources: [
      'https://www.imf.org/external/np/pdr/lessons/100803.pdf',
      'https://www.npr.org/2008/10/31/96369325/argentina-to-nationalize-pensions',
      'https://www.aljazeera.com/news/2008/11/21/argentina-passes-pension-takeover',
    ],
  },
  {
    id: 'greece',
    country: 'Greece',
    period: '2010–2016',
    title: 'Sovereign debt crisis: repeated public pension cuts',
    summary:
      'Under successive bailout programmes Greek public pensions were cut more than a dozen times; cumulative reductions for many pensioners were around 40% and retirement ages were raised.',
    whatHappenedToSavers: 'Public-sector pensioners saw nominal benefits reduced by law; private savings in Greek banks were subject to capital controls in 2015.',
    lossEstimate: 'Cumulative pension cuts of roughly 25–45% depending on the pension level.',
    whatProtectedSavers: 'Diversified savings outside the domestic banking system.',
    lessons: ['State pension promises can be changed by legislation when the state cannot pay.', 'Even eurozone membership did not prevent capital controls.'],
    sources: ['https://www.esm.europa.eu/assistance/greece'],
  },
  {
    id: 'cyprus',
    country: 'Cyprus',
    period: '2013',
    title: 'Bank deposit bail-in',
    summary: 'Uninsured deposits above €100,000 at the Bank of Cyprus were converted into equity with a 47.5% haircut (an initial 37.5% conversion, topped up and finalised on 30 July 2013); Laiki Bank was wound up, with insured deposits moved to Bank of Cyprus and uninsured deposits above €100,000 wiped out.',
    whatHappenedToSavers: 'Large depositors lost close to half of their money above the insured limit; capital controls lasted two years.',
    lossEstimate: '47.5% haircut on uninsured deposits.',
    whatProtectedSavers: 'Diversification across banks and jurisdictions; insured amounts.',
    lessons: ['Cash in a bank is a loan to that bank.', 'Concentration risk applies to deposits too.'],
    sources: ['https://www.centralbank.cy/'],
  },
  {
    id: 'lebanon',
    country: 'Lebanon',
    period: '2019–2023',
    title: 'Banking collapse and currency loss of ~98%',
    summary: 'The Lebanese pound lost about 98% of its value; banks imposed informal capital controls and dollar deposits could only be withdrawn at a fraction of their value ("lollars").',
    whatHappenedToSavers: 'Onshore US-dollar deposits were effectively frozen and converted at punitive rates.',
    lossEstimate: 'Depositors recovered roughly 15–30% of USD deposits.',
    whatProtectedSavers: 'Dollars held offshore, outside the domestic banking system.',
    lessons: ['A dollar in a domestic bank is not the same as a dollar abroad.'],
    sources: ['https://www.worldbank.org/en/country/lebanon'],
  },
  {
    id: 'ghana',
    country: 'Ghana',
    period: '2022–2023',
    title: 'Domestic Debt Exchange Programme',
    summary: 'Ghana restructured its domestic bonds (Dec 2022-2023), lengthening maturities and cutting coupons. A December 2022 MoU with labour unions exempted pension funds from principal haircuts, but ~GHS 29.6bn of pension-held bonds still had coupons cut to 0% (2023), 5% (2024), stepping back up thereafter, with retail/T-bill holders fully exempt while institutional holders (including pension funds) bore the restructuring.',
    whatHappenedToSavers: 'Retirement funds heavily invested in government bonds saw real returns marked down via coupon suppression and extended maturities, even without a headline principal haircut.',
    lossEstimate: 'Net present value losses of roughly 30% on affected bonds despite the pension-fund carve-out.',
    whatProtectedSavers: 'Assets outside domestic government paper.',
    lessons: ['Domestic pension funds are the natural first creditors to be restructured.', 'Prescribed or concentrated holdings of government debt are a risk, not a safe asset.'],
    sources: [
      'https://www.mofep.gov.gh/press-release/2023-02-28/domestic-debt-exchange-programme-updates',
      'https://www.myjoyonline.com/dr-yakubu-abdul-salam-haircuts-in-ghanas-domestic-debt-exchange-programme-a-not-so-simple-explainer/',
      'https://www.imf.org/en/Countries/GHA',
    ],
  },
  {
    id: 'other-crises',
    country: 'Venezuela, Russia, Turkey, Nigeria, Sri Lanka',
    period: '1998–2025',
    title: 'Five more warnings: hyperinflation, local-currency default, chronic devaluation and pension-fund haircuts',
    summary:
      'Venezuela: hyperinflation from ~2016-2018 exceeded 1,000,000% (2018, IMF est.), destroying bolivar savings and pensions. Russia (1998): the government devalued the ruble and defaulted on domestic, ruble-denominated debt on 17 August 1998 - a reminder local-currency default is rare but not impossible. Turkey: chronic lira depreciation continued through 2025 (~20% that year alone, a record low near 42.4/US$ by December). Nigeria: the naira was devalued roughly 43% in 2024 under FX-liberalisation reforms. Sri Lanka: defaulted externally in May 2022 (debt/GDP ~126%) and, rather than a headline capital haircut on its Employees Provident Fund (EPF) and Employees Trust Fund (ETF), cut the interest rate on pension-held government bonds from 20%+ to 12% then 9% (or a 30% haircut alternative) through 2025.',
    whatHappenedToSavers:
      'In each case, savers holding only local-currency or domestic-institution assets lost significant real value - either abruptly (Venezuela hyperinflation, Russia default) or gradually via chronic devaluation (Turkey, Nigeria) or via an interest-rate-based, rather than principal, haircut targeted specifically at captive pension-fund assets (Sri Lanka).',
    lossEstimate: 'Highly variable by country: Venezuela and Russia losses were near-total for affected local-currency instruments; Sri Lankan pension funds saw bond yields roughly halved.',
    whatProtectedSavers: 'Foreign-currency assets held offshore in each case; in Sri Lanka, savings outside the EPF/ETF system.',
    lessons: [
      'Local-currency default is rare (South Africa has never had one) but does happen (Russia 1998).',
      'Chronic currency depreciation (Turkey, Nigeria) erodes real wealth just as surely as a sudden crisis, only more slowly.',
      'Governments facing a fiscal squeeze can extract value from captive pension funds via interest-rate cuts on held bonds, not just outright haircuts (Sri Lanka).',
    ],
    sources: [
      'https://en.wikipedia.org/wiki/Hyperinflation_in_Venezuela',
      'https://en.wikipedia.org/wiki/1998_Russian_financial_crisis',
      'https://www.elibrary.imf.org/view/journals/001/2025/175/article-A001-en.xml',
      'https://www.wsws.org/en/articles/2023/07/05/cphl-j05.html',
    ],
  },
]

export const SA_INDICATORS: SaRiskIndicator[] = [
  {
    id: 'debt-to-gdp',
    label: 'Government debt to GDP',
    value: '~78% (peaking)',
    trend: 'improving',
    detail: 'Gross loan debt is projected to peak at 77.4-78.9% of GDP in 2025/26 (revised up from 76.2% due to weaker nominal growth), then fall to 77.3% in 2026/27 and ~76.5% by 2028/29 - the first sustained decline in 17 years per the Finance Minister.',
    source: 'https://www.treasury.gov.za/documents/National%20Budget/2026/review/Chapter%207.pdf',
    asOf: '2026-02',
  },
  {
    id: 'debt-service',
    label: 'Debt-service cost as share of revenue',
    value: '~21-22%',
    trend: 'stable',
    detail: 'Interest payments remain the fastest-growing expenditure item and crowd out services, though the 2026 Budget projects the ratio beginning to ease as the primary surplus widens.',
    source: 'https://www.treasury.gov.za/documents/National%20Budget/2026/review/Chapter%207.pdf',
    asOf: '2026-02',
  },
  {
    id: 'credit-rating',
    label: 'Sovereign credit rating',
    value: 'Sub-investment grade (BB / Ba2), positive outlook',
    trend: 'improving',
    detail: 'S&P upgraded SA to BB (Nov 2025) and Fitch to BB (5 Jun 2026) - both agencies\' first SA upgrade in ~20 years; Moody\'s (Ba2) placed SA on positive outlook. All three remain two notches below investment grade.',
    source: 'https://www.moneyweb.co.za/news/economy/south-africas-ratings-upgraded-by-sp-global/',
    asOf: '2026-06',
  },
  {
    id: 'gepf-funding',
    label: 'GEPF funding level',
    value: '119.0% (best-estimate basis)',
    trend: 'stable',
    detail: '31 March 2024 statutory actuarial valuation: net assets R2.34tn vs best-estimate liabilities R1.97tn = 119.0% funded (81.6% including full contingency reserves). The Fund is fully funded and the state is guarantor under the GEP Law. 2024/25 assets grew to ~R2.69tn with a ~13-14% investment return.',
    source: 'https://gepf.co.za/wp-content/uploads/2025/09/GEPF-statutory-valuation-report-2024-Final-signed.pdf',
    asOf: '2024-03',
  },
  {
    id: 'gepf-sa-concentration',
    label: 'GEPF assets invested in South Africa',
    value: '~90%',
    trend: 'stable',
    detail: 'The PIC invests the bulk of GEPF assets locally, including large holdings of government bonds and state-owned entity debt.',
    source: 'https://www.pic.gov.za/',
    asOf: '2025-03',
  },
  {
    id: 'prescribed-assets',
    label: 'Prescribed assets',
    value: 'Debated, not enacted',
    trend: 'stable',
    detail: 'Proposals to direct retirement savings into state projects resurface in election years; Reg 28 (2022) instead allows up to 45% in infrastructure voluntarily.',
    source: 'https://www.treasury.gov.za/',
    asOf: '2025-12',
  },
  {
    id: 'inflation-target',
    label: 'SARB inflation target',
    value: '3% point target',
    trend: 'improving',
    detail: 'The SARB moved from the 3–6% band toward a 3% point target in 2025, supporting lower long-run inflation and a more stable rand if credible.',
    source: 'https://www.resbank.co.za/',
    asOf: '2025-11',
  },
  {
    id: 'fatf',
    label: 'FATF grey list',
    value: 'Removed (24 Oct 2025)',
    trend: 'improving',
    detail: 'South Africa was grey-listed in Feb 2023 (20 of 40 FATF recommendations found deficient) and exited on 24 October 2025 after completing all 22 action-plan items, confirmed by an on-site assessment in July 2025 - 32 months on the list in total.',
    source: 'https://www.treasury.gov.za/comm_media/press/2025/2025102401%20MEDIA%20STATEMENT-SOUTH%20AFRICA%20EXITS%20THE%20FATF%20GREYLIST%20ON%2024%20OCTOBER%20%202025.pdf',
    asOf: '2025-10',
  },
  {
    id: 'repo-rate',
    label: 'SARB repo rate',
    value: '7.00%',
    trend: 'worsening',
    detail: 'Held at 7.00% since 29 May 2026 (hiked from 6.75%); the 23 Jul 2026 MPC vote was a hawkish 4-2 split as CPI ran above the SARB\'s new 3% anchor (5.0% y/y in June 2026, a two-year high).',
    source: 'https://www.resbank.co.za/en/home/publications/publication-detail-pages/statements/monetary-policy-statements/2026/march',
    asOf: '2026-07',
  },
  {
    id: 'unemployment',
    label: 'Unemployment rate (official)',
    value: '32.7% (Q1 2026)',
    trend: 'worsening',
    detail: 'Rose from 31.4% in Q4 2025 to 32.7% in Q1 2026 (+301,000 unemployed, to 8.137 million); youth unemployment remains above 46% despite the growth pickup.',
    source: 'https://tradingeconomics.com/south-africa/unemployment-rate',
    asOf: '2026-01',
  },
  {
    id: 'gdp-growth',
    label: 'GDP growth',
    value: '1.1% (2025), 1.2% forecast 2026',
    trend: 'improving',
    detail: 'Real GDP grew 1.1% in 2025 (strongest since 2022, up from a revised 0.5% in 2024); Treasury forecasts 1.2% in 2026, rising to 1.6% in 2027 on improved energy supply, mining and reform momentum.',
    source: 'https://www.treasury.gov.za/documents/National%20Budget/2026/review/Chapter%202.pdf',
    asOf: '2026-02',
  },
]

/** Static risk library keyed by id; insights.ts picks and personalises these. */
export const RISK_LIBRARY: RiskFlag[] = [
  {
    id: 'sovereign-domestic-debt',
    severity: 'warning',
    title: 'Concentration in South African government risk',
    detail: 'A GEPF pension is a promise by the state, invested ~90% in South Africa. In sovereign stress, domestic pension funds are usually first in line for restructuring or prescribed assets.',
    appliesTo: ['stay-gepf'],
    caseStudyId: 'ghana',
  },
  {
    id: 'currency-collapse',
    severity: 'warning',
    title: 'Rand-only assets carry currency risk',
    detail: 'The rand has lost roughly 5% a year against the dollar over 30 years. Income fixed in rand buys less imported goods, medicine and travel each year.',
    appliesTo: [],
    caseStudyId: 'zimbabwe',
  },
  {
    id: 'capital-controls',
    severity: 'info',
    title: 'Jurisdiction of custody matters',
    detail: 'Foreign-currency assets held with a South African institution can be subject to local controls; assets held offshore under foreign custody are harder to reach.',
    appliesTo: ['resign-cash', 'resign-preserve'],
    caseStudyId: 'argentina',
  },
  {
    id: 'sequence-risk',
    severity: 'warning',
    title: 'Sequence-of-returns risk in a living annuity',
    detail: 'Poor returns in the first years of drawdown permanently reduce sustainable income; a defined-benefit pension does not carry this risk.',
    appliesTo: ['resign-preserve', 'resign-cash'],
  },
  {
    id: 'longevity-risk',
    severity: 'warning',
    title: 'Longevity risk',
    detail: 'A living annuity can run out; a GEPF pension is paid for life, with 50% (or 75%) continuing to a spouse.',
    appliesTo: ['resign-preserve', 'resign-cash'],
  },
  {
    id: 'inflation-erosion',
    severity: 'info',
    title: 'Pension increases may lag your true inflation',
    detail: 'GEPF increases target CPI but the rules guarantee only 75% of CPI. A retiree basket (medical aid, electricity, insurance) typically inflates 2–4 points above CPI.',
    appliesTo: ['stay-gepf'],
  },
  {
    id: 'withdrawal-tax',
    severity: 'critical',
    title: 'Withdrawal tax on cashing out',
    detail: 'Cash taken on resignation is taxed on the withdrawal table (only R27,500 tax-free, up to 36%) instead of the retirement table (R550,000 tax-free).',
    appliesTo: ['resign-cash'],
  },
  {
    id: 'medical-subsidy-forfeit',
    severity: 'warning',
    title: 'Resignation forfeits the post-retirement medical subsidy',
    detail: 'Public servants with sufficient service who retire keep an employer medical-scheme subsidy for life; resigning forfeits it.',
    appliesTo: ['resign-preserve', 'resign-cash'],
  },
  {
    id: 'early-retirement-penalty',
    severity: 'warning',
    title: 'Early retirement reduction',
    detail: 'Retiring between 55 and 60 without employer approval reduces the gratuity and pension by a third of a percent for every month before 60.',
    appliesTo: ['stay-gepf'],
  },
  {
    id: 'factor-revision-2025',
    severity: 'warning',
    title: 'Revised actuarial factors from 1 October 2025',
    detail: 'The GEPF cut its actuarial interest factors by ~15% on average. Resignation values are now lower relative to the pension you give up.',
    appliesTo: ['resign-preserve', 'resign-cash'],
  },
  {
    id: 'fees-drag',
    severity: 'info',
    title: 'Fees compound',
    detail: 'Every 1% of annual fees reduces retirement income by roughly 20% over a long horizon.',
    appliesTo: ['resign-preserve', 'resign-cash'],
  },
  {
    id: 'rand-strength',
    severity: 'info',
    title: 'The rand can strengthen for years',
    detail: 'From 2002 to 2005 and 2016 to 2018 the rand gained 30–45% against the dollar; a heavily offshore portfolio funding rand spending loses income in those years.',
    appliesTo: ['resign-preserve', 'resign-cash'],
  },
]

// ---------------------------------------------------------------------------
// Offshore investing facts
// ---------------------------------------------------------------------------

/**
 * Key facts on taking retirement/discretionary savings offshore from South Africa: allowances, routes,
 * tax treatment and estate-planning traps. Verified against public sources as at 2026-09-09 — see
 * research/offshore.md for the full narrative and per-fact sourcing/confidence notes. Not part of the
 * shared MacroHistory/CaseStudy/SaRiskIndicator/RiskFlag shapes in engine/types.ts — a standalone plain
 * object for the UI/AI layer to reference directly.
 */
export const OFFSHORE_FACTS = {
  asOf: '2026-09-09',
  allowances: {
    singleDiscretionaryAllowanceZar: 2_000_000,
    singleDiscretionaryAllowanceNote:
      'Per adult (18+) per calendar year. Doubled from R1,000,000 to R2,000,000 in the 2026 Budget. No prior SARS tax clearance required.',
    foreignInvestmentAllowanceZar: 10_000_000,
    foreignInvestmentAllowanceNote:
      'Additional R10m per calendar year, on top of the SDA. Requires a SARS Approval for International Transfer (AIT) — the process that replaced the old Tax Compliance Status (TCS) PIN / tax clearance certificate.',
    combinedAnnualCapacityZar: 12_000_000,
    aboveCombinedAllowance:
      'Not prohibited, but requires specific SARB approval via an Authorised Dealer (bank), case by case.',
    resetBasis: 'calendar year (resets 1 January), per individual — a couple can each use their own allowances.',
  },
  routes: [
    {
      route: 'Direct offshore brokerage',
      maxOffshorePct: 1.0,
      needsSdaOrFia: true,
      note: 'True offshore custody, outside SA institutional/legal reach; limited by the SDA/FIA/AIT process.',
    },
    {
      route: 'Rand-denominated feeder fund / ETF (e.g. Satrix MSCI World)',
      maxOffshorePct: 1.0,
      needsSdaOrFia: false,
      note: 'Underlying exposure can be ~100% offshore, but the fund wrapper itself is a South African-domiciled entity — does not fully replicate offshore jurisdictional protection.',
    },
    {
      route: 'Retirement annuity / preservation fund (Regulation 28)',
      maxOffshorePct: 0.45,
      needsSdaOrFia: false,
      note: 'Reg 28 caps offshore exposure at 45% (raised from the historical 30%).',
    },
    {
      route: 'Living annuity',
      maxOffshorePct: 1.0,
      needsSdaOrFia: false,
      note: 'Not subject to Regulation 28 — can be up to 100% offshore, subject to the platform/underlying fund\'s own limits (some managers cap aggregate offshore AUM around 45%).',
    },
  ],
  tax: {
    para43Cgt:
      'Para 43/43A of the Eighth Schedule: gains/losses on non-monetary foreign-currency assets are translated to rand either by the "simple method" (convert the net gain/loss at disposal) or the "comprehensive method" (expenditure translated at cost date, proceeds at disposal date) — rand depreciation between purchase and sale increases the taxable rand gain even if the foreign-currency value is unchanged. Monetary assets/liabilities and hedges fall under s24I instead.',
    foreignDividendExemptFraction: 25 / 45,
    foreignDividendNote:
      '25/45ths (≈55.6%) of a foreign dividend is exempt under s10B(3); the rest is included in taxable income, giving a maximum effective rate of ~20% at the top 45% marginal bracket. A separate exemption applies to dividends where the SA resident holds ≥10% of the foreign company\'s equity/votes.',
    foreignInterestExemptZar: 0,
    foreignInterestNote:
      'No exempt portion for foreign interest (unlike the R23,800/R34,500 local interest exemption) — fully taxable at marginal rates, with a foreign tax credit available for tax already withheld abroad.',
  },
  usEstateTax: {
    nonResidentAlienThresholdUsd: 60_000,
    maxRatePct: 0.40,
    note:
      'A non-resident, non-US-citizen holding US-situs assets (direct US shares, most US-domiciled ETFs) above $60,000 can face US federal estate tax at rates up to 40% on death. Irish- or Luxembourg-domiciled UCITS ETFs (e.g. most "IE00…" ISIN global trackers) are treated as non-US-situs — no look-through to underlying US holdings — so they fall outside the $60,000 threshold entirely, at the cost of a 15% (treaty) rather than 0% US dividend withholding rate. This reverses if any beneficiary/joint holder is a US person.',
  },
  usdLivingAnnuities: {
    available: true,
    example: 'Allan Gray living annuity offers USD-denominated unit trusts (e.g. Baillie Gifford Worldwide Emerging Markets Leading Companies Fund, Dodge & Cox U.S. Stock Fund / Worldwide Global Stock Fund) alongside rand-denominated Orbis global feeder funds.',
    note: 'Other major LISPs were not confirmed in this pass to offer true USD-denominated (as opposed to rand-denominated-offshore) underlying funds with the same range — confirm per provider.',
  },
  emigration: {
    financialEmigrationAbolished: '2021-03',
    exitTaxMechanism:
      'Section 9H "deemed disposal": the day before ceasing SA tax residency, the taxpayer\'s worldwide assets (with statutory exceptions, e.g. SA immovable property) are deemed disposed of at market value and CGT is triggered immediately, with no actual sale or cash received.',
    threeYearRule:
      'Applies specifically to retirement annuity (RA) funds: once SARS confirms non-residency, RA benefits are locked and cannot be withdrawn/annuitised until 3 years after that confirmation date. Distinct from the exit tax, which is charged immediately at cessation of residency.',
    spousalDonationsTaxChange:
      'From 25 Feb 2026, inter-spousal asset transfers made after one spouse has already ceased SA tax residency can attract donations tax at 20% — closes a previously common phased-emigration planning technique.',
  },
  fxSpreads: {
    typicalBankSpreadPctRange: [0.02, 0.03] as [number, number],
    typicalTransferFeeZarRange: [500, 1000] as [number, number],
    note: 'Retail banks typically embed a 2-3% spread versus the interbank rate on forex conversions, on top of separate SWIFT/transfer fees; independent forex brokers often quote materially tighter spreads for SDA/FIA-sized transfers.',
  },
  sources: [
    'https://www.sableinternational.com/forex/south-africa-transfers/tax-clearance-certificate',
    'https://www.polity.org.za/article/higher-single-discretionary-allowance-brings-more-capacity-not-less-compliance-2026-03-25',
    'https://www.finglobal.com/2026/04/20/two-million-single-discretionary-allowance-south-africa/',
    'https://www.newtons-sa.co.za/2019/07/22/calculating-your-foreign-currency-capital-gain/',
    'https://www.taxtim.com/za/calculators/taxable-foreign-dividends',
    'https://www.skyboundwealth.com/technical-guides/u-s-estate-tax-rules-for-non-residents',
    'https://www.bogleheads.org/wiki/Nonresident_alien_investors_and_Ireland_domiciled_ETFs',
    'https://www.allangray.co.za/what-we-offer/living-annuity/',
    'https://www.finglobal.com/2026/08/30/exit-tax-south-africa-explained/',
    'https://www.moneyweb.co.za/in-depth/future-forex/your-banks-forex-fees-are-much-higher-than-they-seem-heres-the-alternative/',
    '../../research/offshore.md',
  ],
} as const

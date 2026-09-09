# Taking money offshore from South Africa — allowances, routes, tax and estate issues

**Status:** Compiled 2026-09-09. Figures reflect the 2026 Budget changes where noted; SARS/SARB rules
change periodically so treat allowance amounts as current-as-at-date and re-verify before acting.

---

## 1. Allowances: SDA and FIA

- **Single Discretionary Allowance (SDA)**: historically **R1 million per calendar year** per SA-resident
  individual aged 18+, usable for any purpose (offshore investment, travel, gifts) **without needing
  prior SARS tax clearance**. **Per the 2026 Budget, the SDA was doubled to R2 million per calendar
  year** — a significant, recent, confirmed change. (Note: the task brief references the long-standing
  R1m figure; as of the 2026 Budget the current SDA is **R2m**. Both figures are documented below so the
  history is clear.)
- **Foreign Investment Allowance (FIA)**: an **additional R10 million per calendar year**, on top of the
  SDA, specifically for offshore investment purposes. Using the FIA requires:
  - A **SARS "Approval for International Transfer" (AIT)** — this replaced the older "Tax Compliance
    Status (TCS) PIN" / tax clearance certificate process; SARS verifies the taxpayer is compliant and
    that the source of funds is legitimate before approving the transfer.
  - Supporting documentation (proof of funds, tax compliance).
  - Amounts **above** the combined SDA+FIA (so above R12m/year on the new 2026 limits, or above R11m
    under the old R1m SDA) are **not prohibited** but require **specific SARB approval** via an
    Authorised Dealer, case by case.
- **Reset**: both allowances are **per calendar year** (not tax year) and reset on 1 January.
- **Practical combined capacity (2026)**: **R12 million per person per calendar year** (R2m SDA + R10m
  FIA) without needing bespoke SARB approval — a married couple can each use their own allowances,
  effectively doubling household capacity.

Sources: [Sable International — SA foreign investment allowance and AIT](https://www.sableinternational.com/forex/south-africa-transfers/tax-clearance-certificate); [Polity — Higher SDA brings more capacity, not less compliance](https://www.polity.org.za/article/higher-single-discretionary-allowance-brings-more-capacity-not-less-compliance-2026-03-25); [FinGlobal — the SDA: the R1m/R2m opportunity](https://www.finglobal.com/2026/04/20/two-million-single-discretionary-allowance-south-africa/); [FinGlobal — six things SARS wants you to know about SDA/FIA](https://www.finglobal.com/2024/11/22/single-discretionary-and-foreign-investment-allowance/); [Currency Partners — 2026 annual allowances explained](https://www.currencypartners.co.za/market-news/2026-offshore-allowances/); [SARB — Financial Surveillance circular 6/2026](https://www.resbank.co.za/content/dam/sarb/what-we-do/financial-surveillance/financial-surveillance-documents/2026/6-2026.pdf).

---

## 2. Routes to get offshore exposure

| Route | Mechanism | Offshore % achievable | Notes |
|---|---|---|---|
| **Direct offshore brokerage** | Use SDA/FIA to physically move rand, convert to USD/other, buy shares/ETFs via a foreign or local platform (e.g. EasyEquities USD, Interactive Brokers, Saxo) | Up to 100% | True offshore custody — the asset sits outside SA and outside SA institutional reach; subject to allowance limits and AIT |
| **Rand-denominated feeder funds / ETFs** | Local unit trust or ETF that itself invests offshore (e.g. Satrix MSCI World, Allan Gray-Orbis feeder funds) | Effectively 100% underlying offshore exposure, but the **wrapper is a South African-domiciled fund** | No SDA/FIA needed (you're buying a rand-priced local instrument); convenient and liquid, but the *legal claim* is against a South African entity, not a foreign one — doesn't fully replicate the "jurisdiction of custody" protection discussed in `risks.md` |
| **Retirement funds (RA/preservation fund) under Reg 28** | Offshore allocation inside a Regulation-28-compliant vehicle | Capped — historically 30%, raised to **45%** offshore under the current Reg 28 limits | Still a South African-domiciled retirement fund; the tax-free growth/contribution benefits apply, but full jurisdictional diversification is not possible while assets remain inside Reg 28 |
| **Living annuity** | Once retired, a living annuity is **not** subject to Reg 28 | **Up to 100% offshore** is permitted for a living annuity (subject to the underlying platform/fund's own offshore limits — see below) | The single biggest lever a retiring member has for full currency diversification, because living annuities are exempt from Reg 28's asset-allocation limits |

**Platform-level caveat on "100% offshore" living annuities**: even though Reg 28 doesn't apply, some
living-annuity/LISP platforms themselves face **aggregate** offshore limits (e.g. a fund manager may be
capped at 45% of its total assets under management held offshore in aggregate, which can in practice
constrain how much a single client can allocate once the platform is near its own cap). Rand-denominated
feeder-fund building blocks (e.g. Allan Gray-Orbis global feeder funds) inside a living annuity can
achieve very high, but platform-dependent, offshore weightings; direct foreign-currency unit trusts
(e.g. the Baillie Gifford, Dodge & Cox USD-denominated funds available via Allan Gray's living annuity)
are also usable inside a living annuity for genuine foreign-currency exposure without an aggregate-limit
constraint in the same way.

Sources: [Allan Gray — living annuity](https://www.allangray.co.za/what-we-offer/living-annuity/); [Allan Gray — Allan Gray-Orbis rand-denominated offshore unit trusts / living annuity offshore limits removed](https://www.allangray.co.za/latest-insights/offshore-investing/allan-gray-orbis-rand-denominated-offshore-unit-trusts-open-living-annuity-offshore-limits-removed/); [Blue Chip Digital — maximising offshore allocation in a living annuity](https://bluechipdigital.co.za/southern-africa-investment-news/maximising-offshore-allocation-in-a-living-annuity/).

---

## 3. Tax on foreign assets and income

### 3.1 Foreign-currency capital gains tax — paragraph 43
**Paragraph 43 of the Eighth Schedule** to the Income Tax Act governs how a capital gain/loss on an
asset acquired or disposed of in a foreign currency is translated into rand for CGT purposes. There are
two methods:
- **Simple method (para 43(1))**: calculate the gain/loss in the foreign currency first, then translate
  the *net gain or loss* into rand at the **spot or average rate on disposal**.
- **Comprehensive method (para 43A)**: translate expenditure into rand at the rate applying **when the
  expenditure was incurred**, and translate proceeds into rand at the rate applying **when the asset is
  disposed of** — meaning rand movements between purchase and sale flow directly into (or out of) the
  taxable gain, on top of the underlying foreign-currency return.
- Note the scope: paragraph 43 covers **non-monetary assets** acquired/disposed of in foreign currency
  (e.g. foreign shares, offshore property); monetary foreign-currency assets/liabilities and forex
  hedging fall under **section 24I** of the main Act instead.
- **Practical implication for an offshore investor**: rand depreciation between purchase and sale of a
  foreign asset **increases** the rand capital gain (and therefore CGT payable) even if the asset's
  foreign-currency (e.g. USD) value hasn't changed — currency-driven "gains" are real, taxable gains
  under SA CGT rules.

Sources: [Newtons — calculating your foreign currency capital gain](https://www.newtons-sa.co.za/2019/07/22/calculating-your-foreign-currency-capital-gain/); [Arkin & Company — CGT on foreign currency assets](https://www.linkedin.com/pulse/capital-gains-tax-foreign-currency-assets-arkin-company-chartered).

### 3.2 Foreign dividends and interest
- **Foreign dividends**: for individuals, **25/45ths (≈55.6%) of a foreign dividend is exempt** under
  section 10B(3), with the remaining ~44.4% included in taxable income — giving a **maximum effective
  rate of ~20%** on foreign dividends at the top 45% marginal rate (comparable to the local dividends
  withholding tax rate of 20%, by design). A separate, broader exemption applies where the SA resident
  holds **≥10%** of the equity and voting rights of the foreign company (most portfolio investors won't
  qualify for this). The full gross dividend must be declared; SARS/the return applies the exemption.
- **Foreign interest**: **no exempt portion** — foreign interest income is **fully taxable** at marginal
  rates (unlike local interest, which enjoys an annual exemption of R23,800, or R34,500 for taxpayers 65
  and older). A **foreign tax credit** (rebate) is available for any withholding tax already deducted
  abroad, to avoid double taxation, but there is no equivalent of the local interest exemption for
  offshore interest.

Sources: [TaxTim — foreign dividends tax calculator](https://www.taxtim.com/za/calculators/taxable-foreign-dividends); [TaxTim — foreign income tax for SA residents](https://www.taxtim.com/za/guides/foreign-incometax-for-sa-residents); [SARS — interest and dividends](https://www.sars.gov.za/tax-rates/income-tax/interest-and-dividends/).

---

## 4. US estate tax and Irish-domiciled UCITS mitigation

- **The $60,000 trap**: a non-resident, non-US-citizen ("non-resident alien," which a South African
  investor is) who holds **US-situs assets** (direct US shares, US-domiciled ETFs like most S&P
  500/Nasdaq ETFs) is subject to US federal **estate tax** on death, with only a **$60,000 filing
  threshold/exemption** — vastly smaller than the multi-million-dollar exemption available to US
  citizens/residents. Above that threshold, US estate tax can apply at rates **up to 40%** on the
  US-situs assets, potentially requiring the estate to file a US estate tax return and pay tax (and often
  delaying the release of the assets to heirs) before probate/administration can complete.
- **Irish (or Luxembourg) domiciled UCITS ETFs as mitigation**: the critical legal distinction is **fund
  domicile, not underlying holdings**. A UCITS ETF domiciled in Ireland (e.g. many "IE00..." ISIN funds
  tracking the S&P 500 or MSCI World, and the Amundi MSCI World UCITS ETF that Satrix's MSCI World
  feeder fund itself invests into) is a **non-US issuer** — there is **no look-through** to its
  underlying American shareholdings for US estate tax purposes, so the ETF shares themselves are treated
  as **non-US-situs property**, entirely outside the $60,000 US estate tax net, even though the fund's
  economic exposure is to US companies.
- **Trade-off**: Irish-domiciled UCITS funds typically suffer US dividend withholding tax at a
  treaty-reduced **15%** (via the US-Ireland tax treaty) rather than the US-domiciled-ETF investor's
  0% US withholding — a modest, known cost in exchange for eliminating an unpredictable, potentially
  much larger estate-tax exposure.
- **Critical caveat**: this planning **reverses entirely if any family member (spouse, joint account
  holder, or heir with a beneficial interest) is a US person** (US citizen or US tax resident) — normal
  US estate/gift rules would then apply regardless of fund domicile.
- **Practical guidance for a South African investor**: prefer Irish- or Luxembourg-domiciled UCITS ETFs
  (widely available through SA offshore platforms, and the underlying vehicle for most local
  rand-denominated global feeder funds) over directly holding US-domiciled ETFs or individual US shares,
  specifically to avoid the $60,000 estate-tax trap — this is a standard piece of cross-border planning
  advice, not a South Africa-specific rule.

Sources: [Skybound Wealth — US estate tax for non-residents: do your ETFs & stocks qualify?](https://www.skyboundwealth.com/technical-guides/u-s-estate-tax-rules-for-non-residents); [3tej — the $60,000 line: US estate tax on non-residents](https://3tej.com/blog/us-estate-tax-non-residents-60000-threshold); [Jungle Tax — US situs assets $60,000 estate tax threshold](https://www.jungletax.co.uk/guides/us-situs-assets-60000-estate-tax-threshold-uk-investors); [Bogleheads — nonresident alien investors and Ireland-domiciled ETFs](https://www.bogleheads.org/wiki/Nonresident_alien_investors_and_Ireland_domiciled_ETFs); [Taxes for Expats — UCITS ETF withholding tax & PFIC rules](https://www.taxesforexpats.com/articles/investments/ucits-etf-withholding-tax.html).

---

## 5. USD-denominated living annuities

Several South African providers allow a living annuity to be invested in **genuine foreign-currency
(not just rand-denominated-but-offshore-invested) building blocks**. Example: **Allan Gray's living
annuity** permits allocation to USD-denominated unit trusts such as the **Baillie Gifford Worldwide
Emerging Markets Leading Companies Fund (USD)** and **Dodge & Cox U.S. Stock Fund / Dodge & Cox
Worldwide Global Stock Fund (USD)** — these sit alongside the more common rand-denominated
Allan Gray-Orbis global feeder funds. Because a living annuity falls **outside Regulation 28**, there is
no regulatory ceiling on the proportion allocated this way (subject only to the platform's own product
rules and any aggregate offshore-AUM constraints noted in §2). Momentum and other large LISPs impose
similar offshore-percentage mechanics but were not confirmed in this pass to offer true USD-denominated
underlying funds (as opposed to rand-denominated offshore feeder funds) with the same specificity as
Allan Gray's range — worth confirming directly with each provider before assuming parity.

Source: [Allan Gray — product range brochure](https://www.allangray.co.za/globalassets/documents-repository/product/brochures/Multiple%20products/Files/Product%20Range%20Brochure.pdf); [Allan Gray — simplifying offshore investing](https://www.allangray.co.za/latest-insights/offshore-investing/simplifying-offshore-investing/).

---

## 6. Emigration — the "three-year rule" and exit tax

- **The old "financial emigration" process was abolished in March 2021.** It is no longer a formal SARB
  category. Today, an individual leaving South Africa simply **notifies SARS of a change in tax
  residency** (ceasing tax residency, tested via the ordinarily-resident test or the physical-presence
  test) rather than going through the old SARB/bank "financial emigration" declaration.
- **Exit tax (s9H, "deemed disposal")**: the day before an individual **ceases to be a South African tax
  resident**, the Income Tax Act deems a **disposal of the person's entire worldwide asset base at market
  value** (with some statutory exceptions — notably South African-situated immovable property and certain
  retirement fund interests, which are not part of the deemed disposal but are dealt with under their own
  rules). **Capital gains tax is triggered immediately** on the resulting notional gain, even though no
  actual sale has occurred and no cash has changed hands — this "exit charge" can be a very large,
  liquidity-straining tax event for someone with significant unrealised gains (e.g. a large investment
  portfolio or business interest) at the point of emigration.
- **The "three-year rule" — retirement annuity lock-up**: this specifically refers to **retirement
  annuity (RA) funds**: once SARS has confirmed an individual's non-residency, **RA benefits remain
  locked and cannot be accessed (withdrawn/annuitised) until three years after** that non-residency
  confirmation date. This is a liquidity/access restriction on RA savings, distinct from the exit tax
  itself, and is a common point of confusion — the "3-year rule" does not delay when the exit tax is
  charged (that's immediate, at cessation of residency); it delays when locked-in RA money can actually be
  withdrawn.
- **2026 Budget change to watch**: from **25 February 2026**, inter-spousal asset transfers made **after**
  one spouse has already ceased SA tax residency can attract **donations tax at 20%** — closing a
  previously-used planning technique where one spouse would emigrate first and the other would later
  transfer/gift assets across, and materially changing sequencing strategy for couples planning a phased
  emigration.

Sources: [FinGlobal — South African exit tax explained (Aug 2026)](https://www.finglobal.com/2026/08/30/exit-tax-south-africa-explained/); [PKF South Africa — ceasing SA tax residency: key tax implications](https://www.pkf.co.za/news/2025/ceasing-south-african-tax-residency-key-tax-implications-for-emigrants/); [FinGlobal — why 50,000+ South Africans chose tax emigration](https://www.finglobal.com/2026/02/20/south-african-expats-tax-emigration/); [Financial Emigration South Africa — hurdles of ceasing SA tax residency once the clock has ticked](https://www.financialemigration.co.za/hurdles-of-ceasing-your-south-african-tax-residency-once-the-clock-has-ticked/); [Financial Emigration South Africa — exit tax and retirement interests explained](https://www.financialemigration.co.za/understanding-south-africas-exit-tax-and-the-proposed-tax-on-retirement-interests/).

---

## 7. FX spreads and the cost of converting rand

- Retail bank forex conversion typically carries a **hidden spread of ~2–3%** between the interbank rate
  and the rate quoted to the client, on top of separate, more visible fees (SWIFT/transfer charges of
  roughly **R500–R1,000 per transaction**, plus possible commission/admin fees).
- Worked example commonly cited: on a **R1 million** transfer at a true spot rate of R17.20/US$, a bank
  might quote R17.56/US$ — a ~2% spread that silently costs the client **~R20,000** versus the
  interbank rate, before any explicit fees.
- Independent forex brokers/platforms (e.g. Future Forex and similar fintech alternatives to bank
  treasury desks) market themselves specifically on **narrower spreads** than the major banks for
  SDA/FIA-sized transfers — worth shopping around rather than defaulting to one's transactional bank for
  a large once-off offshore transfer.
- **Implication for planning**: a **1–3% one-off FX conversion cost** should be modelled explicitly when
  comparing "stay in rand" vs "go offshore" scenarios, since it's a real, immediate drag distinct from
  ongoing platform/fund fees.

Sources: [Moneyweb/Future Forex — your bank's forex fees are much higher than they seem](https://www.moneyweb.co.za/in-depth/future-forex/your-banks-forex-fees-are-much-higher-than-they-seem-heres-the-alternative/); [Moneyweb/Future Forex — a cheaper, easier way to move money to and from South Africa](https://www.moneyweb.co.za/in-depth/future-forex/heres-a-cheaper-easier-way-to-move-money-to-and-from-south-africa/).

---

## 8. Summary decision table

| Question | Answer |
|---|---|
| How much can I move offshore per year without SARB approval? | R2m (SDA) + R10m (FIA, needs AIT) = **R12m/person/year** (2026 figures) |
| Do I need tax clearance for the first R2m? | No — SDA requires no prior SARS clearance |
| Do I need tax clearance for the next R10m? | Yes — AIT (replaced the old TCS/tax clearance certificate) |
| Can my living annuity be 100% offshore? | Yes, in principle (no Reg 28 constraint) — subject to the specific platform/fund's own limits |
| Can my RA/preservation fund be 100% offshore? | No — capped at 45% under current Reg 28 |
| Will I owe US estate tax on my offshore ETF? | Only if it's US-domiciled and you're not a US person; **Irish/Luxembourg UCITS ETFs avoid this** |
| Does converting rand to dollars trigger CGT immediately? | No — CGT is triggered on disposal of the resulting asset, but para 43/43A brings currency movement into the gain calculation at that point |
| What happens to my RA if I emigrate? | It's not disposed of under the exit-tax deemed disposal, but is **locked for 3 years** after SARS confirms non-residency |
| What's the "exit tax"? | A deemed disposal (s9H) of your worldwide assets at market value the day before you cease SA tax residency, taxed under normal CGT rules |

---

## What could not be verified

- Whether Momentum, Investec, and other major LISPs offer true USD-denominated (not just
  rand-denominated-offshore) underlying unit trusts inside a living annuity with the same range as Allan
  Gray — only Allan Gray's offering was confirmed with specific fund names.
- The exact current aggregate offshore-AUM percentage cap that constrains individual living-annuity
  clients at specific large managers (cited generally as ~45% aggregate, per one Momentum actuary
  commentary, but not confirmed as a universal or regulatory figure — it may be an internal risk limit
  that varies by manager).
- A precise, current SARS practice note or interpretation note number for paragraph 43 vs paragraph 43A
  election mechanics (the general mechanism is well documented across professional/accounting sources,
  but a primary SARS interpretation note reference was not pulled in this pass).
- Whether the 2026 Budget's spousal-donations-tax change (20% from 25 Feb 2026) has since been amended,
  challenged, or given transitional relief — only the initial announcement was found.

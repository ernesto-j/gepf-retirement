# SA Pension Planner — GEPF: stay or leave?

A South African retirement planner for public servants (GEPF members) who are retiring soon or planning to. It captures your lifestyle and GEPF details, then compares:

- **Staying**: retiring from the GEPF and drawing the defined-benefit pension (gratuity + lifelong, inflation-linked annuity, spouse pension, medical subsidy).
- **Leaving and preserving**: resigning, transferring your actuarial interest tax-free to a preservation fund, and later drawing a living annuity (up to 100% offshore).
- **Leaving and cashing out**: resigning, taking the cash allowed under the two-pot rules, paying withdrawal tax, and investing the rest — including offshore to hedge the rand.

For each route it works out the tax on lump sums (retirement vs withdrawal tables, with aggregation), the **monthly PAYE on GEPF pension drawings**, fees for the top SA funds, the age at which invested capital runs out, how "true" (personal) inflation and rand depreciation affect purchasing power over 20–30 years, pros and cons, and sovereign/pension-system risk flags with case studies (Zimbabwe, Argentina, Greece, Cyprus, Lebanon, Ghana). A scenario planner compares any two routes side by side, and an AI assistant answers questions with the current page and scenarios as context. You can upload a GEPF benefit statement (PDF or photo) and have the numbers extracted.

> **Estimates only — not financial advice.** Every number is reproducible from your inputs and the documented assumptions, but the GEPF pays what its rules and your actual record say, and SARS applies the tables in force on the day. Verify with the GEPF/GPAA, SARS and a licensed adviser before acting.

## Quick start

```bash
npm install
cp .env.example .env        # add ANTHROPIC_API_KEY for the AI assistant (optional)
npm run dev                  # web on http://localhost:5173, API on :8787
```

Other commands:

```bash
npm test            # engine unit tests (Vitest)
npm run typecheck   # app + server
npm run build       # production bundle in dist/ (npm start serves it with the API)
npm run build:single# ONE self-contained HTML file in dist-single/index.html
npm run e2e         # Playwright smoke test with screenshots in e2e/screenshots/
                    # (set PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome to reuse an installed Chromium)
```

The single-file build can be opened straight from disk or emailed. Its AI features work in "browser key" mode (paste your Anthropic API key under Ask AI → settings; the key is stored only in your browser's localStorage).

## How it works

### Inputs (Profile page)

- **About you**: age, planned exit age, planning horizon (default 90), spouse and spouse-pension election (50% or 75%).
- **GEPF membership**: pensionable service, pensionable salary and growth, service before 1 September 2024 (two-pot), post-retirement medical subsidy eligibility, previous lump sums (for tax aggregation). Upload a benefit statement to fill these in.
- **Lifestyle**: target after-tax monthly income in today's rand (or build it from essentials, discretionary, medical aid, housing), other income, other savings and their offshore share, debt, once-off capital needs, legacy goal, and the share of your spending that is import-linked.
- **Your own investments**: holdings you set up yourself that run alongside every scenario, each with its own currency (ZAR, USD, AUD, GBP, EUR), deposit, optional loan (amortising or interest-only), growth, income yield, running costs, income tax and CGT rates, purchase and selling costs, and an optional fixed term. Presets: S&P 500 UCITS ETF in dollars, Australian residential and commercial property for a non-resident buyer, a fixed-term deposit, other. Net cash counts toward your income (or is reinvested), negative carry is funded from savings, and sale proceeds return to your savings. Assets without a term are held to the horizon and are not sold piecemeal for income.
- **Assumptions** (with presets): official CPI, personal "true" inflation, medical inflation, GEPF increase as a share of CPI, USD/ZAR spot, rand depreciation, returns (local balanced, cash, offshore in USD), fees, FX cost, living-annuity limits, tax year.

### GEPF benefits (engine/gepf.ts)

- Final salary = average pensionable salary over the last 24 months.
- 10+ years' service: gratuity = 6.72% × final salary × service; annuity = final salary × service ÷ 55 + R360 a year.
- Under 10 years: no pension; the actuarial interest (service × final salary × F(age)) is paid as a once-off gratuity.
- Early retirement between 55 and 60 without employer approval: ⅓% reduction per month before 60.
- Resignation at any age: actuarial interest = pensionable service × final salary × age-dependent factor F(age) (GEPF Rule 14.4), using the factors the GEPF introduced on **1 October 2025**. GEPF says these are on average 15% lower than the 2021 factors, but a real benefit statement dated 31 March 2026 (the first seen on the revised basis) puts the cut at only 7% at age 64, so the curve in `src/data/gepfRules.ts` is fitted to both facts: it passes through that observed point and averages 15% below the 2021 curve across all tabulated ages, which makes the reduction run from about 17% at 40 to 7% at 64. The value under the previous factors is shown for comparison.
- DPSA early-retirement (ERP, 55–59: reduction waived plus 2 weeks' salary per year for the first 20 years, 1 week thereafter) and voluntary-exit (VEP, 60–63: 2 weeks per year for the first 10 years, 1 week thereafter) programme incentives, taxed as severance benefits, when selected on the Profile page (Circular 38 of 2025; exits by 31 March 2027).
- Two-pot split of the actuarial interest: vested (pre-September-2024 accrual, less the 10%/R30,000 seed), savings (seed + ⅓ of later accrual) and retirement (⅔ of later accrual). On resignation you may cash the vested and savings components; the retirement component must be preserved.

### Tax (engine/tax.ts)

SARS tables for 2026/27 (the app's default tax year; 2025/26 is also available): seven income brackets, primary/secondary/tertiary rebates, medical scheme fees tax credits, the retirement lump-sum table (first R550,000 tax-free) and the withdrawal table (first R27,500 tax-free) — both unchanged since 2023/24 and applied cumulatively over all previous lump sums. Living-annuity draws and the GEPF pension are taxed as income with the age rebates; the tool shows the monthly PAYE at 60, 65 and 75.

### Projection (engine/projection.ts)

Annual steps from the exit age to the horizon. Income target escalates at personal inflation (medical aid at medical inflation). Capital is held in a local sleeve and an offshore sleeve (in USD, valued at spot × (1 + depreciation)^t), rebalanced yearly, net of the chosen fund's all-in fee. Retirement-fund money grows untaxed; discretionary money carries a blended tax drag. Living annuities draw between 2.5% and 17.5% of capital; when the target income needs more than that, the row is marked "capped" and the shortfall is shown. **Ruin age** is the first age at which all investable capital is exhausted; for the stay route the GEPF pension continues regardless. Totals include lifetime tax, fees, present value of net income (today's rand) and legacy at the horizon.

### Funds (engine/funds.ts)

The Funds page compares 23 SA funds on fees and 1, 3, 5, 10 and 20-year and since-launch returns (≈ marks approximate figures), runs the living-annuity route once per fund on the common return assumption and on the fund's own history, and shows growth of R1m over 30 years per fund net of its all-in fee.

### Rand and inflation (engine/hedge.ts)

Long-run rand depreciation against the dollar has averaged roughly the SA–US inflation differential. The hedge projection compares a rand-only portfolio with a partly offshore one, in nominal rand, in today's purchasing power, and in USD, with a stress toggle for years in which the rand strengthens.

### Risks (data/caseStudies.ts, engine/insights.ts)

Flags are generated per scenario (withdrawal tax, medical-subsidy forfeiture, early-retirement penalty, 2025 factor revision, sequence and longevity risk, rand-only exposure, sovereign concentration, fees). Case studies describe the mechanisms by which savers lost money elsewhere and what protected them; South Africa's own indicators are shown with dates and sources.

## Data and sources

All data files in `src/data/` carry `asOf` dates and source URLs. Fund returns marked ≈ (`returnsConfidence: 'approximate'`) are labelled estimates used so the fund-history comparison can run where a fact sheet could not be fetched; replace them from the fund's minimum disclosure document. Research notes with sources and the adversarial verification reports are in `research/`. Values marked `confidence: 'low'` (notably the exact actuarial-interest factor table) are estimates — use the resignation value from your own benefit statement, which overrides the formula.

## Limitations

- The GEPF's actuarial factors are approximated unless you enter your statement value. The published table (Appendix 8 of the 2024 valuation) is not available; the curves are anchored to two real benefit statements and a GEPF FAQ example, so they are most reliable near retirement and least reliable below 55.
- Tax tables are for the selected tax year only; future budgets will change them.
- Returns and exchange rates are deterministic assumptions, not forecasts; use the sensitivities and presets.
- Medical-subsidy rules differ by employer and service; check your own eligibility.
- Not covered: divorce orders, purchased service pricing, disability benefits, foreign tax residency changes.

## Project layout

See `docs/SPEC.md` for the engineering spec (engine contracts, simulation rules, page specs, AI layer).

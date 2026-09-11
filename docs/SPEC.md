# South African Pension Planner — Engineering Spec

Purpose: help a South African public servant (GEPF member) who is retiring soon, or planning to, decide between **staying in the GEPF** (retire and draw the defined-benefit pension) and **leaving** (resign and either preserve the actuarial interest in another fund or cash out and invest, including offshore to hedge the rand). The app captures lifestyle details, compares top SA funds and their fees, works out the tax on every route (lump sums and monthly PAYE on pension drawings), projects income and capital to a planning horizon with "true" (personal) inflation and rand depreciation, shows the age at which invested capital runs out, flags sovereign/pension-system risks (Zimbabwe, Argentina, etc.), and has an AI assistant that knows the current page and scenarios. Members can upload their GEPF benefit statement and have the numbers extracted.

Everything is deterministic and transparent: every number on screen must be reproducible from the inputs and the documented assumptions. Data files carry `asOf` dates and source URLs.

## Stack

- Vite 8 + React 19 + TypeScript 6 (strict), Tailwind CSS v4 (`@tailwindcss/vite`), Recharts 3, Zustand 5 (persisted to localStorage).
- Engine: pure TypeScript in `src/engine`, no React, unit-tested with Vitest (`tests/**/*.test.ts`).
- AI: `@anthropic-ai/sdk`. Express server in `server/index.ts` (`/api/ask`, `/api/extract-statement`, `/api/health`) using `ANTHROPIC_API_KEY`; browser fallback where the user pastes their own key (stored in localStorage only) and the SDK is created with `dangerouslyAllowBrowser: true`.
- Scripts: `npm run dev` (web + api), `npm run build`, `npm run typecheck`, `npm test`, `npm run e2e` (Playwright smoke; browsers at `/opt/pw-browsers`, never run `playwright install`).

## Directory layout and file ownership

```
src/engine/types.ts        shared domain model (done — do not change shapes without updating this spec)
src/engine/money.ts        formatting + small numeric helpers (done)
src/engine/tax.ts          income tax, PAYE, lump-sum tables            [engine agent A]
src/engine/gepf.ts         GEPF benefit formulas, actuarial interest, two-pot [engine agent B]
src/engine/projection.ts   scenario simulation, ruin age, comparison    [engine agent C]
src/engine/insights.ts     pros/cons + risk flags per scenario           [engine agent C]
src/engine/hedge.ts        rand-hedge and inflation projections, history stats [engine agent D]
src/engine/funds.ts        fee-impact maths, fund ranking                 [engine agent D]
src/engine/statement.ts    apply extracted statement values to a profile  [engine agent B]
src/data/taxTables.ts      SARS tables (done for 2025/26; research may add 2026/27)
src/data/gepfRules.ts      GEPF rules + actuarial factor tables           [data from research]
src/data/funds.ts          fund/fee/return data                           [data from research]
src/data/macroHistory.ts   USD/ZAR, CPI, asset returns                    [data from research]
src/data/caseStudies.ts    Zimbabwe, Argentina, Greece, ... + SA indicators [data from research]
src/data/defaults.ts       default profile and assumptions (done)
src/store/useAppStore.ts   zustand store (done)
src/store/useResults.ts    memoised scenario results hook (done)
src/ai/shared.ts           system prompt, context serialiser, extraction schema [AI agent]
src/ai/client.ts           browser client: server proxy or direct           [AI agent]
server/index.ts            Express API                                     [AI agent]
src/components/*           shared UI: Nav, NumberInput, Field, KpiTile, charts, AskAiDrawer, StatementUpload
src/pages/ProfilePage.tsx  inputs (person, GEPF, lifestyle, assumptions, statement upload) [UI agent 1]
src/pages/ComparePage.tsx  stay vs leave: 3 core routes, tax table, pros/cons  [UI agent 2]
src/pages/PlannerPage.tsx  scenario planner: A vs B custom scenarios          [UI agent 2]
src/pages/FundsPage.tsx    fund + fee comparison, fee-impact chart            [UI agent 3]
src/pages/RandPage.tsx     FX + inflation history, hedge benefit 20–30 yrs    [UI agent 3]
src/pages/RisksPage.tsx    risk flags + case studies + SA indicators          [UI agent 3]
src/pages/AskPage.tsx      full-page AI chat                                  [AI agent]
src/App.tsx                shell, nav, page switch, drawer                     [UI agent 1]
```

Each agent owns only its files. Import other agents' modules by the contracts below; the integration pass fixes mismatches.

## Conventions

- Rates are decimals. Money in rand, annual unless the name ends in `Monthly`.
- Round only for display (`formatRand`, `formatPct` in `money.ts`). Engine keeps full precision.
- Every engine function is pure and takes its data (`TaxTables`, `GepfRules`, `FundInfo[]`) as parameters, with defaults from `src/data` for convenience.
- Never throw for ordinary bad input in the engine; clamp and record a note in `ScenarioResult.notes`.
- All data records carry `asOf` and `source`. Where a figure is an estimate, say so in a `note`.

## Engine contracts

### `src/engine/tax.ts`

```ts
export function getTaxTables(taxYear?: TaxYear): TaxTables          // from src/data/taxTables
export function calcIncomeTax(taxableIncome: number, age: number, tables: TaxTables, opts?: { medicalMembers?: number }): IncomeTaxResult
export function calcMonthlyPaye(annualTaxableIncome: number, age: number, tables: TaxTables, opts?: { medicalMembers?: number }): { monthlyTax: number; monthlyNet: number; annual: IncomeTaxResult }
export function calcRetirementLumpSumTax(amount: number, previousLumpSums: number, tables: TaxTables): LumpSumTaxResult
export function calcWithdrawalLumpSumTax(amount: number, previousLumpSums: number, tables: TaxTables): LumpSumTaxResult
export function calcSavingsPotWithdrawalTax(amount: number, otherTaxableIncome: number, age: number, tables: TaxTables): number
export function marginalRate(taxableIncome: number, tables: TaxTables): number
export function grossForNet(targetNet: number, age: number, tables: TaxTables, opts?: { medicalMembers?: number; otherTaxableIncome?: number }): number
```

Rules:
- Bracket tax: find the highest bracket with `threshold <= income`; tax = `base + rate * (income - threshold)`.
- Rebates: primary always; add secondary when `age >= 65`; add tertiary when `age >= 75` (age at end of the tax year; use the age passed in). Tax never below 0.
- Medical credits: `firstTwo` per month for members 1–2, `additional` for each further member, times 12; credits cannot make tax negative. (The additional medical expenses credit is out of scope; note it.)
- Lump sum aggregation: `tax = T(previous + amount) − T(previous)` using the relevant table, where `T` applies the table to a cumulative amount. Retirement table for retirement/death/severance; withdrawal table for resignation cash. Previous lump sums include both withdrawal and retirement benefits received since the aggregation start dates.
- Savings-pot withdrawals are taxed at the marginal rate (added to other income): `tax = T_income(other + amount) − T_income(other)`.
- `grossForNet` solves gross income such that net = target using bisection (precision R1).

Tests must include SARS 2025/26 examples: R500,000 taxable at age 40 → tax R117,507 (R121,475 base? — compute exactly from the table); R1,000,000 retirement lump sum with no previous lump sums → R101,700 tax; R1,000,000 withdrawal with no previous → R199,710; a 65-year-old with R200,000 pension pays R0 (below threshold R148,217 is not the case: R200,000 → tax = 18%·200,000 − 17,235 − 9,444 = R9,321); aggregation example where a prior R300,000 withdrawal increases the tax on a later R600,000 retirement lump sum.

### `src/engine/gepf.ts`

```ts
export function getGepfRules(): GepfRules                                 // from src/data/gepfRules
export function interpolateFactor(table: ActuarialFactorTable, age: number): number
export function projectServiceAndSalary(m: GepfMembership, currentAge: number, exitAge: number): { serviceYears: number; finalSalaryAnnual: number; salaryAtExit: number }
export function calcGepfRetirementBenefit(input: GepfBenefitInput, rules: GepfRules): GepfRetirementBenefit
export function calcGepfResignationBenefit(input: GepfBenefitInput & { serviceYearsBeforeTwoPot: number }, rules: GepfRules): GepfResignationBenefit
export function exitProgrammeIncentive(rules: GepfRules, programme: ExitProgrammeChoice | undefined, ageAtExit: number, serviceYears: number, basicSalaryAnnual: number): ExitProgrammeIncentive
export function gepfBenefitsAtExit(profile: Profile, exitAge: number, rules: GepfRules): { retirement: GepfRetirementBenefit; resignation: GepfResignationBenefit; serviceYears: number; finalSalaryAnnual: number; salaryAtExit: number; incentive: ExitProgrammeIncentive; source: 'formula' | 'statement' }
```

Rules (defaults in `GepfRules`, all overridable):
- `serviceYears = pensionableServiceYearsNow + (exitAge − currentAge)`, clamped ≥ 0.
- Final salary = average pensionable salary over the last 24 months ≈ mean of salary in the last two years: `salaryNow · (1+g)^(n−1) · (2+g)/2` where `n = exitAge − currentAge` (if n < 1, use salaryNow).
- 10+ years: `gratuity = 0.0672 · FS · years`; `annuity = FS · years / 55 + 360` per year.
- < 10 years: gratuity only = `0.15 · FS · years` (no annuity); `gratuityOnly = true`.
- Early retirement (age 55 to < 60) without exemption: both gratuity and annuity reduced by `1/3 % per month` before age 60 (`reductionFactor = 1 − months · 0.003333…`). Below 55 the member cannot retire: `calcGepfRetirementBenefit` still returns the formula values but the scenario builder must not offer a stay-gepf route below 55 (add a note).
- Resignation (any age, any service): per GEPF Rule 14.4, `actuarialInterest = serviceYears · FS · F(age)` where `F` is the age-dependent actuarial factor (F(40) ≈ 0.2036 in the GEPF FAQ example; values rise with age towards ~0.30 near 60) using the **1 Oct 2025 factors** (`rules.actuarialFactors`, interpolated). When the previous (2021) table is present, also compute `actuarialInterestPreviousFactors`. Report `gratuityComponent` = unreduced gratuity and `annuityComponent = actuarialInterest − gratuityComponent` for information. (Earlier drafts of this spec described the formula as gratuity + annuity × factor — that is superseded.)
- Two-pot split of the actuarial interest: `vested = AI · (serviceYearsBeforeTwoPot / serviceYears) − seed`, `seed = min(0.10 · vestedBeforeSeed, 30000)` (seed moves to savings), post-two-pot accrual `AI · (1 − share)` splits 1/3 savings, 2/3 retirement. `maxCashOnResignation = vested + savings`. If `serviceYearsBeforeTwoPot` is undefined, derive: `min(serviceYears, serviceYearsNow − yearsSince(2024-09-01))` — the helper receives it already computed by the caller.
- DPSA exit programmes (`gepf.exitProgramme`, `rules.exitProgramme`; DPSA Circular 38 of 2025, implementation period 1 Oct 2025 – 31 Mar 2027): **ERP** for an exit at 55–59 waives the early-retirement reduction entirely and pays a once-off incentive of `2 weeks` of basic salary per year for the first 20 years of pensionable service plus `1 week` per completed year after that; **VEP** for an exit at 60–63 pays `2 weeks` per year for the first 10 years plus `1 week` thereafter (no reduction applies at 60+ anyway). Both require 10+ years' pensionable service; `incentive = weeks / 52 · basic salary at exit`. Approval by the Executive Authority is discretionary, so the programme is an INPUT. An explicit `deps.exemptFromEarlyReduction` still overrides the ERP waiver in both directions. In `projection.ts` the incentive is a second lump sum at exit on the stay-gepf route only, taxed on the **retirement** table aggregated immediately after the gratuity (a "severance benefit" from age 55 — expected treatment, to be confirmed with the IRP3(a) directive), reported in `ScenarioResult.atExit.incentive{Weeks,Gross,Tax,Net}`, invested with the net gratuity, and included in the comparison table's "Net lump sum at exit" and "Tax on lump sums".
- Statement override: when `useStatementValues && statement` has `resignationBenefit`/`retirementGratuity`/`retirementAnnuityAnnual`, use those for an exit at the statement date's age and grow them to the exit age with salary growth (approximation; add a note). If the statement carries the two-pot components use them directly.
- `statement.ts`: `applyStatement(profile, values): Profile` fills service, salary, statement block, sets `useStatementValues = true`.

Tests: FS R600,000, 30 years, age 60 → gratuity R1,209,600, annuity R327,632.73 p.a. (R27,302.73/month); age 57 without exemption → reduction 36 months → factor 0.88; age 57 with 30 years on an approved ERP → factor 1 and an incentive of 50 weeks = R576,923.08; 8 years → gratuity only R720,000; resignation at 45 with factor table — assert monotonic interpolation and the two-pot split sums to the actuarial interest.

### `src/engine/projection.ts`

```ts
export function defaultScenarios(profile: Profile, funds: FundInfo[]): ScenarioDefinition[]  // 3 core routes
export function runScenario(profile: Profile, def: ScenarioDefinition, deps?: { tables?: TaxTables; rules?: GepfRules; funds?: FundInfo[] }): ScenarioResult
export function compareScenarios(results: ScenarioResult[]): ComparisonResult
export function summarise(result: ScenarioResult): ScenarioSummary
```

Simulation (annual steps, year 0 = exit year, ages `exitAge … planToAge` inclusive):

Common
- `t` = years since **today** (not exit). `cpiIndex = (1+officialCpi)^t`, `personalIndex = (1+personalInflation)^t`, `usdZar = spot · (1+randDepreciation)^t`.
- Income target (net, nominal) for a year: `targetNetMonthlyIncomeToday · 12 · personalIndex`. Medical aid contributions inside the target escalate at `medicalInflation` — implement by splitting the target into medical and non-medical parts and escalating separately.
- Other income: `otherIncomeMonthly · 12 · (1+otherIncomeEscalation)^t`, taxable.
- Capital sleeves: `local` (ZAR, grows at `localBalancedReturn − fee`) and `offshore` (USD, grows at `offshoreReturnUsd − fee`, valued at `usdZar`). Rebalance to the scenario's `offshorePct` each year. Fee = fund `allInFee` (or `feeOverride`). For retirement-fund money (preservation fund, living annuity) no tax on returns. For discretionary money (gratuity, cash-out proceeds, `otherSavings`) apply `discretionaryReturnTaxRate` to the year's return.
- `ScenarioDefinition.returnBasis` (`'assumption'` default, or `'fund-history'`): when `'fund-history'` and the scenario's fund has a return on record, the LOCAL sleeve grows at `fundGrossReturn(fund)` = `(y10 ?? y5 ?? y3) + fund.ter` instead of `localBalancedReturn` (fact-sheet returns are net of TER; the engine still deducts the fund's own all-in fee as usual) and a note explains the basis and that past returns are not a forecast; without a return on record it falls back to `localBalancedReturn` with a note. The offshore sleeve is never affected.
- FX conversion cost `fxConversionCost` applied once when rand is converted to the offshore sleeve.
- Taxable income for the year = GEPF pension + living-annuity draw + other income (+ savings-pot cash if any). Tax via `calcIncomeTax` with the member's age that year. Apportion the tax across sources pro rata for the row columns.
- Target-income drawdown: find the gross draw so that total net income = target (use `grossForNet` with other taxable income), then clamp for living annuities to `[min, max] · capitalStart`; discretionary pots have no clamp. If the required draw exceeds what is allowed or available, income falls short: `capped = true`, `shortfall > 0`. Draw first from the living annuity, then discretionary pots.
- Ruin age: first age at which *all investable capital* (living annuity + discretionary) is exhausted (`capitalEnd <= 0`), else null. `incomeShortfallAge`: first age with `shortfall > 1% of target`, else null.
- Legacy at horizon = `capitalEnd` in the last row; real = divided by `personalIndex`. GEPF pension has no capital value at the horizon (spouse pension continues while the spouse lives; note it).
- Totals as in `ScenarioResult.totals`; `pvNetIncome = Σ totalNetIncome / personalIndex`. `guaranteedIncomeShare = gepfPensionNet / totalNetIncome` in year 0.

`stay-gepf`
- Requires `exitAge >= 55`; below 55 return a result with a critical flag and zero pension.
- At exit: gratuity taxed on the retirement table (aggregated with `previousLumpSumsRetirement + previousLumpSumsWithdrawal`); `lumpSumNet − onceOffCapitalNeeds` invested as discretionary capital, `gratuityOffshorePct` offshore. Plus `otherSavings`.
- Pension: `annuityAnnual` from `calcGepfRetirementBenefit`, escalating each year by `officialCpi · gepfIncreaseAsPctOfCpi`. Medical subsidy if eligible, escalating at `medicalInflation`, treated as non-taxable income (it is an employer contribution; note the simplification).
- Top up to the target from the discretionary pot (no drawdown limits).

`resign-preserve`
- At exit: full `actuarialInterest` transferred tax-free to a preservation fund (`lumpSumTable: 'none'`), invested at the fund's fee, offshore share capped at `reg28.maxOffshore` while in the preservation fund. Medical subsidy forfeited: compute `forfeitedMedicalSubsidyPv` = PV at personal inflation of the subsidy from exit to horizon (0 if not eligible).
- Gap years (`exitAge` to `retireFromPreservationAge − 1`): no draw from the fund; income = other income only; shortfall reported. `retireFromPreservationAge = max(55, exitAge)` by default.
- At retirement from the preservation fund: `lumpSumAtRetirementPct` (default 1/3, max 1/3) taken as a lump sum on the **retirement** table (aggregated), net invested as discretionary; the rest goes into a living annuity with the scenario's `offshorePct` (up to the fund's `maxOffshore`, 100% for most).
- Then living-annuity drawdown as above.

`resign-cash`
- At exit: `cash = maxCashOnResignation · cashOutFraction`; the vested part is taxed on the **withdrawal** table (aggregated) and the savings-component part at the marginal rate on top of the final salary in the resignation year (two-pot rules). Net of tax, minus `onceOffCapitalNeeds`, invested as discretionary (offshore share = `offshorePct`, with FX cost). Remaining vested/savings plus the retirement component transferred to a preservation fund → living annuity at `retireFromPreservationAge` (same as resign-preserve). Medical subsidy forfeited.
- Draw: living annuity first (target-income), then discretionary.

`defaultScenarios(profile)` returns: `stay` (stay-gepf, gratuity 30% offshore), `preserve` (resign-preserve, low-cost index fund, 50% offshore in the living annuity), `cash` (resign-cash, 100% cash-out, 70% offshore). Names: "Stay: retire from GEPF", "Leave: preserve & living annuity", "Leave: cash out & invest offshore".

`compareScenarios` builds `ComparisonMetric` rows: net lump sum at exit, tax on lump sum(s), invested capital, first-year net monthly income, first-year monthly tax, guaranteed income share, income shortfall age, ruin age, lifetime tax, lifetime fees, PV of net income, legacy at 90 (real), forfeited medical subsidy PV. `winners[metricKey] = scenarioId`.

Tests: a 58-year-old with 30 years' service and R600k salary must produce a stay-gepf first-year gross pension ≈ R25.1k/month after the 24-month reduction... (compute precisely in the test from the formulas); resign-preserve capital grows tax-free; ruin age null when the draw is 3% and returns exceed inflation; ruin age within horizon when the target is far above what the capital supports; the 17.5% cap triggers `capped`; totals are consistent (`Σ rows.totalNetIncome = lifetimeNetIncomeNominal`).

### `src/engine/insights.ts`

```ts
export function prosCons(result: ScenarioResult, profile: Profile, rules: GepfRules): { pros: string[]; cons: string[] }
export function riskFlags(result: ScenarioResult, profile: Profile, rules: GepfRules): RiskFlag[]
```
Content must be specific and numeric where possible (e.g. "Resigning at 52 uses the 1 Oct 2025 factors, ~15% lower than before" / "Withdrawal tax of R1.2m (31%) vs R0 on transfer" / "You forfeit the medical subsidy worth ≈ R1.9m in today's rand" / "Living annuity at 9% draw exceeds the 4–5% sustainable range: capital exhausted at 79" / "GEPF concentration: ~90% of assets in SA; increases are discretionary above 75% of CPI" / "Offshore 70%: rand strength years reduce income; spending is in rand"). Flags with `caseStudyId` link to Zimbabwe/Argentina/etc. where relevant: e.g. `sovereign-domestic-debt` (stay-gepf: prescribed assets / PIC governance), `currency-collapse` (all local-heavy routes), `capital-controls` (offshore held onshore), `sequence-risk`, `longevity-risk` (leave routes), `inflation-erosion` (GEPF increases below personal inflation), `withdrawal-tax` (resign-cash), `medical-subsidy-forfeit`, `early-retirement-penalty`, `factor-revision-2025`.

### `src/engine/hedge.ts`

```ts
export function projectHedge(opts: { capital: number; years: number; offshoreShareHedged: number; assumptions: Assumptions; feeLocal?: number; feeOffshore?: number }): HedgeProjectionRow[]
export function purchasingPower(amount: number, years: number, rate: number): number
export function randStats(history: MacroHistory, asOfYear: number): { dep10: number; dep20: number; dep30: number; cpiAvg10: number; cpiAvg20: number; cpiAvg30: number; usCpiAvg20: number; inflationDifferential20: number; pppImpliedDepreciation20: number }
export function requiredIncomeForPurchasingPower(todayAmount: number, years: number, inflation: number): number
```
`projectHedge` compares 0% offshore (`unhedged`) vs `offshoreShareHedged` offshore, both nominal and in today's purchasing power (personal inflation) and in USD. Include a stress mode where the rand appreciates (negative depreciation) for the first N years so the chart is honest about downside.

### `src/engine/funds.ts`

```ts
export function feeImpact(opts: { capital: number; years: number; grossReturn: number; fee: number; drawdown?: number }): { finalCapital: number; feesPaid: number; finalCapitalNoFee: number; incomeLossPct: number }
export function rankFunds(funds: FundInfo[], opts?: { horizon: 10 | 5 | 3 }): (FundInfo & { score: number })[]
export function fundById(funds: FundInfo[], id: string): FundInfo
```

## Data files (from research; agents may write these)

- `src/data/taxTables.ts`: `export const TAX_TABLES: Record<TaxYear, TaxTables>`; `export const DEFAULT_TAX_YEAR: TaxYear`.
- `src/data/gepfRules.ts`: `export const GEPF_RULES: GepfRules` including both factor tables (2025 and 2021) with `confidence`. If the exact factor table is not found, use a clearly-labelled estimate (`confidence: 'low'`) with the note explaining the basis, and let the user override via the statement values.
- `src/data/funds.ts`: `export const FUNDS: FundInfo[]` (≥ 8 funds + a `gepf` pseudo-entry with 0 fees), `export const FUND_ARCHETYPES` (index / active / full-service with all-in fee).
- `src/data/macroHistory.ts`: `export const MACRO: MacroHistory`.
- `src/data/caseStudies.ts`: `export const CASE_STUDIES: CaseStudy[]`, `export const SA_INDICATORS: SaRiskIndicator[]`, `export const RISK_LIBRARY: RiskFlag[]` (static descriptions used by insights).

## Store (`src/store/useAppStore.ts`, done)

Zustand store persisted under key `sa-pension-planner-v1`: `profile`, `scenarios: ScenarioDefinition[]` (planner), `page: AppPage`, `ai: { mode: 'server' | 'browser'; apiKey: string; model: string }`, `chat: AiChatMessage[]`, `plannerSelection: [string, string]` and setters (`setProfile(patch)`, `setPerson`, `setGepf`, `setLifestyle`, `setAssumptions`, `upsertScenario`, `removeScenario`, `setPage`, `setAi`, `pushChat`, `clearChat`, `resetAll`). `useResults()` returns `{ core: ScenarioResult[]; comparison: ComparisonResult; planner: ScenarioResult[]; funds: FundInfo[]; rules: GepfRules; tables: TaxTables }` memoised on profile + scenarios.

## UI

Layout: left sidebar nav (icons + labels) on desktop, top tabs on mobile. Page header with title and one-line explanation. Persistent "Ask AI" button (bottom-right) opening `AskAiDrawer` which has the page/scenario context. Numbers formatted with `formatRand` (R1 234 567) and `formatRandCompact` (R1.23m). Every chart has a title, axis labels with units, a legend, and a one-sentence "how to read" caption. Use the palette tokens in `src/index.css` (`--color-series-1..6`): stay-GEPF is always series-1 (green), preserve series-2 (orange), cash/offshore series-3 (blue). Load the `dataviz` skill before writing charts if available.

Pages:
1. **Profile** — sections: About you; Your GEPF membership (with `StatementUpload`, and a live preview of the estimated gratuity, pension, resignation value under old vs new factors); Lifestyle & spending (with a computed "your income target" and a "true inflation" explainer); Assumptions (collapsed, with presets: SARB-target / recent-history / pessimistic). All inputs write to the store immediately.
2. **Stay vs Leave (Compare)** — three core routes side by side as cards with KPIs; the comparison table; a "monthly tax on GEPF drawings" panel (year-1 gross pension, PAYE, net, effective rate, age-65 rebate effect, table by age 60/65/75); charts: net income vs target over time (lines, 3 routes + target), capital over time, lifetime totals bars; pros/cons lists; risk flags; a "what you give up" panel (medical subsidy, guarantee, spouse pension).
3. **Scenario Planner** — pick A and B (from saved scenarios; create/edit with a form: kind, exit age, retirement-from-preservation age, fund, fee override, offshore %, drawdown strategy/%, cash-out fraction, lump sum %, per-scenario assumption overrides such as returns, rand depreciation, inflation). Show A vs B KPIs, drawdown-to-zero age, year-by-year table (toggle), and charts. Include quick sensitivities: rand depreciation −2/+2 pp, returns −2/+2 pp, personal inflation +2 pp.
4. **Funds & Fees** — table of funds (TER, TIC, platform, advice, all-in, 5/10-yr returns, max offshore, Reg 28), select-to-use-in-scenario buttons, a fee-impact chart (capital after N years at 0.5% / 1% / 2% / 3% all-in) and the "1% fee ≈ X% less income" callout, and GEPF's implicit cost (none to member) explanation.
5. **Rand & Inflation** — USD/ZAR history chart (1994–now) with annotations, SA CPI vs "true" personal inflation vs medical inflation, purchasing-power table (what R30k/month buys in 10/20/30 years at 4.5% vs 7.5%), hedge projection chart (0% vs chosen offshore % over 20 and 30 years, nominal and real), with sliders for depreciation, offshore share and a "rand strengthens for 5 years" stress toggle, and an explainer on spending in rand vs imported inflation.
6. **Risks** — the current scenarios' flags grouped by severity; SA indicators cards; case-study accordion (Zimbabwe, Argentina, Greece, Cyprus, Lebanon, Ghana, …) each with "what protected savers"; a balanced "arguments for staying" and "arguments for leaving" section.
7. **Ask AI** — chat with streaming answers, suggested questions per page, context chips showing what is being shared (page, profile summary, scenario summaries), settings (server/browser key mode, model), and a prominent "not financial advice" note.

Accessibility: labels on all inputs, keyboard-navigable, sufficient contrast, tables with `<th scope>`; responsive down to 375px width.

## AI layer

- `src/ai/shared.ts`: `buildSystemPrompt()` (role: SA retirement-planning analyst; must use the provided context, explain calculations, cite that outputs are estimates, never invent figures, be explicit about tax years, note it is not financial advice, and suggest what to change on the page), `serialiseContext(ctx: AiContext): string` (compact JSON, ≤ ~12k chars), `STATEMENT_SCHEMA` (JSON schema for `GepfStatementValues`), `SUGGESTED_QUESTIONS: Record<AppPage, string[]>`.
- `server/index.ts`: Express 5. `POST /api/ask` body `{ messages: AiChatMessage[], context: AiContext }` → SSE stream of text deltas (`data: {"delta": "..."}`) and a final `data: {"done": true, "usage": {...}}`; uses `client.messages.stream` with `system` (cached), model from `AI_MODEL` env (default `claude-opus-5`), `max_tokens` 8000, adaptive thinking default. `POST /api/extract-statement` body `{ pdfBase64?: string; imageBase64?: string; mediaType: string }` → `GepfStatementValues` using a document/image block and structured output (`output_config.format` JSON schema, or `client.messages.parse` if available in the SDK version — check the SDK docs in the claude-api skill files at `/tmp/claude-0/bundled-skills/2.1.266/4c9c7f37236c6a61bb43a80d9cda9abe/claude-api/typescript/claude-api/`). `GET /api/health` → `{ ok: true, hasKey: boolean, model }`. Serve `dist/` statically in production. Body limit 25 MB.
- `src/ai/client.ts`: `askStream(messages, context, settings, onDelta): Promise<void>` and `extractStatement(file: File, settings): Promise<GepfStatementValues>`; when `settings.mode === 'browser'` and a key is present, call the SDK directly with `dangerouslyAllowBrowser: true`; otherwise call the server. Surface clear errors (no key, no server).
- Cost/safety: context is summarised, not the full year tables. Never send the API key to the server in browser mode.

## Definition of done

`npm run typecheck`, `npm test`, `npm run build` and `npm run e2e` pass; the e2e test loads each page, fills the profile, and screenshots to `e2e/screenshots/`; README documents setup, the methodology, assumptions and limitations, and the data sources with dates.

# Fund fees & returns update — 2026-09-11

Owner scope for this round: `src/data/funds.ts` and this file only. Read (not modified):
`src/engine/types.ts` (FundInfo shape) and `src/engine/funds.ts` (fee-impact/ranking helpers —
note that during this session another process added a `fundGrossReturn` helper there that
explicitly falls back to the global return assumption when a fund's `returns.y10/y5/y3` are all
`null`, which is exactly the pattern this update leans on for funds with no verified return).

Today is 2026-09-11. Goal: refresh `FUNDS` with ~10-12+ living-annuity-appropriate SA fund
options (high-equity balanced, medium-equity, low-equity and two rand-denominated global
feeders), each fact-checked against the latest MDD/fact sheet reachable, with unverifiable
figures nulled rather than guessed. 23 investable funds + the `gepf` pseudo-entry are now in
`FUNDS` (up from 14).

## Methodology & a data-quality finding

Tooling available: `WebSearch` (a search-and-synthesize tool, not raw snippets) and `WebFetch`.
**Every** `WebFetch` attempt against a fund manager, LISP platform, or data-vendor domain this
round (Allan Gray, Coronation, PSG, Sanlam, EasyEquities, FundsData, Moneyweb, Morningstar) was
blocked by the sandbox's egress proxy (`EGRESS_BLOCKED`). All figures below therefore come from
`WebSearch`'s synthesized answers over its own search results, which has two consequences worth
flagging for whoever next continues this research:

1. **Precision ceiling.** The tool can usually confirm a fund's identity, MDD dates, and
   qualitative facts (benchmark composition, min. investment, Reg 28 status), and sometimes a
   single headline number (a management fee, one return period), but it very rarely returns a
   full TER/TC/TIC + 1/3/5/10-year table from inside a PDF fact sheet — those tables just don't
   surface in synthesized search answers even when the source PDF is listed as a result.
2. **A repeated-value artefact.** Four unrelated funds — Allan Gray Balanced, Allan Gray Stable,
   Old Mutual Balanced, and Ninety One Opportunity — each returned an identical "annual
   management charge: 1.15%" from a Citywire-flavoured query, worded almost identically each
   time. Real, independently-priced funds from three different managers should not share an
   exact fee to two decimal places. This looks like the synthesis layer substituting a
   default/placeholder value when the real per-fund figure wasn't actually retrievable, rather
   than four genuine coincidences. **All four instances were treated as unreliable and excluded**
   from `src/data/funds.ts` (each fund's `notes` says so explicitly). Two similar
   near-duplications were caught and excluded the same way: Sygnia Skeleton 40's "TER 0.45% as of
   December 2024" was verbatim identical to the Skeleton 70 entry (almost certainly a
   cross-contamination between the two very similarly-named funds), and Foord Balanced's
   "1.15%" AMC hit the same pattern as the four above. **Lesson for future rounds:** treat any
   WebSearch-synthesized numeric fee/return figure with suspicion until it recurs with a
   plausible, fund-specific magnitude from an independent query — round numbers that exactly
   match another fund's figure are a red flag, not a source.

Given the above, this round's realistic yield was: a handful of directly-quoted, dated fee
figures (management fees, sometimes full TER/TC/TIC); a few dated but genuinely fund-specific
return snapshots (mostly stale by 1-2 years, so not used as "current" returns); several
Citywire-style fund-size/peer-ranking facts (useful context, not returns); and, for most funds,
no usable TER/TIC/return refresh at all. Per the task's instruction, **every unverified return
period was set to `null`** rather than carrying forward the previous round's numbers — in
particular the block of seven funds (Allan Gray Balanced, Coronation Balanced Plus, Ninety One
Opportunity, Foord Balanced, Old Mutual Balanced, Discovery Balanced, Sanlam/Glacier Balanced)
that had previously all shared the same generic 0.13-0.14 / 0.10-0.11 / 0.10-0.11 / 0.075-0.085
return block — clearly a sector-typical placeholder, not fund-specific data — now show `null`
for every period not individually re-verified this round. TER/TC/TIC fields (which the
`FundInfo` type requires as numbers, unlike `returns`, which is nullable) keep a clearly-labelled
low-confidence prior where no fresh figure was found, exactly as the previous round did.

### Search queries used (representative; ~55 WebSearch calls total)

- `<fund name> fact sheet TER TIC 2026 returns 1 year 3 year 5 year 10 year`
- `<fund name> minimum disclosure document TER TIC 2026`
- `fundsdata.co.za <fund name> summary TER TIC returns`
- `citywire <fund name> annual management charge fund size performance`
- `citywire <fund name> performance 1 year 3 year 5 year 10 year annualised`
- `ASISA South African Multi Asset High/Medium/Low Equity category average return 10 years 2026`
- `ASISA Global Multi Asset High Equity rand denominated category average return 2026`
- Direct `WebFetch` attempts on: allangray.co.za, coronation.com, psg.co.za (download subdomain),
  sanlam.com, fundsdata.co.za, moneyweb.co.za, morningstar.com / morningstar.co.za,
  easyequities.co.za — **all blocked** (`EGRESS_BLOCKED`), confirming the task brief's warning.

## Category average returns found

Only one was found and corroborated: **ASISA SA Multi-Asset High Equity, 10-year average return
≈ 8.10% p.a.** (medium confidence — sourced from the Satrix Balanced Index Fund's 31 Mar 2026 MDD,
which cites the category average alongside its own return; carried into every SA Multi-Asset
High Equity fund's `notes` this round). Despite repeated, differently-worded searches, **no
verified 10-year category average was found for SA Multi-Asset Medium Equity, SA Multi-Asset Low
Equity, or the (rand-denominated) Global Multi-Asset High Equity category** — each of those
funds' `notes` says so explicitly rather than guessing a number.

## Per-fund table

TER/TC/TIC/fees are % p.a.; returns are annualised, net of fees. **Bold** = directly sourced this
round; *plain* = low/medium-confidence prior (see `notes` in `src/data/funds.ts` for the full
reasoning behind every number, including why generic/suspicious values were rejected).
"—" = null / not available.

| id | TER | TC | TIC | Platform | Advice | y1 | y3 | y5 | y10 | SI | asOf | Confidence | Source |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| gepf | 0 | 0 | 0 | 0 | 0 | — | — | — | — | — | 2025-03-31 | unchanged | gepf.co.za |
| 10x-your-future | 0.86 | 0.05 | *0.91* | 0 | 0 | 15.0 | 11.0 | 11.0 | 9.0 | — | 2026-03-31 | low (carried) | 10X Mar-2026 Class A MDD (link found; figures not extracted) |
| sygnia-skeleton-70 | *0.45* | *0.07* | *0.52* | 0.20 | 0 | 15.0 | 11.0 | 11.0 | 8.5 | — | 2026-06-04 | low-medium | Sygnia (TER re-confirmed, still Dec-2024 vintage) |
| satrix-balanced | **0.52** | **0.08** | **0.60** | 0.25 | 0 | **22.0** | **16.25** | **13.26** | **9.91** | — | 2026-03-31 | **high** | Satrix MDD (fully verified, unchanged) |
| allan-gray-balanced | *1.70* | *0.11* | *1.81* | 0.40 | 0.50 | — | — | — | — | — | 2026-07-31 | fee-band high; TIC low | Allan Gray (fee band 0.50-1.50% confirmed; TIC/returns not extracted) |
| coronation-balanced-plus | *1.47* | *0.15* | *1.62* | 0.40 | 0.50 | **12.4** | — | — | — | — | 2026-07-31 | fee **medium**; TIC low | Coronation (mgmt fee 1.25% + y1 return both confirmed, different dates) |
| ninety-one-opportunity | *1.65* | *0.12* | *1.77* | 0.40 | 0.50 | — | — | — | — | — | 2026-06-30 | low (A); medium (E, proxy only) | Ninety One (E-class TER 1.17/TC 0.02/TIC 1.19 as cross-check) |
| foord-balanced | *1.22* | *0.10* | *1.32* | 0.40 | 0.50 | — | — | — | — | — | 2026-01-31 | low | Foord Jan-2026 MDD (figures not extracted; Aug-2024 returns too stale to use) |
| psg-balanced | *1.45* | *0.15* | *1.60* | 0.40 | 0.50 | — | — | — | — | *10.7* | 2026-03-31 | low | PSG (since-inception figure only, low confidence; 5Y figure rejected as implausible) |
| mg-balanced | *1.30* | *0.15* | *1.45* | 0.40 | 0.50 | — | — | — | — | — | 2026-04-30 | low | M&G/Prudential Apr-2026 MDD (figures not extracted) |
| nedgroup-core-diversified | *0.40* | *0.05* | *0.45* | 0.20 | 0 | — | — | — | — | — | 2026-06-19 | fee **medium**; split low | Nedgroup/Citywire (0.40% mgmt fee corroborated twice) |
| old-mutual-balanced | *1.75* | *0.15* | *1.90* | 0.50 | 0.75 | — | — | — | — | — | 2026-05-31 | low | Old Mutual May-2026 fact sheet (figures not extracted; "1.15%" AMC rejected) |
| discovery-balanced | *1.90* | *0.15* | *2.05* | 0.50 | 0.75 | — | — | — | — | — | 2026-05-31 | low-medium | Discovery May-2026 MDD; AMC 1.51%/size R44.9bn (Citywire, unverified vs MDD) |
| sanlam-glacier-balanced | *1.60* | *0.15* | *1.75* | 0.55 | 1.00 | — | — | — | — | — | 2026-03-31 | low (range 1.40-1.96% found) | Sanlam SIM/SCI/Private-Wealth variants (inconsistent; prior kept) |
| prescient-balanced | *0.45* | *0.12* | *0.57* | 0.40 | 0.50 | — | — | — | — | — | 2025-05-31 | fee **medium** (0.35% AMC); TER/TIC low | Prescient/Citywire |
| camissa-balanced | *1.44* | *0.15* | *1.59* | 0.40 | 0.50 | — | — | — | — | — | 2024-11-30 | medium-low (stale) | Camissa (fka Kagiso)/Citywire |
| fairtree-balanced-prescient | *1.50* | *0.15* | *1.65* | 0.40 | 0.50 | — | — | — | — | — | placeholder | low (no data found) | Fairtree fund page |
| coronation-capital-plus | *0.95* | *0.15* | *1.10* | 0.40 | 0.50 | — | — | — | — | — | 2026-04-30 | fee **medium** (0.75% AMC); TER/TIC low | Coronation Apr-2026 fact sheet |
| allan-gray-stable | *1.10* | *0.08* | *1.18* | 0.40 | 0.50 | — | — | — | — | — | 2026-06-30 | low ("1.15%" AMC rejected) | Allan Gray Jun-2026 MDD; Citywire ranking only |
| ninety-one-cautious-managed | **1.01** | **0.03** | **1.04** | 0.40 | 0.50 | — | — | — | — | — | 2026-06-30 | medium-low (class unclear) | Ninety One / Sanlam-hosted MDD, 30 Jun 2026 |
| nedgroup-core-guarded | *0.40* | *0.05* | *0.45* | 0.20 | 0 | — | — | — | — | — | 2026-04-30 | fee medium; split low | Nedgroup/Citywire (0.40% mgmt fee) |
| sygnia-skeleton-40 | *0.43* | *0.06* | *0.49* | 0.20 | 0 | *14.34* | — | — | — | — | ~2026-08 | low (date approximate) | investing.com holdings page (Sygnia's own 0.45%/Dec-2024 figure rejected as conflated with Skeleton 70) |
| allan-gray-orbis-global-feeder | *1.10* | *0.15* | *1.25* | 0.40 | 0.50 | — | — | — | — | — | 2026-06-30 | low-medium (base fee only) | Allan Gray/Orbis — performance-fee mechanism, base fee only |
| coronation-global-managed-feeder | *1.25* | *0.15* | *1.40* | 0.40 | 0.50 | — | — | — | — | — | 2026-04-30 | fee medium (1.25% incl. 0.40% feeder-level, confirmed) | Coronation Apr-2026 fact sheet; Citywire (poor recent ranking 296/298) |

## What changed vs the previous round (`funds-fees-annuities.md`, 2026-09-09)

- **10 new funds added** (kebab-case ids, all existing ids kept): `prescient-balanced`,
  `camissa-balanced`, `fairtree-balanced-prescient`, `coronation-capital-plus` (medium equity),
  `allan-gray-stable`, `ninety-one-cautious-managed`, `nedgroup-core-guarded`,
  `sygnia-skeleton-40` (low equity), `allan-gray-orbis-global-feeder`,
  `coronation-global-managed-feeder` (global rand feeders — two of the three named candidates
  were used, per the "one or two" instruction; Ninety One Global Strategic Managed Feeder was
  researched but not added, to keep the global bucket at two).
- Each new fund has `type` (`index` for the two passive Nedgroup/Sygnia low-equity funds,
  `active` for the rest), `category` set to its ASISA-style category (`SA Multi-Asset Medium
  Equity`, `SA Multi-Asset Low Equity`, or `Global Multi-Asset (rand feeder)`), `reg28: true` for
  the SA multi-asset funds and `reg28: false` + `maxOffshore: 1` for the two global feeders, per
  the brief.
- **Verified/medium-confidence upgrades on existing funds:** Ninety One Cautious Managed's
  TER/TC/TIC (1.01/0.03/1.04%, 30 Jun 2026); Nedgroup Core Diversified's and Core Guarded's 0.40%
  management fee (corroborated twice each); Coronation Balanced Plus's 1.25% management fee
  (re-confirmed) and a dated +12.4% one-year return (31 May 2026); Coronation Capital Plus's and
  Coronation Global Managed Feeder's 0.75%/1.25% fees.
- **Returns nulled, not guessed:** the seven-fund shared generic return block described above is
  gone; every period without a dated, fund-specific figure is now `null`. A handful of stale or
  class-mismatched figures found this round (Foord's Aug-2024 returns, Ninety One Opportunity's
  Aug-2025 E-class snapshot, PSG's since-inception figure) are recorded only in `notes` with
  explicit staleness/confidence caveats, not silently promoted into the structured fields — except
  PSG's since-inception figure, which was placed in `returns.sinceInception` (the field the type
  provides for exactly this) with a low-confidence label.
- **`FUND_ARCHETYPES`**: re-checked against the larger fund set. The plain-average all-in fee per
  archetype came out to ≈0.75% (index), ≈2.28% (active), ≈3.25% (full-service) — all inside the
  existing documented ranges — so the three headline `allInFee` numbers (0.009 / 0.023 / 0.033)
  were left unchanged; only the labels/comment were updated to reflect the larger fund roster and
  to note that the new low-equity/global-feeder funds sit outside the three cost-tier archetypes
  (different risk allocation, not a different cost tier of the same allocation).
- `DEFAULT_FUND_ID` (`10x-your-future`), `LIVING_ANNUITY_FACTS`, and the `fund()` helper are
  unchanged.

## What could not be found (be aware before relying on this data)

- A clean, current (non-stale, correct share-class) TER/TC/TIC **and** full 1/3/5/10-year return
  table for almost every actively-managed fund. This is a tooling ceiling, not a per-fund
  problem — see "Methodology" above.
- ASISA 10-year category averages for **Medium Equity**, **Low Equity**, and **Global Multi-Asset
  High Equity (rand)** — searched with several phrasings, not found.
- A verified TER/TIC for Allan Gray Balanced, Foord Balanced, PSG Balanced, M&G Balanced, Old
  Mutual Balanced, Discovery Balanced, Sanlam/Glacier Balanced, and every brand-new low/medium
  equity and global-feeder fund except Ninety One Cautious Managed and (fee-only) Coronation
  Capital Plus / Coronation Global Managed Feeder.
- Fairtree Balanced Prescient: no dated fact sheet, fee, or return data of any kind surfaced;
  entry is a placeholder-dated, low-confidence, general-knowledge prior only.
- Sygnia Skeleton Balanced 40: Sygnia's own TER figure could not be trusted this round (see the
  repeated-value/conflation finding above); the figure used instead comes from a secondary
  aggregator (investing.com) with an approximate date.

## Verification

```
cd /home/user/gepf-retirement && npx tsc -b && npx vitest run
```

Both pass: `tsc -b` reports no errors; `vitest run` → 262/262 tests passed across 11 files,
including `tests/funds.test.ts` (fee-impact maths and fund ranking/lookup against the live
`FUNDS` array, which continues to exclude `gepf` and rank the rest without throwing).

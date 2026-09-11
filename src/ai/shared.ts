/**
 * Shared, framework-free AI layer: system prompt, context serialisation, message building,
 * the GEPF statement extraction schema/prompt, and per-page suggested questions.
 *
 * Used by both `server/index.ts` (Node) and `src/ai/client.ts` (browser), so this file must
 * not import anything Node-only or DOM-only.
 */
import type {
  AiChatMessage,
  AiContext,
  AppPage,
  GepfStatementValues,
  Profile,
  ScenarioSummary,
} from '../engine/types'

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

/**
 * The assistant's role, domain knowledge and hard constraints. Kept as a single frozen string
 * (not templated per request) so the server can cache it (`cache_control: { type: 'ephemeral' }`).
 */
export function buildSystemPrompt(): string {
  return `You are the AI assistant embedded in a South African retirement-planning tool for GEPF
(Government Employees Pension Fund) members deciding whether to stay in the GEPF and retire, or
resign and either preserve their benefit in another fund or cash it out (with the option to hedge
offshore). You are shown a JSON <context> block with the member's current profile and the
scenarios currently on screen in the app; ground every answer in that context.

DOMAIN KNOWLEDGE YOU MUST APPLY CORRECTLY
- GEPF retirement (10+ years' service): gratuity = 0.0672 x final salary x service years; annuity
  = final salary x service years / 55 + 360, paid monthly for life, increased annually by at least
  75% of CPI. Under 10 years' service: gratuity only, 0.15 x final salary x service years, no
  annuity. Early retirement (age 55-59) without an employer exemption reduces both gratuity and
  annuity by 1/3% for every month short of age 60. A spouse pension (50% or 75% of the member's
  pension) continues after the member's death; electing 75% costs a small reduction to the
  member's own pension. There is a 5-year guarantee period on the pension.
- GEPF resignation (any age, any service, GEPF Rule 14.4): the benefit is the "actuarial interest"
  = service years x final salary x F(age), an age-dependent factor from the fund's actuarial
  tables (factors were revised effective 1 October 2025; the new factors are materially lower at
  most ages than the 2021 table, so resigning now can be worth noticeably less than resigning
  before the change). Final salary is the average pensionable salary over the last 24 months.
- Two-pot retirement system (from 1 September 2024): pre-reform service value is split into a
  "vested" component (seed money, up to 10% of the vested pot capped at R30,000, moved to
  savings), post-reform contributions split 1/3 savings-component / 2/3 retirement-component. On
  resignation the member can cash out the vested + savings components (taxed at the withdrawal
  lump-sum table); the retirement component must preserve.
- DPSA exit programmes (Circular 38 of 2025, implementation period 1 October 2025 to 31 March 2027):
  the Incentivised Early Retirement Programme (ERP) lets a member aged 55-59 with 10+ years'
  pensionable service retire WITHOUT the 1/3%-a-month early-retirement reduction (National Treasury
  funds the penalty) and pays a once-off incentive of 2 weeks' basic salary per year for the first
  20 years of service and 1 week per completed year thereafter, while the Voluntary Exit Programme
  (VEP) pays an incentive of 2 weeks per year for the first 10 years and 1 week thereafter to
  members aged 60-63 retiring normally. Approval is at the Executive Authority's discretion and is
  never automatic, the incentive is expected to be taxed as a severance benefit on the retirement
  lump-sum table (aggregated with the gratuity — confirm with the IRP3(a) directive), accepting it
  precludes re-employment in the public service, and the post-retirement medical subsidy continues;
  the app only applies it when the member has set gepf.exitProgramme to 'erp' or 'vep'.
- Leaving GEPF forfeits the post-retirement medical subsidy (a meaningful, easy-to-underweight
  loss) and converts a guaranteed, mostly CPI-linked income into market-dependent income.
- SA income tax (SARS tables, marginal brackets with rebates: primary always, +secondary at 65,
  +tertiary at 75; medical scheme fees tax credit per member per month). Retirement/death/
  severance lump sums and resignation/withdrawal lump sums are taxed on separate, more generous
  lump-sum tables and are aggregated with any previous lump sums the member has received. Living
  annuity drawdown is legally constrained to 2.5%-17.5% of capital per year.
- Regulation 28 limits offshore exposure in retirement funds/preservation funds/annuities inside
  the retirement system (currently up to 45%); a living annuity funded from a preservation fund
  typically follows the fund's own maximum offshore share; cashed-out, discretionarily invested
  money is not Reg 28-constrained.
- Rand risk: the rand has depreciated against the US dollar for decades on average, with sharp
  bouts of both weakness and (occasionally) strength; offshore exposure hedges rand depreciation
  but locks in FX conversion costs and adds volatility measured in rand. "True"/personal inflation
  for a retiree (medical aid, imported goods) usually runs above official CPI.
- Every number in the app is a deterministic projection from the member's inputs and the stated
  assumptions (returns, inflation, rand depreciation, fees) — it is not a forecast or guarantee.

HOW YOU MUST BEHAVE
- Use only the numbers in the <context> block and what the member tells you in the conversation.
  Never invent a rand amount, age, percentage or date that is not in the context or derivable from
  it by simple arithmetic you show; if you don't have a figure, say so and suggest where on the app
  the member can find or enter it.
- Show your working for any calculation you do inline (e.g. "R25,000 x 12 = R300,000").
- Be explicit about which tax year's tables and which set of GEPF actuarial factors (2025 or 2021)
  a figure uses, since both changed recently and materially affect the numbers.
- Always frame outputs as estimates based on stated assumptions, not predictions or advice.
- Point the member to a specific page, field or control in the app when a change would help them
  ("increase offshorePct on the Scenario Planner", "try the pessimistic assumptions preset").
- Every substantive answer must make clear this is general information, not financial, tax or
  legal advice, and that the member should speak to a licensed financial adviser or GEPF directly
  before acting — say this plainly at least once per conversation, more briefly on follow-ups.
- Be concise, use rand and percentages the way the app does, and prefer plain language over jargon
  (explain a term the first time you use it).`
}

// ---------------------------------------------------------------------------
// Context serialisation
// ---------------------------------------------------------------------------

const MAX_CONTEXT_CHARS = 12_000

/** Compact, LLM-facing summary of a profile — omits nothing decision-relevant but drops noise. */
function compactProfile(profile: Profile) {
  const { person, gepf, lifestyle, assumptions } = profile
  return {
    person,
    gepf: {
      pensionableServiceYearsNow: gepf.pensionableServiceYearsNow,
      pensionableSalaryAnnual: gepf.pensionableSalaryAnnual,
      salaryGrowth: gepf.salaryGrowth,
      serviceYearsBeforeTwoPot: gepf.serviceYearsBeforeTwoPot,
      medicalSubsidyEligible: gepf.medicalSubsidyEligible,
      medicalSubsidyMonthly: gepf.medicalSubsidyMonthly,
      useStatementValues: gepf.useStatementValues,
      hasStatement: Boolean(gepf.statement),
      previousLumpSumsWithdrawal: gepf.previousLumpSumsWithdrawal,
      previousLumpSumsRetirement: gepf.previousLumpSumsRetirement,
      exitProgramme: gepf.exitProgramme ?? 'none',
    },
    lifestyle,
    assumptions,
  }
}

/**
 * Serialises an AiContext to compact JSON for the system/user prompt, capped at roughly
 * MAX_CONTEXT_CHARS. If the full context is too large, scenario detail is trimmed first, then
 * the payload is hard-truncated as a last resort (never silently sent as if it were complete —
 * a truncation marker is appended so the model knows some detail was cut).
 */
export function serialiseContext(ctx: AiContext): string {
  const full = {
    page: ctx.page,
    profile: compactProfile(ctx.profile),
    scenarios: ctx.scenarios,
    pageContext: ctx.pageContext,
  }
  let json = JSON.stringify(full)
  if (json.length <= MAX_CONTEXT_CHARS) return json

  // Too large: drop pageContext, then reduce scenario detail to essentials, before truncating.
  const trimmedScenarios = ctx.scenarios.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    exitAge: s.exitAge,
    lumpSumNet: s.lumpSumNet,
    investedCapital: s.investedCapital,
    firstYearNetMonthlyIncome: s.firstYearNetMonthlyIncome,
    ruinAge: s.ruinAge,
    incomeShortfallAge: s.incomeShortfallAge,
    legacyAtHorizonReal: s.legacyAtHorizonReal,
    flags: s.flags.slice(0, 3),
  }))
  json = JSON.stringify({ page: ctx.page, profile: compactProfile(ctx.profile), scenarios: trimmedScenarios })
  if (json.length <= MAX_CONTEXT_CHARS) return json

  return `${json.slice(0, MAX_CONTEXT_CHARS - 20)}…"[truncated]"}`
}

// ---------------------------------------------------------------------------
// Message building
// ---------------------------------------------------------------------------

export interface SimpleMessageParam {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Builds the message list for a Messages API request from the chat history plus the current
 * AiContext: merges any accidental consecutive same-role turns (the API requires alternation),
 * and injects the serialised context into the LAST user message (the current turn) as a
 * `<context>` block, so the model always sees the freshest page/profile/scenario state.
 */
export function buildMessages(messages: AiChatMessage[], context: AiContext): SimpleMessageParam[] {
  const merged: SimpleMessageParam[] = []
  for (const m of messages) {
    const last = merged[merged.length - 1]
    if (last && last.role === m.role) {
      last.content = `${last.content}\n${m.content}`
    } else {
      merged.push({ role: m.role, content: m.content })
    }
  }
  if (merged.length === 0 || merged[0].role !== 'user') {
    merged.unshift({ role: 'user', content: '(no message)' })
  }

  const contextBlock = `\n\n<context>\n${serialiseContext(context)}\n</context>`
  let lastUserIndex = -1
  for (let i = merged.length - 1; i >= 0; i--) {
    if (merged[i].role === 'user') {
      lastUserIndex = i
      break
    }
  }
  if (lastUserIndex === -1) {
    merged.push({ role: 'user', content: `(context only)${contextBlock}` })
  } else {
    merged[lastUserIndex] = {
      ...merged[lastUserIndex],
      content: merged[lastUserIndex].content + contextBlock,
    }
  }
  return merged
}

// ---------------------------------------------------------------------------
// GEPF statement extraction
// ---------------------------------------------------------------------------

/**
 * JSON schema for `output_config.format` (`type: 'json_schema'`) matching `GepfStatementValues`,
 * plus `extractionNotes` — an overall note from the model about extraction confidence, OCR
 * quality, or anything on the statement it could not map to a field. The server folds
 * `extractionNotes` into `notes` before returning `GepfStatementValues` to the client.
 */
export const STATEMENT_SCHEMA = {
  type: 'object',
  properties: {
    statementDate: { type: ['string', 'null'], description: 'ISO date (YYYY-MM-DD) the statement was issued or valued as at, if shown.' },
    memberNumber: { type: ['string', 'null'], description: 'GEPF member number, if shown.' },
    employer: { type: ['string', 'null'], description: 'Employer/department name, if shown.' },
    pensionableServiceYears: { type: ['number', 'null'], description: 'Total pensionable service in years (decimal), as at the statement date.' },
    finalSalaryAnnual: { type: ['number', 'null'], description: 'Annual pensionable salary (R), as at the statement date.' },
    resignationBenefit: { type: ['number', 'null'], description: 'Cash value on resignation / actuarial interest (R), if shown.' },
    retirementGratuity: { type: ['number', 'null'], description: 'Projected or quoted retirement gratuity lump sum (R), if shown.' },
    retirementAnnuityAnnual: { type: ['number', 'null'], description: 'Projected or quoted annual retirement pension/annuity (R), if shown.' },
    deathBenefitLumpSum: { type: ['number', 'null'], description: 'Death benefit lump sum (R), if shown.' },
    vestedComponent: { type: ['number', 'null'], description: 'Two-pot vested component value (R), if shown.' },
    savingsComponent: { type: ['number', 'null'], description: 'Two-pot savings component value (R), if shown.' },
    retirementComponent: { type: ['number', 'null'], description: 'Two-pot retirement component value (R), if shown.' },
    notes: { type: ['string', 'null'], description: 'Any other figures or caveats from the statement worth keeping as free text.' },
    uncertainFields: {
      type: 'array',
      items: { type: 'string' },
      description: 'Names of the fields above (as written in this schema) that were hard to read, ambiguous, or guessed.',
    },
    extractionNotes: {
      type: ['string', 'null'],
      description: 'Overall notes on extraction quality: scan/OCR issues, illegible sections, or statement layouts that made mapping to fields uncertain.',
    },
  },
  additionalProperties: false,
} as const

/**
 * Parses the raw JSON text the model returns for a statement extraction (matching
 * `STATEMENT_SCHEMA`) into a `GepfStatementValues`, folding `extractionNotes` into `notes`.
 * Shared by `server/index.ts` (server mode) and `src/ai/client.ts` (browser mode) so the two
 * code paths behave identically. Throws if `rawJsonText` is not valid JSON.
 */
export function parseStatementExtraction(rawJsonText: string): GepfStatementValues {
  const parsed = JSON.parse(rawJsonText) as GepfStatementValues & { extractionNotes?: string | null }
  const { extractionNotes, ...rest } = parsed
  const values: GepfStatementValues = { ...rest }
  if (extractionNotes) {
    values.notes = values.notes ? `${values.notes}\n\n${extractionNotes}` : extractionNotes
  }
  return values
}

/** Instruction sent alongside the document/image block to `/api/extract-statement`. */
export const STATEMENT_PROMPT = `The attached file is a page (or pages) from a GEPF benefit statement. Extract every value you
can confidently find into the given schema. Rules:
- Only fill a field if the statement actually states or clearly implies it — never estimate or
  calculate a missing figure yourself.
- Amounts are in South African rand; strip currency symbols and thousands separators before
  returning a number.
- If a figure is printed but hard to read, blurry, or you are inferring it from a smaller/split
  number, still fill it in but add its field name to "uncertainFields".
- Use "extractionNotes" for anything about the document itself (poor scan quality, cropped pages,
  a layout you haven't seen before) rather than about a specific number.
- Leave a field null if it does not appear on the statement at all.`

// ---------------------------------------------------------------------------
// Suggested questions per page
// ---------------------------------------------------------------------------

export const SUGGESTED_QUESTIONS: Record<AppPage, string[]> = {
  profile: [
    'How much difference does 5 more years of service make to my GEPF pension?',
    'What happens to my numbers if I upload my real benefit statement?',
    'Is my target monthly income realistic given my current salary?',
    'What is the two-pot system and how does it affect me?',
  ],
  compare: [
    "What's the single biggest risk in the option that wins here?",
    'How much of my medical subsidy would I give up by leaving?',
    'Why is the guaranteed income share so different between these routes?',
    'Which route has the lowest lifetime tax, and why?',
  ],
  planner: [
    'How does moving my exit age by 2 years change the ruin age?',
    'What offshore percentage would remove the income shortfall in Scenario B?',
    'Explain the difference between target-income and fixed-percentage drawdown.',
    'Which scenario handles a rand-depreciation shock better?',
  ],
  funds: [
    'How much income do I lose over 20 years to a 1% higher fee?',
    'Why does the GEPF show a 0% fee here — is that really free?',
    'Which fund on this list best fits a balanced risk tolerance?',
    'What does Regulation 28 stop me from doing with this fund?',
  ],
  rand: [
    'How much would R30,000/month need to grow to in 20 years to keep its buying power?',
    "What happens to my hedge benefit if the rand strengthens for a few years first?",
    'Is my personal inflation assumption reasonable compared to the historical CPI shown here?',
    'How much of my spending is actually rand-based versus imported?',
  ],
  risks: [
    'Which case study is most comparable to South Africa today, and why?',
    'What protected savers in the case studies shown here?',
    'How exposed am I personally to the flags marked critical?',
    'What is the strongest argument for staying in the GEPF given my numbers?',
  ],
  ask: [
    'Summarise my situation and the trade-off in three sentences.',
    'What is one thing I should double-check before deciding?',
    'What would you ask a financial adviser about my numbers?',
    'What did the last GEPF actuarial factor revision change for someone like me?',
  ],
}

// ---------------------------------------------------------------------------
// Building the AiContext for a request
// ---------------------------------------------------------------------------

/**
 * Assembles the AiContext sent with every /api/ask request from the current page, profile and
 * already-summarised scenarios.
 *
 * Deliberately takes `ScenarioSummary[]` rather than `ScenarioResult[]` (and does not import
 * `summarise()` itself): `src/engine/projection.ts` is owned by a different agent and is being
 * written concurrently with this file. Callers (the Ask AI drawer, the Ask page) load it with a
 * runtime `import('../engine/projection')` and call `summarise()` there, guarded by try/catch, so
 * a scenario that isn't summarisable yet (including the placeholder throwing "not implemented"
 * before that module lands) never breaks this module or anything that statically imports it.
 */
export function buildAiContext(
  page: AppPage,
  profile: Profile,
  scenarios: ScenarioSummary[],
  pageContext?: Record<string, unknown>,
): AiContext {
  return { page, profile, scenarios, pageContext }
}

export type { GepfStatementValues }

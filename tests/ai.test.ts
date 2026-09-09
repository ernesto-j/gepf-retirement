import { describe, expect, it } from 'vitest'
import {
  buildAiContext,
  buildMessages,
  buildSystemPrompt,
  parseStatementExtraction,
  serialiseContext,
  STATEMENT_SCHEMA,
  SUGGESTED_QUESTIONS,
} from '../src/ai/shared'
import { SseParser } from '../src/ai/client'
import { DEFAULT_PROFILE } from '../src/data/defaults'
import type { AiChatMessage, AppPage, ScenarioSummary } from '../src/engine/types'

const APP_PAGES: AppPage[] = ['profile', 'compare', 'planner', 'funds', 'rand', 'risks', 'ask']

const SCENARIO: ScenarioSummary = {
  id: 'stay',
  name: 'Stay: retire from GEPF',
  kind: 'stay-gepf',
  exitAge: 60,
  fundId: 'gepf',
  offshorePct: 0,
  lumpSumNet: 1_100_000,
  lumpSumTax: 90_000,
  investedCapital: 1_100_000,
  firstYearNetMonthlyIncome: 25_000,
  firstYearMonthlyTax: 3_500,
  ruinAge: null,
  incomeShortfallAge: null,
  legacyAtHorizonReal: 800_000,
  pvNetIncome: 4_500_000,
  flags: ['inflation-erosion'],
}

describe('buildSystemPrompt', () => {
  it('states the role, the "not financial advice" constraint and never-invent-figures rule', () => {
    const prompt = buildSystemPrompt()
    expect(prompt.length).toBeGreaterThan(200)
    expect(prompt).toMatch(/not financial(?:,| )/i)
    expect(prompt.toLowerCase()).toContain('never invent')
    expect(prompt.toLowerCase()).toContain('gepf')
    expect(prompt.toLowerCase()).toContain('tax year')
  })

  it('is stable across calls (safe to cache)', () => {
    expect(buildSystemPrompt()).toBe(buildSystemPrompt())
  })
})

describe('serialiseContext', () => {
  it('produces parseable JSON containing the page and scenario data', () => {
    const ctx = buildAiContext('compare', DEFAULT_PROFILE, [SCENARIO])
    const json = serialiseContext(ctx)
    const parsed = JSON.parse(json)
    expect(parsed.page).toBe('compare')
    expect(parsed.scenarios[0].id).toBe('stay')
    expect(parsed.profile.person.currentAge).toBe(DEFAULT_PROFILE.person.currentAge)
  })

  it('never exceeds roughly 12k characters, even with many large scenarios', () => {
    const manyScenarios: ScenarioSummary[] = Array.from({ length: 200 }, (_, i) => ({
      ...SCENARIO,
      id: `scenario-${i}`,
      name: `Scenario number ${i} with a fairly long descriptive name for padding`,
      flags: ['inflation-erosion', 'sequence-risk', 'withdrawal-tax', 'longevity-risk', 'currency-collapse'],
    }))
    const ctx = buildAiContext('planner', DEFAULT_PROFILE, manyScenarios, { note: 'x'.repeat(5000) })
    const json = serialiseContext(ctx)
    expect(json.length).toBeLessThanOrEqual(12_000)
  })
})

describe('buildMessages', () => {
  it('injects a <context> block into the last user message', () => {
    const history: AiChatMessage[] = [{ role: 'user', content: 'How much tax will I pay?' }]
    const ctx = buildAiContext('compare', DEFAULT_PROFILE, [SCENARIO])
    const messages = buildMessages(history, ctx)
    const last = messages[messages.length - 1]
    expect(last.role).toBe('user')
    expect(last.content).toContain('How much tax will I pay?')
    expect(last.content).toContain('<context>')
    expect(last.content).toContain('</context>')
    expect(last.content).toContain('"compare"')
  })

  it('merges consecutive same-role turns so roles alternate', () => {
    const history: AiChatMessage[] = [
      { role: 'user', content: 'Hi' },
      { role: 'user', content: 'Actually, ignore that.' },
      { role: 'assistant', content: 'Sure.' },
      { role: 'assistant', content: 'What would you like to know?' },
      { role: 'user', content: 'What is my ruin age?' },
    ]
    const ctx = buildAiContext('planner', DEFAULT_PROFILE, [])
    const messages = buildMessages(history, ctx)
    for (let i = 1; i < messages.length; i++) {
      expect(messages[i].role).not.toBe(messages[i - 1].role)
    }
    expect(messages[0].content).toBe('Hi\nActually, ignore that.')
  })

  it('injects context even when the history has no user message', () => {
    const ctx = buildAiContext('funds', DEFAULT_PROFILE, [])
    const messages = buildMessages([], ctx)
    expect(messages.length).toBeGreaterThan(0)
    expect(messages[messages.length - 1].role).toBe('user')
    expect(messages[messages.length - 1].content).toContain('<context>')
  })
})

describe('buildAiContext', () => {
  it('assembles page, profile and scenarios as given, passing pageContext through', () => {
    const ctx = buildAiContext('risks', DEFAULT_PROFILE, [SCENARIO], { selectedFundId: 'gepf' })
    expect(ctx.page).toBe('risks')
    expect(ctx.profile).toBe(DEFAULT_PROFILE)
    expect(ctx.scenarios).toEqual([SCENARIO])
    expect(ctx.pageContext).toEqual({ selectedFundId: 'gepf' })
  })
})

describe('STATEMENT_SCHEMA', () => {
  it('is a JSON object schema matching GepfStatementValues plus extractionNotes', () => {
    expect(STATEMENT_SCHEMA.type).toBe('object')
    expect(STATEMENT_SCHEMA.additionalProperties).toBe(false)
    const props = Object.keys(STATEMENT_SCHEMA.properties)
    for (const key of [
      'statementDate',
      'memberNumber',
      'employer',
      'pensionableServiceYears',
      'finalSalaryAnnual',
      'resignationBenefit',
      'retirementGratuity',
      'retirementAnnuityAnnual',
      'deathBenefitLumpSum',
      'vestedComponent',
      'savingsComponent',
      'retirementComponent',
      'notes',
      'uncertainFields',
      'extractionNotes',
    ]) {
      expect(props).toContain(key)
    }
  })
})

describe('parseStatementExtraction', () => {
  it('folds extractionNotes into notes', () => {
    const raw = JSON.stringify({
      finalSalaryAnnual: 720_000,
      notes: 'Statement covers March 2025.',
      extractionNotes: 'Second page was slightly blurry.',
    })
    const values = parseStatementExtraction(raw)
    expect(values.finalSalaryAnnual).toBe(720_000)
    expect(values.notes).toContain('Statement covers March 2025.')
    expect(values.notes).toContain('Second page was slightly blurry.')
    expect('extractionNotes' in values).toBe(false)
  })

  it('leaves notes untouched when there is no extractionNotes', () => {
    const raw = JSON.stringify({ finalSalaryAnnual: 500_000 })
    const values = parseStatementExtraction(raw)
    expect(values.notes).toBeUndefined()
  })

  it('throws on invalid JSON', () => {
    expect(() => parseStatementExtraction('{not json')).toThrow()
  })
})

describe('SUGGESTED_QUESTIONS', () => {
  it('has at least two questions for every app page', () => {
    for (const page of APP_PAGES) {
      expect(SUGGESTED_QUESTIONS[page]?.length).toBeGreaterThanOrEqual(2)
      for (const q of SUGGESTED_QUESTIONS[page]) {
        expect(typeof q).toBe('string')
        expect(q.length).toBeGreaterThan(5)
      }
    }
  })
})

describe('SseParser', () => {
  const events = [{ delta: 'Hello' }, { delta: ' world' }, { done: true, usage: { output_tokens: 12 } }]
  function sseText(): string {
    return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
  }

  it('parses a full SSE payload delivered in one chunk', () => {
    const parser = new SseParser()
    expect(parser.push(sseText())).toEqual(events)
  })

  it('is robust to the stream being split at arbitrary byte boundaries, including mid-JSON', () => {
    const full = sseText()
    for (const splitEvery of [1, 2, 3, 7, 13, 29]) {
      const parser = new SseParser()
      const collected: unknown[] = []
      for (let i = 0; i < full.length; i += splitEvery) {
        collected.push(...parser.push(full.slice(i, i + splitEvery)))
      }
      expect(collected).toEqual(events)
    }
  })

  it('ignores malformed events instead of throwing', () => {
    const parser = new SseParser()
    const result = parser.push('data: {not valid json\n\ndata: {"delta":"ok"}\n\n')
    expect(result).toEqual([{ delta: 'ok' }])
  })
})

import type { CustomInvestment, CustomInvestmentKind, CustomInvestmentLoan, InvestmentCurrency } from '../../../engine/types'
import { INVESTMENT_PRESETS } from '../../../engine/investments'

export function randomInvestmentId(): string {
  return `inv-${Math.random().toString(36).slice(2, 9)}`
}

const DEFAULT_INVESTMENT: CustomInvestment = {
  id: '',
  name: 'New investment',
  kind: 'other',
  enabled: true,
  currency: 'ZAR',
  startAge: 60,
  termYears: undefined,
  fundedFrom: 'exit-capital',
  deposit: 0,
  purchaseCostPct: 0,
  loan: undefined,
  growth: 0.06,
  incomeYield: 0,
  costsPct: 0,
  incomeTaxRate: 0.18,
  cgtRate: 0.18,
  sellingCostPct: 0.01,
  incomeUse: 'spend',
  notes: undefined,
}

/** Sane starting deposit (and, where relevant, loan) for each preset kind — see the task brief. */
const PRESET_FILL: Record<CustomInvestmentKind, { deposit: number; loan?: CustomInvestmentLoan }> = {
  'equity-index': { deposit: 100_000 },
  'residential-property': { deposit: 200_000, loan: { amount: 300_000, rate: 0.065, termYears: 25, interestOnly: false } },
  'commercial-property': { deposit: 300_000, loan: { amount: 300_000, rate: 0.07, termYears: 20, interestOnly: false } },
  'fixed-term': { deposit: 1_000_000 },
  other: { deposit: 500_000 },
}

export const PRESET_BUTTONS: { kind: CustomInvestmentKind; label: string }[] = [
  { kind: 'equity-index', label: '+ S&P 500 / global index ETF' },
  { kind: 'residential-property', label: '+ Australian residential property' },
  { kind: 'commercial-property', label: '+ Commercial property' },
  { kind: 'fixed-term', label: '+ Fixed-term deposit or bond' },
  { kind: 'other', label: '+ Other' },
]

export const KIND_OPTIONS: { value: CustomInvestmentKind; label: string }[] = [
  { value: 'equity-index', label: 'Equity / index ETF' },
  { value: 'residential-property', label: 'Residential property' },
  { value: 'commercial-property', label: 'Commercial property' },
  { value: 'fixed-term', label: 'Fixed-term deposit or bond' },
  { value: 'other', label: 'Other' },
]

export const CURRENCY_OPTIONS: { value: InvestmentCurrency; label: string }[] = [
  { value: 'ZAR', label: 'ZAR — South African rand' },
  { value: 'USD', label: 'USD — US dollar' },
  { value: 'AUD', label: 'AUD — Australian dollar' },
  { value: 'GBP', label: 'GBP — British pound' },
  { value: 'EUR', label: 'EUR — Euro' },
]

export const FUNDED_FROM_OPTIONS: { value: CustomInvestment['fundedFrom']; label: string }[] = [
  { value: 'exit-capital', label: 'My exit capital' },
  { value: 'external', label: 'External money (outside the plan)' },
]

export const INCOME_USE_OPTIONS: { value: CustomInvestment['incomeUse']; label: string }[] = [
  { value: 'spend', label: 'Spend — counts toward my income target' },
  { value: 'reinvest', label: 'Reinvest — adds to my savings' },
]

export const DEFAULT_LOAN: CustomInvestmentLoan = { amount: 0, rate: 0.07, termYears: 20, interestOnly: false }

/** Build a new CustomInvestment from a preset kind, merged with sane operational fills. */
export function createInvestmentFromPreset(kind: CustomInvestmentKind, exitAge: number): CustomInvestment {
  const preset = INVESTMENT_PRESETS[kind]
  const fill = PRESET_FILL[kind]
  return {
    ...DEFAULT_INVESTMENT,
    ...preset,
    id: randomInvestmentId(),
    kind,
    enabled: true,
    startAge: exitAge,
    fundedFrom: 'exit-capital',
    deposit: fill.deposit,
    loan: fill.loan,
  }
}

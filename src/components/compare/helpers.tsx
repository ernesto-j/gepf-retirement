import { Component, type ErrorInfo, type ReactNode } from 'react'
import type { ComparisonMetric, FundInfo, ScenarioDefinition, ScenarioKind, ScenarioResult } from '../../engine/types'
import { formatAge, formatPct, formatRand } from '../../engine/money'
import { colourForScenario } from '../chartTheme'
import { Callout } from '../ui'

/* ------------------------------------------------------------------ */
/* Engine error boundary                                               */
/* ------------------------------------------------------------------ */

interface BoundaryProps {
  children: ReactNode
  /** When this value changes the boundary clears its error and re-renders the children. */
  resetKey?: unknown
}

interface BoundaryState {
  error: Error | null
}

/** Catches engine exceptions (e.g. while modules are still stubs) and shows a calm "not ready" message. */
export class EngineBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) console.error('Engine error', error, info.componentStack)
  }

  componentDidUpdate(prev: BoundaryProps): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <Callout tone="warn" title="Engine not ready">
          <p>
            The calculation engine could not produce results for this page yet
            {this.state.error.message ? ` (${this.state.error.message})` : ''}. Check your inputs on the Profile page, or try again
            once the engine has loaded.
          </p>
          <button type="button" className="btn-secondary mt-2" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </Callout>
      )
    }
    return this.props.children
  }
}

/** Run a function and return a fallback if it throws (engine stubs). */
export function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

/* ------------------------------------------------------------------ */
/* Route metadata and copy                                             */
/* ------------------------------------------------------------------ */

export const KIND_LABEL: Record<ScenarioKind, string> = {
  'stay-gepf': 'Stay: retire from the GEPF',
  'resign-preserve': 'Leave: resign and preserve',
  'resign-cash': 'Leave: resign and cash out',
}

export const KIND_SHORT: Record<ScenarioKind, string> = {
  'stay-gepf': 'Stay',
  'resign-preserve': 'Preserve',
  'resign-cash': 'Cash out',
}

export function fundName(funds: FundInfo[], id: string): string {
  return funds.find((f) => f.id === id)?.name ?? id
}

export function fundFee(funds: FundInfo[], def: ScenarioDefinition): number | null {
  if (def.feeOverride !== undefined) return def.feeOverride
  return funds.find((f) => f.id === def.fundId)?.allInFee ?? null
}

/** One-line description of the mechanics of a scenario, using only its definition. */
export function describeRoute(def: ScenarioDefinition, funds: FundInfo[]): string {
  const retireAt = def.retireFromPreservationAge ?? Math.max(55, def.exitAge)
  const fee = fundFee(funds, def)
  const feeText = fee === null ? '' : ` at ${formatPct(fee, 2)} all-in fees`
  switch (def.kind) {
    case 'stay-gepf':
      return `Retire from the GEPF at ${def.exitAge}: a once-off gratuity taxed on the retirement table, plus a monthly pension for life that rises with CPI. The net gratuity is invested${feeText}, ${formatPct(
        def.gratuityOffshorePct ?? 0,
        0,
      )} of it offshore.`
    case 'resign-preserve':
      return `Resign at ${def.exitAge} and transfer the full actuarial interest tax-free to a preservation fund (${fundName(
        funds,
        def.fundId,
      )}${feeText}). At ${retireAt} take ${formatPct(def.lumpSumAtRetirementPct ?? 1 / 3, 1)} as a lump sum on the retirement table and draw the rest as a living annuity, ${formatPct(
        def.offshorePct,
        0,
      )} offshore.`
    case 'resign-cash':
      return `Resign at ${def.exitAge} and cash out ${formatPct(
        def.cashOutFraction ?? 1,
        0,
      )} of the vested and savings components, taxed on the withdrawal table. The net proceeds are invested ${formatPct(
        def.offshorePct,
        0,
      )} offshore (${fundName(funds, def.fundId)}${feeText}); the retirement component is preserved and drawn as a living annuity from ${retireAt}.`
  }
}

/** Colour for any scenario id; custom ids take their index among the saved scenarios. */
export function scenarioColour(id: string, customIndex = 0): string {
  return colourForScenario(id, customIndex)
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

export function formatMetricValue(format: ComparisonMetric['format'], value: number | string | null | undefined, planToAge?: number): string {
  if (value === null || value === undefined) {
    if (format === 'age') return planToAge ? `Lasts to ${planToAge}` : formatAge(null)
    return '—'
  }
  if (typeof value === 'string') return value
  switch (format) {
    case 'currency':
      return formatRand(value)
    case 'currencyMonthly':
      return `${formatRand(value)} / month`
    case 'age':
      return formatAge(value)
    case 'percent':
      return formatPct(value)
    case 'years':
      return `${Math.round(value * 10) / 10} yrs`
    case 'text':
      return String(value)
  }
}

/** Ruin / shortfall age as a tile value: the age, or "Never" when the capital lasts to the horizon. */
export function ageTile(age: number | null): { value: string; tone: 'ok' | 'warn' | 'danger' } {
  if (age === null) return { value: 'Never', tone: 'ok' }
  return { value: formatAge(age), tone: age < 80 ? 'danger' : 'warn' }
}

/** Total lump-sum tax across the exit and any later retirement-from-preservation event. */
export function lumpSumTaxSummary(r: ScenarioResult): { gross: number; tax: number; effective: number } {
  // Includes the DPSA ERP / VEP incentive, which is a second lump sum at exit taxed on the same
  // (retirement) table — the comparison table's "Net lump sum at exit" / "Tax on lump sums" rows
  // aggregate it the same way.
  const gross = r.atExit.lumpSumGross + (r.atExit.incentiveGross ?? 0) + (r.atRetirementFromPreservation?.lumpSumGross ?? 0)
  const tax = r.atExit.lumpSumTax + (r.atExit.incentiveTax ?? 0) + (r.atRetirementFromPreservation?.lumpSumTax ?? 0)
  return { gross, tax, effective: gross > 0 ? tax / gross : 0 }
}

export function resultById(results: ScenarioResult[], id: string): ScenarioResult | undefined {
  return results.find((r) => r.definition.id === id)
}

// STUB — replaced by the projection engine agent. Signatures per docs/SPEC.md.
import type { ComparisonResult, FundInfo, GepfRules, Profile, ScenarioDefinition, ScenarioResult, ScenarioSummary, TaxTables } from './types'

export function defaultScenarios(_profile: Profile, _funds: FundInfo[]): ScenarioDefinition[] {
  throw new Error('not implemented')
}
export function runScenario(_profile: Profile, _def: ScenarioDefinition, _deps?: { tables?: TaxTables; rules?: GepfRules; funds?: FundInfo[] }): ScenarioResult {
  throw new Error('not implemented')
}
export function compareScenarios(_results: ScenarioResult[]): ComparisonResult {
  throw new Error('not implemented')
}
export function summarise(_result: ScenarioResult): ScenarioSummary {
  throw new Error('not implemented')
}

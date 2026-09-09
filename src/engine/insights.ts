// STUB — replaced by the projection engine agent. Signatures per docs/SPEC.md.
import type { GepfRules, Profile, RiskFlag, ScenarioResult } from './types'

export function prosCons(_result: ScenarioResult, _profile: Profile, _rules: GepfRules): { pros: string[]; cons: string[] } {
  throw new Error('not implemented')
}
export function riskFlags(_result: ScenarioResult, _profile: Profile, _rules: GepfRules): RiskFlag[] {
  throw new Error('not implemented')
}

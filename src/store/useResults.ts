import { useMemo } from 'react'
import { useAppStore } from './useAppStore'
import { compareScenarios, defaultScenarios, runScenario } from '../engine/projection'
import { getTaxTables } from '../engine/tax'
import { getGepfRules } from '../engine/gepf'
import { FUNDS } from '../data/funds'
import type { ComparisonResult, FundInfo, GepfRules, ScenarioDefinition, ScenarioResult, TaxTables } from '../engine/types'

export interface Results {
  /** The three core routes derived from the profile: ids 'stay', 'preserve', 'cash'. */
  core: ScenarioResult[]
  coreDefinitions: ScenarioDefinition[]
  comparison: ComparisonResult
  /** All scenario definitions available to the planner: core + saved. */
  allDefinitions: ScenarioDefinition[]
  /** Results for the planner's A/B selection. */
  planner: [ScenarioResult | null, ScenarioResult | null]
  funds: FundInfo[]
  rules: GepfRules
  tables: TaxTables
}

/** Memoised engine results for the current profile and scenarios. */
export function useResults(): Results {
  const profile = useAppStore((s) => s.profile)
  const scenarios = useAppStore((s) => s.scenarios)
  const plannerSelection = useAppStore((s) => s.plannerSelection)

  return useMemo(() => {
    const tables = getTaxTables(profile.assumptions.taxYear)
    const rules = getGepfRules()
    const deps = { tables, rules, funds: FUNDS }
    const coreDefinitions = defaultScenarios(profile, FUNDS)
    const core = coreDefinitions.map((d) => runScenario(profile, d, deps))
    const comparison = compareScenarios(core)
    const allDefinitions = [...coreDefinitions, ...scenarios]
    const run = (id: string): ScenarioResult | null => {
      const coreIdx = coreDefinitions.findIndex((d) => d.id === id)
      if (coreIdx >= 0) return core[coreIdx]
      const def = scenarios.find((d) => d.id === id)
      return def ? runScenario(profile, def, deps) : null
    }
    const planner: [ScenarioResult | null, ScenarioResult | null] = [run(plannerSelection[0]), run(plannerSelection[1])]
    return { core, coreDefinitions, comparison, allDefinitions, planner, funds: FUNDS, rules, tables }
  }, [profile, scenarios, plannerSelection])
}

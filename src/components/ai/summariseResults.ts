import type { ScenarioResult, ScenarioSummary } from '../../engine/types'

/**
 * Loads `summarise()` from `src/engine/projection.ts` via a runtime `import()`, guarded by
 * try/catch: that module is owned by a different agent and may still be a stub (or mid-edit)
 * when this runs, so a scenario — or the whole module — that can't be summarised yet is skipped
 * rather than breaking the Ask AI drawer/page.
 */
export async function summariseResults(results: ScenarioResult[]): Promise<ScenarioSummary[]> {
  let summarise: ((r: ScenarioResult) => ScenarioSummary) | undefined
  try {
    ;({ summarise } = await import('../../engine/projection'))
  } catch {
    return []
  }
  const summaries: ScenarioSummary[] = []
  for (const result of results) {
    try {
      summaries.push(summarise(result))
    } catch {
      // Not summarisable yet (e.g. the placeholder throwing "not implemented") - skip it.
    }
  }
  return summaries
}

import { useState } from 'react'
import type { ScenarioDefinition } from '../engine/types'
import { useAppStore } from '../store/useAppStore'
import { useResults } from '../store/useResults'
import { PageHeader, Section, Grid } from '../components/ui'
import { IncomeChart } from '../components/charts/IncomeChart'
import { CapitalChart } from '../components/charts/CapitalChart'
import { TotalsChart } from '../components/charts/TotalsChart'
import { EngineBoundary, scenarioColour } from '../components/compare/helpers'
import { ScenarioPicker } from '../components/planner/ScenarioPicker'
import { ScenarioForm } from '../components/planner/ScenarioForm'
import { PlannerKpis } from '../components/planner/PlannerKpis'
import { YearByYearTable } from '../components/planner/YearByYearTable'
import { SensitivityTable } from '../components/planner/SensitivityTable'

type Slot = 0 | 1

/** Scenario planner: pick two scenarios (A and B), build custom ones, and compare them in depth. */
export default function PlannerPage() {
  const profile = useAppStore((s) => s.profile)
  return (
    <div>
      <PageHeader
        title="Scenario planner"
        intro="Pick any two scenarios — the three core routes or ones you build yourself — and compare them side by side: income, capital, tax, fees, and how sensitive the numbers are to being wrong about returns, inflation and the rand."
      />
      <EngineBoundary resetKey={profile}>
        <PlannerContent />
      </EngineBoundary>
    </div>
  )
}

function PlannerContent() {
  const profile = useAppStore((s) => s.profile)
  const plannerSelection = useAppStore((s) => s.plannerSelection)
  const setPlannerSelection = useAppStore((s) => s.setPlannerSelection)
  const upsertScenario = useAppStore((s) => s.upsertScenario)
  const removeScenario = useAppStore((s) => s.removeScenario)

  const { coreDefinitions, allDefinitions, planner, funds, rules, tables } = useResults()
  const coreIds = new Set(coreDefinitions.map((d) => d.id))

  const [formSlot, setFormSlot] = useState<Slot | null>(null)
  const [formInitial, setFormInitial] = useState<ScenarioDefinition | null>(null)
  const [showSensitivities, setShowSensitivities] = useState(false)

  const defA = allDefinitions.find((d) => d.id === plannerSelection[0]) ?? null
  const defB = allDefinitions.find((d) => d.id === plannerSelection[1]) ?? null
  const [resultA, resultB] = planner
  const nameA = defA?.name ?? 'Scenario A'
  const nameB = defB?.name ?? 'Scenario B'
  const colours = { [plannerSelection[0]]: scenarioColour(plannerSelection[0], 0), [plannerSelection[1]]: scenarioColour(plannerSelection[1], 1) }
  const results = [resultA, resultB].filter((r): r is NonNullable<typeof r> => r !== null)

  function selectSlot(slot: Slot, id: string) {
    const other: Slot = slot === 0 ? 1 : 0
    const next: [string, string] = [...plannerSelection]
    if (id === next[other]) {
      // Picking the scenario already in the other slot would duplicate chart series; swap instead.
      next[other] = next[slot]
    }
    next[slot] = id
    setPlannerSelection(next)
  }

  function openNew(slot: Slot) {
    setFormSlot(slot)
    setFormInitial(null)
  }

  function openEdit(slot: Slot, def: ScenarioDefinition) {
    setFormSlot(slot)
    setFormInitial(def)
  }

  function closeForm() {
    setFormSlot(null)
    setFormInitial(null)
  }

  function handleSave(def: ScenarioDefinition) {
    if (formSlot === null) return
    upsertScenario(def)
    selectSlot(formSlot, def.id)
    closeForm()
  }

  function handleDelete(slot: Slot, id: string) {
    removeScenario(id)
    if (plannerSelection[slot] === id) {
      const otherId = plannerSelection[1 - slot]
      const fallback = coreDefinitions.find((d) => d.id !== otherId)?.id ?? coreDefinitions[0]?.id ?? id
      selectSlot(slot, fallback)
    }
  }

  return (
    <div className="space-y-4">
      <Section title="Choose scenarios A and B" description="Pick from the three core routes or your own saved scenarios; only ones you create can be edited or deleted.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ScenarioPicker
            slotLabel="Scenario A"
            selectedId={plannerSelection[0]}
            allDefinitions={allDefinitions}
            coreIds={coreIds}
            onChange={(id) => selectSlot(0, id)}
            onNew={() => openNew(0)}
            onEdit={(def) => openEdit(0, def)}
            onDelete={(id) => handleDelete(0, id)}
          />
          <ScenarioPicker
            slotLabel="Scenario B"
            selectedId={plannerSelection[1]}
            allDefinitions={allDefinitions}
            coreIds={coreIds}
            onChange={(id) => selectSlot(1, id)}
            onNew={() => openNew(1)}
            onEdit={(def) => openEdit(1, def)}
            onDelete={(id) => handleDelete(1, id)}
          />
        </div>
        {formSlot !== null && (
          <div className="mt-4">
            <ScenarioForm initial={formInitial} profile={profile} funds={funds} onSave={handleSave} onCancel={closeForm} />
          </div>
        )}
      </Section>

      <Section title="A vs B at a glance" description="The better value on each metric is highlighted; capital-runs-out age is shown first since it usually matters most.">
        <PlannerKpis a={resultA} b={resultB} nameA={nameA} nameB={nameB} />
      </Section>

      <Section title="Net income vs your target" description="After-tax monthly income by age for scenarios A and B, against your income target.">
        <IncomeChart results={results} colours={colours} />
      </Section>

      <Grid cols={2}>
        <Section title="Invested capital over time" description="How the invested capital behind each scenario runs down.">
          <CapitalChart results={results} colours={colours} />
        </Section>
        <Section title="Lifetime totals" description="Total income, tax, fees and legacy across the whole horizon.">
          <TotalsChart results={results} colours={colours} />
        </Section>
      </Grid>

      <Section title="Year-by-year detail" description="Every year's income, tax and capital, toggled open on demand.">
        <YearByYearTable a={resultA} b={resultB} nameA={nameA} nameB={nameB} />
      </Section>

      <Section
        title="Sensitivities"
        description="How much the outcome moves if returns, the rand or inflation surprise you."
        right={
          <button type="button" className="btn-secondary" onClick={() => setShowSensitivities((o) => !o)} aria-expanded={showSensitivities}>
            {showSensitivities ? 'Hide' : 'Show'} sensitivities
          </button>
        }
      >
        {showSensitivities && (
          <SensitivityTable
            profile={profile}
            defA={defA}
            defB={defB}
            resultA={resultA}
            resultB={resultB}
            nameA={nameA}
            nameB={nameB}
            deps={{ tables, rules, funds }}
          />
        )}
      </Section>
    </div>
  )
}

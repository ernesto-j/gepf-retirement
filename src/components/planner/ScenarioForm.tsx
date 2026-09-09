import { useState } from 'react'
import type { Assumptions, FundInfo, Profile, ScenarioDefinition, ScenarioKind } from '../../engine/types'
import { Field, Grid, NumberInput, PercentInput, SelectInput, Toggle } from '../ui'
import { DEFAULT_FUND_ID } from '../../data/funds'

const KIND_OPTIONS: { value: ScenarioKind; label: string }[] = [
  { value: 'stay-gepf', label: 'Stay: retire from the GEPF' },
  { value: 'resign-preserve', label: 'Leave: resign and preserve' },
  { value: 'resign-cash', label: 'Leave: resign and cash out' },
]

const DRAWDOWN_OPTIONS: { value: ScenarioDefinition['drawdownStrategy']; label: string }[] = [
  { value: 'target-income', label: 'Draw to meet my income target' },
  { value: 'fixed-pct', label: 'Fixed % of capital each year' },
]

/** One row of a per-scenario assumption override: a toggle plus a percent field, shown only when enabled. */
const OVERRIDE_FIELDS: { key: keyof Assumptions; label: string; min: number; max: number }[] = [
  { key: 'randDepreciation', label: 'Rand depreciation vs USD', min: -0.1, max: 0.2 },
  { key: 'personalInflation', label: 'Your personal inflation', min: 0, max: 0.25 },
  { key: 'officialCpi', label: 'Official CPI', min: 0, max: 0.2 },
  { key: 'localBalancedReturn', label: 'Local balanced return (gross)', min: -0.1, max: 0.3 },
  { key: 'offshoreReturnUsd', label: 'Offshore return, USD (gross)', min: -0.1, max: 0.3 },
  { key: 'gepfIncreaseAsPctOfCpi', label: 'GEPF increase as % of CPI', min: 0, max: 1.5 },
]

function randomId(): string {
  return `custom-${Math.random().toString(36).slice(2, 9)}`
}

export function blankScenario(profile: Profile, funds: FundInfo[]): ScenarioDefinition {
  const exitAge = profile.person.plannedExitAge
  return {
    id: '',
    name: 'New scenario',
    kind: 'resign-preserve',
    exitAge,
    retireFromPreservationAge: Math.max(55, exitAge),
    fundId: funds.find((f) => f.id !== 'gepf')?.id ?? DEFAULT_FUND_ID,
    feeOverride: undefined,
    offshorePct: 0.5,
    gratuityOffshorePct: 0.3,
    lumpSumAtRetirementPct: 1 / 3,
    cashOutFraction: 1,
    drawdownStrategy: 'target-income',
    drawdownPct: 0.04,
    overrides: undefined,
  }
}

/** Create/edit form for a saved scenario. `initial` null means a brand-new scenario. */
export function ScenarioForm({
  initial,
  profile,
  funds,
  onSave,
  onCancel,
}: {
  initial: ScenarioDefinition | null
  profile: Profile
  funds: FundInfo[]
  onSave: (def: ScenarioDefinition) => void
  onCancel: () => void
}) {
  const [def, setDef] = useState<ScenarioDefinition>(() => initial ?? blankScenario(profile, funds))
  const patch = (p: Partial<ScenarioDefinition>) => setDef((d) => ({ ...d, ...p }))

  const overrides = def.overrides ?? {}
  const setOverride = (key: keyof Assumptions, value: number | undefined) => {
    setDef((d) => {
      const next = { ...(d.overrides ?? {}) }
      if (value === undefined) delete next[key]
      else (next as Record<string, number>)[key] = value
      return { ...d, overrides: Object.keys(next).length > 0 ? next : undefined }
    })
  }

  const isStay = def.kind === 'stay-gepf'
  const isResign = def.kind !== 'stay-gepf'
  const isCash = def.kind === 'resign-cash'

  return (
    <form
      className="card space-y-4 border-brand-200"
      onSubmit={(e) => {
        e.preventDefault()
        const toSave: ScenarioDefinition = { ...def, id: def.id || randomId() }
        onSave(toSave)
      }}
    >
      <h3 className="text-base font-semibold text-slate-900">{initial ? 'Edit scenario' : 'New scenario'}</h3>

      <Grid cols={2}>
        <Field label="Scenario name">
          <input className="input" value={def.name} onChange={(e) => patch({ name: e.target.value })} required />
        </Field>
        <SelectInput label="Kind" value={def.kind} onChange={(kind) => patch({ kind })} options={KIND_OPTIONS} />
        <NumberInput label="Exit age" value={def.exitAge} onChange={(exitAge) => patch({ exitAge })} min={45} max={75} step={1} />
        {isResign && (
          <NumberInput
            label="Retire from preservation fund at age"
            value={def.retireFromPreservationAge ?? Math.max(55, def.exitAge)}
            onChange={(retireFromPreservationAge) => patch({ retireFromPreservationAge })}
            min={55}
            max={75}
            step={1}
          />
        )}
        <SelectInput
          label="Fund"
          value={def.fundId}
          onChange={(fundId) => patch({ fundId })}
          options={funds.filter((f) => f.id !== 'gepf').map((f) => ({ value: f.id, label: f.name }))}
        />
        <PercentInput
          label="Fee override (blank = use fund fee)"
          value={def.feeOverride ?? 0}
          onChange={(v) => patch({ feeOverride: v })}
          min={0}
          max={0.05}
          step={0.01}
        />
        {isStay ? (
          <PercentInput
            label="Gratuity invested offshore"
            value={def.gratuityOffshorePct ?? 0}
            onChange={(gratuityOffshorePct) => patch({ gratuityOffshorePct })}
            min={0}
            max={1}
            step={0.05}
          />
        ) : (
          <PercentInput label="Living annuity offshore share" value={def.offshorePct} onChange={(offshorePct) => patch({ offshorePct })} min={0} max={1} step={0.05} />
        )}
        {isResign && (
          <PercentInput
            label="Lump sum at retirement from preservation"
            value={def.lumpSumAtRetirementPct ?? 1 / 3}
            onChange={(lumpSumAtRetirementPct) => patch({ lumpSumAtRetirementPct })}
            min={0}
            max={1 / 3}
            step={0.05}
          />
        )}
        {isCash && (
          <PercentInput
            label="Cash-out fraction of allowed amount"
            value={def.cashOutFraction ?? 1}
            onChange={(cashOutFraction) => patch({ cashOutFraction })}
            min={0}
            max={1}
            step={0.05}
          />
        )}
        <SelectInput
          label="Drawdown strategy"
          value={def.drawdownStrategy}
          onChange={(drawdownStrategy) => patch({ drawdownStrategy })}
          options={DRAWDOWN_OPTIONS}
        />
        {def.drawdownStrategy === 'fixed-pct' && (
          <PercentInput label="Fixed annual drawdown" value={def.drawdownPct ?? 0.04} onChange={(drawdownPct) => patch({ drawdownPct })} min={0.01} max={0.2} step={0.005} />
        )}
      </Grid>

      <div>
        <h4 className="mb-2 text-sm font-semibold text-slate-800">Assumption overrides for this scenario</h4>
        <p className="help mb-2">Turn on any assumption you want this scenario to use instead of the global value on the Profile page.</p>
        <div className="space-y-3">
          {OVERRIDE_FIELDS.map((f) => {
            const enabled = overrides[f.key] !== undefined
            const value = (overrides[f.key] as number | undefined) ?? (profile.assumptions[f.key] as number)
            return (
              <div key={f.key} className="rounded-md border border-slate-200 p-2">
                <Toggle
                  label={f.label}
                  checked={enabled}
                  onChange={(checked) => setOverride(f.key, checked ? (profile.assumptions[f.key] as number) : undefined)}
                />
                {enabled && (
                  <div className="mt-2 max-w-xs">
                    <PercentInput label={f.label} value={value} onChange={(v) => setOverride(f.key, v)} min={f.min} max={f.max} step={0.005} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex gap-2">
        <button type="submit" className="btn-primary">
          Save scenario
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

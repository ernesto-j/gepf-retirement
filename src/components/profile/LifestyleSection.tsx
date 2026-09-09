import type { HousingStatus, LifestyleInputs, RiskTolerance } from '../../engine/types'
import { Callout, Grid, NumberInput, PercentInput, R, RandInput, Section, SelectInput } from '../../components/ui'

const HOUSING_OPTIONS: { value: HousingStatus; label: string }[] = [
  { value: 'owned', label: 'Owned, no bond' },
  { value: 'bonded', label: 'Owned, still paying a bond' },
  { value: 'renting', label: 'Renting' },
]

const RISK_OPTIONS: { value: RiskTolerance; label: string }[] = [
  { value: 'conservative', label: 'Conservative' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'aggressive', label: 'Aggressive' },
]

export function LifestyleSection({
  lifestyle,
  onChange,
}: {
  lifestyle: LifestyleInputs
  onChange: (patch: Partial<LifestyleInputs>) => void
}) {
  const computedTotal = lifestyle.essentialsMonthly + lifestyle.discretionaryMonthly + lifestyle.medicalAidMonthly + lifestyle.housingCostMonthly

  return (
    <Section title="Lifestyle & spending" description="What you want to spend in retirement, in today's rand.">
      <div className="mb-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-700">
          Essentials + discretionary + medical aid + housing ={' '}
          <span className="font-semibold tabular-nums text-slate-900">{R(computedTotal)}/month</span>. Your income target is currently{' '}
          <span className="font-semibold tabular-nums text-slate-900">{R(lifestyle.targetNetMonthlyIncomeToday)}/month</span>.
        </div>
        <button type="button" className="btn-secondary shrink-0" onClick={() => onChange({ targetNetMonthlyIncomeToday: computedTotal })}>
          Use this total as my target
        </button>
      </div>

      <Grid cols={3}>
        <RandInput
          label="Target net income"
          monthly
          value={lifestyle.targetNetMonthlyIncomeToday}
          min={0}
          step={500}
          onChange={(v) => onChange({ targetNetMonthlyIncomeToday: v })}
          help="Desired after-tax income at retirement, in today's rand."
        />
        <RandInput label="Essentials" monthly value={lifestyle.essentialsMonthly} min={0} step={500} onChange={(v) => onChange({ essentialsMonthly: v })} help="Groceries, transport, utilities." />
        <RandInput
          label="Discretionary"
          monthly
          value={lifestyle.discretionaryMonthly}
          min={0}
          step={500}
          onChange={(v) => onChange({ discretionaryMonthly: v })}
          help="Travel, dining, hobbies."
        />
        <RandInput label="Medical aid" monthly value={lifestyle.medicalAidMonthly} min={0} step={250} onChange={(v) => onChange({ medicalAidMonthly: v })} />
        <NumberInput label="Medical aid members" value={lifestyle.medicalAidMembers} min={0} max={15} step={1} onChange={(v) => onChange({ medicalAidMembers: v })} />
        <SelectInput label="Housing" value={lifestyle.housing} onChange={(v) => onChange({ housing: v })} options={HOUSING_OPTIONS} />
        <RandInput
          label="Housing cost"
          monthly
          value={lifestyle.housingCostMonthly}
          min={0}
          step={250}
          onChange={(v) => onChange({ housingCostMonthly: v })}
          help="Bond, rates, levies or rent."
        />
        <NumberInput label="Dependants" value={lifestyle.dependants} min={0} max={10} step={1} onChange={(v) => onChange({ dependants: v })} />
        <RandInput
          label="Other income"
          monthly
          value={lifestyle.otherIncomeMonthly}
          min={0}
          step={500}
          onChange={(v) => onChange({ otherIncomeMonthly: v })}
          help="Rental, part-time work, another annuity — taxable."
        />
        <PercentInput
          label="Other income escalation"
          value={lifestyle.otherIncomeEscalation}
          min={0}
          max={0.2}
          onChange={(v) => onChange({ otherIncomeEscalation: v })}
        />
        <RandInput
          label="Other savings"
          value={lifestyle.otherSavings}
          min={0}
          step={10000}
          onChange={(v) => onChange({ otherSavings: v })}
          help="Discretionary investments outside GEPF (unit trusts, RA, TFSA, cash)."
        />
        <PercentInput
          label="Other savings already offshore"
          value={lifestyle.otherSavingsOffshorePct}
          min={0}
          max={1}
          onChange={(v) => onChange({ otherSavingsOffshorePct: v })}
        />
        <RandInput label="Debt outstanding" value={lifestyle.debtOutstanding} min={0} step={10000} onChange={(v) => onChange({ debtOutstanding: v })} />
        <RandInput
          label="Once-off capital needs at exit"
          value={lifestyle.onceOffCapitalNeeds}
          min={0}
          step={10000}
          onChange={(v) => onChange({ onceOffCapitalNeeds: v })}
          help="Car, home improvements, debt settlement, travel — funded from your lump sum."
        />
        <RandInput
          label="Legacy goal"
          value={lifestyle.legacyGoal}
          min={0}
          step={50000}
          onChange={(v) => onChange({ legacyGoal: v })}
          help="Capital you'd like left over for heirs at the end of the plan."
        />
        <SelectInput label="Risk tolerance" value={lifestyle.riskTolerance} onChange={(v) => onChange({ riskTolerance: v })} options={RISK_OPTIONS} />
        <PercentInput
          label="Share of spending that's imported"
          value={lifestyle.spendingImportedShare}
          min={0}
          max={1}
          onChange={(v) => onChange({ spendingImportedShare: v })}
          help="Medicine, tech, imported goods and overseas travel move with the rand; the rest is local (see Rand & inflation)."
        />
      </Grid>

      <div className="mt-4">
        <Callout tone="info" title="Why 'true' inflation matters">
          Retirees spend differently to the CPI basket: medical aid and imported goods usually rise faster than
          official CPI, while housing (once bonds are paid off) can rise slower. The Assumptions section below lets
          you set your own "personal inflation" rate separately from official CPI so projections reflect what you
          actually spend on.
        </Callout>
      </div>
    </Section>
  )
}

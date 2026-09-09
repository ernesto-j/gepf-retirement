import { useId } from 'react'
import type { PersonProfile } from '../../engine/types'
import { Field, Grid, NumberInput, Section, SelectInput, Toggle } from '../../components/ui'

export function AboutYouSection({
  person,
  onChange,
}: {
  person: PersonProfile
  onChange: (patch: Partial<PersonProfile>) => void
}) {
  const nameId = useId()
  return (
    <Section title="About you" description="Basic details used across every scenario and tax calculation.">
      <Grid cols={3}>
        <Field label="Name (optional)" htmlFor={nameId}>
          <input
            id={nameId}
            className="input"
            value={person.name ?? ''}
            placeholder="Not saved anywhere but your browser"
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </Field>
        <NumberInput label="Current age" value={person.currentAge} min={18} max={100} step={1} onChange={(v) => onChange({ currentAge: v })} />
        <SelectInput
          label="Sex"
          value={person.sex ?? 'other'}
          onChange={(v) => onChange({ sex: v })}
          options={[
            { value: 'female', label: 'Female' },
            { value: 'male', label: 'Male' },
            { value: 'other', label: 'Prefer not to say' },
          ]}
          help="Only used for spouse-pension pricing conventions; never shown elsewhere."
        />
        <NumberInput
          label="Planned exit age"
          suffix="years"
          value={person.plannedExitAge}
          min={45}
          max={75}
          step={1}
          onChange={(v) => onChange({ plannedExitAge: v })}
          help="Age you plan to resign or retire from GEPF. GEPF retirement (pension) needs age 55+."
        />
        <NumberInput
          label="Plan to age"
          suffix="years"
          value={person.planToAge}
          min={person.plannedExitAge + 1}
          max={110}
          step={1}
          onChange={(v) => onChange({ planToAge: v })}
          help="Planning horizon for the projections (default 90)."
        />
        <div className="flex flex-col gap-3">
          <Toggle
            label="I have a spouse / life partner"
            checked={person.hasSpouse}
            onChange={(v) => onChange({ hasSpouse: v })}
            help="Affects the spouse pension shown on the stay-GEPF route."
          />
          {person.hasSpouse && (
            <NumberInput label="Spouse age" value={person.spouseAge ?? person.currentAge} min={0} max={110} step={1} onChange={(v) => onChange({ spouseAge: v })} />
          )}
        </div>
        {person.hasSpouse && (
          <SelectInput
            label="Spouse pension on your death"
            value={String(person.spousePensionPct) as '50' | '75'}
            onChange={(v) => onChange({ spousePensionPct: Number(v) as 50 | 75 })}
            options={[
              { value: '50', label: '50% (no cost, default)' },
              { value: '75', label: '75% (enhanced, reduces your pension)' },
            ]}
            help="Electing 75% reduces your own GEPF pension slightly."
          />
        )}
      </Grid>
    </Section>
  )
}

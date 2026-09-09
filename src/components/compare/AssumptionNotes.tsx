import type { Profile, ScenarioResult } from '../../engine/types'
import { formatPct } from '../../engine/money'

export function AssumptionNotes({ results, profile }: { results: ScenarioResult[]; profile: Profile }) {
  const a = profile.assumptions
  const notes = new Map<string, string[]>()
  for (const r of results) {
    for (const n of r.notes) {
      const list = notes.get(n) ?? []
      list.push(r.definition.name)
      notes.set(n, list)
    }
  }
  return (
    <div className="space-y-3 text-sm text-slate-600">
      <p>
        Projections run from your current age of {profile.person.currentAge} to {profile.person.planToAge} using official CPI of {formatPct(a.officialCpi)},
        personal inflation of {formatPct(a.personalInflation)}, medical inflation of {formatPct(a.medicalInflation)}, GEPF increases at{' '}
        {formatPct(a.gepfIncreaseAsPctOfCpi, 0)} of CPI, rand depreciation of {formatPct(a.randDepreciation)} a year from a spot of R{a.usdZarSpot.toFixed(2)},
        local balanced returns of {formatPct(a.localBalancedReturn)} and offshore returns of {formatPct(a.offshoreReturnUsd)} in US dollars. Tax year{' '}
        {a.taxYear}. Change any of these on the Profile page.
      </p>
      {notes.size > 0 && (
        <ul className="list-disc space-y-1 pl-5">
          {[...notes.entries()].map(([note, names]) => (
            <li key={note}>
              {note}
              {names.length < results.length && <span className="text-slate-400"> ({names.join(', ')})</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-500">
        Estimates only, not financial advice. Every figure is reproducible from your inputs and the documented assumptions; verify benefit amounts against
        your GEPF benefit statement.
      </p>
    </div>
  )
}

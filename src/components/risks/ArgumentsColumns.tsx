import type { ScenarioResult } from '../../engine/types'
import { formatAge, formatPct, formatRandCompact } from '../../engine/money'

function findResult(core: ScenarioResult[] | null, id: string): ScenarioResult | undefined {
  return core?.find((r) => r.definition.id === id)
}

/** Balanced, numeric-where-possible arguments for staying vs leaving, built from the current core results when available. */
export function ArgumentsColumns({ core }: { core: ScenarioResult[] | null }) {
  const stay = findResult(core, 'stay')
  const preserve = findResult(core, 'preserve')
  const cash = findResult(core, 'cash')
  const bestLeaveRuin = [preserve, cash]
    .filter((r): r is ScenarioResult => !!r)
    .sort((a, b) => (b.ruinAge ?? Infinity) - (a.ruinAge ?? Infinity))[0]

  const forStaying: string[] = [
    'A lifelong, inflation-linked pension that cannot run out, no matter how long you live — the single biggest protection against longevity risk.',
    '50% (or 75%, at a cost) of your pension continues to your spouse for their life.',
    'No investment decisions, no market risk, no sequence-of-returns risk, and no fees on the pension itself.',
    'Keeps the post-retirement medical aid subsidy, which resigning forfeits entirely.',
    stay
      ? `In your own numbers, the GEPF pension supplies ${formatPct(stay.totals.guaranteedIncomeShare)} of your first-year net income guaranteed for life.`
      : 'A defined-benefit pension typically supplies most of a retiree\'s guaranteed income, reducing reliance on markets.',
    'The GEPF is currently well funded (state guarantor, ~110%+ funding level) and the increase rule guarantees at least 75% of CPI.',
  ]

  const forLeaving: string[] = [
    'Control over your capital: how it is invested, how much offshore, how it is drawn down, and what is left to your heirs.',
    'The ability to hold a meaningful offshore share as a hedge against rand weakness — something the GEPF's own ~10% offshore allocation does not give you individually.',
    preserve
      ? `Transferring to a preservation fund is completely tax-free (vs a lump sum taxed on exit), and here grows to ${formatRandCompact(
          preserve.atExit.transferredToPreservation,
        )} before any drawdown.`
      : 'Transferring the full actuarial interest to a preservation fund on resignation is completely tax-free.',
    'Any capital left unspent becomes a legacy for your heirs; a GEPF pension leaves nothing beyond the spouse pension and guarantee period.',
    'Flexibility to adjust your income up or down with your actual needs, rather than a fixed formula.',
    bestLeaveRuin
      ? `Under today's default assumptions, capital ${
          bestLeaveRuin.ruinAge === null ? `lasts to your planning horizon (age ${formatAge(bestLeaveRuin.definition.exitAge)}+)` : `runs out around age ${formatAge(bestLeaveRuin.ruinAge)}`
        } on the better-performing leave route — check the Compare page for your exact numbers.`
      : 'A well-invested, low-cost portfolio can outperform the GEPF pension in total lifetime income, but this depends on markets and drawdown discipline.',
  ]

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-emerald-800">Arguments for staying</h3>
        <ul className="space-y-2 text-sm text-slate-700">
          {forStaying.map((a, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden="true" className="mt-0.5 text-emerald-600">
                ✓
              </span>
              <span>{a}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-4">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-sky-800">Arguments for leaving</h3>
        <ul className="space-y-2 text-sm text-slate-700">
          {forLeaving.map((a, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden="true" className="mt-0.5 text-sky-600">
                ✓
              </span>
              <span>{a}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

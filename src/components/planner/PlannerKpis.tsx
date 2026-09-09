import type { ScenarioResult } from '../../engine/types'
import { formatAge, formatPct, formatRand, formatRandCompact } from '../../engine/money'
import { DataTable, KpiTile, td, th } from '../ui'
import { ageTile } from '../compare/helpers'

interface Metric {
  key: string
  label: string
  pick: (r: ScenarioResult) => number | null
  higherIsBetter: boolean
  format: (v: number | null) => string
}

const METRICS: Metric[] = [
  { key: 'lumpSum', label: 'Net lump sum at exit', pick: (r) => r.atExit.lumpSumNet, higherIsBetter: true, format: (v) => formatRand(v) },
  { key: 'investedCapital', label: 'Invested capital at exit', pick: (r) => r.atExit.investedCapital, higherIsBetter: true, format: (v) => formatRand(v) },
  {
    key: 'firstYearIncome',
    label: 'First-year net income',
    pick: (r) => r.firstYear.netMonthlyIncome,
    higherIsBetter: true,
    format: (v) => `${formatRand(v)} / month`,
  },
  {
    key: 'firstYearTax',
    label: 'First-year monthly tax',
    pick: (r) => r.firstYear.monthlyTax,
    higherIsBetter: false,
    format: (v) => formatRand(v),
  },
  {
    key: 'shortfallAge',
    label: 'Income shortfall from age',
    pick: (r) => r.incomeShortfallAge,
    higherIsBetter: true,
    format: (v) => formatAge(v),
  },
  {
    key: 'lifetimeIncome',
    label: "Lifetime net income (today's rand)",
    pick: (r) => r.totals.lifetimeNetIncomeReal,
    higherIsBetter: true,
    format: (v) => formatRandCompact(v),
  },
  { key: 'lifetimeTax', label: 'Lifetime tax paid', pick: (r) => r.totals.lifetimeTaxPaid, higherIsBetter: false, format: (v) => formatRandCompact(v) },
  { key: 'lifetimeFees', label: 'Lifetime fees paid', pick: (r) => r.totals.lifetimeFeesPaid, higherIsBetter: false, format: (v) => formatRandCompact(v) },
  {
    key: 'legacy',
    label: "Legacy at horizon (today's rand)",
    pick: (r) => r.totals.legacyAtHorizonReal,
    higherIsBetter: true,
    format: (v) => formatRandCompact(v),
  },
  {
    key: 'guaranteedShare',
    label: 'Guaranteed income share',
    pick: (r) => r.totals.guaranteedIncomeShare,
    higherIsBetter: true,
    format: (v) => formatPct(v ?? 0, 0),
  },
]

function better(aVal: number | null, bVal: number | null, higherIsBetter: boolean): 'a' | 'b' | 'tie' {
  const av = aVal === null ? (higherIsBetter ? Infinity : -Infinity) : aVal
  const bv = bVal === null ? (higherIsBetter ? Infinity : -Infinity) : bVal
  if (av === bv) return 'tie'
  if (higherIsBetter) return av > bv ? 'a' : 'b'
  return av < bv ? 'a' : 'b'
}

/** A vs B: capital-runs-out-at-age up front, then every other metric side by side with the better value marked. */
export function PlannerKpis({ a, b, nameA, nameB }: { a: ScenarioResult | null; b: ScenarioResult | null; nameA: string; nameB: string }) {
  if (!a && !b) return <p className="text-sm text-slate-500">Choose two scenarios to compare.</p>

  const ruinWinner = a && b ? better(a.ruinAge, b.ruinAge, true) : 'tie'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <KpiTile
          label={`${nameA}: capital runs out at age`}
          value={a ? ageTile(a.ruinAge).value : '—'}
          tone={a ? ageTile(a.ruinAge).tone : 'neutral'}
          sub={a?.ruinAge === null ? 'Lasts to the planning horizon' : 'Living annuity plus discretionary savings exhausted'}
        />
        <KpiTile
          label={`${nameB}: capital runs out at age`}
          value={b ? ageTile(b.ruinAge).value : '—'}
          tone={b ? ageTile(b.ruinAge).tone : 'neutral'}
          sub={b?.ruinAge === null ? 'Lasts to the planning horizon' : 'Living annuity plus discretionary savings exhausted'}
        />
      </div>
      {a && b && ruinWinner !== 'tie' && (
        <p className="text-sm text-slate-600">
          <span className="font-medium">{ruinWinner === 'a' ? nameA : nameB}</span> keeps invested capital going longer.
        </p>
      )}

      <DataTable caption="Scenario A vs B on every metric; the better value in each row is highlighted">
        <thead className="bg-slate-50">
          <tr>
            <th scope="col" className={th}>
              Metric
            </th>
            <th scope="col" className={`${th} text-right`}>
              {nameA}
            </th>
            <th scope="col" className={`${th} text-right`}>
              {nameB}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {METRICS.map((m) => {
            const av = a ? m.pick(a) : null
            const bv = b ? m.pick(b) : null
            const winner = a && b ? better(av, bv, m.higherIsBetter) : 'tie'
            return (
              <tr key={m.key}>
                <th scope="row" className={`${td} text-left font-medium text-slate-700`}>
                  {m.label}
                  <span className="block text-xs font-normal text-slate-400">{m.higherIsBetter ? 'higher is better' : 'lower is better'}</span>
                </th>
                <td className={`${td} text-right ${winner === 'a' ? 'bg-emerald-50 font-semibold text-emerald-800' : ''}`}>
                  {a ? m.format(av) : '—'}
                  {winner === 'a' && <span className="ml-1 text-emerald-600">✓</span>}
                </td>
                <td className={`${td} text-right ${winner === 'b' ? 'bg-emerald-50 font-semibold text-emerald-800' : ''}`}>
                  {b ? m.format(bv) : '—'}
                  {winner === 'b' && <span className="ml-1 text-emerald-600">✓</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </DataTable>
    </div>
  )
}

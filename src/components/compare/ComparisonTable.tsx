import type { ComparisonResult } from '../../engine/types'
import { DataTable, td, th } from '../ui'
import { formatMetricValue } from './helpers'

export function ComparisonTable({
  comparison,
  colours,
  planToAge,
}: {
  comparison: ComparisonResult
  colours: Record<string, string>
  planToAge: number
}) {
  const scenarios = comparison.scenarios
  if (comparison.table.length === 0 || scenarios.length === 0) {
    return <p className="text-sm text-slate-500">No comparison metrics available.</p>
  }
  return (
    <DataTable caption="Comparison of the three routes on each metric; the best value in each row is highlighted">
      <thead className="bg-slate-50">
        <tr>
          <th scope="col" className={th}>
            Metric
          </th>
          {scenarios.map((s) => (
            <th key={s.definition.id} scope="col" className={`${th} text-right`}>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colours[s.definition.id] }} />
                {s.definition.name}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {comparison.table.map((m) => {
          const winner = comparison.winners[m.key]
          return (
            <tr key={m.key}>
              <th scope="row" className={`${td} text-left font-medium text-slate-700`}>
                {m.label}
                <span className="block text-xs font-normal text-slate-400">{m.higherIsBetter ? 'higher is better' : 'lower is better'}</span>
              </th>
              {scenarios.map((s) => {
                const id = s.definition.id
                const isWinner = winner === id
                return (
                  <td
                    key={id}
                    className={`${td} text-right ${isWinner ? 'bg-emerald-50 font-semibold text-emerald-800' : ''}`}
                    aria-label={isWinner ? 'best value' : undefined}
                  >
                    {formatMetricValue(m.format, m.values[id], planToAge)}
                    {isWinner && (
                      <span className="ml-1 text-emerald-600" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </DataTable>
  )
}

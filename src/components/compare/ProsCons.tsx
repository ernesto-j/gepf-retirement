import type { ScenarioResult } from '../../engine/types'

export function ProsCons({ results, colours }: { results: ScenarioResult[]; colours: Record<string, string> }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {results.map((r) => (
        <div key={r.definition.id} className="rounded-lg border border-slate-200 p-3">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colours[r.definition.id] }} />
            {r.definition.name}
          </h3>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-emerald-700">For</h4>
          {r.pros.length === 0 ? (
            <p className="mb-2 text-sm text-slate-400">No specific advantages listed.</p>
          ) : (
            <ul className="mb-3 mt-1 space-y-1">
              {r.pros.map((p, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-700">
                  <span aria-hidden="true" className="mt-0.5 text-emerald-600">
                    ✓
                  </span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          )}
          <h4 className="text-xs font-semibold uppercase tracking-wide text-red-700">Against</h4>
          {r.cons.length === 0 ? (
            <p className="text-sm text-slate-400">No specific drawbacks listed.</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {r.cons.map((c, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-700">
                  <span aria-hidden="true" className="mt-0.5 text-red-600">
                    ✗
                  </span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}

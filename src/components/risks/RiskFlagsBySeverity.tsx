import type { RiskFlag, ScenarioResult } from '../../engine/types'
import { CASE_STUDIES } from '../../data/caseStudies'
import { Badge } from '../ui'

type Severity = RiskFlag['severity']

const ORDER: Severity[] = ['critical', 'warning', 'info']

const STYLE: Record<Severity, { box: string; label: string; tone: 'danger' | 'warn' | 'brand' }> = {
  critical: { box: 'border-red-200 bg-red-50', label: 'Critical', tone: 'danger' },
  warning: { box: 'border-amber-200 bg-amber-50', label: 'Warning', tone: 'warn' },
  info: { box: 'border-sky-200 bg-sky-50', label: 'Info', tone: 'brand' },
}

interface GroupedFlag {
  flag: RiskFlag
  routeNames: string[]
}

/** Merge the flags from the current core scenarios so each distinct risk appears once, with the routes it was raised for. */
function groupFlags(results: ScenarioResult[]): Record<Severity, GroupedFlag[]> {
  const map = new Map<string, GroupedFlag>()
  for (const r of results) {
    for (const f of r.flags) {
      const key = `${f.id}|${f.title}|${f.detail}`
      const existing = map.get(key)
      if (existing) {
        if (!existing.routeNames.includes(r.definition.name)) existing.routeNames.push(r.definition.name)
      } else {
        map.set(key, { flag: f, routeNames: [r.definition.name] })
      }
    }
  }
  const grouped: Record<Severity, GroupedFlag[]> = { critical: [], warning: [], info: [] }
  for (const g of map.values()) grouped[g.flag.severity].push(g)
  return grouped
}

function caseStudyLabel(id: string): string {
  const cs = CASE_STUDIES.find((c) => c.id === id)
  return cs ? `${cs.country} (${cs.period})` : id
}

export function RiskFlagsBySeverity({ results, onSelectCaseStudy }: { results: ScenarioResult[]; onSelectCaseStudy: (id: string) => void }) {
  const grouped = groupFlags(results)
  const total = ORDER.reduce((n, s) => n + grouped[s].length, 0)
  if (total === 0) return <p className="text-sm text-slate-500">No risk flags were raised for your current three routes.</p>

  return (
    <div className="space-y-4">
      {ORDER.map((sev) => {
        const items = grouped[sev]
        if (items.length === 0) return null
        const style = STYLE[sev]
        return (
          <div key={sev}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Badge tone={style.tone}>{style.label}</Badge>
              <span className="text-slate-500">
                {items.length} flag{items.length === 1 ? '' : 's'}
              </span>
            </h3>
            <ul className="space-y-2">
              {items.map(({ flag, routeNames }) => (
                <li key={`${flag.id}-${flag.title}`} className={`rounded-lg border p-3 ${style.box}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-900">{flag.title}</div>
                    <div className="flex flex-wrap gap-1">
                      {routeNames.map((n) => (
                        <Badge key={n} tone="neutral">
                          {n}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-slate-700">{flag.detail}</p>
                  {flag.caseStudyId && (
                    <button
                      type="button"
                      className="mt-2 inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-300"
                      onClick={() => onSelectCaseStudy(flag.caseStudyId!)}
                    >
                      Case study: {caseStudyLabel(flag.caseStudyId)} ↓
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

import type { CaseStudy } from '../../engine/types'
import { Badge } from '../ui'

export function CaseStudyAccordion({
  caseStudies,
  openId,
  onToggle,
}: {
  caseStudies: CaseStudy[]
  openId: string | null
  onToggle: (id: string) => void
}) {
  return (
    <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
      {caseStudies.map((cs) => {
        const open = openId === cs.id
        return (
          <div key={cs.id} id={`case-study-${cs.id}`}>
            <button
              type="button"
              className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-300"
              aria-expanded={open}
              onClick={() => onToggle(cs.id)}
            >
              <span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{cs.country}</span>
                  <Badge tone="neutral">{cs.period}</Badge>
                </span>
                <span className="mt-0.5 block text-sm text-slate-600">{cs.title}</span>
              </span>
              <span aria-hidden="true" className="mt-1 flex-shrink-0 text-slate-400">
                {open ? '▾' : '▸'}
              </span>
            </button>
            {open && (
              <div className="space-y-3 px-4 pb-4 text-sm text-slate-700">
                <p>{cs.summary}</p>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">What happened to savers</h4>
                  <p className="mt-0.5">{cs.whatHappenedToSavers}</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-900">
                  <span className="text-xs font-semibold uppercase tracking-wide">Loss estimate</span>
                  <p className="mt-0.5">{cs.lossEstimate}</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-emerald-900">
                  <span className="text-xs font-semibold uppercase tracking-wide">What protected savers</span>
                  <p className="mt-0.5">{cs.whatProtectedSavers}</p>
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lessons</h4>
                  <ul className="mt-0.5 list-inside list-disc space-y-0.5">
                    {cs.lessons.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                  {cs.sources.map((s) => (
                    <a key={s} href={s} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-slate-600">
                      source
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

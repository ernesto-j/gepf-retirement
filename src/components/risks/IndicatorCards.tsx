import type { SaRiskIndicator } from '../../engine/types'
import { Badge, Grid } from '../ui'

const TREND_STYLE: Record<SaRiskIndicator['trend'], { tone: 'ok' | 'warn' | 'danger'; arrow: string; label: string }> = {
  improving: { tone: 'ok', arrow: '↓', label: 'Improving' },
  stable: { tone: 'warn', arrow: '→', label: 'Stable' },
  worsening: { tone: 'danger', arrow: '↑', label: 'Worsening' },
}

export function IndicatorCards({ indicators }: { indicators: SaRiskIndicator[] }) {
  return (
    <Grid cols={4}>
      {indicators.map((ind) => {
        const t = TREND_STYLE[ind.trend]
        return (
          <div key={ind.id} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ind.label}</div>
              <Badge tone={t.tone}>
                {t.arrow} {t.label}
              </Badge>
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{ind.value}</div>
            <p className="mt-1 text-xs text-slate-600">{ind.detail}</p>
            <div className="mt-2 text-[10px] text-slate-400">
              as of {ind.asOf} ·{' '}
              <a href={ind.source} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-slate-600">
                source
              </a>
            </div>
          </div>
        )
      })}
    </Grid>
  )
}

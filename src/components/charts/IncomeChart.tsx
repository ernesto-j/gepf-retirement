import type { ReactNode } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import type { ScenarioResult } from '../../engine/types'
import { formatAge, formatRand } from '../../engine/money'
import { SERIES, chartMargin, colourForScenario, tickRand } from '../chartTheme'

/* ------------------------------------------------------------------ */
/* Shared chart scaffolding (used by IncomeChart, CapitalChart, Totals)*/
/* ------------------------------------------------------------------ */

/** Title states the takeaway; caption says how to read the chart. */
export function ChartFrame({
  title,
  caption,
  children,
  right,
}: {
  title: string
  caption: string
  children: ReactNode
  right?: ReactNode
}) {
  return (
    <figure className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <figcaption className="text-sm font-semibold text-slate-900">{title}</figcaption>
        {right}
      </div>
      {children}
      <p className="mt-2 text-xs text-slate-500">
        <span className="font-medium text-slate-600">How to read: </span>
        {caption}
      </p>
    </figure>
  )
}

export type ValueFormatter = (value: number) => string

/** Tooltip body: value leads, series name follows; a short line key carries identity. */
export function ChartTooltipContent({
  active,
  payload,
  label,
  formatValue,
  formatLabel,
}: Pick<TooltipContentProps, 'active' | 'payload' | 'label'> & {
  formatValue: ValueFormatter
  formatLabel: (label: string | number | undefined) => string
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-semibold text-slate-900">{formatLabel(label)}</div>
      <ul className="space-y-0.5">
        {payload.map((entry, i) => {
          const raw = entry.value
          const n = typeof raw === 'number' ? raw : Number(raw)
          if (!Number.isFinite(n)) return null
          const colour = entry.color ?? entry.stroke ?? entry.fill ?? SERIES.axis
          const dashed = entry.strokeDasharray !== undefined && entry.strokeDasharray !== ''
          return (
            <li key={`${String(entry.dataKey ?? entry.name)}-${i}`} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-0 w-4"
                style={{ borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${colour}` }}
              />
              <span className="font-semibold tabular-nums text-slate-900">{formatValue(n)}</span>
              <span className="text-slate-500">{String(entry.name ?? entry.dataKey ?? '')}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export const axisTick = { fontSize: 11, fill: SERIES.axis }

/** Colour for a scenario id: core ids are fixed; custom ids use the caller's map or the fallback palette. */
export function seriesColour(id: string, index: number, colours?: Record<string, string>): string {
  return colours?.[id] ?? colourForScenario(id, index)
}

/** Merge per-scenario rows into one dataset keyed by age (union of ages across scenarios). */
export function mergeByAge(
  results: ScenarioResult[],
  pick: (row: ScenarioResult['rows'][number]) => number,
  extra?: (row: ScenarioResult['rows'][number]) => Record<string, number>,
): Record<string, number | null>[] {
  const byAge = new Map<number, Record<string, number | null>>()
  for (const r of results) {
    for (const row of r.rows) {
      const age = Math.round(row.age)
      let point = byAge.get(age)
      if (!point) {
        point = { age }
        byAge.set(age, point)
      }
      point[r.definition.id] = pick(row)
      if (extra) {
        for (const [k, v] of Object.entries(extra(row))) if (point[k] === undefined) point[k] = v
      }
    }
  }
  const ids = results.map((r) => r.definition.id)
  return [...byAge.values()]
    .sort((a, b) => (a.age ?? 0) - (b.age ?? 0))
    .map((p) => {
      for (const id of ids) if (p[id] === undefined) p[id] = null
      return p
    })
}

/* ------------------------------------------------------------------ */
/* Income chart                                                        */
/* ------------------------------------------------------------------ */

export interface IncomeChartProps {
  results: ScenarioResult[]
  /** Optional colour per scenario id (defaults to chartTheme.colourForScenario). */
  colours?: Record<string, string>
  /** 'nominal' shows rand of the year; 'real' shows today's rand (personal inflation). */
  mode?: 'nominal' | 'real'
  /** Scenario ids drawn with a dashed stroke (secondary encoding when two colours are close). */
  dashIds?: string[]
  height?: number
  /** Override the computed takeaway title. */
  title?: string
}

function incomeTakeaway(results: ScenarioResult[], mode: 'nominal' | 'real'): string {
  if (results.length === 0) return 'Net income by age'
  const onTarget = results.filter((r) => r.incomeShortfallAge === null)
  const suffix = mode === 'real' ? ' (today’s rand)' : ''
  if (onTarget.length === results.length) return `Every route meets your income target to the horizon${suffix}`
  const best = [...results].sort((a, b) => (b.incomeShortfallAge ?? 999) - (a.incomeShortfallAge ?? 999))[0]
  const worst = [...results].sort((a, b) => (a.incomeShortfallAge ?? 999) - (b.incomeShortfallAge ?? 999))[0]
  if (best.incomeShortfallAge === null) {
    return `${best.definition.name} stays on target to the horizon; ${worst.definition.name} falls short from age ${formatAge(worst.incomeShortfallAge)}${suffix}`
  }
  return `${best.definition.name} keeps the target longest (to ${formatAge(best.incomeShortfallAge)}); ${worst.definition.name} falls short from ${formatAge(worst.incomeShortfallAge)}${suffix}`
}

/** Net monthly income by age for each scenario, with the income target as a dotted reference. */
export function IncomeChart({ results, colours, mode = 'nominal', dashIds = [], height = 300, title }: IncomeChartProps) {
  const real = mode === 'real'
  const data = mergeByAge(
    results,
    (row) => (real ? row.totalNetIncomeReal : row.totalNetIncome) / 12,
    (row) => ({ target: (real ? row.targetNetIncome / (row.personalIndex || 1) : row.targetNetIncome) / 12 }),
  )
  const fmt = (v: number) => `${formatRand(v)} / month`
  return (
    <ChartFrame
      title={title ?? incomeTakeaway(results, mode)}
      caption={`Each line is the net (after-tax) income per month for one route at each age${
        real ? ', in today’s rand' : ', in the rand of that year'
      }. The dotted grey line is your income target; a line below it means a shortfall. Hover or tap for exact values.`}
    >
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ ...chartMargin, bottom: 20, left: 12 }}>
            <CartesianGrid stroke={SERIES.grid} vertical={false} />
            <XAxis
              dataKey="age"
              type="number"
              domain={['dataMin', 'dataMax']}
              tick={axisTick}
              tickLine={false}
              axisLine={{ stroke: SERIES.grid }}
              label={{ value: 'Age (years)', position: 'insideBottom', offset: -12, fontSize: 11, fill: SERIES.axis }}
            />
            <YAxis
              tickFormatter={tickRand}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={64}
              label={{
                value: real ? 'Net income (R / month, today’s rand)' : 'Net income (R / month)',
                angle: -90,
                position: 'insideLeft',
                offset: -2,
                fontSize: 11,
                fill: SERIES.axis,
              }}
            />
            <Tooltip
              cursor={{ stroke: SERIES.axis, strokeWidth: 1 }}
              content={(p) => <ChartTooltipContent {...p} formatValue={fmt} formatLabel={(l) => `Age ${l ?? ''}`} />}
            />
            <Legend verticalAlign="top" height={32} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
            {results.map((r, i) => (
              <Line
                key={r.definition.id}
                type="monotone"
                dataKey={r.definition.id}
                name={r.definition.name}
                stroke={seriesColour(r.definition.id, i, colours)}
                strokeWidth={2}
                strokeDasharray={dashIds.includes(r.definition.id) ? '6 3' : undefined}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: '#ffffff' }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
            <Line
              type="monotone"
              dataKey="target"
              name="Income target"
              stroke={SERIES.target}
              strokeWidth={1.5}
              strokeDasharray="2 4"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  )
}

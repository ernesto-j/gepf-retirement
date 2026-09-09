import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ScenarioResult } from '../../engine/types'
import { formatRand, formatRandCompact } from '../../engine/money'
import { SERIES, chartMargin, tickRand } from '../chartTheme'
import { ChartFrame, ChartTooltipContent, axisTick, seriesColour } from './IncomeChart'

export interface TotalsChartProps {
  results: ScenarioResult[]
  colours?: Record<string, string>
  height?: number
  title?: string
}

const METRICS: { key: string; label: string; pick: (r: ScenarioResult) => number }[] = [
  { key: 'income', label: 'Lifetime net income (today’s rand)', pick: (r) => r.totals.lifetimeNetIncomeReal },
  { key: 'tax', label: 'Lifetime tax paid', pick: (r) => r.totals.lifetimeTaxPaid },
  { key: 'fees', label: 'Lifetime fees paid', pick: (r) => r.totals.lifetimeFeesPaid },
  { key: 'legacy', label: 'Legacy at horizon (today’s rand)', pick: (r) => r.totals.legacyAtHorizonReal },
]

function totalsTakeaway(results: ScenarioResult[]): string {
  if (results.length === 0) return 'Lifetime totals by route'
  const best = [...results].sort((a, b) => b.totals.lifetimeNetIncomeReal - a.totals.lifetimeNetIncomeReal)[0]
  return `${best.definition.name} delivers the most lifetime net income in today’s rand (${formatRandCompact(
    best.totals.lifetimeNetIncomeReal,
  )})`
}

/** Grouped bars: lifetime net income (real), tax, fees and legacy (real) for each scenario. */
export function TotalsChart({ results, colours, height = 300, title }: TotalsChartProps) {
  const data = METRICS.map((m) => {
    const point: Record<string, number | string> = { metric: m.label }
    for (const r of results) point[r.definition.id] = Math.max(0, m.pick(r))
    return point
  })
  return (
    <ChartFrame
      title={title ?? totalsTakeaway(results)}
      caption="Bars are totals across the whole planning horizon, one colour per route. Net income and legacy are in today’s rand (discounted at your personal inflation); tax and fees are the rand actually paid over the years. Taller income and legacy bars are better; taller tax and fee bars are worse."
    >
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ ...chartMargin, bottom: 8, left: 12 }} barGap={2} barCategoryGap="25%">
            <CartesianGrid stroke={SERIES.grid} vertical={false} />
            <XAxis dataKey="metric" tick={axisTick} tickLine={false} axisLine={{ stroke: SERIES.grid }} interval={0} />
            <YAxis
              tickFormatter={tickRand}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={64}
              label={{ value: 'Rand (R)', angle: -90, position: 'insideLeft', offset: -2, fontSize: 11, fill: SERIES.axis }}
            />
            <Tooltip
              cursor={{ fill: '#f1f5f9' }}
              content={(p) => <ChartTooltipContent {...p} formatValue={formatRand} formatLabel={(l) => String(l ?? '')} />}
            />
            <Legend verticalAlign="top" height={32} iconType="square" wrapperStyle={{ fontSize: 12 }} />
            {results.map((r, i) => (
              <Bar
                key={r.definition.id}
                dataKey={r.definition.id}
                name={r.definition.name}
                fill={seriesColour(r.definition.id, i, colours)}
                maxBarSize={24}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  )
}

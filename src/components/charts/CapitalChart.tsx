import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ScenarioResult } from '../../engine/types'
import { formatAge, formatRand } from '../../engine/money'
import { SERIES, chartMargin, tickRand } from '../chartTheme'
import { ChartFrame, ChartTooltipContent, axisTick, mergeByAge, seriesColour } from './IncomeChart'

export interface CapitalChartProps {
  results: ScenarioResult[]
  colours?: Record<string, string>
  mode?: 'nominal' | 'real'
  dashIds?: string[]
  height?: number
  title?: string
}

function capitalTakeaway(results: ScenarioResult[], mode: 'nominal' | 'real'): string {
  if (results.length === 0) return 'Investable capital by age'
  const suffix = mode === 'real' ? ' (today’s rand)' : ''
  const runsOut = results.filter((r) => r.ruinAge !== null).sort((a, b) => (a.ruinAge ?? 0) - (b.ruinAge ?? 0))
  const lasts = results.filter((r) => r.ruinAge === null)
  if (runsOut.length === 0) return `Invested capital lasts to the horizon on every route${suffix}`
  const first = runsOut[0]
  if (lasts.length === 0) {
    return `Capital runs out first on ${first.definition.name} (age ${formatAge(first.ruinAge)})${suffix}`
  }
  const lastNames = lasts.map((r) => r.definition.name).join(' and ')
  return `Capital runs out at ${formatAge(first.ruinAge)} on ${first.definition.name}; ${lastNames} ${lasts.length > 1 ? 'last' : 'lasts'} to the horizon${suffix}`
}

/** Investable capital (living annuity + discretionary) at the end of each year, by age. */
export function CapitalChart({ results, colours, mode = 'nominal', dashIds = [], height = 300, title }: CapitalChartProps) {
  const real = mode === 'real'
  const data = mergeByAge(results, (row) => Math.max(0, real ? row.capitalEndReal : row.capitalEnd))
  return (
    <ChartFrame
      title={title ?? capitalTakeaway(results, mode)}
      caption={`Each line is the invested capital (living annuity plus discretionary savings) left at the end of each year${
        real ? ', in today’s rand' : ''
      }. A GEPF pension has no capital value, so the stay route only shows the invested gratuity. A line that reaches zero means the capital is exhausted at that age (marked with a dashed vertical line).`}
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
                value: real ? 'Capital (R, today’s rand)' : 'Capital (R, nominal)',
                angle: -90,
                position: 'insideLeft',
                offset: -2,
                fontSize: 11,
                fill: SERIES.axis,
              }}
            />
            <Tooltip
              cursor={{ stroke: SERIES.axis, strokeWidth: 1 }}
              content={(p) => <ChartTooltipContent {...p} formatValue={formatRand} formatLabel={(l) => `Age ${l ?? ''}`} />}
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
            {results.map((r, i) =>
              r.ruinAge !== null ? (
                <ReferenceLine
                  key={`ruin-${r.definition.id}`}
                  x={Math.round(r.ruinAge)}
                  stroke={seriesColour(r.definition.id, i, colours)}
                  strokeDasharray="3 3"
                  strokeWidth={1}
                  label={{ value: `Runs out ${formatAge(r.ruinAge)}`, position: 'top', fontSize: 10, fill: SERIES.axis }}
                />
              ) : null,
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  )
}

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MacroHistory } from '../../engine/types'
import { SERIES, chartMargin } from '../chartTheme'
import { ChartFrame, ChartTooltipContent, axisTick } from '../charts/IncomeChart'

const EVENTS: { year: number; label: string }[] = [
  { year: 2001, label: "'01 rand crisis" },
  { year: 2008, label: "'08 financial crisis" },
  { year: 2016, label: "'16 Nenegate" },
  { year: 2020, label: "'20 Covid" },
  { year: 2023, label: "'23 fiscal strain" },
]

const fmtRate = (v: number) => `R${v.toFixed(2)} / US$1`

export function FxHistoryChart({ history, height = 300 }: { history: MacroHistory; height?: number }) {
  const data = history.usdZarAnnualAvg
  const first = data[0]
  const last = data[data.length - 1]
  const years = last && first ? last.year - first.year : 0
  const cagr = first && last && first.value > 0 && years > 0 ? (last.value / first.value) ** (1 / years) - 1 : null

  return (
    <ChartFrame
      title={
        cagr !== null
          ? `The rand has weakened roughly ${(cagr * 100).toFixed(1)}% a year against the US dollar since ${first.year}`
          : 'USD/ZAR annual average exchange rate'
      }
      caption="Each point is the annual average rand price of one US dollar (higher = weaker rand). Dashed markers flag five well-known stress episodes — the trend, not any single year, is what matters for a decades-long retirement."
    >
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ ...chartMargin, bottom: 20, left: 12, top: 24 }}>
            <CartesianGrid stroke={SERIES.grid} vertical={false} />
            <XAxis
              dataKey="year"
              type="number"
              domain={['dataMin', 'dataMax']}
              tick={axisTick}
              tickLine={false}
              axisLine={{ stroke: SERIES.grid }}
              label={{ value: 'Year', position: 'insideBottom', offset: -12, fontSize: 11, fill: SERIES.axis }}
            />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) => `R${v.toFixed(0)}`}
              label={{ value: 'Rand per US dollar', angle: -90, position: 'insideLeft', offset: -2, fontSize: 11, fill: SERIES.axis }}
            />
            <Tooltip
              cursor={{ stroke: SERIES.axis, strokeWidth: 1 }}
              content={(p) => <ChartTooltipContent {...p} formatValue={fmtRate} formatLabel={(l) => String(l ?? '')} />}
            />
            {EVENTS.map((e) => (
              <ReferenceLine
                key={e.year}
                x={e.year}
                stroke={SERIES.axis}
                strokeDasharray="3 3"
                label={{ value: e.label, position: 'top', fontSize: 10, fill: SERIES.axis, angle: 0 }}
              />
            ))}
            <Line
              type="monotone"
              dataKey="value"
              name="USD/ZAR"
              stroke={SERIES.cash}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: '#ffffff' }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  )
}

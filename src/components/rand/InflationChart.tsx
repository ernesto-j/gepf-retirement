import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MacroHistory, MacroSeriesPoint } from '../../engine/types'
import { SERIES, SERIES_LIST, chartMargin, tickPct } from '../chartTheme'
import { ChartFrame, ChartTooltipContent, axisTick } from '../charts/IncomeChart'

interface Series {
  key: string
  label: string
  points: MacroSeriesPoint[]
  colour: string
}

function mergeByYear(series: Series[]): Record<string, number | null>[] {
  const byYear = new Map<number, Record<string, number | null>>()
  for (const s of series) {
    for (const p of s.points) {
      let row = byYear.get(p.year)
      if (!row) {
        row = { year: p.year }
        byYear.set(p.year, row)
      }
      row[s.key] = p.value
    }
  }
  const keys = series.map((s) => s.key)
  return [...byYear.values()]
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
    .map((r) => {
      for (const k of keys) if (r[k] === undefined) r[k] = null
      return r
    })
}

const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`

/** SA CPI vs US CPI vs medical-aid inflation vs electricity tariff increases, one line each. */
export function InflationChart({ macro, height = 300 }: { macro: MacroHistory; height?: number }) {
  const series: Series[] = [
    { key: 'saCpi', label: 'SA CPI (official)', points: macro.saCpi, colour: SERIES_LIST[0] },
    { key: 'usCpi', label: 'US CPI', points: macro.usCpi, colour: SERIES_LIST[2] },
    { key: 'medical', label: 'Medical aid inflation', points: macro.medicalAidInflation, colour: SERIES_LIST[1] },
    { key: 'electricity', label: 'Electricity tariff increases', points: macro.electricityTariffIncrease, colour: SERIES_LIST[3] },
  ]
  const data = mergeByYear(series)
  const latestSaCpi = [...macro.saCpi].sort((a, b) => a.year - b.year).at(-1)
  const latestMedical = [...macro.medicalAidInflation].sort((a, b) => a.year - b.year).at(-1)

  return (
    <ChartFrame
      title={
        latestSaCpi && latestMedical
          ? `A retiree's real costs run hotter than headline CPI: medical aid rose ${(latestMedical.value * 100).toFixed(
              1,
            )}% vs official CPI at ${(latestSaCpi.value * 100).toFixed(1)}% in ${latestMedical.year}`
          : 'Official CPI vs the costs that matter most in retirement'
      }
      caption="Each line is the annual % increase for that basket. Medical aid and electricity — a large share of a retiree's spending — have consistently outpaced official CPI, which is why a 'true' personal inflation rate above CPI is used elsewhere on this page."
    >
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ ...chartMargin, bottom: 20, left: 12 }}>
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
              tickFormatter={tickPct}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={48}
              label={{ value: 'Annual increase (%)', angle: -90, position: 'insideLeft', offset: -2, fontSize: 11, fill: SERIES.axis }}
            />
            <Tooltip
              cursor={{ stroke: SERIES.axis, strokeWidth: 1 }}
              content={(p) => <ChartTooltipContent {...p} formatValue={fmtPct} formatLabel={(l) => String(l ?? '')} />}
            />
            <Legend verticalAlign="top" height={32} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.colour}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: '#ffffff' }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  )
}

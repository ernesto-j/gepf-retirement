import { useMemo } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { feeImpact } from '../../engine/funds'
import { formatRand, formatRandCompact } from '../../engine/money'
import { SERIES, SERIES_LIST, chartMargin, tickRand } from '../chartTheme'
import { ChartFrame, ChartTooltipContent, axisTick } from '../charts/IncomeChart'
import { Callout } from '../ui'

const FEE_LEVELS = [0.005, 0.01, 0.02, 0.03] as const
const FEE_KEYS = FEE_LEVELS.map((f) => `f${Math.round(f * 1000)}`)
const FEE_LABELS = FEE_LEVELS.map((f) => `${(f * 100).toFixed(1)}%`)

export interface FeeImpactChartProps {
  capital: number
  years: number
  grossReturn: number
  height?: number
}

/** Capital after N years at four illustrative all-in fee levels, plus the "each extra 1%" callout. */
export function FeeImpactChart({ capital, years, grossReturn, height = 320 }: FeeImpactChartProps) {
  const data = useMemo(() => {
    try {
      const points: Record<string, number>[] = []
      for (let y = 0; y <= years; y++) {
        const point: Record<string, number> = { year: y }
        FEE_LEVELS.forEach((fee, i) => {
          point[FEE_KEYS[i]] = feeImpact({ capital, years: y, grossReturn, fee }).finalCapital
        })
        points.push(point)
      }
      return points
    } catch {
      return null
    }
  }, [capital, years, grossReturn])

  const callout = useMemo(() => {
    try {
      const base = feeImpact({ capital, years, grossReturn, fee: 0.01 })
      const doubled = feeImpact({ capital, years, grossReturn, fee: 0.02 })
      return { oneOnePct: base.incomeLossPct, marginalPct: doubled.incomeLossPct - base.incomeLossPct }
    } catch {
      return null
    }
  }, [capital, years, grossReturn])

  if (!data) {
    return (
      <Callout tone="warn" title="Fee-impact chart not ready">
        The fee calculation engine did not return a result. Try again shortly.
      </Callout>
    )
  }

  const best = data[data.length - 1]
  const gap = best ? best[FEE_KEYS[0]] - best[FEE_KEYS[3]] : 0
  const title = `A 3% all-in fee leaves ${formatRandCompact(gap)} less than a 0.5% fee after ${years} years, on ${formatRandCompact(capital)} invested`

  return (
    <div className="space-y-3">
      <ChartFrame
        title={title}
        caption={`Each line grows ${formatRandCompact(capital)} at a ${(grossReturn * 100).toFixed(1)}% gross annual return, net of the stated all-in fee, with no withdrawals. The gap between lines is pure cost — none of it reflects a difference in investment skill.`}
      >
        <div style={{ width: '100%', height }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ ...chartMargin, bottom: 20, left: 12 }}>
              <CartesianGrid stroke={SERIES.grid} vertical={false} />
              <XAxis
                dataKey="year"
                type="number"
                domain={[0, years]}
                tick={axisTick}
                tickLine={false}
                axisLine={{ stroke: SERIES.grid }}
                label={{ value: 'Years invested', position: 'insideBottom', offset: -12, fontSize: 11, fill: SERIES.axis }}
              />
              <YAxis
                tickFormatter={tickRand}
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                width={64}
                label={{ value: 'Capital (R, nominal)', angle: -90, position: 'insideLeft', offset: -2, fontSize: 11, fill: SERIES.axis }}
              />
              <Tooltip
                cursor={{ stroke: SERIES.axis, strokeWidth: 1 }}
                content={(p) => <ChartTooltipContent {...p} formatValue={formatRand} formatLabel={(l) => `Year ${l ?? ''}`} />}
              />
              <Legend verticalAlign="top" height={32} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
              {FEE_KEYS.map((key, i) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={`${FEE_LABELS[i]} all-in fee`}
                  stroke={SERIES_LIST[i]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: '#ffffff' }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartFrame>
      {callout && (
        <Callout tone="warn" title="Each extra 1% in fees compounds">
          A flat 1% all-in fee costs roughly {(callout.oneOnePct * 100).toFixed(0)}% of the income your capital could otherwise
          generate over {years} years; the second percentage point costs a further {(callout.marginalPct * 100).toFixed(0)}
          %. Fees are the one part of your return that is guaranteed and known in advance — always ask what you get for the
          extra cost of an active or full-service fund over a low-cost index option.
        </Callout>
      )}
    </div>
  )
}

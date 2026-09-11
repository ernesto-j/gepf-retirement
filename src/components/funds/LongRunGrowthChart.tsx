import { useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { FundInfo } from '../../engine/types'
import { fundLongRunReturn, growthOfCapital, rankFunds, type FundLongRunReturn } from '../../engine/funds'
import { formatPct, formatRand } from '../../engine/money'
import { SERIES, SERIES_LIST, chartMargin, tickRand } from '../chartTheme'
import { ChartFrame, ChartTooltipContent, axisTick } from '../charts/IncomeChart'

const YEARS = 30
const CAPITAL = 1_000_000
const MAX_SELECTED = 6
/** Not a real fund id — the synthetic "GEPF-equivalent" reference line, counted against `MAX_SELECTED` like any other line. */
const CPI_ID = 'cpi4-reference'

interface Series {
  id: string
  name: string
  color: string
  dashed?: boolean
  /** Value at each year 0..YEARS; `null` where the fund has no long-run figure to plot. */
  points: (number | null)[]
  longRun?: FundLongRunReturn
  fund?: FundInfo
}

/** Top 3 index funds by the app's usual (10y⁠/5y⁠/3y − all-in fee) score, plus two named active managers, plus the CPI+4% reference — 6 lines total. */
function defaultSelection(funds: FundInfo[]): string[] {
  const topIndex = rankFunds(funds)
    .filter((f) => f.type === 'index')
    .slice(0, 3)
    .map((f) => f.id)
  const named = ['allan-gray-balanced', 'coronation-balanced-plus'].filter((id) => funds.some((f) => f.id === id))
  return [...topIndex, ...named, CPI_ID].slice(0, MAX_SELECTED)
}

export interface LongRunGrowthChartProps {
  /** Investable funds (no `gepf`); every fund appears as a checkbox, capped at `MAX_SELECTED` checked at once. */
  funds: FundInfo[]
  /** officialCpi + 4pp (a common living-annuity drawdown target), used for the "CPI+4% reference" line. No fee is deducted from it. */
  cpiPlus4Rate: number
  height?: number
}

/**
 * Growth of R1,000,000 over 30 years, one line per selected fund plus an optional CPI+4%
 * reference line. Each fund line uses `fundLongRunReturn` (the longest available annualised
 * return, net of TER) grossed up by the fund's own TER — since long-run returns, like the 1/3/5/
 * 10-year figures elsewhere in the app, are net of TER only — then compounded net of the fund's
 * full all-in fee (`growthOfCapital`), matching the "R1m after 30 yrs" column in
 * `FundHistoryTable`. Illustrative only: it assumes a single constant rate for the whole 30
 * years, not the sequence of real annual returns a fund will actually produce.
 */
export function LongRunGrowthChart({ funds, cpiPlus4Rate, height = 360 }: LongRunGrowthChartProps) {
  const [selected, setSelected] = useState<string[]>(() => defaultSelection(funds))

  function toggle(id: string) {
    setSelected((s) => {
      if (s.includes(id)) return s.filter((x) => x !== id)
      if (s.length >= MAX_SELECTED) return s
      return [...s, id]
    })
  }

  const seriesList = useMemo<Series[]>(() => {
    const selectedFunds = funds.filter((f) => selected.includes(f.id))
    const list: Series[] = selectedFunds.map((f, i) => {
      const longRun = fundLongRunReturn(f)
      const points: (number | null)[] = []
      for (let y = 0; y <= YEARS; y++) {
        if (longRun.rate === null) {
          points.push(null)
          continue
        }
        const grossReturn = longRun.rate + f.ter
        points.push(growthOfCapital(grossReturn, f.allInFee, y, CAPITAL))
      }
      return {
        id: f.id,
        name: `${f.name}${f.returnsConfidence === 'approximate' ? ' ≈' : ''}`,
        color: SERIES_LIST[i % SERIES_LIST.length],
        points,
        longRun,
        fund: f,
      }
    })
    if (selected.includes(CPI_ID)) {
      const points: (number | null)[] = []
      for (let y = 0; y <= YEARS; y++) points.push(growthOfCapital(cpiPlus4Rate, 0, y, CAPITAL))
      list.push({ id: CPI_ID, name: 'CPI+4% reference', color: SERIES.target, dashed: true, points })
    }
    return list
  }, [funds, selected, cpiPlus4Rate])

  const data = useMemo(() => {
    const rows: Record<string, number | null>[] = []
    for (let y = 0; y <= YEARS; y++) {
      const row: Record<string, number | null> = { year: y }
      for (const s of seriesList) row[s.id] = s.points[y]
      rows.push(row)
    }
    return rows
  }, [seriesList])

  const atLimit = selected.length >= MAX_SELECTED

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lines to show</span>
          <span className="text-xs text-slate-500">
            {selected.length} of {MAX_SELECTED} max
          </span>
        </div>
        <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
          <label className={`flex items-center gap-2 text-sm ${atLimit && !selected.includes(CPI_ID) ? 'text-slate-400' : 'text-slate-700'}`}>
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-300"
              checked={selected.includes(CPI_ID)}
              disabled={atLimit && !selected.includes(CPI_ID)}
              onChange={() => toggle(CPI_ID)}
            />
            <span className="font-medium">CPI+4% reference</span>
          </label>
          {funds.map((f) => {
            const checked = selected.includes(f.id)
            const disabled = atLimit && !checked
            return (
              <label key={f.id} className={`flex items-center gap-2 text-sm ${disabled ? 'text-slate-400' : 'text-slate-700'}`}>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-300"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(f.id)}
                />
                <span className="truncate" title={f.name}>
                  {f.name}
                </span>
              </label>
            )
          })}
        </div>
      </div>

      <ChartFrame
        title="Growth of R1,000,000 over 30 years, by fund's own long-run track record"
        caption="Each fund line grows R1,000,000 for up to 30 years at that fund's longest available annualised return (10/15/20/30-year or since-inception — see each fund's row above), grossed up by its TER (long-run returns are net of TER only) and then compounded net of its full all-in fee, exactly as the fund-comparison table above. The CPI+4% reference line grows the same R1,000,000 at your CPI assumption plus 4 percentage points, before any fee, as a common target for a comfortable retirement drawdown — it is not a fund. All of it is illustrative, not a forecast: it assumes one constant rate for the whole 30 years, and most of the return figures behind it are themselves approximate (≈) estimates, not fact-sheet numbers — see the fund table's notes."
      >
        {seriesList.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">Tick at least one line above to see the chart.</p>
        ) : (
          <div style={{ width: '100%', height }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ ...chartMargin, bottom: 20, left: 12 }}>
                <CartesianGrid stroke={SERIES.grid} vertical={false} />
                <XAxis
                  dataKey="year"
                  type="number"
                  domain={[0, YEARS]}
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
                  label={{ value: 'R1m grown to (nominal)', angle: -90, position: 'insideLeft', offset: -2, fontSize: 11, fill: SERIES.axis }}
                />
                <Tooltip
                  cursor={{ stroke: SERIES.axis, strokeWidth: 1 }}
                  content={(p) => <ChartTooltipContent {...p} formatValue={formatRand} formatLabel={(l) => `Year ${l ?? ''}`} />}
                />
                <Legend verticalAlign="top" height={32} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                {seriesList.map((s) => (
                  <Line
                    key={s.id}
                    type="monotone"
                    dataKey={s.id}
                    name={
                      s.longRun && s.longRun.rate !== null
                        ? `${s.name} (${s.longRun.label} ${formatPct(s.longRun.rate, 1)})`
                        : s.name
                    }
                    stroke={s.color}
                    strokeWidth={2}
                    strokeDasharray={s.dashed ? '6 3' : undefined}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: '#ffffff' }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartFrame>
    </div>
  )
}

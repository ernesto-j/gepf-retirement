import { useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Assumptions } from '../../engine/types'
import { projectHedge } from '../../engine/hedge'
import { formatRand, formatRandCompact } from '../../engine/money'
import { SERIES, chartMargin, tickRand } from '../chartTheme'
import { ChartFrame, ChartTooltipContent, axisTick } from '../charts/IncomeChart'
import { Callout, Grid, KpiTile, PercentInput, RandInput, Slider, Toggle } from '../ui'

const fmt = (v: number) => formatRand(v)

export function HedgeProjectionPanel({ assumptions, defaultCapital }: { assumptions: Assumptions; defaultCapital: number }) {
  const [capital, setCapital] = useState(Math.max(100_000, Math.round(defaultCapital / 10_000) * 10_000))
  const [years, setYears] = useState<20 | 30>(20)
  const [offshorePct, setOffshorePct] = useState(0.5)
  const [depreciation, setDepreciation] = useState(assumptions.randDepreciation)
  const [randStrengthens, setRandStrengthens] = useState(false)

  const scenarioAssumptions: Assumptions = useMemo(() => ({ ...assumptions, randDepreciation: depreciation }), [assumptions, depreciation])

  const rows = useMemo(() => {
    try {
      return projectHedge({
        capital,
        years,
        offshoreShareHedged: offshorePct,
        assumptions: scenarioAssumptions,
        randStrengthYears: randStrengthens ? 5 : undefined,
        randStrengthRate: randStrengthens ? -0.08 : undefined,
      })
    } catch {
      return null
    }
  }, [capital, years, offshorePct, scenarioAssumptions, randStrengthens])

  const last = rows && rows.length > 0 ? rows[rows.length - 1] : null
  const realRatio = last && last.unhedgedReal > 0 ? last.hedgedReal / last.unhedgedReal : null
  const nominalRatio = last && last.unhedgedNominal > 0 ? last.hedgedNominal / last.unhedgedNominal : null

  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <RandInput label="Starting capital" value={capital} onChange={setCapital} step={50_000} />
        <div>
          <span className="label">Horizon</span>
          <div className="mt-1 inline-flex overflow-hidden rounded-md border border-slate-300">
            {[20, 30].map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setYears(y as 20 | 30)}
                className={`px-3 py-2 text-sm font-medium ${years === y ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                {y} years
              </button>
            ))}
          </div>
        </div>
        <Slider label="Offshore share (hedged route)" value={offshorePct} onChange={setOffshorePct} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} />
        <PercentInput label="Rand depreciation p.a." value={depreciation} onChange={setDepreciation} min={-0.05} max={0.15} step={0.5} />
      </Grid>
      <Toggle
        label="Stress test: the rand strengthens for the first 5 years"
        checked={randStrengthens}
        onChange={setRandStrengthens}
        help="Simulates roughly 8% p.a. rand appreciation for years 1–5 before reverting to the depreciation rate above — offshore assets lose ground in rand terms during this period."
      />

      {!rows ? (
        <Callout tone="warn" title="Hedge projection not ready">
          The hedge calculation engine did not return a result. Try again shortly.
        </Callout>
      ) : (
        <>
          <Grid cols={3}>
            <KpiTile
              label={`Nominal capital after ${years} years`}
              value={last ? formatRandCompact(last.hedgedNominal) : '—'}
              sub={last ? `vs ${formatRandCompact(last.unhedgedNominal)} unhedged` : undefined}
              tone="brand"
            />
            <KpiTile
              label="Real (today's rand) advantage"
              value={realRatio !== null ? `${realRatio.toFixed(2)}×` : '—'}
              sub={`${Math.round(offshorePct * 100)}% offshore vs 0% offshore, purchasing power`}
              tone={realRatio !== null && realRatio >= 1 ? 'ok' : 'warn'}
            />
            <KpiTile
              label="Nominal ratio"
              value={nominalRatio !== null ? `${nominalRatio.toFixed(2)}×` : '—'}
              sub="Hedged ÷ unhedged, rand of the year"
              tone="neutral"
            />
          </Grid>

          <ChartFrame
            title={`Nominal rand: ${Math.round(offshorePct * 100)}% offshore ${
              nominalRatio !== null && nominalRatio >= 1 ? 'grows faster' : 'grows more slowly'
            } than staying fully in rand`}
            caption="Nominal rand value of the same starting capital, invested 0% offshore ('unhedged') vs your chosen offshore share ('hedged'). Nominal values are not adjusted for inflation."
          >
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows} margin={{ ...chartMargin, bottom: 20, left: 12 }}>
                  <CartesianGrid stroke={SERIES.grid} vertical={false} />
                  <XAxis
                    dataKey="year"
                    tick={axisTick}
                    tickLine={false}
                    axisLine={{ stroke: SERIES.grid }}
                    label={{ value: 'Year', position: 'insideBottom', offset: -12, fontSize: 11, fill: SERIES.axis }}
                  />
                  <YAxis
                    tickFormatter={tickRand}
                    tick={axisTick}
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    label={{ value: 'Capital (R, nominal)', angle: -90, position: 'insideLeft', offset: -2, fontSize: 11, fill: SERIES.axis }}
                  />
                  <Tooltip cursor={{ stroke: SERIES.axis, strokeWidth: 1 }} content={(p) => <ChartTooltipContent {...p} formatValue={fmt} formatLabel={(l) => `Year ${l ?? ''}`} />} />
                  <Legend verticalAlign="top" height={32} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="unhedgedNominal" name="0% offshore" stroke={SERIES.stay} strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="hedgedNominal" name={`${Math.round(offshorePct * 100)}% offshore`} stroke={SERIES.cash} strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartFrame>

          <ChartFrame
            title={`Real (today's rand) purchasing power over ${years} years`}
            caption="The same two portfolios, deflated by your personal inflation rate so the y-axis shows what the capital is actually worth in today's terms — the fairer comparison for a long retirement."
          >
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows} margin={{ ...chartMargin, bottom: 20, left: 12 }}>
                  <CartesianGrid stroke={SERIES.grid} vertical={false} />
                  <XAxis
                    dataKey="year"
                    tick={axisTick}
                    tickLine={false}
                    axisLine={{ stroke: SERIES.grid }}
                    label={{ value: 'Year', position: 'insideBottom', offset: -12, fontSize: 11, fill: SERIES.axis }}
                  />
                  <YAxis
                    tickFormatter={tickRand}
                    tick={axisTick}
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    label={{ value: 'Capital (R, today’s rand)', angle: -90, position: 'insideLeft', offset: -2, fontSize: 11, fill: SERIES.axis }}
                  />
                  <Tooltip cursor={{ stroke: SERIES.axis, strokeWidth: 1 }} content={(p) => <ChartTooltipContent {...p} formatValue={fmt} formatLabel={(l) => `Year ${l ?? ''}`} />} />
                  <Legend verticalAlign="top" height={32} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="unhedgedReal" name="0% offshore" stroke={SERIES.stay} strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="hedgedReal" name={`${Math.round(offshorePct * 100)}% offshore`} stroke={SERIES.cash} strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartFrame>
        </>
      )}
    </div>
  )
}

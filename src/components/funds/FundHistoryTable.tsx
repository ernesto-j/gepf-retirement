import { useMemo, useState } from 'react'
import type { FundInfo, GepfRules, Profile, ScenarioDefinition, TaxTables } from '../../engine/types'
import { runScenario } from '../../engine/projection'
import { fundLongRunReturn, growthOfCapital, type FundLongRunReturn } from '../../engine/funds'
import { formatPct, formatRand } from '../../engine/money'
import { ageTile } from '../compare/helpers'
import { Badge, DataTable, td, th } from '../ui'

type Basis = 'assumption' | 'fund-history'

/**
 * R1,000,000 grown for 30 years at the fund's longest available annualised return
 * (`fundLongRunReturn`), grossed up by TER (long-run returns are net of TER only, like
 * `returns.y1/y3/...`) then reduced by the fund's full all-in fee (TIC + platform + advice) —
 * the same TER-gross-up-then-all-in-fee-deduct convention `fundGrossReturn` uses for the
 * planner's 'fund-history' return basis. `value` is null when the fund has no long-run figure
 * on record (`longRun.rate === null`) — shown as "—", not a guessed number.
 */
function r1mAfter30(fund: FundInfo): { value: number | null; longRun: FundLongRunReturn } {
  const longRun = fundLongRunReturn(fund)
  if (longRun.rate === null) return { value: null, longRun }
  const grossReturn = longRun.rate + fund.ter
  return { value: growthOfCapital(grossReturn, fund.allInFee, 30), longRun }
}

interface FundRunRow {
  fund: FundInfo
  a: ReturnType<typeof runScenario>
  b: ReturnType<typeof runScenario>
  r1m30: number | null
  longRun: FundLongRunReturn
}

type SortKey =
  | 'name'
  | 'allInFee'
  | 'y10'
  | 'r1m30'
  | 'aShortfall'
  | 'aRuin'
  | 'aLifetime'
  | 'aLegacy'
  | 'bShortfall'
  | 'bRuin'
  | 'bLifetime'
  | 'bLegacy'
type SortDir = 'asc' | 'desc'

const TYPE_LABEL: Record<FundInfo['type'], string> = {
  index: 'Index',
  active: 'Active',
  'full-service': 'Full-service',
  gepf: 'GEPF (no fee)',
}

const TONE_TEXT: Record<'ok' | 'warn' | 'danger', string> = {
  ok: 'text-emerald-700',
  warn: 'text-amber-700',
  danger: 'text-red-700',
}

const retCell = (v: number | null | undefined) => (v === null || v === undefined ? '—' : formatPct(v, 1))

function sortValue(row: FundRunRow, key: SortKey): number | string {
  switch (key) {
    case 'name':
      return row.fund.name.toLowerCase()
    case 'allInFee':
      return row.fund.allInFee
    case 'y10':
      return row.fund.returns.y10 ?? -Infinity
    case 'r1m30':
      return row.r1m30 ?? -Infinity
    case 'aShortfall':
      return row.a.incomeShortfallAge ?? Infinity
    case 'aRuin':
      return row.a.ruinAge ?? Infinity
    case 'aLifetime':
      return row.a.totals.pvNetIncome
    case 'aLegacy':
      return row.a.totals.legacyAtHorizonReal
    case 'bShortfall':
      return row.b.incomeShortfallAge ?? Infinity
    case 'bRuin':
      return row.b.ruinAge ?? Infinity
    case 'bLifetime':
      return row.b.totals.pvNetIncome
    case 'bLegacy':
      return row.b.totals.legacyAtHorizonReal
  }
}

/**
 * Index set of the rows tying for the best score on one column. `nullIsBest` treats a null
 * value (e.g. "never runs out") as the best possible outcome, matching `compareScenarios`.
 */
function bestSet(values: (number | null)[], opts: { higherIsBetter: boolean; nullIsBest?: boolean }): Set<number> {
  const score = (v: number | null): number => {
    if (v === null) return opts.nullIsBest ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
    return opts.higherIsBetter ? v : -v
  }
  const scores = values.map(score)
  const best = scores.length > 0 ? Math.max(...scores) : Number.NEGATIVE_INFINITY
  const idx = new Set<number>()
  if (!Number.isFinite(best)) {
    if (best === Number.POSITIVE_INFINITY) values.forEach((v, i) => v === null && idx.add(i))
    return idx
  }
  scores.forEach((s, i) => s === best && idx.add(i))
  return idx
}

function HeaderCell({
  label,
  sortKey,
  sort,
  onSort,
  align = 'right',
  help,
}: {
  label: string
  sortKey: SortKey
  sort: { key: SortKey; dir: SortDir }
  onSort: (key: SortKey) => void
  align?: 'left' | 'right'
  help?: string
}) {
  const active = sort.key === sortKey
  return (
    <th scope="col" className={`${th} ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={help}
        className={`inline-flex items-center gap-1 whitespace-nowrap hover:text-slate-800 ${active ? 'text-brand-700' : ''}`}
      >
        {label}
        <span aria-hidden="true" className="text-[10px]">
          {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  )
}

/**
 * Runs the given 'preserve & living annuity' route once per investable fund, twice each: (a)
 * with the common return assumption (so only fees differ between funds) and (b) with
 * `returnBasis: 'fund-history'` (so each fund grows at its own track record). Sortable, with the
 * best outcome per column highlighted.
 */
export function FundHistoryTable({
  profile,
  funds,
  tables,
  rules,
  baseDefinition,
  onUseInPlanner,
}: {
  profile: Profile
  funds: FundInfo[]
  tables: TaxTables
  rules: GepfRules
  baseDefinition: ScenarioDefinition
  onUseInPlanner: (fund: FundInfo, returnBasis: Basis) => void
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'allInFee', dir: 'asc' })

  const rows = useMemo<FundRunRow[]>(() => {
    const deps = { tables, rules, funds }
    return funds
      .filter((f) => f.id !== 'gepf')
      .map((fund) => {
        const shared: Partial<ScenarioDefinition> = { fundId: fund.id, offshorePct: Math.min(baseDefinition.offshorePct, fund.maxOffshore) }
        const defA: ScenarioDefinition = { ...baseDefinition, ...shared, id: `perfund-a-${fund.id}`, returnBasis: 'assumption' }
        const defB: ScenarioDefinition = { ...baseDefinition, ...shared, id: `perfund-b-${fund.id}`, returnBasis: 'fund-history' }
        const { value: r1m30, longRun } = r1mAfter30(fund)
        return { fund, a: runScenario(profile, defA, deps), b: runScenario(profile, defB, deps), r1m30, longRun }
      })
  }, [profile, funds, tables, rules, baseDefinition])

  const sorted = useMemo(() => {
    const copy = [...rows]
    copy.sort((x, y) => {
      const vx = sortValue(x, sort.key)
      const vy = sortValue(y, sort.key)
      const cmp = typeof vx === 'string' && typeof vy === 'string' ? vx.localeCompare(vy) : Number(vx) - Number(vy)
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [rows, sort])

  function onSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  const planToAge = Math.round(profile.person.planToAge)
  const best = {
    fee: bestSet(sorted.map((r) => r.fund.allInFee), { higherIsBetter: false }),
    y10: bestSet(sorted.map((r) => r.fund.returns.y10), { higherIsBetter: true }),
    r1m30: bestSet(sorted.map((r) => r.r1m30), { higherIsBetter: true }),
    aShortfall: bestSet(sorted.map((r) => r.a.incomeShortfallAge), { higherIsBetter: true, nullIsBest: true }),
    aRuin: bestSet(sorted.map((r) => r.a.ruinAge), { higherIsBetter: true, nullIsBest: true }),
    aLifetime: bestSet(sorted.map((r) => r.a.totals.pvNetIncome), { higherIsBetter: true }),
    aLegacy: bestSet(sorted.map((r) => r.a.totals.legacyAtHorizonReal), { higherIsBetter: true }),
    bShortfall: bestSet(sorted.map((r) => r.b.incomeShortfallAge), { higherIsBetter: true, nullIsBest: true }),
    bRuin: bestSet(sorted.map((r) => r.b.ruinAge), { higherIsBetter: true, nullIsBest: true }),
    bLifetime: bestSet(sorted.map((r) => r.b.totals.pvNetIncome), { higherIsBetter: true }),
    bLegacy: bestSet(sorted.map((r) => r.b.totals.legacyAtHorizonReal), { higherIsBetter: true }),
  }

  const hi = 'bg-emerald-50 font-semibold text-emerald-900'
  const ageCell = (age: number | null) => {
    const t = ageTile(age)
    return <span className={TONE_TEXT[t.tone]}>{t.value}</span>
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        (a) grows every fund at the {formatPct(profile.assumptions.localBalancedReturn, 1)} global return assumption, so only fees tell funds
        apart; (b) instead grows each fund at its own historic return (10/5/3-year fact-sheet return, grossed up by TER). Past returns are one
        data point about a fund, not a forecast of what it will do next.
      </p>
      <DataTable caption="Every investable fund run through the preserve-and-draw-a-living-annuity route: (a) the common return assumption, (b) each fund's own historic return. Click a column heading to sort.">
        <thead className="bg-slate-50">
          <tr>
            <HeaderCell label="Fund" sortKey="name" sort={sort} onSort={onSort} align="left" />
            <HeaderCell label="All-in fee" sortKey="allInFee" sort={sort} onSort={onSort} help="TIC + platform + advice" />
            <HeaderCell label="10yr return" sortKey="y10" sort={sort} onSort={onSort} help="Fund's own annualised 10-year return, net of TER" />
            <HeaderCell
              label="R1m after 30 yrs"
              sortKey="r1m30"
              sort={sort}
              onSort={onSort}
              help="R1,000,000 grown for 30 years at the fund's longest available annualised return, grossed up by TER then reduced by the full all-in fee — illustrative, not a forecast. Hover a value for the return used."
            />
            <HeaderCell label="(a) Shortfall from" sortKey="aShortfall" sort={sort} onSort={onSort} help="Age income first falls below target, global assumption" />
            <HeaderCell label="(a) Runs out at" sortKey="aRuin" sort={sort} onSort={onSort} help="Age capital is exhausted, global assumption" />
            <HeaderCell label="(a) Lifetime income" sortKey="aLifetime" sort={sort} onSort={onSort} help="Lifetime net income, today's rand, global assumption" />
            <HeaderCell label={`(a) Capital at ${planToAge}`} sortKey="aLegacy" sort={sort} onSort={onSort} help="Capital left at the planning horizon, today's rand, global assumption" />
            <HeaderCell label="(b) Shortfall from" sortKey="bShortfall" sort={sort} onSort={onSort} help="Age income first falls below target, fund's own history" />
            <HeaderCell label="(b) Runs out at" sortKey="bRuin" sort={sort} onSort={onSort} help="Age capital is exhausted, fund's own history" />
            <HeaderCell label="(b) Lifetime income" sortKey="bLifetime" sort={sort} onSort={onSort} help="Lifetime net income, today's rand, fund's own history" />
            <HeaderCell label={`(b) Capital at ${planToAge}`} sortKey="bLegacy" sort={sort} onSort={onSort} help="Capital left at the planning horizon, today's rand, fund's own history" />
            <th scope="col" className={th}>
              <span className="sr-only">Use in planner</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((row, i) => (
            <tr key={row.fund.id}>
              <th scope="row" className={`${td} text-left font-medium text-slate-900`}>
                <div>{row.fund.name}</div>
                <div className="mt-0.5">
                  <Badge tone="neutral">{TYPE_LABEL[row.fund.type]}</Badge>
                </div>
              </th>
              <td className={`${td} text-right ${best.fee.has(i) ? hi : ''}`}>{formatPct(row.fund.allInFee, 2)}</td>
              <td className={`${td} text-right ${best.y10.has(i) ? hi : ''}`} title={row.fund.returnsConfidence === 'approximate' ? 'Approximate: fact sheet not verified' : undefined}>{retCell(row.fund.returns.y10)}{row.fund.returnsConfidence === 'approximate' && row.fund.returns.y10 !== null ? ' ≈' : ''}</td>
              <td
                className={`${td} text-right ${best.r1m30.has(i) ? hi : ''}`}
                title={
                  row.r1m30 === null
                    ? 'No long-run return figure on record for this fund'
                    : `Based on the fund's ${row.longRun.label} return (${formatPct(row.longRun.rate, 1)}${row.fund.returnsConfidence === 'approximate' ? ' ≈' : ''}), grossed up by its ${formatPct(row.fund.ter, 2)} TER, then compounded for 30 years net of its ${formatPct(row.fund.allInFee, 2)} all-in fee.`
                }
              >
                {row.r1m30 === null ? '—' : formatRand(row.r1m30)}
              </td>
              <td className={`${td} text-right ${best.aShortfall.has(i) ? hi : ''}`}>{ageCell(row.a.incomeShortfallAge)}</td>
              <td className={`${td} text-right ${best.aRuin.has(i) ? hi : ''}`}>{ageCell(row.a.ruinAge)}</td>
              <td className={`${td} text-right ${best.aLifetime.has(i) ? hi : ''}`}>{formatRand(row.a.totals.pvNetIncome)}</td>
              <td className={`${td} text-right ${best.aLegacy.has(i) ? hi : ''}`}>{formatRand(row.a.totals.legacyAtHorizonReal)}</td>
              <td className={`${td} text-right ${best.bShortfall.has(i) ? hi : ''}`}>{ageCell(row.b.incomeShortfallAge)}</td>
              <td className={`${td} text-right ${best.bRuin.has(i) ? hi : ''}`}>{ageCell(row.b.ruinAge)}</td>
              <td className={`${td} text-right ${best.bLifetime.has(i) ? hi : ''}`}>{formatRand(row.b.totals.pvNetIncome)}</td>
              <td className={`${td} text-right ${best.bLegacy.has(i) ? hi : ''}`}>{formatRand(row.b.totals.legacyAtHorizonReal)}</td>
              <td className={td}>
                <div className="flex justify-end gap-1">
                  <button type="button" className="btn-secondary whitespace-nowrap px-2 py-1 text-xs" onClick={() => onUseInPlanner(row.fund, 'assumption')}>
                    Use (a)
                  </button>
                  <button type="button" className="btn-secondary whitespace-nowrap px-2 py-1 text-xs" onClick={() => onUseInPlanner(row.fund, 'fund-history')}>
                    Use (b)
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  )
}

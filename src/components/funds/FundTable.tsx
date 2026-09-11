import { useMemo, useState } from 'react'
import type { FundInfo } from '../../engine/types'
import { formatPct } from '../../engine/money'
import { Badge, DataTable, td, th } from '../ui'

type SortKey = 'name' | 'ter' | 'tc' | 'tic' | 'platformFee' | 'adviceFee' | 'allInFee' | 'y1' | 'y3' | 'y5' | 'y10' | 'maxOffshore'
type SortDir = 'asc' | 'desc'

const TYPE_LABEL: Record<FundInfo['type'], string> = {
  index: 'Index',
  active: 'Active',
  'full-service': 'Full-service',
  gepf: 'GEPF (no fee)',
}

const TYPE_TONE: Record<FundInfo['type'], 'brand' | 'neutral' | 'warn' | 'ok'> = {
  index: 'ok',
  active: 'brand',
  'full-service': 'warn',
  gepf: 'neutral',
}

function sortValue(f: FundInfo, key: SortKey): number | string {
  switch (key) {
    case 'name':
      return f.name.toLowerCase()
    case 'ter':
      return f.ter
    case 'tc':
      return f.tc
    case 'tic':
      return f.tic
    case 'platformFee':
      return f.platformFee
    case 'adviceFee':
      return f.adviceFee
    case 'allInFee':
      return f.allInFee
    case 'y1':
      return f.returns.y1 ?? -Infinity
    case 'y3':
      return f.returns.y3 ?? -Infinity
    case 'y5':
      return f.returns.y5 ?? -Infinity
    case 'y10':
      return f.returns.y10 ?? -Infinity
    case 'maxOffshore':
      return f.maxOffshore
  }
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

const pctCell = (v: number | null | undefined) => (v === null || v === undefined ? '—' : formatPct(v, 2))
const retCell = (v: number | null | undefined) => (v === null || v === undefined ? '—' : formatPct(v, 1))

export function FundTable({ funds, onUseInPlanner }: { funds: FundInfo[]; onUseInPlanner: (fund: FundInfo) => void }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'allInFee', dir: 'asc' })

  const sorted = useMemo(() => {
    const copy = [...funds]
    copy.sort((a, b) => {
      const va = sortValue(a, sort.key)
      const vb = sortValue(b, sort.key)
      const cmp = typeof va === 'string' && typeof vb === 'string' ? va.localeCompare(vb) : Number(va) - Number(vb)
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [funds, sort])

  function onSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  return (
    <DataTable caption="Funds sorted by all-in annual fee by default; click a column heading to sort by that column">
      <thead className="bg-slate-50">
        <tr>
          <HeaderCell label="Fund" sortKey="name" sort={sort} onSort={onSort} align="left" />
          <HeaderCell label="TER" sortKey="ter" sort={sort} onSort={onSort} help="Total expense ratio: fund management + fixed costs, annual" />
          <HeaderCell label="TC" sortKey="tc" sort={sort} onSort={onSort} help="Transaction costs incurred trading the fund's portfolio, annual" />
          <HeaderCell label="TIC" sortKey="tic" sort={sort} onSort={onSort} help="Total investment charge = TER + TC, the fund-level cost" />
          <HeaderCell label="Platform" sortKey="platformFee" sort={sort} onSort={onSort} help="Admin/platform fee for holding this fund in a living annuity or preservation fund" />
          <HeaderCell label="Advice" sortKey="adviceFee" sort={sort} onSort={onSort} help="Typical financial adviser fee (0 for DIY)" />
          <HeaderCell label="All-in fee" sortKey="allInFee" sort={sort} onSort={onSort} help="TIC + platform + advice: the total annual drag on your capital" />
          <HeaderCell label="1yr" sortKey="y1" sort={sort} onSort={onSort} />
          <HeaderCell label="3yr" sortKey="y3" sort={sort} onSort={onSort} />
          <HeaderCell label="5yr" sortKey="y5" sort={sort} onSort={onSort} />
          <HeaderCell label="10yr" sortKey="y10" sort={sort} onSort={onSort} />
          <HeaderCell label="Max offshore" sortKey="maxOffshore" sort={sort} onSort={onSort} help="Maximum offshore exposure available in a living annuity holding this fund" />
          <th scope="col" className={`${th} text-left`}>
            Reg 28
          </th>
          <th scope="col" className={`${th} text-left`}>
            Source
          </th>
          <th scope="col" className={th}>
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {sorted.map((f) => (
          <tr key={f.id} className={f.type === 'gepf' ? 'bg-brand-50/40' : undefined}>
            <th scope="row" className={`${td} text-left font-medium text-slate-900`}>
              <div>{f.name}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs font-normal text-slate-500">
                <Badge tone={TYPE_TONE[f.type]}>{TYPE_LABEL[f.type]}</Badge>
                <span>{f.manager}</span>
              </div>
              {f.notes && <p className="mt-1 max-w-xs text-xs font-normal text-slate-400">{f.notes}</p>}
            </th>
            <td className={`${td} text-right`}>{pctCell(f.ter)}</td>
            <td className={`${td} text-right`}>{pctCell(f.tc)}</td>
            <td className={`${td} text-right`}>{pctCell(f.tic)}</td>
            <td className={`${td} text-right`}>{pctCell(f.platformFee)}</td>
            <td className={`${td} text-right`}>{pctCell(f.adviceFee)}</td>
            <td className={`${td} text-right font-semibold text-slate-900`}>{pctCell(f.allInFee)}</td>
            <td className={`${td} text-right`}>{retCell(f.returns.y1)}</td>
            <td className={`${td} text-right`}>{retCell(f.returns.y3)}</td>
            <td className={`${td} text-right`}>{retCell(f.returns.y5)}</td>
            <td className={`${td} text-right`} title={f.returnsConfidence === 'approximate' ? 'Approximate: fact sheet not verified' : undefined}>{retCell(f.returns.y10)}{f.returnsConfidence === 'approximate' && f.returns.y10 !== null ? ' ≈' : ''}</td>
            <td className={`${td} text-right`}>{formatPct(f.maxOffshore, 0)}</td>
            <td className={td}>{f.reg28 ? <Badge tone="ok">Yes</Badge> : <Badge tone="neutral">No</Badge>}</td>
            <td className={td}>
              <a
                href={f.source}
                target="_blank"
                rel="noreferrer"
                className="text-brand-700 underline decoration-dotted underline-offset-2 hover:text-brand-800"
              >
                fact sheet
              </a>
              <div className="text-[10px] text-slate-400">as of {f.asOf}</div>
            </td>
            <td className={td}>
              {f.type === 'gepf' ? (
                <span className="text-xs text-slate-400">n/a</span>
              ) : (
                <button type="button" className="btn-secondary whitespace-nowrap px-2 py-1 text-xs" onClick={() => onUseInPlanner(f)}>
                  Use in planner
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  )
}

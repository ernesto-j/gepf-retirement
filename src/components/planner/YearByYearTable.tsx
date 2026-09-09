import { useState } from 'react'
import type { ScenarioResult, YearRow } from '../../engine/types'
import { formatRand } from '../../engine/money'
import { DataTable, td, th, tdRight } from '../ui'

interface Row {
  age: number
  a?: YearRow
  b?: YearRow
}

function mergeRows(a: ScenarioResult | null, b: ScenarioResult | null): Row[] {
  const ages = new Map<number, Row>()
  a?.rows.forEach((r) => {
    const age = Math.round(r.age)
    ages.set(age, { ...(ages.get(age) ?? { age }), a: r })
  })
  b?.rows.forEach((r) => {
    const age = Math.round(r.age)
    ages.set(age, { ...(ages.get(age) ?? { age }), b: r })
  })
  return [...ages.values()].sort((x, y) => x.age - y.age)
}

/** Collapsible year-by-year detail for the two selected scenarios. */
export function YearByYearTable({ a, b, nameA, nameB }: { a: ScenarioResult | null; b: ScenarioResult | null; nameA: string; nameB: string }) {
  const [open, setOpen] = useState(false)
  const rows = mergeRows(a, b)

  return (
    <div>
      <button type="button" className="btn-secondary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? 'Hide' : 'Show'} year-by-year table
      </button>
      {open && (
        <div className="mt-3">
          <DataTable caption="Net income, capital and tax by age for scenarios A and B">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" rowSpan={2} className={th}>
                  Age
                </th>
                {a && (
                  <th scope="colgroup" colSpan={4} className={`${th} border-l border-slate-200 text-center`}>
                    {nameA}
                  </th>
                )}
                {b && (
                  <th scope="colgroup" colSpan={4} className={`${th} border-l border-slate-200 text-center`}>
                    {nameB}
                  </th>
                )}
              </tr>
              <tr>
                {a && (
                  <>
                    <th scope="col" className={`${th} border-l border-slate-200 text-right`}>
                      Net income /m
                    </th>
                    <th scope="col" className={`${th} text-right`}>
                      Tax /m
                    </th>
                    <th scope="col" className={`${th} text-right`}>
                      Capital end
                    </th>
                    <th scope="col" className={`${th} text-right`}>
                      Capped?
                    </th>
                  </>
                )}
                {b && (
                  <>
                    <th scope="col" className={`${th} border-l border-slate-200 text-right`}>
                      Net income /m
                    </th>
                    <th scope="col" className={`${th} text-right`}>
                      Tax /m
                    </th>
                    <th scope="col" className={`${th} text-right`}>
                      Capital end
                    </th>
                    <th scope="col" className={`${th} text-right`}>
                      Capped?
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.age}>
                  <th scope="row" className={`${td} text-left font-medium`}>
                    {r.age}
                  </th>
                  {a && (
                    <>
                      <td className={`${tdRight} border-l border-slate-100`}>{r.a ? formatRand(r.a.totalNetIncome / 12) : '—'}</td>
                      <td className={tdRight}>{r.a ? formatRand((r.a.gepfPensionTax + r.a.drawTax) / 12) : '—'}</td>
                      <td className={tdRight}>{r.a ? formatRand(r.a.capitalEnd) : '—'}</td>
                      <td className={tdRight}>{r.a ? (r.a.capped ? 'Yes' : 'No') : '—'}</td>
                    </>
                  )}
                  {b && (
                    <>
                      <td className={`${tdRight} border-l border-slate-100`}>{r.b ? formatRand(r.b.totalNetIncome / 12) : '—'}</td>
                      <td className={tdRight}>{r.b ? formatRand((r.b.gepfPensionTax + r.b.drawTax) / 12) : '—'}</td>
                      <td className={tdRight}>{r.b ? formatRand(r.b.capitalEnd) : '—'}</td>
                      <td className={tdRight}>{r.b ? (r.b.capped ? 'Yes' : 'No') : '—'}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      )}
    </div>
  )
}

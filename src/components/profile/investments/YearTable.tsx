import { useState } from 'react'
import type { CustomInvestmentYear, InvestmentCurrency } from '../../../engine/types'
import { DataTable, R, td, th } from '../../ui'
import { formatCcy } from './currency'

/** Collapsible year-by-year projection table: most columns in the investment's own currency, plus rand columns for net cash, equity and sale proceeds. */
export function YearTable({ rows, currency }: { rows: CustomInvestmentYear[]; currency: InvestmentCurrency }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-3">
      <button
        type="button"
        className="flex items-center gap-2 text-sm font-medium text-brand-700 hover:text-brand-800"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        Year-by-year detail ({rows.length} year{rows.length === 1 ? '' : 's'})
      </button>
      {open && (
        <div className="mt-2">
          <DataTable caption="Year-by-year projection for this investment">
            <thead>
              <tr>
                <th className={th}>Age</th>
                <th className={th}>Event</th>
                <th className={th}>Value ({currency})</th>
                <th className={th}>Loan balance ({currency})</th>
                <th className={th}>Gross income ({currency})</th>
                <th className={th}>Costs ({currency})</th>
                <th className={th}>Interest ({currency})</th>
                <th className={th}>Principal ({currency})</th>
                <th className={th}>Tax ({currency})</th>
                <th className={th}>Net cash ({currency})</th>
                <th className={th}>Net cash (R)</th>
                <th className={th}>Equity (R)</th>
                <th className={th}>Proceeds (R)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.age} className={r.event ? 'bg-slate-50' : undefined}>
                  <td className={td}>{r.age}</td>
                  <td className={td}>{r.event ?? ''}</td>
                  <td className={td}>{formatCcy(r.valueCcy, currency)}</td>
                  <td className={td}>{formatCcy(r.loanBalanceCcy, currency)}</td>
                  <td className={td}>{formatCcy(r.grossIncomeCcy, currency)}</td>
                  <td className={td}>{formatCcy(r.costsCcy, currency)}</td>
                  <td className={td}>{formatCcy(r.interestCcy, currency)}</td>
                  <td className={td}>{formatCcy(r.principalCcy, currency)}</td>
                  <td className={td}>{formatCcy(r.taxCcy, currency)}</td>
                  <td className={td}>{formatCcy(r.netCashCcy, currency)}</td>
                  <td className={td}>{R(r.netCashZar)}</td>
                  <td className={td}>{R(r.equityZar)}</td>
                  <td className={td}>{r.saleProceedsZar !== undefined ? R(r.saleProceedsZar) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      )}
    </div>
  )
}

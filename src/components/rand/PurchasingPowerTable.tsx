import { useMemo } from 'react'
import { purchasingPower, requiredIncomeForPurchasingPower } from '../../engine/hedge'
import { formatRand } from '../../engine/money'
import { Callout, DataTable, td, th } from '../ui'

const YEARS = [10, 20, 30] as const

interface Col {
  key: 'official' | 'personal' | 'medical'
  label: string
  rate: number
}

export function PurchasingPowerTable({
  targetMonthlyIncome,
  officialCpi,
  personalInflation,
  medicalInflation,
}: {
  targetMonthlyIncome: number
  officialCpi: number
  personalInflation: number
  medicalInflation: number
}) {
  const cols: Col[] = [
    { key: 'official', label: 'Official CPI', rate: officialCpi },
    { key: 'personal', label: 'Your true inflation', rate: personalInflation },
    { key: 'medical', label: 'Medical inflation', rate: medicalInflation },
  ]

  const rows = useMemo(() => {
    try {
      const rates = [officialCpi, personalInflation, medicalInflation]
      return YEARS.map((years) => ({
        years,
        values: rates.map((rate) => requiredIncomeForPurchasingPower(targetMonthlyIncome, years, rate)),
      }))
    } catch {
      return null
    }
  }, [targetMonthlyIncome, officialCpi, personalInflation, medicalInflation])

  const erosion = useMemo(() => {
    try {
      return purchasingPower(targetMonthlyIncome, 20, personalInflation)
    } catch {
      return null
    }
  }, [targetMonthlyIncome, personalInflation])

  if (!rows) {
    return (
      <Callout tone="warn" title="Purchasing-power table not ready">
        The inflation calculation engine did not return a result. Try again shortly.
      </Callout>
    )
  }

  return (
    <div className="space-y-3">
      <DataTable caption="Monthly income needed in 10/20/30 years to buy what today's target income buys now, under three inflation rates">
        <thead className="bg-slate-50">
          <tr>
            <th scope="col" className={`${th} text-left`}>
              In…
            </th>
            {cols.map((c) => (
              <th key={c.key} scope="col" className={`${th} text-right`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.years}>
              <th scope="row" className={`${td} text-left font-medium text-slate-700`}>
                {r.years} years
              </th>
              {r.values.map((v, i) => (
                <td key={cols[i].key} className={`${td} text-right font-semibold`}>
                  {formatRand(v)} <span className="font-normal text-slate-400">/ month</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </DataTable>
      <p className="text-xs text-slate-500">
        Today your target is {formatRand(targetMonthlyIncome)} / month. Read across a row: that is what you would need to
        receive at that future date, under that inflation rate, to afford exactly what {formatRand(targetMonthlyIncome)}{' '}
        affords today. Put the other way: if your income never rose from today's {formatRand(targetMonthlyIncome)}, in 20
        years at your true inflation rate it would only buy what {erosion !== null ? formatRand(erosion) : '—'} buys today —
        this is why an income that only tracks (or lags) official CPI can still feel like it is shrinking.
      </p>
    </div>
  )
}

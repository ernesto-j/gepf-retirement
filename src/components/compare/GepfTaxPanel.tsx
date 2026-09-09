import type { Profile, ScenarioResult, TaxTables } from '../../engine/types'
import { calcMonthlyPaye } from '../../engine/tax'
import { formatPct, formatRand } from '../../engine/money'
import { Callout, DataTable, KpiTile, td, tdRight, th } from '../ui'
import { safe } from './helpers'

const AGES = [60, 65, 75] as const

/** Monthly PAYE on the GEPF pension for the stay route, and the effect of the age rebates. */
export function GepfTaxPanel({ stay, profile, tables }: { stay: ScenarioResult; profile: Profile; tables: TaxTables }) {
  const fy = stay.firstYear
  const gross = fy.gepfPensionMonthlyGross
  const tax = fy.gepfPensionMonthlyTax
  const net = fy.gepfPensionMonthlyNet
  const effective = gross > 0 ? tax / gross : 0
  const members = profile.lifestyle.medicalAidMembers
  const annualGross = gross * 12
  const exitAge = stay.definition.exitAge

  const byAge = AGES.map((age) => ({
    age,
    result: safe(() => calcMonthlyPaye(annualGross, age, tables, { medicalMembers: members }), null),
  }))
  const anyFailed = byAge.some((b) => b.result === null)

  if (gross <= 0) {
    return (
      <Callout tone="info" title="No GEPF pension in the stay route">
        The stay route has no monthly pension in its first year (fewer than {10} years’ service, or an exit age below the early-retirement
        minimum), so there is no PAYE to show.
      </Callout>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiTile label="Gross monthly pension" value={formatRand(gross)} sub={`first year, from age ${exitAge}`} help="GEPF annuity before tax in the first year after retirement." />
        <KpiTile label="PAYE per month" value={formatRand(tax)} sub="deducted from the pension" tone={tax > 0 ? 'warn' : 'ok'} help="Income tax on the pension, apportioned to the pension when other taxable income is present." />
        <KpiTile label="Net monthly pension" value={formatRand(net)} sub="paid into your account" tone="ok" />
        <KpiTile label="Effective tax rate" value={formatPct(effective)} sub="tax as a share of the gross pension" />
      </div>

      <div>
        <p className="mb-2 text-sm text-slate-600">
          The same gross pension of <span className="font-medium tabular-nums">{formatRand(gross)}</span> per month is taxed less as you age: from 65 the
          secondary rebate of {formatRand(tables.rebates.secondary)} a year applies, and from 75 the tertiary rebate of {formatRand(tables.rebates.tertiary)}{' '}
          is added on top of the primary rebate of {formatRand(tables.rebates.primary)}. The table holds the pension constant so that only the rebates
          change; it includes medical scheme credits for {members} member{members === 1 ? '' : 's'} and excludes other income.
        </p>
        {anyFailed ? (
          <Callout tone="warn" title="Tax engine not ready">
            The by-age PAYE table will appear once the tax engine is available.
          </Callout>
        ) : (
          <DataTable caption="Monthly PAYE on the same GEPF pension at ages 60, 65 and 75">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className={th}>
                  Age
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Tax-free threshold
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Rebates (per year)
                </th>
                <th scope="col" className={`${th} text-right`}>
                  PAYE / month
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Net / month
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Effective rate
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {byAge.map(({ age, result }) => {
                if (!result) return null
                const threshold = age >= 75 ? tables.thresholds.age75plus : age >= 65 ? tables.thresholds.age65to74 : tables.thresholds.under65
                const rate = gross > 0 ? result.monthlyTax / gross : 0
                return (
                  <tr key={age}>
                    <th scope="row" className={`${td} text-left font-medium`}>
                      {age}
                      <span className="block text-xs font-normal text-slate-400">{age >= 75 ? 'primary + secondary + tertiary' : age >= 65 ? 'primary + secondary' : 'primary rebate only'}</span>
                    </th>
                    <td className={tdRight}>{formatRand(threshold)}</td>
                    <td className={tdRight}>{formatRand(result.annual.rebates)}</td>
                    <td className={tdRight}>{formatRand(result.monthlyTax)}</td>
                    <td className={tdRight}>{formatRand(result.monthlyNet)}</td>
                    <td className={tdRight}>{formatPct(rate)}</td>
                  </tr>
                )
              })}
            </tbody>
          </DataTable>
        )}
        <p className="help">
          Tax year {tables.taxYear}. In reality the pension rises each year with the GEPF increase, so the rand amounts of tax will differ; the rebate
          effect is what this table isolates.
        </p>
      </div>
    </div>
  )
}

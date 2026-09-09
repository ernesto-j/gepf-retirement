import type { FundInfo, ScenarioResult } from '../../engine/types'
import { formatPct, formatRand, formatRandCompact } from '../../engine/money'
import { Badge, KpiTile } from '../ui'
import { KIND_LABEL, ageTile, describeRoute, lumpSumTaxSummary } from './helpers'

export function RouteCard({
  result,
  colour,
  funds,
  planToAge,
}: {
  result: ScenarioResult
  colour: string
  funds: FundInfo[]
  planToAge: number
}) {
  const { definition: def, atExit, firstYear, totals } = result
  const lump = lumpSumTaxSummary(result)
  const onTarget = firstYear.netMonthlyIncome >= firstYear.targetNetMonthlyIncome * 0.99
  const ruin = ageTile(result.ruinAge)
  const shortfall = ageTile(result.incomeShortfallAge)
  const offshoreShare = atExit.investedCapital > 0 ? atExit.investedOffshoreZar / atExit.investedCapital : 0
  const later = result.atRetirementFromPreservation

  return (
    <article className="card flex h-full flex-col" style={{ borderTopColor: colour, borderTopWidth: 4 }}>
      <header className="mb-3">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: colour }} />
          <h3 className="text-base font-semibold text-slate-900">{def.name}</h3>
        </div>
        <div className="mt-1">
          <Badge tone="neutral">{KIND_LABEL[def.kind]}</Badge>
        </div>
        <p className="mt-2 text-sm text-slate-600">{describeRoute(def, funds)}</p>
        {later && (
          <p className="mt-2 text-xs text-slate-500">
            At {later.age}: preservation value {formatRandCompact(later.preservationValue)} → lump sum {formatRandCompact(later.lumpSumGross)} (tax{' '}
            {formatRandCompact(later.lumpSumTax)}), {formatRandCompact(later.intoLivingAnnuity)} into a living annuity.
          </p>
        )}
      </header>

      <div className="grid grid-cols-2 gap-2">
        <KpiTile
          label="Net lump sum at exit"
          value={formatRandCompact(atExit.lumpSumNet)}
          sub={
            atExit.lumpSumTable === 'none'
              ? `Nothing taken in cash; ${formatRandCompact(atExit.transferredToPreservation)} transferred tax-free`
              : `${formatRandCompact(atExit.lumpSumGross)} gross on the ${atExit.lumpSumTable} table`
          }
          help="Cash received at exit after lump-sum tax, before once-off capital needs."
        />
        <KpiTile
          label="Tax on lump sum(s)"
          value={formatRandCompact(lump.tax)}
          sub={lump.gross > 0 ? `${formatPct(lump.effective)} of ${formatRandCompact(lump.gross)} gross` : 'No lump sum taxed'}
          tone={lump.tax > 0 ? 'warn' : 'ok'}
          help="Tax on the exit lump sum plus any lump sum taken later when retiring from a preservation fund, using SARS aggregation."
        />
        <KpiTile
          label="Invested capital"
          value={formatRandCompact(atExit.investedCapital)}
          sub={`${formatPct(offshoreShare, 0)} offshore at exit`}
          help="Capital actually invested at exit after once-off needs and FX costs, including other savings."
        />
        <KpiTile
          label="First-year net income"
          value={`${formatRandCompact(firstYear.netMonthlyIncome)} /m`}
          sub={`Target ${formatRandCompact(firstYear.targetNetMonthlyIncome)} /m`}
          tone={onTarget ? 'ok' : 'warn'}
          help="After-tax monthly income in the first year after exit, compared with your target."
        />
        <KpiTile
          label="First-year monthly tax"
          value={formatRand(firstYear.monthlyTax)}
          sub={`on ${formatRand(firstYear.grossMonthlyIncome)} gross`}
          help="PAYE on the pension and drawings in the first year, per month."
        />
        <KpiTile
          label="Guaranteed income share"
          value={formatPct(totals.guaranteedIncomeShare, 0)}
          sub="of first-year net income is a lifelong GEPF pension"
          tone={totals.guaranteedIncomeShare > 0.5 ? 'ok' : 'neutral'}
          help="Share of first-year net income that comes from the defined-benefit GEPF pension (paid for life)."
        />
        <KpiTile
          label="Income shortfall from"
          value={shortfall.value}
          sub={result.incomeShortfallAge === null ? `Target met to age ${planToAge}` : 'first age below target'}
          tone={shortfall.tone}
          help="First age at which net income falls more than 1% below your target."
        />
        <KpiTile
          label="Capital runs out"
          value={ruin.value}
          sub={result.ruinAge === null ? `Lasts to age ${planToAge}` : 'invested capital exhausted'}
          tone={ruin.tone}
          help="Age at which all investable capital (living annuity plus discretionary savings) is exhausted."
        />
        <KpiTile
          label={`Legacy at ${planToAge} (real)`}
          value={formatRandCompact(totals.legacyAtHorizonReal)}
          sub="today’s rand; the GEPF pension itself has no capital value"
          help="Capital left at the horizon, expressed in today’s rand using your personal inflation."
        />
        <KpiTile
          label="Medical subsidy forfeited"
          value={formatRandCompact(atExit.forfeitedMedicalSubsidyPv)}
          sub={atExit.forfeitedMedicalSubsidyPv > 0 ? 'present value of the lost subsidy' : 'nothing forfeited'}
          tone={atExit.forfeitedMedicalSubsidyPv > 0 ? 'danger' : 'ok'}
          help="Present value (today’s rand) of the post-retirement medical subsidy you give up by resigning."
        />
      </div>
    </article>
  )
}

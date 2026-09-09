import type { GepfRules, Profile, ScenarioResult } from '../../engine/types'
import { formatPct, formatRand, formatRandCompact } from '../../engine/money'
import { KpiTile } from '../ui'

/** What a member gives up by resigning instead of retiring from the GEPF. Sourced from the rules, profile and results. */
export function GiveUpPanel({
  stay,
  preserve,
  profile,
  rules,
}: {
  stay: ScenarioResult | undefined
  preserve: ScenarioResult | undefined
  profile: Profile
  rules: GepfRules
}) {
  const pensionMonthly = stay?.firstYear.gepfPensionMonthlyGross ?? 0
  const spousePct = profile.person.spousePensionPct / 100
  const spouseMonthly = pensionMonthly * spousePct
  const subsidyPv = preserve?.atExit.forfeitedMedicalSubsidyPv ?? 0
  const subsidyMonthly = profile.gepf.medicalSubsidyEligible ? profile.gepf.medicalSubsidyMonthly : 0
  const last = rules.status.lastIncreases[rules.status.lastIncreases.length - 1]
  const exitAge = stay?.definition.exitAge ?? profile.person.plannedExitAge

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Medical subsidy"
          value={formatRandCompact(subsidyPv)}
          sub={
            profile.gepf.medicalSubsidyEligible
              ? `present value of ${formatRand(subsidyMonthly)} / month, escalating at ${formatPct(profile.assumptions.medicalInflation)}`
              : 'not eligible (needs ' + rules.medicalSubsidyMinServiceYears + '+ years’ service on retirement)'
          }
          tone={subsidyPv > 0 ? 'danger' : 'neutral'}
          help="Employer medical-scheme subsidy paid for life to retirees with enough service; resignation forfeits it entirely."
        />
        <KpiTile
          label="Lifelong guaranteed pension"
          value={`${formatRandCompact(pensionMonthly)} /m`}
          sub={`gross from age ${exitAge}, rising each year; the state stands behind the promise`}
          tone="ok"
          help="Defined-benefit pension paid for the rest of your life regardless of markets or how long you live."
        />
        <KpiTile
          label="Spouse’s pension"
          value={`${formatRandCompact(spouseMonthly)} /m`}
          sub={`${profile.person.spousePensionPct}% of your pension continues to your spouse for life (${formatPct(rules.spousePensionDefault, 0)} default, ${formatPct(
            rules.spousePensionEnhanced,
            0,
          )} by election)`}
          tone={profile.person.hasSpouse ? 'ok' : 'neutral'}
          help="On your death the GEPF pays a percentage of your pension to a surviving spouse for life."
        />
        <KpiTile
          label={`${rules.guaranteeYears}-year guarantee`}
          value={formatRandCompact(pensionMonthly * 12 * rules.guaranteeYears)}
          sub={`${rules.guaranteeYears} years of pension is paid out even if you die soon after retiring`}
          help="If you die within the guarantee period, the balance of the guaranteed years’ pension is paid to your beneficiaries as a lump sum."
        />
      </div>
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
        <li>
          Annual increases: the rules guarantee at least {formatPct(rules.minIncreaseAsPctOfCpi, 0)} of CPI; the last granted increase was{' '}
          {last ? `${formatPct(last.increase)} for ${last.year} against CPI of ${formatPct(last.cpi)}` : 'not available'}.
        </li>
        <li>
          Fund status: funding level {formatPct(rules.status.fundingLevel, 0)} at the {rules.status.valuationDate} valuation, with about{' '}
          {formatPct(rules.status.offshoreAllocation, 0)} of assets offshore.
        </li>
        <li>
          Resigning also gives up the retirement lump-sum table for the exit benefit (cash-outs are taxed on the withdrawal table) and, from 1 October 2025,
          the actuarial interest is calculated with revised factors.
        </li>
      </ul>
    </div>
  )
}

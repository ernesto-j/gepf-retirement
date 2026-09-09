import type { ReactNode } from 'react'
import type { GepfMembership, GepfStatementValues, Profile } from '../../engine/types'
import { gepfBenefitsAtExit, getGepfRules } from '../../engine/gepf'
import { applyStatement } from '../../engine/statement'
import { Badge, Callout, DataTable, Grid, KpiTile, NumberInput, P, PercentInput, R, RandInput, Section, Toggle, td, th } from '../../components/ui'
import StatementUpload from '../StatementUpload'

const STATEMENT_ROWS: { key: keyof GepfStatementValues; label: string; format?: (v: unknown) => string }[] = [
  { key: 'statementDate', label: 'Statement date' },
  { key: 'memberNumber', label: 'Member number' },
  { key: 'employer', label: 'Employer' },
  { key: 'pensionableServiceYears', label: 'Pensionable service (years)', format: (v) => String(v) },
  { key: 'finalSalaryAnnual', label: 'Final salary (annual)', format: (v) => R(v as number) },
  { key: 'resignationBenefit', label: 'Resignation benefit', format: (v) => R(v as number) },
  { key: 'retirementGratuity', label: 'Retirement gratuity', format: (v) => R(v as number) },
  { key: 'retirementAnnuityAnnual', label: 'Retirement annuity (annual)', format: (v) => R(v as number) },
  { key: 'deathBenefitLumpSum', label: 'Death benefit lump sum', format: (v) => R(v as number) },
  { key: 'vestedComponent', label: 'Vested component', format: (v) => R(v as number) },
  { key: 'savingsComponent', label: 'Savings component', format: (v) => R(v as number) },
  { key: 'retirementComponent', label: 'Retirement component', format: (v) => R(v as number) },
  { key: 'notes', label: 'Notes' },
]

export function GepfSection({
  profile,
  onChange,
  onReplaceProfile,
}: {
  profile: Profile
  onChange: (patch: Partial<GepfMembership>) => void
  onReplaceProfile: (profile: Profile) => void
}) {
  const gepf = profile.gepf
  const statement = gepf.statement

  return (
    <Section title="Your GEPF membership" description="Service, salary and any benefit statement you have on hand.">
      <div className="mb-4">
        <StatementUpload onExtracted={(v) => onReplaceProfile(applyStatement(profile, v))} />
      </div>

      {statement && (
        <div className="mb-4 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <Toggle
              label="Use my statement's values"
              checked={gepf.useStatementValues}
              onChange={(v) => onChange({ useStatementValues: v })}
              help="When on, the preview below (and every scenario) uses the extracted benefit values instead of the formula estimate."
            />
            <button
              type="button"
              className="btn-secondary ml-auto"
              onClick={() => onChange({ statement: undefined, useStatementValues: false })}
            >
              Clear statement
            </button>
          </div>
          <DataTable caption="Values extracted from your GEPF benefit statement">
            <thead>
              <tr>
                <th scope="col" className={th}>
                  Field
                </th>
                <th scope="col" className={th}>
                  Value
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {STATEMENT_ROWS.filter((row) => statement[row.key] !== undefined && statement[row.key] !== '').map((row) => (
                <tr key={row.key}>
                  <th scope="row" className={`${td} font-medium text-slate-600`}>
                    {row.label}
                  </th>
                  <td className={td}>{row.format ? row.format(statement[row.key]) : String(statement[row.key])}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          {statement.uncertainFields && statement.uncertainFields.length > 0 && (
            <Callout tone="warn" title="Low-confidence fields">
              The extractor was unsure about: {statement.uncertainFields.join(', ')}. Double check these against your statement.
            </Callout>
          )}
        </div>
      )}

      <Grid cols={3}>
        <NumberInput
          label="Pensionable service now"
          suffix="years"
          value={gepf.pensionableServiceYearsNow}
          min={0}
          max={50}
          step={0.5}
          onChange={(v) => onChange({ pensionableServiceYearsNow: v })}
          help="Total pensionable service to date, including purchased service."
        />
        <RandInput
          label="Pensionable salary"
          monthly={false}
          value={gepf.pensionableSalaryAnnual}
          min={0}
          step={5000}
          onChange={(v) => onChange({ pensionableSalaryAnnual: v })}
          help="Current annual pensionable (not total cost-to-company) salary."
        />
        <PercentInput
          label="Expected salary growth"
          value={gepf.salaryGrowth}
          min={-0.1}
          max={0.3}
          onChange={(v) => onChange({ salaryGrowth: v })}
          help="Nominal annual increase until you exit."
        />
        <NumberInput
          label="Service before 1 Sep 2024 (two-pot)"
          suffix="years, optional"
          value={gepf.serviceYearsBeforeTwoPot ?? 0}
          min={0}
          max={50}
          step={0.5}
          onChange={(v) => onChange({ serviceYearsBeforeTwoPot: v })}
          help="Leave at 0 to let the app estimate this from your service and today's date."
        />
        <RandInput
          label="Previous withdrawal lump sums"
          value={gepf.previousLumpSumsWithdrawal}
          min={0}
          step={10000}
          onChange={(v) => onChange({ previousLumpSumsWithdrawal: v })}
          help="Resignation cash previously received from any fund since 1 Mar 2009 (affects lump-sum tax aggregation)."
        />
        <RandInput
          label="Previous retirement lump sums"
          value={gepf.previousLumpSumsRetirement}
          min={0}
          step={10000}
          onChange={(v) => onChange({ previousLumpSumsRetirement: v })}
          help="Retirement/retrenchment/death lump sums previously received (affects tax aggregation)."
        />
        <div className="flex flex-col gap-3">
          <Toggle
            label="Eligible for the post-retirement medical subsidy"
            checked={gepf.medicalSubsidyEligible}
            onChange={(v) => onChange({ medicalSubsidyEligible: v })}
            help="Usually requires 15+ years' service and retiring (not resigning)."
          />
        </div>
        {gepf.medicalSubsidyEligible && (
          <RandInput
            label="Medical subsidy"
            monthly
            value={gepf.medicalSubsidyMonthly}
            min={0}
            step={500}
            onChange={(v) => onChange({ medicalSubsidyMonthly: v })}
          />
        )}
      </Grid>

      <div className="mt-4">
        <GepfPreview profile={profile} />
      </div>
    </Section>
  )
}

function GepfPreview({ profile }: { profile: Profile }) {
  const exitAge = profile.person.plannedExitAge
  let content: ReactNode
  try {
    const rules = getGepfRules()
    const { retirement, resignation, serviceYears, finalSalaryAnnual, source } = gepfBenefitsAtExit(profile, exitAge, rules)
    const prevAi = resignation.actuarialInterestPreviousFactors
    const pctDiff = prevAi && prevAi > 0 ? resignation.actuarialInterest / prevAi - 1 : null
    content = (
      <>
        <Grid cols={4}>
          <KpiTile label="Final salary (est.)" value={R(finalSalaryAnnual)} sub={`${serviceYears.toFixed(1)} years' service`} />
          <KpiTile label="Retirement gratuity" value={R(retirement.gratuity)} sub={retirement.gratuityOnly ? 'Gratuity only (<10 yrs)' : undefined} />
          <KpiTile
            label="Monthly pension (before tax)"
            value={R(retirement.annuityMonthly)}
            sub={retirement.monthsEarly > 0 ? `${retirement.monthsEarly} months early, factor ${P(retirement.reductionFactor)}` : 'No early-retirement reduction'}
          />
          <KpiTile label="Max cash on resignation" value={R(resignation.maxCashOnResignation)} sub="Vested + savings component" />
        </Grid>
        <Grid cols={3} className="mt-3">
          <KpiTile label="Resignation value (2025 factors)" value={R(resignation.actuarialInterest)} sub={`Factor F(${exitAge}) = ${resignation.factorUsed.toFixed(4)}`} />
          <KpiTile
            label="Resignation value (2021 factors)"
            value={prevAi !== undefined ? R(prevAi) : '—'}
            sub={pctDiff !== null ? `${pctDiff >= 0 ? '+' : ''}${P(pctDiff)} vs 2021` : 'No 2021 table available'}
            tone={pctDiff !== null && pctDiff < 0 ? 'warn' : 'neutral'}
          />
          <KpiTile
            label="Two-pot split"
            value={`${R(resignation.vestedComponent)} / ${R(resignation.savingsComponent)} / ${R(resignation.retirementComponent)}`}
            sub="Vested / savings / retirement"
          />
        </Grid>
        <p className="mt-2 text-xs text-slate-500">
          Source: <Badge tone={source === 'statement' ? 'brand' : 'neutral'}>{source === 'statement' ? 'your benefit statement' : 'formula estimate'}</Badge>{' '}
          {source === 'statement'
            ? '— grown from your statement values to the planned exit age.'
            : '— GEPF Rule 14.4 formula: gratuity + annuity × age factor, using the 1 Oct 2025 factor table.'}
        </p>
      </>
    )
  } catch (err) {
    content = (
      <Callout tone="danger" title="Couldn't compute a preview">
        {err instanceof Error ? err.message : 'Check your service years, salary and exit age.'}
      </Callout>
    )
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <h3 className="text-sm font-semibold text-slate-800">Your GEPF numbers at exit age {exitAge}</h3>
      <div className="mt-2">{content}</div>
    </div>
  )
}

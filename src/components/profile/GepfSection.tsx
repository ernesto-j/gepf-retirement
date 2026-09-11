import type { ReactNode } from 'react'
import type { ExitProgrammeChoice, GepfMembership, GepfStatementValues, Profile } from '../../engine/types'
import { gepfBenefitsAtExit, getGepfRules } from '../../engine/gepf'
import { applyStatement } from '../../engine/statement'
import { calcRetirementLumpSumTax, getTaxTables } from '../../engine/tax'
import { Badge, Callout, DataTable, Grid, KpiTile, NumberInput, P, PercentInput, R, RandInput, Section, SelectInput, Toggle, td, th } from '../../components/ui'
import StatementUpload from '../StatementUpload'

const EXIT_PROGRAMME_OPTIONS: { value: ExitProgrammeChoice; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'erp', label: 'ERP approved (55–59, no penalty + incentive)' },
  { value: 'vep', label: 'VEP approved (60–63, incentive)' },
]

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
        <SelectInput<ExitProgrammeChoice>
          label="DPSA early-retirement / voluntary-exit programme"
          value={gepf.exitProgramme ?? 'none'}
          options={EXIT_PROGRAMME_OPTIONS}
          onChange={(v) => onChange({ exitProgramme: v })}
          help={
            <>
              DPSA Circular 38 of 2025. ERP: exit at 55–59 with no 1/3%-a-month early-retirement reduction plus 2 weeks’ basic salary per year
              for the first 20 years’ service and 1 week per completed year after that. VEP: exit at 60–63 with 2 weeks per year for the first
              10 years and 1 week thereafter. Both need 10+ years’ pensionable service and a permanent post. Phase 1 applications closed
              30 Nov 2025 (exits by 31 Mar 2026); phase 2 runs 1 Apr – 30 Sep 2026 for exits by 31 Mar 2027. Only set this once your Executive
              Authority has approved you — approval is discretionary, not automatic, and accepting precludes re-employment in the public service.
            </>
          }
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
    const { retirement, resignation, serviceYears, finalSalaryAnnual, incentive, source } = gepfBenefitsAtExit(profile, exitAge, rules)
    const prevAi = resignation.actuarialInterestPreviousFactors
    const pctDiff = prevAi && prevAi > 0 ? resignation.actuarialInterest / prevAi - 1 : null
    // Same aggregation as the projection: the incentive is a severance benefit taxed on the
    // retirement table immediately AFTER the gratuity.
    const programme = profile.gepf.exitProgramme === 'vep' ? 'VEP' : 'ERP'
    const tables = getTaxTables(profile.assumptions.taxYear)
    const previous = Math.max(0, profile.gepf.previousLumpSumsWithdrawal) + Math.max(0, profile.gepf.previousLumpSumsRetirement)
    const incentiveTax = incentive.eligible ? calcRetirementLumpSumTax(incentive.gross, previous + Math.max(0, retirement.gratuity), tables) : null
    content = (
      <>
        <Grid cols={4}>
          <KpiTile label="Final salary (est.)" value={R(finalSalaryAnnual)} sub={`${serviceYears.toFixed(1)} years' service`} />
          <KpiTile label="Retirement gratuity" value={R(retirement.gratuity)} sub={retirement.gratuityOnly ? 'Gratuity only (<10 yrs)' : undefined} />
          <KpiTile
            label="Monthly pension (before tax)"
            value={R(retirement.annuityMonthly)}
            sub={
              retirement.monthsEarly > 0 && retirement.reductionFactor >= 1
                ? `${retirement.monthsEarly} months early — reduction waived`
                : retirement.monthsEarly > 0
                  ? `${retirement.monthsEarly} months early, factor ${P(retirement.reductionFactor)}`
                  : 'No early-retirement reduction'
            }
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
        {incentive.eligible && incentiveTax && (
          <Grid cols={3} className="mt-3">
            <KpiTile
              label={`DPSA ${programme} incentive`}
              value={R(incentive.gross)}
              sub={`${incentive.weeks} weeks’ basic salary, gross`}
              tone="ok"
            />
            <KpiTile
              label="Expected tax on the incentive"
              value={R(incentiveTax.tax)}
              sub="severance benefit, retirement lump-sum table, aggregated after the gratuity"
              tone="warn"
            />
            <KpiTile
              label="Incentive after tax"
              value={R(incentiveTax.net)}
              sub={
                profile.gepf.exitProgramme === 'erp'
                  ? `Early-retirement reduction waived (${retirement.monthsEarly} months, factor ${P(retirement.reductionFactor)})`
                  : 'No early-retirement reduction applies at 60+'
              }
              tone="ok"
            />
          </Grid>
        )}
        {profile.gepf.exitProgramme !== undefined && profile.gepf.exitProgramme !== 'none' && !incentive.eligible && (
          <div className="mt-3">
            <Callout tone="warn" title={`No ${programme} incentive at this exit age`}>
              {incentive.reason}
            </Callout>
          </div>
        )}
        {incentive.eligible && (
          <p className="mt-2 text-xs text-slate-500">
            Tax treatment is the EXPECTED one — severance benefit on the retirement lump-sum table; confirm it with the IRP3(a) directive. The
            exit must take effect by {rules.exitProgramme.implementationEnd} and approval by your Executive Authority is discretionary, not
            automatic.
          </p>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Source: <Badge tone={source === 'statement' ? 'brand' : 'neutral'}>{source === 'statement' ? 'your benefit statement' : 'formula estimate'}</Badge>{' '}
          {source === 'statement'
            ? '— grown from your statement values to the planned exit age.'
            : '— GEPF Rule 14.4 formula: pensionable service × final salary × F(Z) age factor, using the 1 Oct 2025 factor table.'}
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

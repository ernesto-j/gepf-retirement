import { useAppStore } from '../store/useAppStore'
import { useResults } from '../store/useResults'
import { PageHeader, Section, Grid } from '../components/ui'
import { IncomeChart } from '../components/charts/IncomeChart'
import { CapitalChart } from '../components/charts/CapitalChart'
import { TotalsChart } from '../components/charts/TotalsChart'
import { RouteCard } from '../components/compare/RouteCard'
import { ComparisonTable } from '../components/compare/ComparisonTable'
import { GepfTaxPanel } from '../components/compare/GepfTaxPanel'
import { GiveUpPanel } from '../components/compare/GiveUpPanel'
import { ProsCons } from '../components/compare/ProsCons'
import { RiskFlagsPanel } from '../components/compare/RiskFlagsPanel'
import { AssumptionNotes } from '../components/compare/AssumptionNotes'
import { EngineBoundary, resultById, scenarioColour } from '../components/compare/helpers'

/** Stay vs Leave: the three core routes side by side, then the shared comparison, tax, chart and risk sections. */
export default function ComparePage() {
  const profile = useAppStore((s) => s.profile)
  return (
    <div>
      <PageHeader
        title="Stay vs Leave"
        intro="Three ways to exit the GEPF, run through the same tax, fee and inflation assumptions: retire and draw the defined-benefit pension, resign and preserve the actuarial interest for a living annuity, or resign and cash out to invest (including offshore)."
      />
      <EngineBoundary resetKey={profile}>
        <CompareContent />
      </EngineBoundary>
    </div>
  )
}

function CompareContent() {
  const profile = useAppStore((s) => s.profile)
  const { core, comparison, funds, rules, tables } = useResults()

  const colours: Record<string, string> = {}
  core.forEach((r) => {
    colours[r.definition.id] = scenarioColour(r.definition.id)
  })

  const stay = resultById(core, 'stay')
  const preserve = resultById(core, 'preserve')

  return (
    <div className="space-y-4">
      <Grid cols={3} className="items-stretch">
        {core.map((r) => (
          <RouteCard key={r.definition.id} result={r} colour={colours[r.definition.id]} funds={funds} planToAge={profile.person.planToAge} />
        ))}
      </Grid>

      <Section title="Side-by-side comparison" description="Every metric for the three routes; the best value in each row is highlighted.">
        <ComparisonTable comparison={comparison} colours={colours} planToAge={profile.person.planToAge} />
      </Section>

      <Section
        title="Monthly tax on your GEPF pension"
        description="How PAYE on the stay route's pension changes with the age rebates, holding the pension amount constant."
      >
        {stay ? (
          <GepfTaxPanel stay={stay} profile={profile} tables={tables} />
        ) : (
          <p className="text-sm text-slate-500">The stay route is not available.</p>
        )}
      </Section>

      <Section title="Net income vs your target" description="After-tax monthly income by age for each route, against your income target.">
        <IncomeChart results={core} colours={colours} />
      </Section>

      <Grid cols={2}>
        <Section title="Invested capital over time" description="How the invested capital (living annuity plus discretionary savings) behind each route runs down.">
          <CapitalChart results={core} colours={colours} />
        </Section>
        <Section title="Lifetime totals" description="Total income, tax, fees and legacy across the whole horizon.">
          <TotalsChart results={core} colours={colours} />
        </Section>
      </Grid>

      <Section title="Pros and cons" description="Route-specific advantages and drawbacks, computed from your numbers.">
        <ProsCons results={core} colours={colours} />
      </Section>

      <Section title="Risk flags" description="Sovereign, currency and longevity risks that apply to these routes, grouped by severity.">
        <RiskFlagsPanel results={core} />
      </Section>

      <Section title="What you give up by leaving" description="Benefits that only the stay route keeps: the medical subsidy, the guarantee, and the spouse's pension.">
        <GiveUpPanel stay={stay} preserve={preserve} profile={profile} rules={rules} />
      </Section>

      <Section title="Assumptions used" description="Every number above is reproducible from these inputs.">
        <AssumptionNotes results={core} profile={profile} />
      </Section>
    </div>
  )
}

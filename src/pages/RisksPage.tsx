import { useState } from 'react'
import { CASE_STUDIES, SA_INDICATORS } from '../data/caseStudies'
import { useResults } from '../store/useResults'
import { ArgumentsColumns } from '../components/risks/ArgumentsColumns'
import { CaseStudyAccordion } from '../components/risks/CaseStudyAccordion'
import { IndicatorCards } from '../components/risks/IndicatorCards'
import { RiskFlagsBySeverity } from '../components/risks/RiskFlagsBySeverity'
import { EngineBoundary } from '../components/compare/helpers'
import { Callout, PageHeader, Section } from '../components/ui'

/** Isolated so a thrown error from useResults() (engine stubs) is caught by the EngineBoundary around it, not the whole page. */
function RiskFlagsSection({ onSelectCaseStudy }: { onSelectCaseStudy: (id: string) => void }) {
  const { core } = useResults()
  return <RiskFlagsBySeverity results={core} onSelectCaseStudy={onSelectCaseStudy} />
}

/** Isolated for the same reason as RiskFlagsSection. */
function ArgumentsSection() {
  const { core } = useResults()
  return <ArgumentsColumns core={core} />
}

export default function RisksPage() {
  const [openCaseStudyId, setOpenCaseStudyId] = useState<string | null>(null)

  function openCaseStudy(id: string) {
    setOpenCaseStudyId(id)
    requestAnimationFrame(() => {
      document.getElementById(`case-study-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <div>
      <PageHeader
        title="Risks"
        intro="No route in this planner is risk-free. Staying concentrates you in South African sovereign and currency risk; leaving trades a guarantee for market, longevity and sequence risk. This page lays out both sides plainly, with real-world examples of what has gone wrong for savers elsewhere."
      />

      <Section
        title="Flags for your three core routes"
        description="Every warning raised for Stay, Preserve or Cash-out below, grouped by severity and showing which route(s) it applies to."
      >
        <EngineBoundary>
          <RiskFlagsSection onSelectCaseStudy={openCaseStudy} />
        </EngineBoundary>
      </Section>

      <Section title="South Africa: the indicators behind the risk" description="A snapshot of the sovereign and fund-specific indicators that drive the flags above.">
        <IndicatorCards indicators={SA_INDICATORS} />
      </Section>

      <Section
        title="When pension promises and savings have failed elsewhere"
        description="Click a case study to expand it. These are extreme examples, not predictions for South Africa — but the mechanisms (currency collapse, debt restructuring, capital controls, bail-ins) are not unique to any one country."
      >
        <CaseStudyAccordion caseStudies={CASE_STUDIES} openId={openCaseStudyId} onToggle={(id) => setOpenCaseStudyId((o) => (o === id ? null : id))} />
      </Section>

      <Section title="Weighing it up" description="A balanced view, independent of which route this planner currently favours for you.">
        <EngineBoundary>
          <ArgumentsSection />
        </EngineBoundary>
      </Section>

      <Callout tone="warn" title="Not financial advice">
        This page describes general risks and historical examples for educational purposes. It is not a recommendation to
        stay in or leave the GEPF, and it is not personalised financial, tax or legal advice. Every figure here is an
        estimate built from the assumptions on your Profile page — verify anything material with a qualified, licensed
        financial adviser and your official GEPF benefit statement before making an irreversible decision.
      </Callout>
    </div>
  )
}

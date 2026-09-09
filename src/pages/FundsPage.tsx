import { useMemo } from 'react'
import type { FundInfo, ScenarioDefinition } from '../engine/types'
import { formatPct, formatRandCompact } from '../engine/money'
import { DEFAULT_FUND_ID, FUNDS, FUND_ARCHETYPES } from '../data/funds'
import { useAppStore } from '../store/useAppStore'
import { EngineBoundary } from '../components/compare/helpers'
import { FeeImpactChart } from '../components/funds/FeeImpactChart'
import { FundTable } from '../components/funds/FundTable'
import { Callout, Grid, PageHeader, Section } from '../components/ui'

const JARGON: { term: string; definition: string }[] = [
  { term: 'TER (Total Expense Ratio)', definition: "The fund manager's own charge for running the portfolio: management fee plus fixed running costs, expressed as % of assets per year." },
  { term: 'TC (Transaction Costs)', definition: 'The cost of buying and selling the underlying investments inside the fund — brokerage, taxes and market impact. Higher for funds that trade more.' },
  { term: 'TIC (Total Investment Charge)', definition: 'TER + TC: the full cost of the fund itself, before any platform or advice fee is added on top.' },
  { term: 'Platform / admin fee', definition: 'What the living annuity, preservation fund or retirement annuity provider charges to administer your account and hold the fund for you.' },
  { term: 'Advice fee', definition: "An ongoing fee paid to a financial adviser, if you use one. It is 0% if you manage your own investments (DIY)." },
  { term: 'All-in fee', definition: 'TIC + platform fee + advice fee: the total annual drag on your capital, and the number that matters most when comparing options.' },
  { term: 'Reg 28', definition: 'Regulation 28 of the Pension Funds Act limits growth-asset and offshore exposure in a preservation fund or retirement annuity (not in a living annuity, which is unrestricted).' },
]

export default function FundsPage() {
  const profile = useAppStore((s) => s.profile)
  const upsertScenario = useAppStore((s) => s.upsertScenario)
  const setPlannerSelection = useAppStore((s) => s.setPlannerSelection)
  const setPage = useAppStore((s) => s.setPage)

  const gepfFund = useMemo(() => FUNDS.find((f) => f.id === 'gepf'), [])
  const investableFunds = useMemo(() => FUNDS.filter((f) => f.type !== 'gepf'), [])
  const illustrativeCapital = 1_000_000
  const illustrativeReturn = profile.assumptions.localBalancedReturn

  function handleUseInPlanner(fund: FundInfo) {
    const exitAge = profile.person.plannedExitAge
    const scenario: ScenarioDefinition = {
      id: `custom-fund-${fund.id}`,
      name: `Leave: preserve via ${fund.name}`,
      kind: 'resign-preserve',
      exitAge,
      retireFromPreservationAge: Math.max(55, exitAge),
      fundId: fund.id,
      offshorePct: Math.min(0.5, fund.maxOffshore),
      lumpSumAtRetirementPct: 1 / 3,
      drawdownStrategy: 'target-income',
    }
    upsertScenario(scenario)
    setPlannerSelection(['stay', scenario.id])
    setPage('planner')
  }

  return (
    <div>
      <PageHeader
        title="Funds & fees"
        intro="Every rand of fee is a rand not compounding for you. Compare the funds available to hold your GEPF resignation value or gratuity, see what fees really cost over 25 years, and jump straight into the Scenario Planner with any fund selected."
      />

      <Section title="Fund comparison" description="Fees are annual, as decimals; returns are annualised and net of the fund's TER. Click a column heading to sort.">
        <FundTable funds={investableFunds} onUseInPlanner={handleUseInPlanner} />
        {gepfFund && (
          <Callout tone="info" title="GEPF charges no fee to you" >
            {gepfFund.notes} Because your GEPF pension is a formula-based promise rather than an investment account, none of
            the cost comparison above applies while you stay — but it applies in full to every rand you resign or cash out
            and invest elsewhere.
          </Callout>
        )}
      </Section>

      <Section title="Three cost archetypes" description="A simplified way to think about the fund universe when you don't want to compare 11 funds line by line.">
        <Grid cols={3}>
          {FUND_ARCHETYPES.map((a) => (
            <div key={a.id} className="rounded-lg border border-slate-200 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{a.label.split(' (')[0]}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{formatPct(a.allInFee, 2)}</div>
              <div className="text-xs text-slate-500">typical all-in fee per year</div>
              <p className="mt-2 text-sm text-slate-600">
                {a.id === 'index' && 'Tracks a market benchmark mechanically. Lowest cost, no manager skill (or error) involved.'}
                {a.id === 'active' && "A manager tries to beat the market. Costs more; the outcome depends on the manager's skill and can lag an index fund after fees."}
                {a.id === 'full-service' && 'Bundles the fund with an adviser and administration platform. Highest cost; can be worth it for genuine ongoing advice.'}
              </p>
              <div className="mt-2 text-xs text-slate-400">e.g. {a.label.match(/\(([^)]+)\)/)?.[1]}</div>
            </div>
          ))}
        </Grid>
      </Section>

      <Section
        title="What fees actually cost you"
        description="Illustrative growth of a lump sum at different all-in fees — the only variable here is cost, not investment choice."
        right={
          <span className="text-xs text-slate-500">
            {formatRandCompact(illustrativeCapital)} invested at {formatPct(illustrativeReturn, 1)} gross return
          </span>
        }
      >
        <EngineBoundary>
          <FeeImpactChart capital={illustrativeCapital} years={25} grossReturn={illustrativeReturn} />
        </EngineBoundary>
      </Section>

      <Section title="Fee jargon, decoded" collapsible defaultOpen={false} description="The terms in the table above, in plain language.">
        <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {JARGON.map((j) => (
            <div key={j.term} className="rounded-lg border border-slate-200 p-3">
              <dt className="text-sm font-semibold text-slate-900">{j.term}</dt>
              <dd className="mt-1 text-sm text-slate-600">{j.definition}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-slate-400">
          Fund data as of {investableFunds[0]?.asOf ?? '—'}; defaults to {DEFAULT_FUND_ID} where a scenario does not specify a fund. Always
          check the fund's current minimum disclosure document (MDD) before acting — fees and returns change.
        </p>
      </Section>
    </div>
  )
}

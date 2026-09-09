import { useMemo } from 'react'
import { MACRO } from '../data/macroHistory'
import { randStats } from '../engine/hedge'
import { getGepfRules, gepfBenefitsAtExit } from '../engine/gepf'
import { formatPct, formatRandCompact } from '../engine/money'
import { useAppStore } from '../store/useAppStore'
import { FxHistoryChart } from '../components/rand/FxHistoryChart'
import { InflationChart } from '../components/rand/InflationChart'
import { PurchasingPowerTable } from '../components/rand/PurchasingPowerTable'
import { HedgeProjectionPanel } from '../components/rand/HedgeProjectionPanel'
import { Callout, Grid, KpiTile, PageHeader, Section } from '../components/ui'

export default function RandPage() {
  const profile = useAppStore((s) => s.profile)

  const asOfYear = useMemo(() => {
    const years = MACRO.usdZarAnnualAvg.map((p) => p.year)
    return years.length > 0 ? Math.max(...years) : new Date().getFullYear()
  }, [])

  const stats = useMemo(() => {
    try {
      return randStats(MACRO, asOfYear)
    } catch {
      return null
    }
  }, [asOfYear])

  const defaultCapital = useMemo(() => {
    try {
      const rules = getGepfRules()
      const { resignation } = gepfBenefitsAtExit(profile, profile.person.plannedExitAge, rules)
      return Math.max(200_000, Math.round(resignation.actuarialInterest))
    } catch {
      return 1_500_000
    }
  }, [profile])

  return (
    <div>
      <PageHeader
        title="Rand & inflation"
        intro="You will spend most of this money in rand, but a lot of what a retiree buys — medicine, imported goods, overseas travel, technology — is priced in dollars. This page shows how the rand and inflation have actually behaved, and what that means for a decades-long GEPF-linked retirement."
      />

      <Section title="The rand against the US dollar, 1994–present">
        <FxHistoryChart history={MACRO} />
        {stats && (
          <Grid cols={3} className="mt-3">
            <KpiTile label="Rand depreciation, 10yr avg p.a." value={formatPct(stats.dep10)} tone="warn" />
            <KpiTile label="Rand depreciation, 20yr avg p.a." value={formatPct(stats.dep20)} tone="warn" />
            <KpiTile label="Rand depreciation, 30yr avg p.a." value={formatPct(stats.dep30)} tone="warn" />
            <KpiTile label="SA CPI, 20yr avg p.a." value={formatPct(stats.cpiAvg20)} />
            <KpiTile label="US CPI, 20yr avg p.a." value={formatPct(stats.usCpiAvg20)} />
            <KpiTile
              label="Inflation differential (SA − US), 20yr"
              value={formatPct(stats.inflationDifferential20)}
              help="By purchasing-power parity, the rand should depreciate roughly by this much per year to offset SA's higher inflation."
            />
          </Grid>
        )}
        {!stats && (
          <Callout tone="warn" title="Rand statistics not ready">
            The macro statistics engine did not return a result. Try again shortly.
          </Callout>
        )}
        {stats && (
          <p className="mt-2 text-xs text-slate-500">
            Purchasing-power parity implies roughly {formatPct(stats.pppImpliedDepreciation20)} p.a. depreciation over 20 years from the
            inflation differential alone; actual depreciation has run{' '}
            {stats.dep20 > stats.pppImpliedDepreciation20 ? 'faster' : 'slower'} than that, reflecting risk premia, terms of trade and
            capital flows beyond inflation.
          </p>
        )}
      </Section>

      <Section title="Official CPI vs the inflation a retiree actually feels" description="Medical aid and electricity costs, which weigh heavily on retirees, have consistently outpaced headline CPI.">
        <InflationChart macro={MACRO} />
      </Section>

      <Section
        title="What your target income will need to be"
        description="Purchasing-power table: monthly rand needed at 10/20/30 years to buy what your target income buys today."
      >
        <PurchasingPowerTable
          targetMonthlyIncome={profile.lifestyle.targetNetMonthlyIncomeToday}
          officialCpi={profile.assumptions.officialCpi}
          personalInflation={profile.assumptions.personalInflation}
          medicalInflation={profile.assumptions.medicalInflation}
        />
      </Section>

      <Section
        title="Offshore hedge projection"
        description={`Compare staying fully in rand against holding part of your capital offshore. Defaults to ${formatRandCompact(
          defaultCapital,
        )}, an estimate of your GEPF resignation value at your planned exit age — change it to match any amount you're considering.`}
      >
        <HedgeProjectionPanel assumptions={profile.assumptions} defaultCapital={defaultCapital} />
        <Callout tone="info" title="Being honest about the downside">
          Offshore diversification does not always win in the short run. The rand strengthened roughly 30–45% against the
          dollar between 2002–2005 and again 2016–2018; during those years a heavily offshore portfolio funding rand-based
          spending produced less local income than staying fully in rand. Use the stress toggle above to see the effect.
          Offshore exposure is a hedge against a bad multi-decade rand outcome, not a bet that wins every year.
        </Callout>
      </Section>

      <Section title="What this means for a GEPF pensioner">
        <div className="space-y-2 text-sm text-slate-700">
          <p>
            A GEPF pension is paid in rand and increases at a share of official CPI (at least 75% by rule) — it is not
            directly exposed to the rand/dollar rate, but it is fully exposed to South African inflation, and specifically
            to the risk that your own cost of living (medical aid, electricity, imported goods) runs hotter than the CPI
            your pension tracks.
          </p>
          <p>
            The GEPF itself holds only around 10% of its assets offshore, so the fund's ability to keep paying — and to keep
            increasing pensions in line with CPI — depends heavily on the health of the South African economy and government
            finances. This is the flip side of the guarantee: a GEPF pension is extremely reliable as long as the state and
            the rand remain stable, and more exposed than a diversified portfolio if they do not.
          </p>
          <p>
            If you leave and invest the proceeds yourself, you take on rand and market risk directly, but you also gain the
            ability to hold a meaningful offshore share as a hedge — something the GEPF's own asset allocation does not
            offer you as an individual member.
          </p>
        </div>
      </Section>
    </div>
  )
}

import type { Assumptions, TaxYear } from '../../engine/types'
import { ASSUMPTION_PRESETS } from '../../data/defaults'
import { Callout, Grid, NumberInput, PercentInput, Section, SelectInput } from '../../components/ui'

const PRESETS: { id: keyof typeof ASSUMPTION_PRESETS; label: string; blurb: string }[] = [
  { id: 'sarb-target', label: 'SARB target', blurb: 'CPI near the 3–4.5% target band, a stable rand.' },
  { id: 'recent-history', label: 'Recent history', blurb: '~2015–2025 averages: higher inflation and rand depreciation.' },
  { id: 'pessimistic', label: 'Pessimistic', blurb: 'Stagflation, weak rand, below-CPI GEPF increases.' },
]

const TAX_YEAR_OPTIONS: { value: TaxYear; label: string }[] = [
  { value: '2025/26', label: '2025/26' },
  { value: '2026/27', label: '2026/27' },
]

export function AssumptionsSection({
  assumptions,
  onChange,
}: {
  assumptions: Assumptions
  onChange: (patch: Partial<Assumptions>) => void
}) {
  return (
    <Section
      title="Assumptions"
      description="Economic and product assumptions behind every projection. Defaults come from recent history — override anything."
      collapsible
      defaultOpen={false}
    >
      <div className="mb-4">
        <div className="mb-2 flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="btn-secondary"
              title={preset.blurb}
              onClick={() => onChange({ ...ASSUMPTION_PRESETS[preset.id], taxYear: assumptions.taxYear })}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <Callout tone="info" title="What is 'true' (personal) inflation?">
          Official CPI tracks a national basket. Retirees typically face a different mix: medical aid inflation runs
          well above CPI, and imported or rand-linked spending (fuel, tech, overseas travel) tracks the rand rather
          than local prices. <strong>Personal inflation</strong> below is the rate the app uses to escalate your
          income target — set it above official CPI if your basket leans towards medical care and imports, as most
          retirees' do.
        </Callout>
      </div>

      <Grid cols={3}>
        <SelectInput label="Tax year" value={assumptions.taxYear} onChange={(v) => onChange({ taxYear: v })} options={TAX_YEAR_OPTIONS} help="SARS tables used for all tax calculations." />
        <PercentInput
          label="Official CPI"
          value={assumptions.officialCpi}
          min={0}
          max={0.3}
          onChange={(v) => onChange({ officialCpi: v })}
          help="Long-run assumption for headline SA inflation."
        />
        <PercentInput
          label="Personal inflation"
          value={assumptions.personalInflation}
          min={0}
          max={0.3}
          onChange={(v) => onChange({ personalInflation: v })}
          help="'True' inflation for your basket — escalates your income target."
        />
        <PercentInput
          label="Medical inflation"
          value={assumptions.medicalInflation}
          min={0}
          max={0.3}
          onChange={(v) => onChange({ medicalInflation: v })}
          help="Typically well above CPI; escalates medical aid and the GEPF medical subsidy."
        />
        <PercentInput
          label="GEPF increase as % of CPI"
          value={assumptions.gepfIncreaseAsPctOfCpi}
          min={0.5}
          max={1.5}
          onChange={(v) => onChange({ gepfIncreaseAsPctOfCpi: v })}
          help="Rules guarantee at least 75% of CPI; the Board can and often does grant full CPI."
        />
        <NumberInput
          label="USD/ZAR spot"
          value={assumptions.usdZarSpot}
          min={1}
          step={0.5}
          onChange={(v) => onChange({ usdZarSpot: v })}
          help="Today's exchange rate used as the base for offshore projections."
        />
        <PercentInput
          label="Rand depreciation"
          value={assumptions.randDepreciation}
          min={-0.1}
          max={0.2}
          onChange={(v) => onChange({ randDepreciation: v })}
          help="Expected nominal annual weakening of the rand vs USD."
        />
        <PercentInput
          label="US inflation"
          value={assumptions.usInflation}
          min={0}
          max={0.15}
          onChange={(v) => onChange({ usInflation: v })}
          help="Used for purchasing-power-parity checks on the rand forecast."
        />
        <PercentInput
          label="Local balanced return"
          value={assumptions.localBalancedReturn}
          min={0}
          max={0.3}
          onChange={(v) => onChange({ localBalancedReturn: v })}
          help="Gross nominal return on a local balanced/multi-asset portfolio, before fees."
        />
        <PercentInput
          label="Local cash return"
          value={assumptions.localCashReturn}
          min={0}
          max={0.3}
          onChange={(v) => onChange({ localCashReturn: v })}
          help="Gross nominal money-market/cash return."
        />
        <PercentInput
          label="Offshore return (USD)"
          value={assumptions.offshoreReturnUsd}
          min={0}
          max={0.3}
          onChange={(v) => onChange({ offshoreReturnUsd: v })}
          help="Gross nominal USD return on the offshore sleeve, before fees."
        />
        <PercentInput
          label="Offshore fee"
          value={assumptions.offshoreFee}
          min={0}
          max={0.05}
          onChange={(v) => onChange({ offshoreFee: v })}
          help="Fee drag used for the offshore sleeve when no specific fund is selected."
        />
        <PercentInput
          label="FX conversion cost"
          value={assumptions.fxConversionCost}
          min={0}
          max={0.05}
          onChange={(v) => onChange({ fxConversionCost: v })}
          help="One-off spread paid when converting rand to the offshore sleeve."
        />
        <PercentInput
          label="Living annuity min drawdown"
          value={assumptions.livingAnnuityMinDrawdown}
          min={0}
          max={0.175}
          onChange={(v) => onChange({ livingAnnuityMinDrawdown: v })}
          help="Regulatory minimum annual drawdown (2.5%)."
        />
        <PercentInput
          label="Living annuity max drawdown"
          value={assumptions.livingAnnuityMaxDrawdown}
          min={0.025}
          max={0.3}
          onChange={(v) => onChange({ livingAnnuityMaxDrawdown: v })}
          help="Regulatory maximum annual drawdown (17.5%)."
        />
        <PercentInput
          label="Discretionary return tax drag"
          value={assumptions.discretionaryReturnTaxRate}
          min={0}
          max={0.45}
          onChange={(v) => onChange({ discretionaryReturnTaxRate: v })}
          help="Blended CGT/dividends/interest tax on non-retirement-fund investment growth."
        />
        <PercentInput
          label="Return volatility"
          value={assumptions.returnVolatility}
          min={0}
          max={0.4}
          onChange={(v) => onChange({ returnVolatility: v })}
          help="Annual standard deviation used only for the optional stress test."
        />
      </Grid>
    </Section>
  )
}

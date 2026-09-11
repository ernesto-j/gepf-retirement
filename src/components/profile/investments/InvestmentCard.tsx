import { useId, useMemo } from 'react'
import type { Assumptions, CustomInvestment, CustomInvestmentLoan } from '../../../engine/types'
import { projectCustomInvestment, summariseInvestment } from '../../../engine/investments'
import { Badge, Callout, Field, Grid, KpiTile, NumberInput, P, PercentInput, R, SelectInput, Toggle } from '../../ui'
import { CURRENCY_OPTIONS, DEFAULT_LOAN, FUNDED_FROM_OPTIONS, INCOME_USE_OPTIONS, KIND_OPTIONS } from './factory'
import { CurrencyInput } from './CurrencyInput'
import { formatCcy } from './currency'
import { OptionalYearsInput } from './OptionalYearsInput'
import { YearTable } from './YearTable'

function LoanFields({
  hideAmount = false,
  loan,
  currency,
  onChange,
}: {
  hideAmount?: boolean
  loan: CustomInvestmentLoan
  currency: CustomInvestment['currency']
  onChange: (patch: Partial<CustomInvestmentLoan>) => void
}) {
  return (
    <Grid cols={4} className="mt-3">
      {!hideAmount && <CurrencyInput label="Loan amount" currency={currency} value={loan.amount} onChange={(v) => onChange({ amount: v })} />}
      <PercentInput label="Interest rate" value={loan.rate} min={0} max={0.3} onChange={(v) => onChange({ rate: v })} />
      <NumberInput label="Loan term" suffix="years" value={loan.termYears} min={1} max={40} step={1} onChange={(v) => onChange({ termYears: Math.round(v) })} />
      <div className="flex items-end pb-2">
        <Toggle
          label="Interest-only"
          checked={loan.interestOnly}
          onChange={(v) => onChange({ interestOnly: v })}
          help="No capital repayments; the balance is settled from sale proceeds."
        />
      </div>
    </Grid>
  )
}

export function InvestmentCard({
  investment,
  assumptions,
  currentAge,
  fromAge,
  toAge,
  onChange,
  onDelete,
}: {
  investment: CustomInvestment
  assumptions: Assumptions
  currentAge: number
  fromAge: number
  toAge: number
  onChange: (patch: Partial<CustomInvestment>) => void
  onDelete: () => void
}) {
  const nameId = useId()
  const notesId = useId()

  const rows = useMemo(
    () => projectCustomInvestment(investment, assumptions, { currentAge, fromAge, toAge }),
    [investment, assumptions, currentAge, fromAge, toAge],
  )
  const summary = useMemo(() => summariseInvestment(rows), [rows])

  // Ongoing operating cash flow only (excludes the once-off purchase outflow and the final sale).
  const flowRows = rows.filter((r) => r.event !== 'buy' && r.event !== 'sell')
  const first5 = flowRows.slice(0, 5)
  const avgNetCash5y = first5.length > 0 ? first5.reduce((s, r) => s + r.netCashZar, 0) / first5.length : 0
  const equityAtEnd = rows.length > 0 ? rows[rows.length - 1].equityZar : 0

  const purchasePrice = investment.deposit + (investment.loan?.amount ?? 0)
  const ltv = investment.loan && purchasePrice > 0 ? investment.loan.amount / purchasePrice : 0

  const preRepaymentRows = investment.loan ? flowRows.filter((r) => r.loanBalanceCcy > 0) : flowRows.slice(0, 5)
  const negativeRows = preRepaymentRows.filter((r) => r.netCashZar < 0)
  const avgNegative = negativeRows.length > 0 ? negativeRows.reduce((s, r) => s - r.netCashZar, 0) / negativeRows.length : 0

  const isProperty = investment.kind === 'residential-property' || investment.kind === 'commercial-property'

  const patchLoan = (patch: Partial<CustomInvestmentLoan>) => {
    if (!investment.loan) return
    onChange({ loan: { ...investment.loan, ...patch } })
  }
  // Property is entered as purchase price + deposit %; deposit and loan amounts are derived from them.
  const depositPct = purchasePrice > 0 ? investment.deposit / purchasePrice : 1
  const setPropertyPrice = (price: number) => {
    const pct = Math.min(1, Math.max(0, depositPct))
    const deposit = price * pct
    const loanAmount = price - deposit
    onChange({
      deposit,
      loan: loanAmount > 0.5 ? { ...(investment.loan ?? DEFAULT_LOAN), amount: loanAmount } : undefined,
    })
  }
  const setDepositPct = (pct: number) => {
    const clamped = Math.min(1, Math.max(0.05, pct))
    const deposit = purchasePrice * clamped
    const loanAmount = purchasePrice - deposit
    onChange({
      deposit,
      loan: loanAmount > 0.5 ? { ...(investment.loan ?? DEFAULT_LOAN), amount: loanAmount } : undefined,
    })
  }

  return (
    <div className={`card ${investment.enabled ? '' : 'opacity-60'}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Toggle
            label={investment.enabled ? 'Included in every scenario' : 'Excluded from projections'}
            checked={investment.enabled}
            onChange={(v) => onChange({ enabled: v })}
          />
          <Badge tone="neutral">{KIND_OPTIONS.find((k) => k.value === investment.kind)?.label ?? investment.kind}</Badge>
          {investment.loan && <Badge tone="warn">Leveraged</Badge>}
        </div>
        <button type="button" className="btn-secondary shrink-0 text-red-700" onClick={onDelete}>
          Delete
        </button>
      </div>

      <Grid cols={3}>
        <Field label="Name" htmlFor={nameId}>
          <input id={nameId} className="input" value={investment.name} onChange={(e) => onChange({ name: e.target.value })} />
        </Field>
        <SelectInput label="Kind" value={investment.kind} onChange={(v) => onChange({ kind: v })} options={KIND_OPTIONS} />
        <SelectInput
          label="Currency"
          value={investment.currency}
          onChange={(v) => onChange({ currency: v })}
          options={CURRENCY_OPTIONS}
          help="Value, income, costs and the loan are tracked in this currency and converted to rand for the totals."
        />
        <NumberInput
          label="Start age"
          suffix="years"
          value={investment.startAge}
          min={18}
          max={toAge}
          step={1}
          onChange={(v) => onChange({ startAge: Math.round(v) })}
          help="Below your exit age, this is treated as an investment you already own."
        />
        <OptionalYearsInput
          label="Term (years)"
          value={investment.termYears}
          onChange={(v) => onChange({ termYears: v })}
          help="Blank = held to your planning horizon."
        />
        <SelectInput
          label="Funded from"
          value={investment.fundedFrom}
          onChange={(v) => onChange({ fundedFrom: v })}
          options={FUNDED_FROM_OPTIONS}
          help="'Exit capital' draws the deposit from your lump sum / savings at exit; 'external' is money outside the plan."
        />
        {isProperty ? (
          <>
            <CurrencyInput
              label="Purchase price"
              currency={investment.currency}
              value={purchasePrice}
              onChange={setPropertyPrice}
              help="Price of the property; purchase costs are added on top."
            />
            <PercentInput
              label="Deposit"
              value={depositPct}
              min={0.05}
              max={1}
              step={1}
              onChange={setDepositPct}
              help={`Deposit ${formatCcy(investment.deposit, investment.currency)}; loan ${formatCcy(purchasePrice - investment.deposit, investment.currency)} (LVR ${P(1 - depositPct, 0)}). 100% = no loan.`}
            />
          </>
        ) : (
          <CurrencyInput
            label="Deposit"
            currency={investment.currency}
            value={investment.deposit}
            onChange={(v) => onChange({ deposit: v })}
            help="Cash put in — the purchase amount less any loan."
          />
        )}
        <PercentInput
          label="Purchase costs"
          value={investment.purchaseCostPct}
          min={0}
          max={0.15}
          onChange={(v) => onChange({ purchaseCostPct: v })}
          help="Stamp duty, FIRB, transfer and brokerage costs, as a % of the purchase price."
        />
      </Grid>

      <div className="mt-4 border-t border-slate-100 pt-3">
        {!isProperty && (
          <Toggle
            label="Fund part of this with a loan"
            checked={!!investment.loan}
            onChange={(v) => onChange({ loan: v ? DEFAULT_LOAN : undefined })}
            help="Interest and any capital repayments come out of the investment's own income each year."
          />
        )}
        {isProperty && !investment.loan && <p className="help">No loan: the deposit is 100% of the price. Lower the deposit % above to add a mortgage.</p>}
        {investment.loan && <LoanFields hideAmount={isProperty} loan={investment.loan} currency={investment.currency} onChange={patchLoan} />}
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3">
        <Grid cols={3}>
          <PercentInput label={isProperty ? 'Capital growth' : 'Growth'} value={investment.growth} min={-0.2} max={0.3} onChange={(v) => onChange({ growth: v })} help="Capital growth p.a., in the investment's currency." />
          <PercentInput label={isProperty ? 'Rental yield (gross)' : 'Income yield'} value={investment.incomeYield} min={0} max={0.2} onChange={(v) => onChange({ incomeYield: v })} help={isProperty ? 'Annual gross rent as a % of the property value (weekly rent x 52 / price).' : 'Gross rent / dividends / interest, p.a. on value.'} />
          <PercentInput label="Running costs" value={investment.costsPct} min={0} max={0.1} onChange={(v) => onChange({ costsPct: v })} help="Rates, levies, management, vacancy, TER, p.a. on value." />
          <PercentInput label="Income tax" value={investment.incomeTaxRate} min={0} max={0.5} onChange={(v) => onChange({ incomeTaxRate: v })} help="Effective rate on net income." />
          <PercentInput label="Capital gains tax" value={investment.cgtRate} min={0} max={0.5} onChange={(v) => onChange({ cgtRate: v })} help="Effective rate on the gain at sale." />
          <PercentInput label="Selling costs" value={investment.sellingCostPct} min={0} max={0.15} onChange={(v) => onChange({ sellingCostPct: v })} help="Agent, legal and other costs at sale, as a % of sale price." />
        </Grid>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3">
        <Grid cols={2}>
          <SelectInput label="Income use" value={investment.incomeUse} onChange={(v) => onChange({ incomeUse: v })} options={INCOME_USE_OPTIONS} />
          <Field label="Notes" htmlFor={notesId}>
            <input
              id={notesId}
              className="input"
              value={investment.notes ?? ''}
              placeholder="Optional"
              onChange={(e) => onChange({ notes: e.target.value || undefined })}
            />
          </Field>
        </Grid>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiTile label="Cash in at purchase" value={R(summary.purchaseCashZar)} sub={`age ${summary.startAge}`} help="Deposit plus purchase costs, in rand at the exchange rate on purchase." />
          <KpiTile
            label="Avg. net cash, yrs 1–5"
            value={R(avgNetCash5y)}
            tone={avgNetCash5y < 0 ? 'warn' : 'ok'}
            sub="per year, in rand"
            help="Average of income less costs, loan service and tax over the first five years after purchase (excludes the purchase cash and sale proceeds)."
          />
          <KpiTile label="Equity at end of term" value={R(equityAtEnd)} sub={`age ${summary.endAge}`} help="Value less any outstanding loan balance, in rand, at the end of the term (or your planning horizon)." />
          <KpiTile label="Sale proceeds" value={R(summary.saleProceedsZar)} sub="net of loan, CGT & costs" help="Net cash in rand when the asset is sold — this returns to your discretionary savings." />
          <KpiTile
            label="Loan-to-value"
            value={investment.loan ? P(ltv) : 'No loan'}
            tone={ltv > 0.6 ? 'warn' : 'neutral'}
            sub={investment.loan ? 'at purchase' : undefined}
            help="Loan amount as a share of the purchase price (deposit + loan) when this investment is bought."
          />
        </div>

        <div className="mt-3 flex flex-col gap-2">
          {negativeRows.length > 0 && (
            <Callout tone="warn" title="Needs top-ups from your savings">
              This investment needs about {R(avgNegative)} a year from your savings
              {investment.loan ? ' until the loan is repaid' : ' in its early years'}, since costs, tax
              {investment.loan ? ' and loan repayments' : ''} exceed the income it produces.
            </Callout>
          )}
          {investment.loan && (
            <Callout tone="info" title="Leverage and non-resident tax">
              You're borrowing to fund this investment. When the asset sits offshore, interest deductibility,
              withholding tax and non-resident filing rules vary by country and can differ from the simple
              effective rates used here — confirm the treatment locally before relying on these numbers.
            </Callout>
          )}
          {isProperty && (
            <Callout tone="info" title="Foreign property: approximations">
              FIRB approval and stamp-duty surcharges typically apply to foreign buyers of Australian property;
              non-resident owners are usually taxed on rental income from the first dollar (no tax-free threshold)
              and don't qualify for the 50% CGT discount on sale. As a South African tax resident you also declare
              this income and gain on your SA return, claiming a foreign tax credit for tax paid abroad. These
              defaults are approximations — confirm the current rules with a cross-border tax adviser.
            </Callout>
          )}
        </div>

        <YearTable rows={rows} currency={investment.currency} />
      </div>
    </div>
  )
}

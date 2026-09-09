/**
 * Pros / cons and risk flags for a scenario result.
 *
 * Everything here is SPECIFIC and NUMERIC: the strings quote the member's own rand amounts,
 * effective tax rates, ages, drawdown rates and offshore shares taken from the projection, so
 * the Compare page never shows generic advice. The static descriptions in
 * `src/data/caseStudies.ts` (`RISK_LIBRARY`) are used as templates: the id, title, `appliesTo`
 * and `caseStudyId` are kept so the Risks page can link to the case studies, while `detail` is
 * rewritten for this member and the severity is raised or lowered by the numbers.
 *
 * Pure functions, no React, no I/O. Nothing throws: missing or degenerate values simply drop
 * the corresponding bullet.
 */
import type { GepfRules, Profile, RiskFlag, ScenarioResult, TaxTables, YearRow } from './types'
import { RISK_LIBRARY } from '../data/caseStudies'
import { gepfBenefitsAtExit } from './gepf'
import { formatPct, formatRand, formatRandCompact } from './money'
import { calcRetirementLumpSumTax, calcWithdrawalLumpSumTax, getTaxTables } from './tax'

/** Sustainable long-run drawdown band for a living annuity (industry rule of thumb). */
const SUSTAINABLE_DRAW = { low: 0.04, high: 0.05 }

function finite(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function pct(value: number, decimals = 1): string {
  return formatPct(finite(value), decimals)
}

function age(value: number): string {
  return String(Math.round(finite(value)))
}

/** Numbers that both `prosCons` and `riskFlags` need. */
interface Derived {
  tables: TaxTables
  first: YearRow | undefined
  last: YearRow | undefined
  planToAge: number
  exitAge: number
  retireFromPreservationAge: number
  offshoreShare: number
  /** Drawdown rate in the first year in which capital is actually drawn. */
  firstDrawRate: number
  firstDrawRow: YearRow | undefined
  /** How much of the pension's purchasing power is left at the horizon (1 = all of it). */
  pensionRealAtHorizon: number
  benefits: ReturnType<typeof gepfBenefitsAtExit>
  lumpSumTaxTotal: number
  lumpSumGrossTotal: number
  lumpSumNetTotal: number
}

function derive(result: ScenarioResult, profile: Profile, rules: GepfRules): Derived {
  const rows = result.rows
  const first = rows[0]
  const last = rows[rows.length - 1]
  const exitAge = result.atExit.age
  const firstDrawRow = rows.find((r) => r.drawGross > 1 && r.capitalStart > 1)
  const pensionFirst = first && first.personalIndex > 0 ? first.gepfPensionGross / first.personalIndex : 0
  const pensionLast = last && last.personalIndex > 0 ? last.gepfPensionGross / last.personalIndex : 0
  return {
    tables: getTaxTables(profile.assumptions.taxYear),
    first,
    last,
    planToAge: last?.age ?? exitAge,
    exitAge,
    retireFromPreservationAge: result.atRetirementFromPreservation?.age ?? Math.max(rules.earlyRetirementMinAge, exitAge),
    offshoreShare: result.atExit.investedCapital > 0 ? result.atExit.investedOffshoreZar / result.atExit.investedCapital : 0,
    firstDrawRate: firstDrawRow ? firstDrawRow.drawdownRate : 0,
    firstDrawRow,
    pensionRealAtHorizon: pensionFirst > 0 ? pensionLast / pensionFirst : 0,
    benefits: gepfBenefitsAtExit(profile, exitAge, rules),
    lumpSumTaxTotal: result.atExit.lumpSumTax + (result.atRetirementFromPreservation?.lumpSumTax ?? 0),
    lumpSumGrossTotal: result.atExit.lumpSumGross + (result.atRetirementFromPreservation?.lumpSumGross ?? 0),
    lumpSumNetTotal: result.atExit.lumpSumNet + (result.atRetirementFromPreservation?.lumpSumNet ?? 0),
  }
}

// ---------------------------------------------------------------------------
// Pros and cons
// ---------------------------------------------------------------------------

/**
 * Route-specific advantages and disadvantages, quantified from the projection.
 * Bullets that would be meaningless for this member (no spouse, no medical subsidy, no
 * early-retirement reduction, no capital) are omitted rather than hedged.
 */
export function prosCons(result: ScenarioResult, profile: Profile, rules: GepfRules): { pros: string[]; cons: string[] } {
  const d = derive(result, profile, rules)
  const pros: string[] = []
  const cons: string[] = []
  const a = profile.assumptions
  const totals = result.totals
  const first = d.first

  // --- Shared: capital, income and shortfall -------------------------------
  const capital = result.atExit.investedCapital
  const targetMonthly = finite(first?.targetNetIncome) / 12
  const netMonthly = result.firstYear.netMonthlyIncome

  if (result.kind === 'stay-gepf') {
    const pension = finite(first?.gepfPensionGross)
    if (pension > 0) {
      pros.push(
        `A guaranteed pension for life: ${formatRand(pension / 12)} a month before tax, ${formatRand(finite(first?.gepfPensionNet) / 12)} after PAYE of ${formatRand(finite(first?.gepfPensionTax) / 12)} (${pct(
          finite(first?.gepfPensionTax) / pension,
        )} effective). It is ${pct(totals.guaranteedIncomeShare)} of your first-year income and cannot run out.`,
      )
      pros.push(
        `Increases are paid every year targeting CPI (modelled at ${pct(a.gepfIncreaseAsPctOfCpi * a.officialCpi)} a year, ${pct(
          a.gepfIncreaseAsPctOfCpi,
          0,
        )} of official CPI of ${pct(a.officialCpi)}), with a rule minimum of ${pct(rules.minIncreaseAsPctOfCpi, 0)} of CPI — no investment, sequence-of-returns or longevity risk on this part of your income.`,
      )
      if (profile.person.hasSpouse) {
        const spouseShare = profile.person.spousePensionPct / 100
        pros.push(
          `Your spouse keeps ${pct(spouseShare, 0)} of the pension for life (${formatRand((pension * spouseShare) / 12)} a month at today's level), and the pension is guaranteed for ${rules.guaranteeYears} years even if you die sooner.`,
        )
      }
    }
    if (result.atExit.lumpSumGross > 0) {
      const rate = result.atExit.lumpSumTax / result.atExit.lumpSumGross
      pros.push(
        `The gratuity of ${formatRand(result.atExit.lumpSumGross)} is taxed on the retirement table — ${formatRand(result.atExit.lumpSumTax)} (${pct(
          rate,
        )} effective) — because the first ${formatRand(d.tables.retirementLumpSum[1]?.threshold ?? 550_000)} of retirement lump sums is tax-free. The same amount taken as resignation cash would cost ${formatRand(
          calcWithdrawalLumpSumTax(result.atExit.lumpSumGross, 0, d.tables).tax,
        )}.`,
      )
    }
    if (result.atExit.forfeitedMedicalSubsidyPv === 0 && profile.gepf.medicalSubsidyEligible && finite(first?.medicalSubsidy) > 0) {
      pros.push(
        `The employer medical subsidy of ${formatRand(finite(first?.medicalSubsidy) / 12)} a month continues in retirement and escalates with medical inflation of ${pct(
          a.medicalInflation,
        )} — worth about ${formatRandCompact(
          result.rows.reduce((s, r) => s + (r.personalIndex > 0 ? r.medicalSubsidy / r.personalIndex : 0), 0),
        )} in today's rand over the plan.`,
      )
    }

    const b = d.benefits.retirement
    if (b.monthsEarly > 0 && b.reductionFactor < 1) {
      const lostPension = (pension / Math.max(b.reductionFactor, 1e-9)) * (1 - b.reductionFactor)
      const lostGratuity = (result.atExit.lumpSumGross / Math.max(b.reductionFactor, 1e-9)) * (1 - b.reductionFactor)
      cons.push(
        `Retiring at ${age(d.exitAge)} is ${b.monthsEarly} months before ${rules.normalRetirementAge}: at ${pct(
          rules.earlyRetirementReductionPerMonth,
          2,
        )} a month the gratuity and pension are cut to ${pct(b.reductionFactor)} of the full benefit — ${formatRand(lostPension / 12)} a month of pension and ${formatRand(
          lostGratuity,
        )} of gratuity given up permanently.`,
      )
    }
    if (pension > 0 && d.pensionRealAtHorizon > 0 && d.pensionRealAtHorizon < 0.999) {
      cons.push(
        `Increases at ${pct(a.gepfIncreaseAsPctOfCpi * a.officialCpi)} lag your personal inflation of ${pct(
          a.personalInflation,
        )}: by age ${age(d.planToAge)} the pension buys ${pct(1 - d.pensionRealAtHorizon)} less than today (${formatRand(
          (finite(d.last?.gepfPensionGross) / Math.max(finite(d.last?.personalIndex), 1e-9)) / 12,
        )} a month in today's rand, against ${formatRand(pension / 12 / Math.max(finite(first?.personalIndex), 1e-9))} now).`,
      )
    }
    cons.push(
      `The pension has no capital value: only the invested gratuity and your other savings (${formatRand(
        capital,
      )} at exit) can be left to heirs — ${formatRand(totals.legacyAtHorizonReal)} in today's rand at age ${age(d.planToAge)}.`,
    )
    cons.push(
      `Concentration: the pension is a promise by the South African state and the GEPF holds about ${pct(
        rules.status.offshoreAllocation,
        0,
      )} of its ${formatRandCompact(rules.status.assetsRand)} of assets outside South Africa. Only ${formatRand(
        result.atExit.investedOffshoreZar,
      )} of your own money (${pct(d.offshoreShare, 0)} of ${formatRand(capital)}) is offshore.`,
    )
  } else {
    // --- Leave routes -------------------------------------------------------
    const ai = result.atExit.actuarialInterest
    const cashable = result.atExit.vestedComponent + result.atExit.savingsComponent
    if (result.kind === 'resign-preserve') {
      pros.push(
        `The full actuarial interest of ${formatRand(ai)} moves to a preservation fund with no tax on the transfer. Cashing out the ${formatRand(
          cashable,
        )} you are allowed to take (the vested and savings components) would cost ${formatRand(
          calcWithdrawalLumpSumTax(cashable, 0, d.tables).tax,
        )} of withdrawal tax instead.`,
      )
    } else {
      const rate = result.atExit.lumpSumGross > 0 ? result.atExit.lumpSumTax / result.atExit.lumpSumGross : 0
      pros.push(
        `${formatRand(result.atExit.lumpSumNet)} in cash at ${age(d.exitAge)} (${formatRand(result.atExit.lumpSumGross)} less ${formatRand(
          result.atExit.lumpSumTax,
        )} of withdrawal tax, ${pct(rate)} effective) — money you control immediately.`,
      )
      cons.push(
        `Withdrawal tax of ${formatRand(result.atExit.lumpSumTax)} on ${formatRand(result.atExit.lumpSumGross)} (${pct(
          rate,
        )}): only ${formatRand(d.tables.withdrawalLumpSum[1]?.threshold ?? 27_500)} is tax-free on resignation. Preserving the same amount and taking it at retirement would have cost ${formatRand(
          calcRetirementLumpSumTax(result.atExit.lumpSumGross, 0, d.tables).tax,
        )} — ${formatRand(
          Math.max(0, result.atExit.lumpSumTax - calcRetirementLumpSumTax(result.atExit.lumpSumGross, 0, d.tables).tax),
        )} more tax, permanently out of your capital.`,
      )
    }
    pros.push(
      `You control the capital: ${formatRand(capital)} is invested at exit, ${formatRand(
        result.atExit.investedOffshoreZar,
      )} of it (${pct(d.offshoreShare, 0)}) offshore and out of the rand, and you can change the fund, the fee and the drawdown at any time.`,
    )
    pros.push(
      `Whatever is left belongs to your estate: ${formatRand(totals.legacyAtHorizonReal)} in today's rand at age ${age(
        d.planToAge,
      )} (${formatRand(totals.legacyAtHorizon)} nominal), against nothing from a GEPF pension.`,
    )
    if (result.atRetirementFromPreservation) {
      const e = result.atRetirementFromPreservation
      pros.push(
        `At ${age(e.age)} you may take ${formatRand(e.lumpSumGross)} (${pct(
          e.preservationValue > 0 ? e.lumpSumGross / e.preservationValue : 0,
          0,
        )} of ${formatRand(e.preservationValue)}) as a lump sum on the retirement table for ${formatRand(e.lumpSumTax)} of tax (${pct(
          e.lumpSumGross > 0 ? e.lumpSumTax / e.lumpSumGross : 0,
        )}), with ${formatRand(e.intoLivingAnnuity)} going into the living annuity.`,
      )
    }

    if (result.atExit.forfeitedMedicalSubsidyPv > 0) {
      cons.push(
        `You forfeit the post-retirement medical subsidy: ${formatRand(
          finite(profile.gepf.medicalSubsidyMonthly),
        )} a month today, worth about ${formatRandCompact(result.atExit.forfeitedMedicalSubsidyPv)} in today's rand over the plan to age ${age(
          d.planToAge,
        )}. Resignation never qualifies, whatever your service.`,
      )
    }
    const prev = d.benefits.resignation.actuarialInterestPreviousFactors
    if (prev && prev > 0 && ai > 0) {
      const cut = 1 - ai / prev
      if (cut > 0.005) {
        cons.push(
          `Your resignation value is calculated on the factors that took effect on 1 October 2025: ${formatRand(ai)} against ${formatRand(
            prev,
          )} on the previous basis — ${formatRand(prev - ai)} (${pct(cut)}) less for exactly the same service.`,
        )
      }
    }
    if (d.retireFromPreservationAge > d.exitAge + 1e-9) {
      const gapShortfall = result.rows.find((r) => r.age < d.retireFromPreservationAge)?.shortfall ?? 0
      cons.push(
        `The preserved money is locked until ${age(d.retireFromPreservationAge)}: for ${Math.round(
          d.retireFromPreservationAge - d.exitAge,
        )} year(s) from ${age(d.exitAge)} you live on other income and savings${
          gapShortfall > 0 ? `, leaving you ${formatRand(gapShortfall / 12)} a month short of your target in the first of them` : ' with no drawdown from the fund'
        }.`,
      )
    }
    if (d.firstDrawRow) {
      const r = d.firstDrawRate
      const verdict =
        r > SUSTAINABLE_DRAW.high
          ? `above the ${pct(SUSTAINABLE_DRAW.low, 0)}–${pct(SUSTAINABLE_DRAW.high, 0)} rate usually considered sustainable`
          : `inside the ${pct(SUSTAINABLE_DRAW.low, 0)}–${pct(SUSTAINABLE_DRAW.high, 0)} sustainable range`
      cons.push(
        `Drawdown: ${formatRand(d.firstDrawRow.drawGross)} in the first year of drawing is ${pct(r)} of ${formatRand(
          d.firstDrawRow.capitalStart,
        )} of capital — ${verdict}${
          result.ruinAge === null
            ? `; the capital still lasts to age ${age(d.planToAge)} on these assumptions.`
            : `; the capital is exhausted at age ${age(result.ruinAge)}.`
        }`,
      )
    }
    cons.push(
      `None of this income is guaranteed for life: ${pct(
        totals.guaranteedIncomeShare,
      )} of your first-year income is a lifelong pension, so longevity and market risk sit with you, and lifetime fees of ${formatRand(
        totals.lifetimeFeesPaid,
      )} come out of your capital.`,
    )
  }

  // --- Shared closing bullets ---------------------------------------------
  if (result.ruinAge === null && capital > 0) {
    pros.push(
      `Capital lasts: ${formatRand(capital)} invested at exit still leaves ${formatRand(
        totals.legacyAtHorizon,
      )} (${formatRand(totals.legacyAtHorizonReal)} in today's rand) at age ${age(d.planToAge)}.`,
    )
  }
  if (result.incomeShortfallAge !== null) {
    cons.push(
      `Your income target is not met from age ${age(result.incomeShortfallAge)}: in the first short year you get ${formatRand(
        finite(result.rows.find((r) => r.age === result.incomeShortfallAge)?.totalNetIncome) / 12,
      )} a month against a target of ${formatRand(
        finite(result.rows.find((r) => r.age === result.incomeShortfallAge)?.targetNetIncome) / 12,
      )}.`,
    )
  } else if (netMonthly + 1 >= targetMonthly && targetMonthly > 0) {
    pros.push(
      `Your target of ${formatRand(targetMonthly)} a month (net, ${formatRand(
        finite(profile.lifestyle.targetNetMonthlyIncomeToday),
      )} in today's rand) is met every year to age ${age(d.planToAge)}; first-year net income is ${formatRand(netMonthly)} a month.`,
    )
  }
  return { pros, cons }
}

// ---------------------------------------------------------------------------
// Risk flags
// ---------------------------------------------------------------------------

/** A copy of a `RISK_LIBRARY` entry with this member's numbers in the detail. */
function fromLibrary(id: string, detail: string, severity?: RiskFlag['severity']): RiskFlag | null {
  const base = RISK_LIBRARY.find((f) => f.id === id)
  if (!base) return null
  return { ...base, detail, severity: severity ?? base.severity }
}

/**
 * Risk flags for this scenario, ordered critical -> warning -> info. Library entries keep their
 * ids and case-study links so the Risks page can cross-reference them; the detail is this
 * member's numbers.
 */
export function riskFlags(result: ScenarioResult, profile: Profile, rules: GepfRules): RiskFlag[] {
  const d = derive(result, profile, rules)
  const a = profile.assumptions
  const out: (RiskFlag | null)[] = []
  const capital = result.atExit.investedCapital
  const offshoreShare = d.offshoreShare

  if (result.kind === 'stay-gepf') {
    out.push(
      fromLibrary(
        'sovereign-domestic-debt',
        `${pct(result.totals.guaranteedIncomeShare)} of your first-year income is a promise by the South African state. The GEPF is ${pct(
          rules.status.fundingLevel,
          0,
        )} funded at ${rules.status.valuationDate} with ${formatRandCompact(rules.status.assetsRand)} of assets, only ${pct(
          rules.status.offshoreAllocation,
          0,
        )} of them outside South Africa, and it is the single largest holder of SA government debt. Prescribed assets or a debt restructuring would hit this income first.`,
        result.totals.guaranteedIncomeShare > 0.6 ? 'warning' : 'info',
      ),
    )
    out.push(
      fromLibrary(
        'inflation-erosion',
        `Your pension is modelled to rise ${pct(a.officialCpi * a.gepfIncreaseAsPctOfCpi)} a year (${pct(
          a.gepfIncreaseAsPctOfCpi,
          0,
        )} of CPI; the rules guarantee only ${pct(rules.minIncreaseAsPctOfCpi, 0)}), while your personal inflation is ${pct(
          a.personalInflation,
        )} and medical inflation ${pct(a.medicalInflation)}. By age ${age(d.planToAge)} the pension buys ${pct(
          Math.max(0, 1 - d.pensionRealAtHorizon),
        )} less than in year one.`,
        a.personalInflation > a.officialCpi * a.gepfIncreaseAsPctOfCpi + 0.015 ? 'warning' : 'info',
      ),
    )
    const b = d.benefits.retirement
    if (b.monthsEarly > 0 && b.reductionFactor < 1) {
      out.push(
        fromLibrary(
          'early-retirement-penalty',
          `Retiring at ${age(d.exitAge)} is ${b.monthsEarly} months before ${rules.normalRetirementAge}: the gratuity and pension are permanently reduced to ${pct(
            b.reductionFactor,
          )} of the full benefit — ${formatRand(result.firstYear.gepfPensionMonthlyGross * (1 / Math.max(b.reductionFactor, 1e-9) - 1))} a month less pension for life. Working to ${rules.normalRetirementAge}, or an employer-approved (ill-health / restructuring) exit, avoids it.`,
          b.reductionFactor < 0.9 ? 'critical' : 'warning',
        ),
      )
    }
    out.push(
      fromLibrary(
        'currency-collapse',
        `Your pension is paid in rand and the rand has lost roughly 5% a year against the dollar over 30 years (modelled here at ${pct(
          a.randDepreciation,
        )}: R${a.usdZarSpot.toFixed(2)} today to R${(a.usdZarSpot * (1 + a.randDepreciation) ** Math.max(0, d.planToAge - profile.person.currentAge)).toFixed(
          2,
        )} by age ${age(d.planToAge)}). Only ${formatRand(result.atExit.investedOffshoreZar)} — ${pct(
          offshoreShare,
          0,
        )} of your ${formatRand(capital)} of investable capital — is outside the rand, and ${pct(
          profile.lifestyle.spendingImportedShare,
          0,
        )} of your spending is imported.`,
        offshoreShare < 0.2 ? 'warning' : 'info',
      ),
    )
  } else {
    if (result.kind === 'resign-cash' && result.atExit.lumpSumGross > 0) {
      const rate = result.atExit.lumpSumTax / result.atExit.lumpSumGross
      const retirementTax = calcRetirementLumpSumTax(result.atExit.lumpSumGross, 0, d.tables).tax
      out.push(
        fromLibrary(
          'withdrawal-tax',
          `Cashing out ${formatRand(result.atExit.lumpSumGross)} costs ${formatRand(result.atExit.lumpSumTax)} of tax (${pct(
            rate,
          )} effective) on the withdrawal table, where only ${formatRand(
            d.tables.withdrawalLumpSum[1]?.threshold ?? 27_500,
          )} is tax-free. On the retirement table the same amount would cost ${formatRand(retirementTax)} — you pay ${formatRand(
            Math.max(0, result.atExit.lumpSumTax - retirementTax),
          )} extra, and that capital never earns a return again.`,
          rate > 0.25 ? 'critical' : 'warning',
        ),
      )
    }
    if (result.atExit.forfeitedMedicalSubsidyPv > 0) {
      out.push(
        fromLibrary(
          'medical-subsidy-forfeit',
          `Resigning gives up the post-retirement medical subsidy of ${formatRand(
            profile.gepf.medicalSubsidyMonthly,
          )} a month, worth about ${formatRandCompact(
            result.atExit.forfeitedMedicalSubsidyPv,
          )} in today's rand to age ${age(d.planToAge)} at ${pct(a.medicalInflation)} medical inflation — ${pct(
            capital > 0 ? result.atExit.forfeitedMedicalSubsidyPv / capital : 0,
          )} of the capital this route puts to work.`,
          result.atExit.forfeitedMedicalSubsidyPv > 0.15 * Math.max(capital, 1) ? 'critical' : 'warning',
        ),
      )
    }
    const prev = d.benefits.resignation.actuarialInterestPreviousFactors
    if (prev && prev > 0 && result.atExit.actuarialInterest > 0) {
      const cut = 1 - result.atExit.actuarialInterest / prev
      out.push(
        fromLibrary(
          'factor-revision-2025',
          `At ${age(d.exitAge)} your actuarial interest is ${formatRand(result.atExit.actuarialInterest)} using the factors effective 1 October 2025 (F ≈ ${d.benefits.resignation.factorUsed.toFixed(
            4,
          )}), against ${formatRand(prev)} on the previous factors — ${formatRand(prev - result.atExit.actuarialInterest)} (${pct(
            cut,
          )}) less. ${rules.actuarialFactors.confidence !== 'high' ? 'The factor table here is an estimate: check the value on your benefit statement before deciding.' : ''}`,
          cut > 0.1 ? 'warning' : 'info',
        ),
      )
    }
    if (d.firstDrawRow) {
      out.push(
        fromLibrary(
          'sequence-risk',
          `You draw ${pct(d.firstDrawRate)} of capital in your first drawing year (${formatRand(
            d.firstDrawRow.drawGross,
          )} from ${formatRand(d.firstDrawRow.capitalStart)}), against the ${pct(SUSTAINABLE_DRAW.low, 0)}–${pct(
            SUSTAINABLE_DRAW.high,
            0,
          )} usually considered sustainable. This projection assumes a steady ${pct(
            a.localBalancedReturn,
          )} local and ${pct(a.offshoreReturnUsd)} US-dollar return every year; a poor first five years would push the capital out ${
            result.ruinAge === null ? 'of' : 'further out of'
          } reach permanently.`,
          d.firstDrawRate > SUSTAINABLE_DRAW.high ? 'critical' : 'warning',
        ),
      )
    }
    out.push(
      fromLibrary(
        'longevity-risk',
        result.ruinAge === null
          ? `Your capital lasts to age ${age(d.planToAge)} on these assumptions, ending at ${formatRand(
              result.totals.legacyAtHorizonReal,
            )} in today's rand — but living beyond ${age(d.planToAge)}, or drawing more, has no backstop: ${pct(
              result.totals.guaranteedIncomeShare,
            )} of your income is guaranteed for life.`
          : `Your capital is exhausted at age ${age(result.ruinAge)}, ${Math.round(
              d.planToAge - result.ruinAge,
            )} years before the end of the plan, after which only ${formatRand(
              finite(d.last?.totalNetIncome) / 12,
            )} a month of other income remains. A GEPF pension would have paid for life, with ${pct(
              profile.person.hasSpouse ? profile.person.spousePensionPct / 100 : 0,
              0,
            )} continuing to your spouse.`,
        result.ruinAge !== null && result.ruinAge < d.planToAge - 5 ? 'critical' : 'warning',
      ),
    )
    out.push(
      fromLibrary(
        'capital-controls',
        `${formatRand(result.atExit.investedOffshoreZar)} (${pct(
          offshoreShare,
          0,
        )}) of your capital is offshore. Hold it in your own name with a foreign custodian where you can: assets held through a South African product remain within reach of local rules, exchange control and any future prescribed-asset requirement.`,
      ),
    )
    if (offshoreShare > 0.5) {
      out.push(
        fromLibrary(
          'rand-strength',
          `You are ${pct(offshoreShare, 0)} offshore while ${pct(
            1 - profile.lifestyle.spendingImportedShare,
            0,
          )} of your spending is in rand. A repeat of 2002–2005 (the rand gained about 40%) would cut the rand value of ${formatRand(
            result.atExit.investedOffshoreZar,
          )} to roughly ${formatRand(result.atExit.investedOffshoreZar * 0.6)} and your income with it. The projection assumes the rand only weakens, at ${pct(
            a.randDepreciation,
          )} a year.`,
        ),
      )
    } else {
      out.push(
        fromLibrary(
          'currency-collapse',
          `Only ${pct(offshoreShare, 0)} of your ${formatRand(
            capital,
          )} is offshore, so most of your retirement capital and all of your income depend on the rand, modelled to fall ${pct(
            a.randDepreciation,
          )} a year against the dollar while ${pct(profile.lifestyle.spendingImportedShare, 0)} of your spending is imported.`,
          offshoreShare < 0.2 ? 'warning' : 'info',
        ),
      )
    }
    out.push(
      fromLibrary(
        'fees-drag',
        `Fees over the plan come to ${formatRand(result.totals.lifetimeFeesPaid)} — ${pct(
          capital > 0 ? result.totals.lifetimeFeesPaid / capital : 0,
        )} of the capital you start with. Every 1% of annual fees costs roughly 20% of retirement income over 30 years, so the fund, platform and adviser you choose matter as much as the decision to leave.`,
        result.totals.lifetimeFeesPaid > 0.5 * Math.max(capital, 1) ? 'warning' : 'info',
      ),
    )
  }

  if (result.incomeShortfallAge !== null) {
    const row = result.rows.find((r) => r.age === result.incomeShortfallAge)
    out.push({
      id: 'income-shortfall',
      severity: result.incomeShortfallAge < d.planToAge - 10 ? 'critical' : 'warning',
      title: `Income falls short of your target from age ${age(result.incomeShortfallAge)}`,
      detail: `From age ${age(result.incomeShortfallAge)} this route pays ${formatRand(
        finite(row?.totalNetIncome) / 12,
      )} a month against a target of ${formatRand(finite(row?.targetNetIncome) / 12)} — ${formatRand(
        finite(row?.shortfall) / 12,
      )} a month short${
        row && row.capitalStart > 0 && row.drawdownRate >= a.livingAnnuityMaxDrawdown - 1e-6
          ? `, because the living-annuity drawdown is capped at ${pct(a.livingAnnuityMaxDrawdown)} of capital`
          : ''
      }. Reduce the target, work longer, or draw less earlier.`,
      appliesTo: [result.kind],
    })
  }

  const order: Record<RiskFlag['severity'], number> = { critical: 0, warning: 1, info: 2 }
  return out.filter((f): f is RiskFlag => f !== null).sort((x, y) => order[x.severity] - order[y.severity])
}

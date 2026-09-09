import { useMemo } from 'react'
import type { Assumptions, FundInfo, GepfRules, Profile, ScenarioDefinition, ScenarioResult, TaxTables } from '../../engine/types'
import { runScenario } from '../../engine/projection'
import { formatAge, formatRand } from '../../engine/money'
import { DataTable, td, th, tdRight } from '../ui'
import { safe } from '../compare/helpers'

interface Deps {
  tables: TaxTables
  rules: GepfRules
  funds: FundInfo[]
}

function effective(def: ScenarioDefinition, profile: Profile, key: keyof Assumptions): number {
  const v = def.overrides?.[key]
  return typeof v === 'number' ? v : (profile.assumptions[key] as number)
}

interface SensitivitySpec {
  key: string
  label: string
  patch: (def: ScenarioDefinition, profile: Profile) => Partial<Assumptions>
}

const SENSITIVITIES: SensitivitySpec[] = [
  {
    key: 'rand-down',
    label: 'Rand depreciation −2pp',
    patch: (def, profile) => ({ randDepreciation: effective(def, profile, 'randDepreciation') - 0.02 }),
  },
  {
    key: 'rand-up',
    label: 'Rand depreciation +2pp',
    patch: (def, profile) => ({ randDepreciation: effective(def, profile, 'randDepreciation') + 0.02 }),
  },
  {
    key: 'returns-down',
    label: 'Returns −2pp (local and offshore)',
    patch: (def, profile) => ({
      localBalancedReturn: effective(def, profile, 'localBalancedReturn') - 0.02,
      offshoreReturnUsd: effective(def, profile, 'offshoreReturnUsd') - 0.02,
    }),
  },
  {
    key: 'returns-up',
    label: 'Returns +2pp (local and offshore)',
    patch: (def, profile) => ({
      localBalancedReturn: effective(def, profile, 'localBalancedReturn') + 0.02,
      offshoreReturnUsd: effective(def, profile, 'offshoreReturnUsd') + 0.02,
    }),
  },
  {
    key: 'personal-inflation-up',
    label: 'Personal inflation +2pp',
    patch: (def, profile) => ({ personalInflation: effective(def, profile, 'personalInflation') + 0.02 }),
  },
  {
    key: 'gepf-75',
    label: 'GEPF increases at 75% of CPI',
    patch: () => ({ gepfIncreaseAsPctOfCpi: 0.75 }),
  },
]

function runWith(def: ScenarioDefinition | null, profile: Profile, patch: Partial<Assumptions>, deps: Deps): ScenarioResult | null {
  if (!def) return null
  const varied: ScenarioDefinition = { ...def, overrides: { ...def.overrides, ...patch } }
  return safe(() => runScenario(profile, varied, deps), null)
}

function cell(r: ScenarioResult | null): { ruin: string; income: string } {
  if (!r) return { ruin: '—', income: '—' }
  return { ruin: formatAge(r.ruinAge), income: `${formatRand(r.firstYear.netMonthlyIncome)}/m` }
}

/** Re-runs the two selected scenarios under a handful of stressed assumptions, one row per stress. */
export function SensitivityTable({
  profile,
  defA,
  defB,
  resultA,
  resultB,
  nameA,
  nameB,
  deps,
}: {
  profile: Profile
  defA: ScenarioDefinition | null
  defB: ScenarioDefinition | null
  resultA: ScenarioResult | null
  resultB: ScenarioResult | null
  nameA: string
  nameB: string
  deps: Deps
}) {
  const rows = useMemo(() => {
    return SENSITIVITIES.map((s) => ({
      spec: s,
      a: runWith(defA, profile, s.patch(defA ?? ({} as ScenarioDefinition), profile), deps),
      b: runWith(defB, profile, s.patch(defB ?? ({} as ScenarioDefinition), profile), deps),
    }))
  }, [profile, defA, defB, deps.tables, deps.rules, deps.funds])

  if (!defA && !defB) return null

  return (
    <div>
      <p className="help mb-2">
        Each row re-runs the projection with one assumption stressed, holding everything else at this scenario's current settings — a quick check on how
        sensitive the "capital runs out" age and first-year income are to being wrong about the future.
      </p>
      <DataTable caption="Sensitivity of scenarios A and B to stressed assumptions">
        <thead className="bg-slate-50">
          <tr>
            <th scope="col" rowSpan={2} className={th}>
              Stress
            </th>
            <th scope="col" colSpan={2} className={`${th} border-l border-slate-200 text-center`}>
              {nameA}
            </th>
            <th scope="col" colSpan={2} className={`${th} border-l border-slate-200 text-center`}>
              {nameB}
            </th>
          </tr>
          <tr>
            <th scope="col" className={`${th} border-l border-slate-200 text-right`}>
              Runs out at
            </th>
            <th scope="col" className={`${th} text-right`}>
              1st-yr income
            </th>
            <th scope="col" className={`${th} border-l border-slate-200 text-right`}>
              Runs out at
            </th>
            <th scope="col" className={`${th} text-right`}>
              1st-yr income
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          <tr className="bg-slate-50/60">
            <th scope="row" className={`${td} text-left font-medium`}>
              Base case (current settings)
            </th>
            <td className={`${tdRight} border-l border-slate-100`}>{cell(resultA).ruin}</td>
            <td className={tdRight}>{cell(resultA).income}</td>
            <td className={`${tdRight} border-l border-slate-100`}>{cell(resultB).ruin}</td>
            <td className={tdRight}>{cell(resultB).income}</td>
          </tr>
          {rows.map(({ spec, a, b }) => (
            <tr key={spec.key}>
              <th scope="row" className={`${td} text-left font-medium`}>
                {spec.label}
              </th>
              <td className={`${tdRight} border-l border-slate-100`}>{cell(a).ruin}</td>
              <td className={tdRight}>{cell(a).income}</td>
              <td className={`${tdRight} border-l border-slate-100`}>{cell(b).ruin}</td>
              <td className={tdRight}>{cell(b).income}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  )
}

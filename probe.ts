import { DEFAULT_PROFILE } from './src/data/defaults'
import { FUNDS } from './src/data/funds'
import { defaultScenarios, runScenario, compareScenarios, summarise } from './src/engine/projection'
import type { Profile } from './src/engine/types'

const NAN = Number.NaN
const hostile: Partial<Profile>[] = [
  { person: { ...DEFAULT_PROFILE.person, currentAge: NAN } },
  { person: { ...DEFAULT_PROFILE.person, plannedExitAge: NAN } },
  { person: { ...DEFAULT_PROFILE.person, planToAge: NAN } },
  { person: { ...DEFAULT_PROFILE.person, currentAge: 60, plannedExitAge: 40 } },
  { person: { ...DEFAULT_PROFILE.person, planToAge: 500 } },
  { gepf: { ...DEFAULT_PROFILE.gepf, pensionableSalaryAnnual: NAN } },
  { gepf: { ...DEFAULT_PROFILE.gepf, pensionableServiceYearsNow: -5 } },
  { gepf: { ...DEFAULT_PROFILE.gepf, salaryGrowth: NAN } },
  { lifestyle: { ...DEFAULT_PROFILE.lifestyle, targetNetMonthlyIncomeToday: NAN } },
  { lifestyle: { ...DEFAULT_PROFILE.lifestyle, otherSavings: -100 } },
  { lifestyle: { ...DEFAULT_PROFILE.lifestyle, medicalAidMembers: NAN } },
  { assumptions: { ...DEFAULT_PROFILE.assumptions, usdZarSpot: 0 } },
  { assumptions: { ...DEFAULT_PROFILE.assumptions, randDepreciation: -1 } },
  { assumptions: { ...DEFAULT_PROFILE.assumptions, personalInflation: NAN } },
  { assumptions: { ...DEFAULT_PROFILE.assumptions, localBalancedReturn: NAN, offshoreReturnUsd: NAN } },
  { assumptions: { ...DEFAULT_PROFILE.assumptions, livingAnnuityMaxDrawdown: 0.001 } },
  { assumptions: { ...DEFAULT_PROFILE.assumptions, taxYear: 'nope' as never } },
]
for (const patch of hostile) {
  const p: Profile = { ...DEFAULT_PROFILE, ...patch }
  const rs = defaultScenarios(p, FUNDS).map((d) => runScenario(p, d, { funds: FUNDS }))
  const bad: string[] = []
  for (const r of rs) {
    for (const row of r.rows) for (const [k, v] of Object.entries(row)) if (typeof v === 'number' && !Number.isFinite(v)) bad.push(`${r.definition.id}.${row.age}.${k}=${v}`)
    for (const [k, v] of Object.entries(r.totals)) if (!Number.isFinite(v)) bad.push(`${r.definition.id}.totals.${k}=${v}`)
    for (const [k, v] of Object.entries(r.atExit)) if (typeof v === 'number' && !Number.isFinite(v)) bad.push(`${r.definition.id}.atExit.${k}=${v}`)
    summarise(r)
  }
  compareScenarios(rs)
  console.log(Object.keys(patch)[0], JSON.stringify(patch).slice(0, 70).padEnd(72), 'rows', rs[0].rows.length, bad.length ? 'BAD ' + bad.slice(0, 5).join(',') : 'ok')
}

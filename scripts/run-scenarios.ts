/**
 * Command-line scenario runner: loads a profile JSON (same shape the app exports from
 * Profile -> "Save or load this case"), runs the three core routes plus any saved scenarios,
 * prints a comparison table, net income at 5-year ages, and a sensitivity grid.
 *
 *   npx tsx scripts/run-scenarios.ts profiles/my-case.json [--old-factors] [--json]
 *
 * --old-factors  evaluates resignation values on the previous (2021) actuarial factor table
 * --json         prints the raw results as JSON instead of tables
 */
import { readFileSync } from 'node:fs'
import { compareScenarios, defaultScenarios, runScenario } from '../src/engine/projection'
import { gepfBenefitsAtExit, getGepfRules } from '../src/engine/gepf'
import { getTaxTables } from '../src/engine/tax'
import { FUNDS } from '../src/data/funds'
import { DEFAULT_PROFILE } from '../src/data/defaults'
import { formatRand, formatPct } from '../src/engine/money'
import type { GepfRules, Profile, ScenarioDefinition, ScenarioResult } from '../src/engine/types'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
if (!file) {
  console.error('usage: npx tsx scripts/run-scenarios.ts <profile.json> [--old-factors] [--json]')
  process.exit(1)
}
const raw = JSON.parse(readFileSync(file, 'utf8')) as { profile: Partial<Profile>; scenarios?: ScenarioDefinition[] }
const profile: Profile = {
  person: { ...DEFAULT_PROFILE.person, ...raw.profile.person },
  gepf: { ...DEFAULT_PROFILE.gepf, ...raw.profile.gepf },
  lifestyle: { ...DEFAULT_PROFILE.lifestyle, ...raw.profile.lifestyle },
  assumptions: { ...DEFAULT_PROFILE.assumptions, ...raw.profile.assumptions },
}

let rules: GepfRules = getGepfRules()
if (args.includes('--old-factors') && rules.previousActuarialFactors) {
  rules = { ...rules, actuarialFactors: rules.previousActuarialFactors, previousActuarialFactors: undefined }
}
const tables = getTaxTables(profile.assumptions.taxYear)
const deps = { tables, rules, funds: FUNDS }

const defs = [...defaultScenarios(profile, FUNDS), ...(raw.scenarios ?? [])]
const results = defs.map((d) => runScenario(profile, d, deps))
const comparison = compareScenarios(results)

if (args.includes('--json')) {
  console.log(JSON.stringify({ profile, results }, null, 1))
  process.exit(0)
}

const b = gepfBenefitsAtExit(profile, profile.person.plannedExitAge, rules)
console.log(`\nGEPF benefits at exit age ${profile.person.plannedExitAge} (source: ${b.source})`)
console.log(`  service ${b.serviceYears.toFixed(2)} yrs, final salary ${formatRand(b.finalSalaryAnnual)}`)
console.log(`  gratuity ${formatRand(b.retirement.gratuity)}, pension ${formatRand(b.retirement.annuityMonthly)}/month (reduction factor ${b.retirement.reductionFactor.toFixed(3)})`)
console.log(`  resignation value ${formatRand(b.resignation.actuarialInterest)} (F=${b.resignation.factorUsed.toFixed(4)})` +
  (b.resignation.actuarialInterestPreviousFactors ? ` vs ${formatRand(b.resignation.actuarialInterestPreviousFactors)} on the previous factors` : ''))
console.log(`  two-pot: vested ${formatRand(b.resignation.vestedComponent)}, savings ${formatRand(b.resignation.savingsComponent)}, retirement ${formatRand(b.resignation.retirementComponent)}`)

function fmt(v: number | string | null, format: string): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string') return v
  if (format === 'currency') return formatRand(v)
  if (format === 'currencyMonthly') return `${formatRand(v)}/m`
  if (format === 'percent') return formatPct(v)
  if (format === 'age') return String(Math.round(v))
  return String(Math.round(v * 100) / 100)
}

function table(headers: string[], rows: string[][]) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)))
  const line = (cells: string[]) => cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ')
  console.log(line(headers))
  console.log(widths.map((w) => '-'.repeat(w)).join('  '))
  rows.forEach((r) => console.log(line(r)))
}

console.log('\nCOMPARISON')
table(
  ['Metric', ...results.map((r) => r.definition.name)],
  comparison.table.map((m) => [
    m.label + (comparison.winners[m.key] ? '' : ''),
    ...results.map((r) => fmt(m.values[r.definition.id] ?? null, m.format) + (comparison.winners[m.key] === r.definition.id ? ' *' : '')),
  ]),
)

console.log('\nNET INCOME PER YEAR (nominal) AND CAPITAL AT END OF YEAR, by age')
const ages = [65, 70, 75, 80, 85, 90].filter((a) => a >= profile.person.plannedExitAge && a <= profile.person.planToAge)
table(
  ['Age', ...results.flatMap((r) => [`${r.definition.id} net`, `${r.definition.id} capital`])],
  ages.map((age) => [
    String(age),
    ...results.flatMap((r: ScenarioResult) => {
      const row = r.rows.find((x) => Math.round(x.age) === age)
      return row ? [formatRand(row.totalNetIncome), formatRand(row.capitalEnd)] : ['—', '—']
    }),
  ]),
)

console.log('\nSENSITIVITIES (ruin age / PV of net income in today\'s rand)')
const a = profile.assumptions
const variants: { label: string; overrides: Partial<typeof a> }[] = [
  { label: 'base', overrides: {} },
  { label: 'rand depreciation +2pp', overrides: { randDepreciation: a.randDepreciation + 0.02 } },
  { label: 'rand depreciation -2pp', overrides: { randDepreciation: Math.max(-0.05, a.randDepreciation - 0.02) } },
  { label: 'returns -2pp', overrides: { localBalancedReturn: a.localBalancedReturn - 0.02, offshoreReturnUsd: a.offshoreReturnUsd - 0.02 } },
  { label: 'returns +2pp', overrides: { localBalancedReturn: a.localBalancedReturn + 0.02, offshoreReturnUsd: a.offshoreReturnUsd + 0.02 } },
  { label: 'personal inflation +2pp', overrides: { personalInflation: a.personalInflation + 0.02 } },
  { label: 'GEPF increases 75% of CPI', overrides: { gepfIncreaseAsPctOfCpi: 0.75 } },
]
table(
  ['Variant', ...results.map((r) => r.definition.name)],
  variants.map((v) => [
    v.label,
    ...defs.map((d) => {
      const r = runScenario(profile, { ...d, overrides: { ...d.overrides, ...v.overrides } }, deps)
      return `${r.ruinAge === null ? 'lasts' : 'out @' + Math.round(r.ruinAge)} / ${formatRand(r.totals.pvNetIncome)}`
    }),
  ]),
)

console.log('\nNOTES')
results.forEach((r) => {
  console.log(`- ${r.definition.name}:`)
  r.notes.forEach((n) => console.log(`    ${n}`))
  r.flags.filter((f) => f.severity !== 'info').forEach((f) => console.log(`    [${f.severity}] ${f.title}`))
})

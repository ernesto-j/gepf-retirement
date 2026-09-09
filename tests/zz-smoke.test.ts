import { describe, it } from 'vitest'
import { writeFileSync } from 'node:fs'
const out: string[] = []
const log = (...args: unknown[]) => out.push(args.map((x) => String(x)).join(' '))
import { DEFAULT_PROFILE } from '../src/data/defaults'
import { defaultScenarios, runScenario, compareScenarios, summarise } from '../src/engine/projection'
import { FUNDS } from '../src/data/funds'

describe('smoke', () => {
  it('runs', () => {
    const defs = defaultScenarios(DEFAULT_PROFILE, FUNDS)
    const results = defs.map((d) => runScenario(DEFAULT_PROFILE, d))
    for (const r of results) {
      log('---', r.definition.name)
      log('atExit', JSON.stringify(r.atExit, null, 1))
      log('atRet', JSON.stringify(r.atRetirementFromPreservation))
      log('firstYear', JSON.stringify(r.firstYear))
      log('ruin', r.ruinAge, 'shortfall', r.incomeShortfallAge)
      log('totals', JSON.stringify(r.totals, null, 1))
      log('rows0', JSON.stringify(r.rows[0], null, 1))
      log('rows3', JSON.stringify(r.rows[3], null, 1))
      log('PROS'); r.pros.forEach((p) => log(' +', p))
      log('CONS'); r.cons.forEach((p) => log(' -', p))
      log('FLAGS'); r.flags.forEach((f) => log(' !', f.severity, f.id, f.detail))
      log('NOTES'); r.notes.forEach((n) => log(' *', n))
    }
    const cmp = compareScenarios(results)
    log(JSON.stringify(cmp.table, null, 1))
    log(JSON.stringify(cmp.winners, null, 1))
    log(JSON.stringify(summarise(results[0]), null, 1))
    writeFileSync('/tmp/smoke.txt', out.join('\n'))
  })
})

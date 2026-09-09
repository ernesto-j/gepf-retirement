import type { ReactNode } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { R } from '../ui'
import type { AppPage } from '../../engine/types'

export const PAGE_LABELS: Record<AppPage, string> = {
  profile: 'Profile',
  compare: 'Stay vs Leave',
  planner: 'Scenario Planner',
  funds: 'Funds & Fees',
  rand: 'Rand & Inflation',
  risks: 'Risks',
  ask: 'Ask AI',
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
      {children}
    </span>
  )
}

/** Small chips summarising exactly what is being shared with the AI for this request. */
export function ContextChips({ page, scenarioCount }: { page: AppPage; scenarioCount: number }) {
  const profile = useAppStore((s) => s.profile)
  const { person, gepf, lifestyle } = profile
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="What the AI can see">
      <Chip>Page: {PAGE_LABELS[page]}</Chip>
      <Chip>{`Age ${person.currentAge} → exit ${person.plannedExitAge}`}</Chip>
      <Chip>{`${gepf.pensionableServiceYearsNow} yrs service`}</Chip>
      <Chip>{`Target ${R(lifestyle.targetNetMonthlyIncomeToday)}/mo`}</Chip>
      <Chip>
        {scenarioCount} scenario{scenarioCount === 1 ? '' : 's'} on screen
      </Chip>
    </div>
  )
}

import type { CustomInvestment, CustomInvestmentKind } from '../../engine/types'
import { useAppStore } from '../../store/useAppStore'
import { Callout, Section } from '../ui'
import { createInvestmentFromPreset, PRESET_BUTTONS } from './investments/factory'
import { InvestmentCard } from './investments/InvestmentCard'

/**
 * Holdings the member sets up themselves — an S&P 500 ETF in dollars, an Australian property with a
 * deposit and loan, a fixed-term deposit — that run alongside every scenario. Income counts toward
 * the income target; sale proceeds return to savings.
 */
export function InvestmentsSection() {
  const profile = useAppStore((s) => s.profile)
  const setInvestments = useAppStore((s) => s.setInvestments)
  const { investments, person, assumptions } = profile

  function handleAdd(kind: CustomInvestmentKind) {
    setInvestments([...investments, createInvestmentFromPreset(kind, person.plannedExitAge)])
  }

  function handleUpdate(id: string, patch: Partial<CustomInvestment>) {
    setInvestments(investments.map((inv) => (inv.id === id ? { ...inv, ...patch } : inv)))
  }

  function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return
    setInvestments(investments.filter((inv) => inv.id !== id))
  }

  return (
    <Section
      title="Your own investments"
      description="Holdings you set up yourself — an S&P 500 ETF in dollars, an Australian property with a deposit and loan, a fixed-term deposit — that run alongside every scenario. Income counts toward your target; sale proceeds return to your savings."
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {PRESET_BUTTONS.map((p) => (
          <button key={p.kind} type="button" className="btn-secondary" onClick={() => handleAdd(p.kind)}>
            {p.label}
          </button>
        ))}
      </div>

      {investments.length === 0 ? (
        <Callout tone="info">You haven't added any investments yet. Use one of the buttons above to add your first one.</Callout>
      ) : (
        <div className="flex flex-col gap-4">
          {investments.map((inv) => (
            <InvestmentCard
              key={inv.id}
              investment={inv}
              assumptions={assumptions}
              currentAge={person.currentAge}
              fromAge={person.plannedExitAge}
              toAge={person.planToAge}
              onChange={(patch) => handleUpdate(inv.id, patch)}
              onDelete={() => handleDelete(inv.id, inv.name)}
            />
          ))}
        </div>
      )}
    </Section>
  )
}

import type { AppPage } from '../engine/types'

export interface NavItem {
  id: AppPage
  label: string
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'compare', label: 'Stay vs Leave' },
  { id: 'planner', label: 'Scenario planner' },
  { id: 'funds', label: 'Funds & fees' },
  { id: 'rand', label: 'Rand & inflation' },
  { id: 'risks', label: 'Risks' },
  { id: 'ask', label: 'Ask AI' },
]

function Icon({ id }: { id: AppPage }) {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (id) {
    case 'profile':
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="12" cy="8" r="3.25" />
          <path d="M5 20c0-3.5 3.13-6 7-6s7 2.5 7 6" />
        </svg>
      )
    case 'compare':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4 8h11M4 8l3-3M4 8l3 3" />
          <path d="M20 16H9M20 16l-3-3M20 16l-3 3" />
        </svg>
      )
    case 'planner':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4 20V10M12 20V4M20 20v-7" />
          <path d="M2 20h20" />
        </svg>
      )
    case 'funds':
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="9" cy="9" r="5.25" />
          <circle cx="15" cy="15" r="5.25" />
        </svg>
      )
    case 'rand':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4 19 10 5M8 5h6.5c1.8 0 2.5 2.4.8 3.4L4 15.5" />
        </svg>
      )
    case 'risks':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M12 3 2 20h20L12 3Z" />
          <path d="M12 10v4M12 17h.01" />
        </svg>
      )
    case 'ask':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4 5h16v10H9l-4 4V5Z" />
          <path d="M9 9h6M9 12h4" />
        </svg>
      )
    default:
      return null
  }
}

export function Nav({ page, onNavigate }: { page: AppPage; onNavigate: (page: AppPage) => void }) {
  return (
    <nav
      aria-label="Main"
      className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible md:px-3 md:pb-0"
    >
      {NAV_ITEMS.map((item) => {
        const active = item.id === page
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            aria-current={active ? 'page' : undefined}
            className={
              'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition md:w-full ' +
              (active ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')
            }
          >
            <Icon id={item.id} />
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

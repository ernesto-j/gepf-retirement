import type { AppPage } from './engine/types'
import { useAppStore } from './store/useAppStore'
import { Nav } from './components/Nav'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AskAiDrawer } from './components/AskAiDrawer'
import ProfilePage from './pages/ProfilePage'
import ComparePage from './pages/ComparePage'
import PlannerPage from './pages/PlannerPage'
import FundsPage from './pages/FundsPage'
import RandPage from './pages/RandPage'
import RisksPage from './pages/RisksPage'
import AskPage from './pages/AskPage'

function PageSwitch({ page }: { page: AppPage }) {
  switch (page) {
    case 'profile':
      return <ProfilePage />
    case 'compare':
      return <ComparePage />
    case 'planner':
      return <PlannerPage />
    case 'funds':
      return <FundsPage />
    case 'rand':
      return <RandPage />
    case 'risks':
      return <RisksPage />
    case 'ask':
      return <AskPage />
    default:
      return null
  }
}

export default function App() {
  const page = useAppStore((s) => s.page)
  const setPage = useAppStore((s) => s.setPage)
  const drawerOpen = useAppStore((s) => s.drawerOpen)
  const setDrawerOpen = useAppStore((s) => s.setDrawerOpen)
  const resetAll = useAppStore((s) => s.resetAll)
  const taxYear = useAppStore((s) => s.profile.assumptions.taxYear)

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="border-b border-slate-200 bg-white md:w-64 md:shrink-0 md:border-b-0 md:border-r">
        <div className="hidden px-4 pt-4 pb-2 md:block">
          <div className="text-base font-semibold tracking-tight text-slate-900">SA Pension Planner</div>
          <div className="text-xs text-slate-500">GEPF: stay or leave?</div>
        </div>
        <div className="flex items-center gap-2 px-3 pt-3 md:hidden">
          <span className="text-sm font-semibold tracking-tight text-slate-900">SA Pension Planner</span>
          <span className="text-xs text-slate-500">— GEPF: stay or leave?</span>
        </div>
        <Nav page={page} onNavigate={setPage} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 p-4 md:p-6">
          <ErrorBoundary>
            <PageSwitch page={page} />
          </ErrorBoundary>
        </main>

        <footer className="border-t border-slate-200 bg-white px-4 py-3 text-center text-xs text-slate-500 md:px-6">
          <p>Estimates only — not financial advice. Tax year {taxYear}.</p>
          <button
            type="button"
            className="mt-1 text-brand-700 underline underline-offset-2 hover:text-brand-800"
            onClick={() => {
              if (window.confirm('Reset all inputs to the defaults? This clears your saved profile, scenarios and chat.')) {
                resetAll()
              }
            }}
          >
            Reset all inputs
          </button>
        </footer>
      </div>

      {page !== 'ask' && (
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="btn-primary fixed right-4 bottom-4 z-30 gap-2 rounded-full px-4 py-3 shadow-lg md:right-6 md:bottom-6"
          aria-label="Ask AI"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 5h16v10H9l-4 4V5Z" />
            <path d="M9 9h6M9 12h4" />
          </svg>
          Ask AI
        </button>
      )}

      <AskAiDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  )
}

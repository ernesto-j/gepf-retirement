import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useResults } from '../store/useResults'
import { ChatPanel } from './ai/ChatPanel'
import { ContextChips } from './ai/ContextChips'
import { AiSettingsPanel } from './ai/AiSettingsPanel'

/** Slide-over "Ask AI" panel, opened from the persistent button in the app shell. */
export function AskAiDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const page = useAppStore((s) => s.page)
  const clearChat = useAppStore((s) => s.clearChat)
  const { core } = useResults()

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-slate-900/30 transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        aria-hidden="true"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Ask AI"
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-start justify-between gap-2 border-b border-slate-200 p-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Ask AI</h2>
            <p className="mt-0.5 text-xs text-slate-500">Not financial advice.</p>
          </div>
          <button type="button" className="btn-secondary" onClick={onClose} aria-label="Close Ask AI">
            Close
          </button>
        </div>
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4">
          <ContextChips page={page} scenarioCount={core.length} />
          <AiSettingsPanel onClear={clearChat} />
        </div>
        <div className="min-h-0 flex-1 p-4">
          <ChatPanel page={page} />
        </div>
      </aside>
    </>
  )
}

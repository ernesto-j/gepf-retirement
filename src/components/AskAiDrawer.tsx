// PLACEHOLDER — owned by the AI agent per docs/SPEC.md. Replace with the real drawer (chat, context chips, settings).

export function AskAiDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" role="dialog" aria-modal="true" aria-label="Ask AI">
      <div className="h-full w-full max-w-sm bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Ask AI</h2>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="text-sm text-slate-600">The AI assistant is coming soon.</p>
      </div>
    </div>
  )
}

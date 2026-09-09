// PLACEHOLDER — owned by the AI agent per docs/SPEC.md. Replace with the real upload + extraction UI
// (PDF/image upload, calls /api/extract-statement, shows progress and errors).
import type { GepfStatementValues } from '../engine/types'

export function StatementUpload({ onExtracted: _onExtracted }: { onExtracted: (v: GepfStatementValues) => void }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-500">
      Upload your GEPF benefit statement (PDF or photo) to auto-fill these fields — coming soon.
    </div>
  )
}

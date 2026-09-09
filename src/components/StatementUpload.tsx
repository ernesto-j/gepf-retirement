import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { AskAiError, checkServerHealth, extractStatement, type ServerHealth } from '../ai/client'
import type { GepfStatementValues } from '../engine/types'
import { formatRand } from '../engine/money'
import { Callout } from './ui'

type Status = 'idle' | 'extracting' | 'done' | 'error'

const FIELD_LABELS: Record<keyof GepfStatementValues, string> = {
  statementDate: 'Statement date',
  memberNumber: 'Member number',
  employer: 'Employer',
  pensionableServiceYears: 'Pensionable service (years)',
  finalSalaryAnnual: 'Final salary (annual)',
  resignationBenefit: 'Resignation benefit',
  retirementGratuity: 'Retirement gratuity',
  retirementAnnuityAnnual: 'Retirement annuity (annual)',
  deathBenefitLumpSum: 'Death benefit lump sum',
  vestedComponent: 'Vested component',
  savingsComponent: 'Savings component',
  retirementComponent: 'Retirement component',
  notes: 'Notes',
  uncertainFields: 'Fields the AI was unsure of',
}

const CURRENCY_FIELDS = new Set<keyof GepfStatementValues>([
  'finalSalaryAnnual',
  'resignationBenefit',
  'retirementGratuity',
  'retirementAnnuityAnnual',
  'deathBenefitLumpSum',
  'vestedComponent',
  'savingsComponent',
  'retirementComponent',
])

const ACCEPT = 'application/pdf,image/png,image/jpeg,image/gif,image/webp'

/**
 * Upload (drag-drop or file picker) a GEPF benefit statement (PDF or photo), extract its values
 * via the AI, preview them (flagging any the extractor was unsure of), and hand the result to
 * `onExtracted` only once the member confirms with "Apply to my profile".
 */
export default function StatementUpload({ onExtracted }: { onExtracted: (v: GepfStatementValues) => void }) {
  const ai = useAppStore((s) => s.ai)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [extracted, setExtracted] = useState<GepfStatementValues | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [serverHealth, setServerHealth] = useState<ServerHealth | null | 'checking'>('checking')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ai.mode !== 'server') return
    let cancelled = false
    setServerHealth('checking')
    void checkServerHealth().then((health) => {
      if (!cancelled) setServerHealth(health)
    })
    return () => {
      cancelled = true
    }
  }, [ai.mode])

  const disabledReason =
    ai.mode === 'browser'
      ? !ai.apiKey.trim()
        ? "You're in browser mode with no API key set. Add one in AI settings, or switch to server mode."
        : null
      : serverHealth !== 'checking' && (!serverHealth || !serverHealth.ok)
        ? 'The AI server is unreachable. Start it with `npm run server` (or `npm run dev`), or switch to browser mode with your own key.'
        : serverHealth !== 'checking' && serverHealth && !serverHealth.hasKey
          ? 'The AI server has no ANTHROPIC_API_KEY configured. Ask the site operator to set one, or switch to browser mode with your own key.'
          : null
  const disabled = Boolean(disabledReason)

  async function handleFile(file: File) {
    setError(null)
    setExtracted(null)
    setStatus('extracting')
    try {
      const values = await extractStatement(file, ai)
      setExtracted(values)
      setStatus('done')
    } catch (err) {
      setStatus('error')
      setError(err instanceof AskAiError ? err.message : 'Could not extract your statement.')
    }
  }

  const visibleFields = extracted
    ? (Object.keys(FIELD_LABELS) as (keyof GepfStatementValues)[]).filter((k) => {
        const v = extracted[k]
        if (v === undefined || v === null || v === '') return false
        if (Array.isArray(v) && v.length === 0) return false
        return true
      })
    : []

  return (
    <div className="flex flex-col gap-3">
      {disabledReason && (
        <Callout tone="warn" title="Statement extraction is unavailable right now">
          {disabledReason}
        </Callout>
      )}

      <div
        className={`rounded-lg border-2 border-dashed p-6 text-center text-sm transition ${
          disabled
            ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
            : dragOver
              ? 'border-brand-400 bg-brand-50 text-brand-800'
              : 'border-slate-300 text-slate-600 hover:border-brand-300'
        }`}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (disabled) return
          const file = e.dataTransfer.files?.[0]
          if (file) void handleFile(file)
        }}
      >
        <p>Drag a GEPF benefit statement (PDF or photo) here, or</p>
        <button type="button" className="btn-secondary mt-2" disabled={disabled} onClick={() => inputRef.current?.click()}>
          Choose file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void handleFile(file)
          }}
        />
        <p className="mt-2 text-xs text-slate-400">PDF, PNG, JPEG, GIF or WEBP, up to 18 MB.</p>
      </div>

      {status === 'extracting' && <p className="text-sm text-slate-500">Reading your statement…</p>}
      {error && <Callout tone="danger">{error}</Callout>}

      {extracted && (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          {visibleFields.length === 0 ? (
            <p className="p-3 text-sm text-slate-500">The AI couldn't find any values on that file.</p>
          ) : (
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <caption className="sr-only">Values extracted from your GEPF benefit statement</caption>
              <tbody className="divide-y divide-slate-100">
                {visibleFields.map((k) => {
                  const uncertain = k !== 'uncertainFields' && extracted.uncertainFields?.includes(k)
                  const value = extracted[k]
                  return (
                    <tr key={k} className={uncertain ? 'bg-amber-50' : undefined}>
                      <th scope="row" className="px-3 py-2 text-left align-top text-xs font-medium text-slate-500">
                        {FIELD_LABELS[k]}
                        {uncertain && <span className="badge ml-1 bg-amber-100 text-amber-800">uncertain</span>}
                      </th>
                      <td className="px-3 py-2 align-top tabular-nums text-slate-800">
                        {Array.isArray(value) ? value.join(', ') || '—' : CURRENCY_FIELDS.has(k) ? formatRand(value as number) : String(value)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-3">
            <button type="button" className="btn-secondary" onClick={() => setExtracted(null)}>
              Discard
            </button>
            <button type="button" className="btn-primary" onClick={() => onExtracted(extracted)} disabled={visibleFields.length === 0}>
              Apply to my profile
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

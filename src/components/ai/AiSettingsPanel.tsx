import { useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { checkServerHealth, type ServerHealth } from '../../ai/client'
import { Field, SelectInput } from '../ui'

type HealthState = 'unchecked' | 'checking' | ServerHealth | null

/** Mode/key/model settings + a server health check + clear-conversation, shared by the drawer and Ask page. */
export function AiSettingsPanel({ onClear }: { onClear: () => void }) {
  const ai = useAppStore((s) => s.ai)
  const setAi = useAppStore((s) => s.setAi)
  const [health, setHealth] = useState<HealthState>('unchecked')

  async function check() {
    setHealth('checking')
    setHealth(await checkServerHealth())
  }

  return (
    <details className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
      <summary className="cursor-pointer select-none font-medium text-slate-700">AI settings</summary>
      <div className="mt-3 flex flex-col gap-3">
        <SelectInput
          label="Mode"
          value={ai.mode}
          onChange={(v) => setAi({ mode: v })}
          options={[
            { value: 'server', label: 'Server (shared API key)' },
            { value: 'browser', label: 'Browser (your own API key)' },
          ]}
          help="Server mode calls this app's own Express API. Browser mode sends your key straight to Anthropic from your browser and stores it only in localStorage - it is never sent to this app's server."
        />
        {ai.mode === 'browser' && (
          <Field label="Anthropic API key" help="Stored only in this browser's localStorage.">
            <input
              type="password"
              className="input"
              value={ai.apiKey}
              onChange={(e) => setAi({ apiKey: e.target.value })}
              placeholder="sk-ant-..."
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        )}
        <Field label="Model" help="Leave as the default unless you know you want a different one.">
          <input
            className="input"
            value={ai.model}
            onChange={(e) => setAi({ model: e.target.value })}
            placeholder="claude-opus-5"
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary" onClick={check}>
            Check server health
          </button>
          <HealthBadge health={health} />
          <button type="button" className="btn-secondary ml-auto" onClick={onClear}>
            Clear conversation
          </button>
        </div>
      </div>
    </details>
  )
}

function HealthBadge({ health }: { health: HealthState }) {
  if (health === 'unchecked') return null
  if (health === 'checking') return <span className="text-xs text-slate-500">Checking…</span>
  if (health === null) return <span className="text-xs text-red-700">Server unreachable</span>
  if (!health.ok) return <span className="text-xs text-red-700">Server unreachable</span>
  if (!health.hasKey) return <span className="text-xs text-amber-700">Server running, no API key configured</span>
  return <span className="text-xs text-emerald-700">Server ready ({health.model})</span>
}

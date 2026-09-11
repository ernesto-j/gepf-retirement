import { useRef, useState, type ChangeEvent } from 'react'
import type { Profile, ScenarioDefinition } from '../../engine/types'
import { useAppStore } from '../../store/useAppStore'
import { Callout, Section } from '../ui'

const EXPORT_FILENAME = 'sa-pension-planner-case.json'

interface CaseFile {
  version: 1
  exportedAt: string
  profile: Profile
  scenarios: ScenarioDefinition[]
}

interface ImportResult {
  tone: 'ok' | 'danger'
  title: string
  message: string
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Lets a member export their full profile + scenarios to a JSON file (or clipboard), and load one
 * back in later — either from a file or pasted text. Everything happens client-side: nothing is
 * uploaded anywhere.
 */
export default function ImportExport() {
  const profile = useAppStore((s) => s.profile)
  const scenarios = useAppStore((s) => s.scenarios)
  const replaceProfile = useAppStore((s) => s.replaceProfile)
  const upsertScenario = useAppStore((s) => s.upsertScenario)

  const [pasteText, setPasteText] = useState('')
  const [copyNotice, setCopyNotice] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function buildCaseFile(): CaseFile {
    return { version: 1, exportedAt: new Date().toISOString(), profile, scenarios }
  }

  function handleExport() {
    const json = JSON.stringify(buildCaseFile(), null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = EXPORT_FILENAME
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function handleCopy() {
    const json = JSON.stringify(buildCaseFile(), null, 2)
    try {
      await navigator.clipboard.writeText(json)
      setCopyNotice('Copied the case JSON to your clipboard.')
    } catch {
      setCopyNotice('Could not copy automatically — the JSON has been placed in the paste box below so you can copy it by hand.')
      setPasteText(json)
    }
  }

  function applyImport(raw: string) {
    if (!raw.trim()) {
      setResult({ tone: 'danger', title: "Couldn't load this case", message: 'Nothing to import — paste or choose a file first.' })
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      setResult({
        tone: 'danger',
        title: "Couldn't load this case",
        message: `That isn't valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      })
      return
    }

    if (!isPlainObject(parsed) || !isPlainObject(parsed.profile)) {
      setResult({ tone: 'danger', title: "Couldn't load this case", message: 'Expected a JSON object with a "profile" field.' })
      return
    }

    const importedProfile = parsed.profile
    const { person, gepf, lifestyle, assumptions } = importedProfile
    if (!isPlainObject(person) || !isPlainObject(gepf) || !isPlainObject(lifestyle) || !isPlainObject(assumptions)) {
      setResult({
        tone: 'danger',
        title: "Couldn't load this case",
        message: 'The profile must include person, gepf, lifestyle and assumptions objects.',
      })
      return
    }

    // Merge each section onto the current profile so any fields missing from the imported
    // file simply keep their current values.
    const merged: Profile = {
      person: { ...profile.person, ...person },
      gepf: { ...profile.gepf, ...gepf },
      lifestyle: { ...profile.lifestyle, ...lifestyle },
      investments: Array.isArray((parsed as { profile?: { investments?: unknown } }).profile?.investments)
        ? ((parsed as { profile: { investments: Profile['investments'] } }).profile.investments)
        : profile.investments,
      assumptions: { ...profile.assumptions, ...assumptions },
    }
    replaceProfile(merged)

    const importedScenarios = Array.isArray(parsed.scenarios) ? (parsed.scenarios as ScenarioDefinition[]) : []
    importedScenarios.forEach((s) => upsertScenario(s))

    setResult({
      tone: 'ok',
      title: 'Case loaded',
      message: `Age ${merged.person.currentAge}, exit age ${merged.person.plannedExitAge}, ${merged.gepf.pensionableServiceYearsNow} years' service, salary R${Math.round(
        merged.gepf.pensionableSalaryAnnual,
      ).toLocaleString('en-ZA')}. ${importedScenarios.length} scenario${importedScenarios.length === 1 ? '' : 's'} loaded.`,
    })
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => applyImport(String(reader.result ?? ''))
    reader.onerror = () => setResult({ tone: 'danger', title: "Couldn't load this case", message: 'Could not read the selected file.' })
    reader.readAsText(file)
  }

  return (
    <Section
      title="Save or load this case"
      description="Export your profile and scenarios to a file you keep, or bring one back in. Nothing here ever leaves your browser."
    >
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={handleExport}>
          Export JSON
        </button>
        <button type="button" className="btn-secondary" onClick={() => void handleCopy()}>
          Copy JSON
        </button>
        <button type="button" className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
          Import JSON
        </button>
        <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleFileChange} />
      </div>
      {copyNotice && <p className="help mt-2">{copyNotice}</p>}

      <div className="mt-4">
        <label className="label" htmlFor="import-export-paste">
          Paste JSON here
        </label>
        <textarea
          id="import-export-paste"
          className="input mt-1 h-32 font-mono text-xs"
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder="Paste a previously exported case here…"
        />
        <div className="mt-2">
          <button type="button" className="btn-secondary" disabled={!pasteText.trim()} onClick={() => applyImport(pasteText)}>
            Apply
          </button>
        </div>
      </div>

      {result && (
        <div className="mt-4">
          <Callout tone={result.tone} title={result.title}>
            {result.message}
          </Callout>
        </div>
      )}
    </Section>
  )
}

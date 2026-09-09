import { useEffect, useId, useState, type ReactNode } from 'react'
import { formatPct, formatRand, formatRandCompact } from '../engine/money'

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export function PageHeader({ title, intro, actions }: { title: string; intro?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {intro && <p className="mt-1 max-w-3xl text-sm text-slate-600">{intro}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  )
}

export function Section({
  title,
  description,
  children,
  right,
  collapsible = false,
  defaultOpen = true,
  id,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
  right?: ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
  id?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section id={id} className="card mb-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          {collapsible ? (
            <button
              type="button"
              className="flex items-center gap-2 text-left"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
            >
              <span className="text-slate-400">{open ? '▾' : '▸'}</span>
              <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            </button>
          ) : (
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          )}
          {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
        </div>
        {right}
      </div>
      {(!collapsible || open) && children}
    </section>
  )
}

export function Grid({ cols = 2, children, className = '' }: { cols?: 1 | 2 | 3 | 4; children: ReactNode; className?: string }) {
  const map = { 1: 'grid-cols-1', 2: 'grid-cols-1 md:grid-cols-2', 3: 'grid-cols-1 md:grid-cols-3', 4: 'grid-cols-2 md:grid-cols-4' }
  return <div className={`grid gap-3 ${map[cols]} ${className}`}>{children}</div>
}

export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn' | 'danger' | 'ok'
  title?: string
  children: ReactNode
}) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-red-200 bg-red-50 text-red-900',
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }
  return (
    <div className={`rounded-lg border p-3 text-sm ${tones[tone]}`} role={tone === 'danger' ? 'alert' : undefined}>
      {title && <div className="mb-1 font-semibold">{title}</div>}
      <div>{children}</div>
    </div>
  )
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'brand'; children: ReactNode }) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-700',
    ok: 'bg-emerald-100 text-emerald-800',
    warn: 'bg-amber-100 text-amber-800',
    danger: 'bg-red-100 text-red-800',
    brand: 'bg-brand-100 text-brand-800',
  }
  return <span className={`badge ${tones[tone]}`}>{children}</span>
}

/* ------------------------------------------------------------------ */
/* KPI tiles                                                           */
/* ------------------------------------------------------------------ */

export function KpiTile({
  label,
  value,
  sub,
  tone = 'neutral',
  help,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'brand'
  help?: string
}) {
  const tones = {
    neutral: 'text-slate-900',
    ok: 'text-emerald-700',
    warn: 'text-amber-700',
    danger: 'text-red-700',
    brand: 'text-brand-700',
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
        {help && <Help text={help} />}
      </div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${tones[tone]}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

export function Help({ text }: { text: string }) {
  return (
    <span className="group relative inline-block">
      <span
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600"
        aria-label={text}
        title={text}
      >
        ?
      </span>
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export function Field({ label, help, children, htmlFor }: { label: string; help?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {help && <p className="help">{help}</p>}
    </div>
  )
}

/** Rand input: shows formatted value when blurred, raw number while editing. */
export function RandInput({
  label,
  value,
  onChange,
  help,
  min = 0,
  max,
  step = 1000,
  monthly = false,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  help?: ReactNode
  min?: number
  max?: number
  step?: number
  monthly?: boolean
}) {
  const id = useId()
  const [text, setText] = useState(String(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setText(String(value))
  }, [value, focused])
  return (
    <Field label={monthly ? `${label} (R / month)` : `${label} (R)`} help={help} htmlFor={id}>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">R</span>
        <input
          id={id}
          className="input pl-7 tabular-nums"
          inputMode="decimal"
          value={focused ? text : Math.round(value).toLocaleString('en-ZA').replace(/,/g, ' ')}
          onFocus={() => {
            setFocused(true)
            setText(String(value))
          }}
          onBlur={() => {
            setFocused(false)
            const n = Number(text.replace(/[^\d.-]/g, ''))
            if (!Number.isNaN(n)) onChange(clampNum(n, min, max))
          }}
          onChange={(e) => {
            setText(e.target.value)
            const n = Number(e.target.value.replace(/[^\d.-]/g, ''))
            if (!Number.isNaN(n) && e.target.value.trim() !== '') onChange(clampNum(n, min, max))
          }}
          step={step}
        />
      </div>
    </Field>
  )
}

/** Percent input: value is a decimal (0.045), shown as 4.5. */
export function PercentInput({
  label,
  value,
  onChange,
  help,
  min = -1,
  max = 1,
  step = 0.1,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  help?: ReactNode
  min?: number
  max?: number
  step?: number
}) {
  const id = useId()
  const [text, setText] = useState(fmt(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setText(fmt(value))
  }, [value, focused])
  function fmt(v: number) {
    return String(Math.round(v * 10000) / 100)
  }
  return (
    <Field label={`${label} (%)`} help={help} htmlFor={id}>
      <div className="relative">
        <input
          id={id}
          className="input pr-8 tabular-nums"
          inputMode="decimal"
          value={text}
          step={step}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            const n = Number(text)
            if (!Number.isNaN(n)) onChange(clampNum(n / 100, min, max))
          }}
          onChange={(e) => {
            setText(e.target.value)
            const n = Number(e.target.value)
            if (!Number.isNaN(n) && e.target.value.trim() !== '') onChange(clampNum(n / 100, min, max))
          }}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">%</span>
      </div>
    </Field>
  )
}

export function NumberInput({
  label,
  value,
  onChange,
  help,
  min,
  max,
  step = 1,
  suffix,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  help?: ReactNode
  min?: number
  max?: number
  step?: number
  suffix?: string
}) {
  const id = useId()
  return (
    <Field label={suffix ? `${label} (${suffix})` : label} help={help} htmlFor={id}>
      <input
        id={id}
        type="number"
        className="input tabular-nums"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (!Number.isNaN(n) && e.target.value !== '') onChange(clampNum(n, min, max))
        }}
      />
    </Field>
  )
}

export function SelectInput<T extends string>({
  label,
  value,
  onChange,
  options,
  help,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  help?: ReactNode
}) {
  const id = useId()
  return (
    <Field label={label} help={help} htmlFor={id}>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

export function Toggle({ label, checked, onChange, help }: { label: string; checked: boolean; onChange: (v: boolean) => void; help?: ReactNode }) {
  const id = useId()
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-300" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id} className="text-sm text-slate-700">
        <span className="font-medium">{label}</span>
        {help && <span className="block text-xs text-slate-500">{help}</span>}
      </label>
    </div>
  )
}

export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  format?: (v: number) => string
}) {
  const id = useId()
  return (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="label">
          {label}
        </label>
        <span className="text-sm tabular-nums text-slate-700">{format ? format(value) : value}</span>
      </div>
      <input id={id} type="range" className="mt-1 w-full accent-brand-600" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  )
}

function clampNum(n: number, min?: number, max?: number) {
  if (min !== undefined && n < min) return min
  if (max !== undefined && n > max) return max
  return n
}

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

export function DataTable({ children, caption }: { children: ReactNode; caption?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  )
}

export const th = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'
export const td = 'px-3 py-2 tabular-nums text-slate-800'
export const tdRight = 'px-3 py-2 text-right tabular-nums text-slate-800'

/* ------------------------------------------------------------------ */
/* Formatting shortcuts for JSX                                        */
/* ------------------------------------------------------------------ */

export const R = formatRand
export const Rc = formatRandCompact
export const P = formatPct

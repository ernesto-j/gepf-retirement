import { useEffect, useId, useState } from 'react'
import type { InvestmentCurrency } from '../../../engine/types'
import { Field } from '../../ui'
import { currencySymbol } from './currency'

function clampNum(n: number, min?: number, max?: number) {
  if (min !== undefined && n < min) return min
  if (max !== undefined && n > max) return max
  return n
}

/** Like RandInput but for an amount held in an arbitrary investment currency (ZAR/USD/AUD/GBP/EUR). */
export function CurrencyInput({
  label,
  value,
  currency,
  onChange,
  help,
  min = 0,
  max,
  step = 1000,
}: {
  label: string
  value: number
  currency: InvestmentCurrency
  onChange: (v: number) => void
  help?: string
  min?: number
  max?: number
  step?: number
}) {
  const id = useId()
  const [text, setText] = useState(String(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setText(String(value))
  }, [value, focused])
  return (
    <Field label={`${label} (${currency})`} help={help} htmlFor={id}>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">{currencySymbol(currency)}</span>
        <input
          id={id}
          className="input pl-9 tabular-nums"
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

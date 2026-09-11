import { useEffect, useId, useState } from 'react'
import { Field } from '../../ui'

/** A years input where an empty value means "no fixed term" (held to the planning horizon). */
export function OptionalYearsInput({
  label,
  value,
  onChange,
  help,
}: {
  label: string
  value: number | undefined
  onChange: (v: number | undefined) => void
  help?: string
}) {
  const id = useId()
  const [text, setText] = useState(value === undefined ? '' : String(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setText(value === undefined ? '' : String(value))
  }, [value, focused])
  return (
    <Field label={label} help={help} htmlFor={id}>
      <input
        id={id}
        className="input tabular-nums"
        inputMode="numeric"
        placeholder="To horizon"
        value={text}
        onFocus={() => setFocused(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          setFocused(false)
          const trimmed = text.trim()
          if (trimmed === '') {
            onChange(undefined)
            return
          }
          const n = Number(trimmed)
          if (!Number.isNaN(n)) onChange(Math.max(1, Math.round(n)))
        }}
      />
    </Field>
  )
}

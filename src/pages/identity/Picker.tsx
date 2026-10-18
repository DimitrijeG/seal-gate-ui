import { useEffect, useId, useRef, useState } from 'react'

interface PickerProps {
  // The dashed pill's text: "Add group", "Add policy".
  label: string
  // What can be picked, less what is already held. Null when the token may
  // not list them, which offers a typed value instead.
  options: string[] | null
  // The typed-value field, for when there is nothing to list from.
  typed: { label: string; problem: (value: string) => string | null }
  onPick: (value: string) => void
  disabled?: boolean
}

// The design's dashed "+ Add …" pill and the panel it opens: a find box over
// what can be picked. A token that may not list them types one instead.
export function Picker({ label, options, typed, onPick, disabled = false }: PickerProps) {
  const [open, setOpen] = useState(false)
  const [find, setFind] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const fieldId = useId()
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (box.current !== null && !box.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (value: string) => {
    setOpen(false)
    setFind('')
    onPick(value)
  }

  const needle = find.trim().toLowerCase()
  const shown = options?.filter((o) => o.toLowerCase().includes(needle)) ?? []
  const problem = options === null ? typed.problem(find.trim()) : null

  return (
    <div className="picker" ref={box}>
      <button
        type="button"
        className="pill pill--add"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
        {label}
      </button>

      {open && (
        <div className="picker__panel" id={panelId}>
          <label htmlFor={fieldId} className={options === null ? 'picker__label' : 'visually-hidden'}>
            {options === null ? typed.label : label}
          </label>
          <input
            id={fieldId}
            type={options === null ? 'text' : 'search'}
            className="picker__find"
            placeholder={options === null ? undefined : label}
            value={find}
            autoFocus
            aria-invalid={problem !== null && find.trim() !== ''}
            onChange={(e) => setFind(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || options !== null || problem !== null) return
              e.preventDefault()
              pick(find.trim())
            }}
          />

          {options === null ? (
            <>
              {problem !== null && find.trim() !== '' && (
                <span className="field__hint field__hint--error">{problem}</span>
              )}
              <button
                type="button"
                className="button button--primary picker__add"
                disabled={problem !== null}
                onClick={() => pick(find.trim())}
              >
                Add
              </button>
            </>
          ) : shown.length === 0 ? (
            <p className="muted picker__empty">
              {options.length === 0 ? 'Nothing left to add.' : `Nothing matches “${find.trim()}”.`}
            </p>
          ) : (
            <ul className="picker__options">
              {shown.map((option) => (
                <li key={option}>
                  <button type="button" className="picker__option" onClick={() => pick(option)}>
                    {option}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

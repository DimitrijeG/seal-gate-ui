import { type KeyboardEvent, type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface Option<T extends string> {
  value: T
  label: string
}

interface SelectProps<T extends string> {
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  // For a <label htmlFor>; or name it with `label` instead.
  id?: string
  label?: string
  disabled?: boolean
  className?: string
  // Shown before the value, such as a person for an entity.
  icon?: ReactNode
}

interface Place {
  top: number
  left: number
  width: number
}

// A dropdown drawn by the console, since the browser's own open list cannot
// be styled. Follows the WAI-ARIA select-only combobox: focus stays on the
// button, which points at the active option, and the list opens in a portal
// so a scrolling container cannot clip it.
export function Select<T extends string>({ value, options, onChange, id, label, disabled, className, icon }: SelectProps<T>) {
  const listId = useId()
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [place, setPlace] = useState<Place | null>(null)
  const selected = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )

  const show = (at: number) => {
    setActive(at)
    setOpen(true)
  }
  const choose = (at: number) => {
    setOpen(false)
    const option = options[at]
    if (option !== undefined && option.value !== value) onChange(option.value)
  }

  // Placed under the button, or above it when the window has no room below.
  useLayoutEffect(() => {
    if (!open || button.current === null) return
    const rect = button.current.getBoundingClientRect()
    const height = list.current?.offsetHeight ?? 0
    const below = rect.bottom + 4 + height <= window.innerHeight
    setPlace({ top: below ? rect.bottom + 4 : rect.top - 4 - height, left: rect.left, width: rect.width })
  }, [open])

  // Any click elsewhere, or a scroll that would leave the list behind, closes it.
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      const target = e.target as Node
      if (!button.current?.contains(target) && !list.current?.contains(target)) setOpen(false)
    }
    const close = (e: Event) => {
      if (!list.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', outside)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1
    const key = e.key
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(key)) show(selected)
      else if (key === 'Home') show(0)
      else if (key === 'End') show(last)
      else return
    } else if (key === 'ArrowDown') setActive(Math.min(last, active + 1))
    else if (key === 'ArrowUp') setActive(Math.max(0, active - 1))
    else if (key === 'Home') setActive(0)
    else if (key === 'End') setActive(last)
    else if (key === 'Enter' || key === ' ') choose(active)
    else if (key === 'Escape' || key === 'Tab') {
      setOpen(false)
      if (key === 'Tab') return
    } else if (key.length === 1) {
      // Type-ahead: the next option starting with the letter typed.
      const start = (active + 1) % options.length
      const order = [...options.slice(start), ...options.slice(0, start)]
      const hit = order.findIndex((o) => o.label.toLowerCase().startsWith(key.toLowerCase()))
      if (hit !== -1) setActive((start + hit) % options.length)
    } else return
    e.preventDefault()
  }

  return (
    <>
      <button
        ref={button}
        id={id}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        disabled={disabled}
        className={`select${icon ? ' select--icon' : ''}${className ? ` ${className}` : ''}`}
        onClick={() => (open ? setOpen(false) : show(selected))}
        onKeyDown={onKeyDown}
      >
        {icon}
        {/* Every label in one grid cell, so the button is as wide as the longest. */}
        <span className="select__value">
          {options.map((o, i) => (
            <span key={o.value} className={i === selected ? undefined : 'select__ghost'} aria-hidden={i !== selected}>
              {o.label}
            </span>
          ))}
        </span>
      </button>
      {open &&
        createPortal(
          <ul
            ref={list}
            id={listId}
            role="listbox"
            aria-label={label}
            className="select__list"
            style={place === null ? { visibility: 'hidden' } : { top: place.top, left: place.left, minWidth: place.width }}
          >
            {options.map((o, i) => (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === selected}
                className={`select__option${i === active ? ' select__option--active' : ''}`}
                // Keeps focus on the button, as the pattern needs.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => {
                  choose(i)
                  button.current?.focus()
                }}
              >
                <span>{o.label}</span>
                {i === selected && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                )}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  )
}

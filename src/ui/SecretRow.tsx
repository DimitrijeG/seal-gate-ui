import { useEffect, useState } from 'react'

// What a hidden value shows. A fixed length, so it says nothing about the
// value's own.
const HIDDEN = '••••••••••••••••••••••'

interface SecretRowProps {
  label: string
  value: string
  revealed: boolean
  onToggle: () => void
}

// One secret on screen: hidden until revealed, copyable either way.
export function SecretRow({ label, value, revealed, onToggle }: SecretRowProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      // Clipboard refused (no permission, or not a secure context): the
      // value can still be revealed and selected by hand.
    }
  }

  return (
    <div className="secret-row">
      <span className="secret-row__label">{label}</span>
      <code className={`secret-row__value${revealed ? ' secret-row__value--shown' : ' secret-row__value--hidden'}`}>
        {revealed ? value : HIDDEN}
      </code>
      <button
        type="button"
        className={`secret-row__button${revealed ? ' secret-row__button--on' : ''}`}
        aria-pressed={revealed}
        aria-label={`${revealed ? 'Hide' : 'Reveal'} ${label}`}
        onClick={onToggle}
      >
        {revealed ? 'Hide' : 'Reveal'}
      </button>
      <button type="button" className="secret-row__button" aria-label={`Copy ${label}`} onClick={() => void copy()}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

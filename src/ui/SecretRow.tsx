import { CopyButton } from './CopyButton'

// What a hidden value shows. A fixed length, so it says nothing about the
// value's own.
export const HIDDEN = '••••••••••••••••••••••'

interface SecretRowProps {
  label: string
  value: string
  revealed: boolean
  onToggle: () => void
}

// One secret on screen: hidden until revealed, copyable either way.
export function SecretRow({ label, value, revealed, onToggle }: SecretRowProps) {
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
      <CopyButton className="secret-row__button" value={value} label={`Copy ${label}`} />
    </div>
  )
}

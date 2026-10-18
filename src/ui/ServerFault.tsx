import { AlertIcon } from '../app/icons'

// Errors.dc's 500: the server's own message is "internal error", so the
// console says what it knows and offers the one thing worth doing.
export function ServerFault({ onRetry, className }: { onRetry: () => void; className?: string }) {
  return (
    <div className={`server-fault${className === undefined ? '' : ` ${className}`}`} role="alert">
      <AlertIcon />
      <span>The server hit an error. Try again.</span>
      <button type="button" className="button button--quiet" onClick={onRetry}>
        Retry
      </button>
    </div>
  )
}

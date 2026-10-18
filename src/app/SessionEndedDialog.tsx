import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router'

// Shown when the session's token stops working. Modal, and not dismissable:
// the page behind it stays as it was, but nothing on it can be sent until
// the user signs in again.
export function SessionEndedDialog() {
  const ref = useRef<HTMLDialogElement>(null)
  const location = useLocation()

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      className="session-ended"
      aria-labelledby="session-ended-h"
      onCancel={(e) => e.preventDefault()}
    >
      <span id="session-ended-h" className="session-ended__title">
        Session ended
      </span>
      <span className="session-ended__text">Sign in again to carry on where you were.</span>
      <div>
        <Link className="button button--primary" to="/login" state={{ from: location.pathname }}>
          Sign in
        </Link>
      </div>
    </dialog>
  )
}

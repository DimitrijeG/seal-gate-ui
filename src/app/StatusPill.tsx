import { useEffect, useRef, useState } from 'react'
import { useCan } from '../api/capabilities/capabilities'
import { resources } from '../api/capabilities/resources'
import { type Status, api, refreshStatus } from '../api/client'
import { call, messageText } from '../api/result'
import { CircleIcon, LockIcon, OpenLockIcon } from './icons'

export function StatusPill({ status, signedIn }: { status: Status | null; signedIn: boolean }) {
  if (status === null) return null
  if (!status.initialized) {
    return (
      <div role="status" className="status-pill status-pill--sealed">
        <CircleIcon strokeWidth={2.2} />
        Not initialized
      </div>
    )
  }
  if (status.sealed) {
    return (
      <div role="status" className="status-pill status-pill--sealed">
        <LockIcon strokeWidth={2.2} />
        Sealed
      </div>
    )
  }
  return <SealControl status={status} signedIn={signedIn} />
}

// The unsealed pill opens what there is to know and do about the seal, so
// sealing is not a trip to a screen named Unseal.
function SealControl({ status, signedIn }: { status: Status; signedIn: boolean }) {
  const mayUpdate = useCan('update', resources.seal)
  const canSeal = signedIn && mayUpdate
  const [open, setOpen] = useState(false)
  const [sealing, setSealing] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const ref = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    // Escape hands focus back to the pill it came from.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      button.current?.focus()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const seal = async () => {
    setSealing(true)
    setErrors([])
    const res = await call(api.POST('/sys/seal'))
    setSealing(false)
    if (res.ok) setOpen(false)
    // A refusal (the rules changed) is said here; a 401 ends the session globally.
    else if (res.error.kind === 'http' && res.error.status !== 401) setErrors(res.error.messages)
    void refreshStatus()
  }

  return (
    <div className="seal-control" ref={ref}>
      <div role="status">
        <button
          ref={button}
          type="button"
          className="status-pill status-pill--unsealed status-pill--button"
          aria-expanded={open}
          aria-controls="seal-panel"
          onClick={() => {
            setErrors([])
            setOpen(!open)
          }}
        >
          <OpenLockIcon strokeWidth={2.2} />
          Unsealed
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 10l5 5 5-5" />
          </svg>
        </button>
      </div>
      {open && (
        <div id="seal-panel" role="group" aria-label="Seal" className="seal-control__panel">
          <span className="seal-control__title">Unsealed</span>
          <span className="seal-control__text">
            The master key was rebuilt from {status.threshold} of {status.shares} shares and is held in memory.
          </span>
          {canSeal ? (
            <>
              <span className="seal-control__text">
                Sealing discards it: secrets, policies and tokens are refused until {status.threshold} key holders unseal
                again.
              </span>
              <button type="button" className="button button--danger seal-control__seal" disabled={sealing} onClick={() => void seal()}>
                Seal now
              </button>
            </>
          ) : (
            signedIn && <span className="seal-control__text">This token may not seal the instance.</span>
          )}
          {errors.length > 0 && (
            <span className="field__hint field__hint--error" role="alert">
              {messageText(errors)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

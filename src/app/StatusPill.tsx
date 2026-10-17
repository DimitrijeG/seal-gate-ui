import type { Status } from '../api/client'
import { CircleIcon, LockIcon, OpenLockIcon } from './icons'

export function StatusPill({ status }: { status: Status | null }) {
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
  return (
    <div role="status" className="status-pill status-pill--unsealed">
      <OpenLockIcon strokeWidth={2.2} />
      Unsealed
    </div>
  )
}

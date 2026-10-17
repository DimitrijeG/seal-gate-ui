import { useEffect, useState } from 'react'

// Copies a value to the clipboard and says so for two seconds.
export function CopyButton({ value, label, className }: { value: string; label: string; className: string }) {
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
    <button type="button" className={className} aria-label={label} onClick={() => void copy()}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

import { createStore } from '../lib/store'

// One request as the API trace shows it. Bodies are masked before they are
// stored here, so nothing secret is ever held by the trace.
export interface TraceEntry {
  id: number
  method: string
  path: string
  // HTTP status, or null when no response came back.
  status: number | null
  // Masked request body, or a note that the token was sent; empty for neither.
  request: string
  // Masked response body; empty for none.
  response: string
  // How many identical requests in a row this entry stands for, so status
  // polling does not push everything else out of the trace.
  repeats: number
}

export const LIMIT = 50

export const trace = createStore<TraceEntry[]>([])

let nextId = 1

export function addEntry(entries: TraceEntry[], entry: Omit<TraceEntry, 'id' | 'repeats'>): TraceEntry[] {
  const newest = entries[0]
  if (
    newest &&
    newest.method === entry.method &&
    newest.path === entry.path &&
    newest.status === entry.status &&
    newest.request === entry.request &&
    newest.response === entry.response
  ) {
    return [{ ...newest, repeats: newest.repeats + 1 }, ...entries.slice(1)]
  }
  return [{ ...entry, id: nextId++, repeats: 1 }, ...entries].slice(0, LIMIT)
}

export function record(entry: Omit<TraceEntry, 'id' | 'repeats'>): void {
  trace.set((entries) => addEntry(entries, entry))
}

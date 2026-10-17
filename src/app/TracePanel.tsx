import { trace } from '../api/trace'
import { useStore } from '../lib/store'

export function TracePanel() {
  const entries = useStore(trace)
  return (
    <aside className="trace" aria-labelledby="trace-h">
      <div className="trace__head">
        <h2 id="trace-h">API trace</h2>
        <span>newest first · secrets masked</span>
      </div>
      {entries.length === 0 && <p className="trace__empty">No requests yet.</p>}
      {entries.map((e) => (
        <div key={e.id} className="trace__entry">
          <div className="trace__line">
            <span className="trace__method">{e.method}</span>
            <span className="trace__path">{e.path}</span>
            {e.repeats > 1 && <span className="trace__repeats">×{e.repeats}</span>}
            <span className={`trace__code ${e.status !== null && e.status < 400 ? 'trace__code--ok' : 'trace__code--bad'}`}>
              {e.status ?? 'no response'}
            </span>
          </div>
          {e.request !== '' && <div className="trace__req">→ {e.request}</div>}
          {e.status !== null && <div className="trace__res">← {e.response === '' ? '(no body)' : e.response}</div>}
        </div>
      ))}
    </aside>
  )
}

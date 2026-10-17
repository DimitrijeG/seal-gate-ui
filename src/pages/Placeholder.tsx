// Stands in for a screen until its milestone builds it (see TODO.md).
export function Placeholder({ title }: { title: string }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      <p>This screen is not built yet.</p>
    </div>
  )
}

import './App.css'

export default function App() {
  return (
    <header className="app-header">
      <div className="app-header__inner">
        <a className="app-brand" href="/">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          seal-gate
        </a>
      </div>
    </header>
  )
}

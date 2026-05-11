export default function NavRail({ screen, onNavigate, connected }) {
  const items = [
    { key: 'lobby',       icon: '👁',  label: 'Play'        },
    { key: 'leaderboard', icon: '🏆',  label: 'Leaderboard' },
  ]

  return (
    <nav className="nav-rail" role="navigation" aria-label="Main navigation">
      <span className="nav-rail__brand" aria-hidden>BO</span>

      {items.map(({ key, icon, label }) => (
        <button
          key={key}
          className={`nav-btn${screen === key ? ' active' : ''}`}
          onClick={() => onNavigate(key)}
          aria-label={label}
          title={label}
        >
          {icon}
        </button>
      ))}

      <div style={{ marginTop: 'auto' }}>
        <div
          title={connected ? 'Connected' : 'Disconnected'}
          style={{
            width: 8, height: 8, borderRadius: '50%',
            background: connected ? 'var(--accent-green)' : 'var(--accent-red)',
            margin: '0 auto',
          }}
          aria-label={connected ? 'Server connected' : 'Server disconnected'}
        />
      </div>
    </nav>
  )
}

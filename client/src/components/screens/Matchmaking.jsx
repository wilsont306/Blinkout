import { useEffect, useState } from 'react'
import Button from '../ui/Button.jsx'
import StatusPill from '../ui/StatusPill.jsx'

export default function Matchmaking({ playerName, onCancel }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const initials = playerName.slice(0, 2).toUpperCase()

  return (
    <div className="matchmaking">
      <StatusPill variant="queue" pulse>Searching for opponent</StatusPill>

      <div className="pulse-ring-container" aria-label="Searching for opponent" role="status">
        <div className="pulse-ring" aria-hidden />
        <div className="pulse-ring" aria-hidden />
        <div className="pulse-ring" aria-hidden />
        <div className="pulse-avatar">{initials}</div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
          Finding Opponent
        </h2>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)' }}>
          est. &lt; 10 seconds · {elapsed}s elapsed
        </p>
      </div>

      <div style={{
        background: 'var(--surface-primary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-pill)',
        padding: '4px 14px',
        fontFamily: 'var(--font-mono)',
        fontSize: 12, color: 'var(--text-muted)',
      }}>
        ● online
      </div>

      <Button variant="ghost" onClick={onCancel}>Cancel</Button>
    </div>
  )
}

import { useState, useEffect } from 'react'
import StatusPill from '../ui/StatusPill.jsx'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

const MOCK_ROWS = [
  { rank: 1, handle: 'StareGod',     streak: 47, bestHold: 142.3, matches: 203 },
  { rank: 2, handle: 'NoBlink99',    streak: 31, bestHold: 98.1,  matches: 155 },
  { rank: 3, handle: 'IronEyes',     streak: 28, bestHold: 87.4,  matches: 120 },
  { rank: 4, handle: 'GazerPro',     streak: 19, bestHold: 65.0,  matches: 88  },
  { rank: 5, handle: 'DeadpanKing',  streak: 15, bestHold: 55.2,  matches: 74  },
]

function RankBadge({ rank }) {
  const cls = rank <= 3 ? `rank-badge rank-badge--${rank}` : 'rank-badge rank-badge--n'
  return <span className={cls}>{rank}</span>
}

export default function Leaderboard({ playerName }) {
  const [tab, setTab]   = useState('daily')
  const [rows, setRows] = useState(MOCK_ROWS)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`${SERVER_URL}/leaderboard?period=${tab}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) setRows(data)
      })
      .catch(() => { /* fall back to mock data */ })
      .finally(() => setLoading(false))
  }, [tab])

  return (
    <div className="leaderboard">
      <div className="leaderboard__header">
        <h1 className="leaderboard__title">Leaderboard</h1>

        <div className="tab-group" role="tablist">
          {['daily', 'weekly', 'alltime'].map(t => (
            <button
              key={t}
              className={`tab-btn${tab === t ? ' active' : ''}`}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
            >
              {t === 'alltime' ? 'All-time' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
          Loading…
        </p>
      )}

      <div className="lb-table" role="region" aria-label="Leaderboard table">
        <table>
          <thead>
            <tr>
              <th style={{ width: 48 }}>Rank</th>
              <th>Player</th>
              <th>Win Streak</th>
              <th>Best Hold</th>
              <th>Matches</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr
                key={row.rank}
                className={row.handle === playerName ? 'me' : ''}
              >
                <td><RankBadge rank={row.rank} /></td>
                <td style={{ fontWeight: row.handle === playerName ? 700 : 400 }}>
                  {row.handle}
                  {row.handle === playerName && (
                    <StatusPill variant="violet" style={{ marginLeft: 8 }}>You</StatusPill>
                  )}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--mono-data)' }}>
                  {row.streak}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--mono-data)' }}>
                  {row.bestHold.toFixed(1)}s
                </td>
                <td style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {row.matches}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

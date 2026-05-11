import { useEffect, useState } from 'react'

export default function Matchmaking({ playerName, matched = false, onCancel }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const initials = playerName.slice(0, 2).toUpperCase()

  return (
    <div className="poster-screen poster-screen--queue">
      <div className="poster-card poster-card--queue">
        <div className="poster-meta">Browser Coliseum · 10-May-MMXXVI · Best of Three Lives</div>
        <div className="poster-kicker">Tonight</div>

        <h1 className="poster-headline">
          Finding a worthy <span>opponent.</span>
        </h1>
        <p className="poster-subline">Scanning the floor · challengers online: 1,284</p>

        <div className="poster-ring" aria-label={`Searching for opponent, elapsed ${elapsed} seconds`} role="status">
          <span>{elapsed}s</span>
          <small>{initials}</small>
        </div>

        <div className="poster-score-strip">
          <div><span>Est. wait</span><strong>&lt; 10s</strong></div>
          <div><span>Your rec.</span><strong>0 - 0</strong></div>
          <div><span>You are</span><strong>{playerName}</strong></div>
        </div>

        <button
          className="poster-cta poster-cta--cancel"
          type="button"
          onClick={onCancel}
        >
          Cancel queue
          <small>step out of matchmaking</small>
        </button>

        <div className="poster-footnote">Blink Duel · Entry 04</div>
        <div className="poster-footnote poster-footnote--right">Official card</div>
      </div>

      {matched && (
        <div className="matchmaking-overlay">
          <p className="matchmaking-overlay__kicker">Opponent found</p>
          <h2 className="matchmaking-overlay__title">Match<br /><em>Found.</em></h2>
          <p className="matchmaking-overlay__sub">Entering the duel in 2 seconds</p>
        </div>
      )}
    </div>
  )
}

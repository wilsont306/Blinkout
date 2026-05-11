export default function Result({
  resultData,
  playerName,
  stats,
  rematchStatus = null,   // null | 'requested' | 'opponent-wants' | 'declined'
  onRematch,
  onCancelRematch,
  onLeave = () => {},
}) {
  if (!resultData) return (
    <div className="poster-screen poster-screen--result poster-screen--result-lose">
      <div className="poster-card poster-card--result">
        <div className="poster-kicker">Match Over</div>
        <h1 className="poster-headline"><em>Done.</em></h1>
        <div className="result-cta-row">
          <button className="poster-cta poster-cta--result result-cta--leave" type="button" onClick={onLeave}>
            Leave<small>return to lobby</small>
          </button>
        </div>
      </div>
    </div>
  )

  const { winner, myPlayerId, reason } = resultData
  const opponentName = resultData.opponentName || 'Opponent'
  const blinkTimestamp = Number.isFinite(resultData.blinkTimestamp) ? resultData.blinkTimestamp : 0
  const duration = Number.isFinite(resultData.duration) ? resultData.duration : blinkTimestamp
  const isWin = typeof resultData.isWin === 'boolean' ? resultData.isWin : winner === myPlayerId
  const holdLabel = `${(blinkTimestamp / 1000).toFixed(2)}s`

  const rematchLabel = rematchStatus === 'requested'
    ? `Waiting for ${opponentName}…`
    : rematchStatus === 'opponent-wants'
    ? `${opponentName} wants a rematch!`
    : rematchStatus === 'declined'
    ? 'Opponent left'
    : `Rematch vs ${opponentName}`

  const rematchSub = rematchStatus === 'requested'
    ? 'click to cancel'
    : rematchStatus === 'opponent-wants'
    ? 'click to confirm'
    : rematchStatus === 'declined'
    ? 're-queue to find another'
    : 'same opponent · direct rematch'

  const handleRematchClick = () => {
    if (rematchStatus === 'requested') onCancelRematch?.()
    else if (rematchStatus !== 'declined') onRematch?.()
  }

  return (
    <div className={`poster-screen poster-screen--result${isWin ? '' : ' poster-screen--result-lose'}`}>
      <div className="poster-card poster-card--result">
        <div className="poster-meta">Browser Coliseum · 10-May-MMXXVI · Best of Three Lives</div>

        <div className="poster-kicker">
          {isWin ? 'Victory' : 'Defeat'}
        </div>

        <h1 className="poster-headline">
          {isWin
            ? <><span className="result-dim">Eyes</span>{' '}<em>open.</em></>
            : <><span className="result-dim">You</span>{' '}<em>blinked.</em></>}
        </h1>

        <p className="poster-subline">
          {isWin
            ? `${opponentName} blinked · held for ${holdLabel}`
            : reason === 'forfeit'
            ? 'You left the match'
            : `You blinked · held for ${holdLabel}`}
        </p>

        <div className="result-stats-strip">
          <div>
            <span>Hold time</span>
            <strong>{duration != null ? `${(duration / 1000).toFixed(2)}s` : '—'}</strong>
          </div>
          <div>
            <span>{isWin ? 'Win streak' : 'Loss streak'}</span>
            <strong>{isWin ? stats.streak : stats.losses}</strong>
          </div>
          <div>
            <span>Final strike</span>
            <strong>{blinkTimestamp != null ? `${(blinkTimestamp / 1000).toFixed(2)}s` : '—'}</strong>
          </div>
          <div>
            <span>Daily rank</span>
            <strong>—</strong>
          </div>
        </div>

        <div className="result-cta-row">
          <button
            className={`poster-cta poster-cta--result result-cta--rematch${rematchStatus === 'requested' ? ' poster-cta--waiting' : ''}${rematchStatus === 'opponent-wants' ? ' poster-cta--glow' : ''}`}
            type="button"
            onClick={handleRematchClick}
            disabled={rematchStatus === 'declined'}
          >
            {rematchLabel}
            <small>{rematchSub}</small>
          </button>

          <button
            className="poster-cta poster-cta--result result-cta--leave"
            type="button"
            onClick={onLeave}
          >
            Leave
            <small>return to lobby</small>
          </button>
        </div>

        <div className="poster-footnote">Blink Duel · {isWin ? 'Winner' : 'Eliminated'}</div>
        <div className="poster-footnote poster-footnote--right">{playerName}</div>
      </div>
    </div>
  )
}

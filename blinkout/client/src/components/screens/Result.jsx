import { playClick } from '../../lib/sounds.js'

export default function Result({
  resultData,
  playerName,
  stats,
  rematchStatus = null,   // null | 'requested' | 'opponent-wants' | 'declined'
  onRematch,
  onCancelRematch,
  onNewMatch,
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

  const safeStats = stats ?? {}
  const { winner, myPlayerId, reason } = resultData
  const opponentName = resultData.opponentName || 'Opponent'
  const blinkTimestamp = Number.isFinite(resultData.blinkTimestamp) ? resultData.blinkTimestamp : 0
  const duration = Number.isFinite(resultData.duration) ? resultData.duration : blinkTimestamp
  const isWin = typeof resultData.isWin === 'boolean' ? resultData.isWin : winner === myPlayerId
  const holdLabel = `${(blinkTimestamp / 1000).toFixed(2)}s`
  const wins = Number.isFinite(safeStats.wins) ? safeStats.wins : 0
  const losses = Number.isFinite(safeStats.losses) ? safeStats.losses : 0
  const streak = Number.isFinite(safeStats.streak) ? safeStats.streak : 0

  const rematchLabel = rematchStatus === 'requested'
    ? `Waiting for ${opponentName}…`
    : rematchStatus === 'opponent-wants'
    ? `Accept rematch`
    : rematchStatus === 'declined'
    ? 'Opponent left'
    : `Ask ${opponentName} for rematch`

  const rematchSub = rematchStatus === 'requested'
    ? 'click to cancel'
    : rematchStatus === 'opponent-wants'
    ? `${opponentName} is waiting`
    : rematchStatus === 'declined'
    ? 'find a new match'
    : 'same opponent · both must accept'

  const handleRematchClick = () => {
    if (rematchStatus === 'requested') onCancelRematch?.()
    else if (rematchStatus !== 'declined') onRematch?.()
  }

  const headline = getHeadline(isWin, reason)
  const subline = getSubline(isWin, reason, opponentName, holdLabel)

  return (
    <div className={`poster-screen poster-screen--result${isWin ? '' : ' poster-screen--result-lose'}`}>
      <div className="poster-card poster-card--result">
        <div className="poster-meta">Browser Coliseum · 10-May-MMXXVI · Best of Three Lives</div>

        <div className="poster-kicker">
          {isWin ? 'Victory' : 'Defeat'}
        </div>

        <h1 className="poster-headline">
          <span className="result-dim">{headline.dim}</span>{' '}<em>{headline.em}</em>
        </h1>

        <p className="poster-subline">{subline}</p>

        <div className="result-stats-strip">
          <div>
            <span>Hold time</span>
            <strong>{duration != null ? `${(duration / 1000).toFixed(2)}s` : '—'}</strong>
          </div>
          <div>
            <span>{isWin ? 'Win streak' : 'Loss streak'}</span>
            <strong>{isWin ? streak : losses}</strong>
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
            onClick={() => { playClick(); handleRematchClick() }}
            disabled={rematchStatus === 'declined'}
          >
            {rematchLabel}
            <small>{rematchSub}</small>
          </button>

          <button
            className="poster-cta poster-cta--result result-cta--new"
            type="button"
            onClick={() => { playClick(); onNewMatch?.() }}
          >
            New match
            <small>find someone else</small>
          </button>

          <button
            className="poster-cta poster-cta--result result-cta--leave"
            type="button"
            onClick={() => { playClick(); onLeave?.() }}
          >
            Back to lobby
            <small>return to lobby</small>
          </button>
        </div>

        <div className="poster-footnote">Blink Duel · {isWin ? 'Winner' : 'Eliminated'}</div>
        <div className="poster-footnote poster-footnote--right">{playerName || (isWin ? `${wins}W` : `${losses}L`)}</div>
      </div>
    </div>
  )
}

function getHeadline(isWin, reason) {
  if (isWin) {
    if (reason === 'covered')                                           return { dim: 'Face',   em: 'hidden.' }
    if (reason === 'bad-lighting' || reason === 'bad-glare')           return { dim: 'Lights', em: 'out.' }
    if (reason === 'no-face')                                          return { dim: 'No',     em: 'show.' }
    if (reason === 'tab-hidden' || reason === 'left-page'
        || reason === 'user'    || reason === 'forfeit')               return { dim: 'They',   em: 'fled.' }
    return { dim: 'Eyes', em: 'open.' }
  } else {
    if (reason === 'covered')                                          return { dim: 'Face',   em: 'hidden.' }
    if (reason === 'bad-lighting')                                     return { dim: 'Lights', em: 'out.' }
    if (reason === 'bad-glare')                                        return { dim: 'Too',    em: 'bright.' }
    if (reason === 'no-face')                                          return { dim: 'No',     em: 'show.' }
    if (reason === 'tab-hidden' || reason === 'left-page')             return { dim: 'You',    em: 'fled.' }
    if (reason === 'user' || reason === 'forfeit')                     return { dim: 'You',    em: 'left.' }
    return { dim: 'You', em: 'blinked.' }
  }
}

function getSubline(isWin, reason, opponentName, holdLabel) {
  if (isWin) {
    switch (reason) {
      case 'covered':      return `${opponentName}'s face was covered`
      case 'bad-lighting': return `${opponentName}'s camera was too dark`
      case 'bad-glare':    return `${opponentName}'s camera had too much glare`
      case 'no-face':      return `${opponentName} had no face detected`
      case 'tab-hidden':   return `${opponentName} switched tabs`
      case 'left-page':    return `${opponentName} disconnected`
      case 'user':
      case 'forfeit':      return `${opponentName} forfeited`
      default:             return `${opponentName} blinked · held for ${holdLabel}`
    }
  } else {
    switch (reason) {
      case 'covered':      return 'Your face or camera was covered'
      case 'bad-lighting': return "Camera too dark · eyes couldn't be tracked"
      case 'bad-glare':    return "Too much glare · eyes couldn't be tracked"
      case 'no-face':      return 'No face detected when the round began'
      case 'tab-hidden':   return 'You switched tabs during the match'
      case 'left-page':    return 'You navigated away'
      case 'user':
      case 'forfeit':      return 'You forfeited the match'
      default:             return `You blinked · held for ${holdLabel}`
    }
  }
}

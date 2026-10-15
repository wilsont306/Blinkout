export default function ResultCrashFallback({ onReset }) {
  let lastResult = null
  try {
    lastResult = JSON.parse(sessionStorage.getItem('blinkout_last_result') || 'null')
  } catch {}

  const isWin = lastResult?.isWin === true
  const opponentName = lastResult?.opponentName || 'Opponent'

  const goHome = () => {
    sessionStorage.removeItem('blinkout_last_result')
    if (onReset) onReset()
    else window.location.assign('/')
  }

  return (
    <div className={`poster-screen poster-screen--result${isWin ? '' : ' poster-screen--result-lose'}`}>
      <div className="poster-card poster-card--result">
        <div className="poster-meta">BlinkOut · Match Complete</div>
        <div className="poster-kicker">{isWin ? 'Victory' : 'Defeat'}</div>
        <h1 className="poster-headline">
          {isWin
            ? <><span className="result-dim">Eyes</span>{' '}<em>open.</em></>
            : <><span className="result-dim">You</span>{' '}<em>blinked.</em></>}
        </h1>
        <p className="poster-subline">
          {isWin ? `${opponentName} lost the stare.` : 'Better luck next time.'}
        </p>
        <div className="result-cta-row">
          <button
            className="poster-cta poster-cta--result result-cta--new"
            type="button"
            onClick={goHome}
          >
            New match
            <small>find someone else</small>
          </button>
          <button
            className="poster-cta poster-cta--result result-cta--leave"
            type="button"
            onClick={goHome}
          >
            Back to lobby
            <small>return to lobby</small>
          </button>
        </div>
        <div className="poster-footnote poster-footnote--right">{opponentName}</div>
      </div>
    </div>
  )
}

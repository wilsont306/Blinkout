export default function ResultCrashFallback() {
  let lastResult = null

  try {
    lastResult = JSON.parse(sessionStorage.getItem('blinkout_last_result') || 'null')
  } catch {
    lastResult = null
  }

  const isWin = lastResult?.isWin !== false
  const opponentName = lastResult?.opponentName || 'Opponent'

  return (
    <div className={`poster-screen poster-screen--result${isWin ? '' : ' poster-screen--result-lose'}`}>
      <div className="poster-card poster-card--result">
        <div className="poster-meta">BlinkOut · Match Complete</div>
        <div className="poster-kicker">{isWin ? 'Victory' : 'Defeat'}</div>
        <h1 className="poster-headline">
          {isWin
            ? <><span className="result-dim">Eyes</span>{' '}<em>open.</em></>
            : <><span className="result-dim">Match</span>{' '}<em>over.</em></>}
        </h1>
        <p className="poster-subline">
          {isWin ? `${opponentName} lost the stare.` : 'The match ended.'}
        </p>
        <div className="result-cta-row">
          <button className="poster-cta poster-cta--result result-cta--leave" type="button" onClick={() => window.location.assign('/')}>
            Leave
            <small>return to lobby</small>
          </button>
        </div>
      </div>
    </div>
  )
}

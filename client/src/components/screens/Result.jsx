import Button from '../ui/Button.jsx'

export default function Result({ resultData, playerName, stats, onRematch, onReturnToQueue }) {
  if (!resultData) return null

  const { winner, loser, duration, blinkTimestamp, myPlayerId, opponentName } = resultData
  const isWin = winner === myPlayerId

  const holdTime = isWin
    ? `${(blinkTimestamp / 1000).toFixed(2)}s`
    : `${(blinkTimestamp / 1000).toFixed(2)}s`

  const statCards = [
    { label: 'Hold Time',    value: `${(duration / 1000).toFixed(2)}s` },
    { label: isWin ? 'Win Streak'  : 'Loss Streak', value: isWin ? stats.streak : stats.losses },
    { label: 'Blink at',     value: `${(blinkTimestamp / 1000).toFixed(2)}s` },
    { label: 'Daily Rank',   value: '—' },
  ]

  return (
    <div className={`result result--${isWin ? 'win' : 'lose'}`}>
      <div
        className={`result__icon-ring result__icon-ring--${isWin ? 'win' : 'lose'}`}
        aria-hidden
      >
        {isWin ? '🏆' : '😵'}
      </div>

      <h1
        className={`result__headline result__headline--${isWin ? 'win' : 'lose'}`}
        aria-live="assertive"
      >
        {isWin ? 'You Won' : 'You Blinked'}
      </h1>

      <p className="result__subtitle">
        {isWin
          ? `${opponentName} blinked at ${(blinkTimestamp / 1000).toFixed(2)}s`
          : `You blinked at ${(blinkTimestamp / 1000).toFixed(2)}s`}
      </p>

      <div className="result__stats" role="region" aria-label="Match statistics">
        {statCards.map(({ label, value }) => (
          <div key={label} className="result-stat">
            <div className="result-stat__label">{label}</div>
            <div className="result-stat__value">{value}</div>
          </div>
        ))}
      </div>

      <div className="result__actions">
        <Button
          variant={isWin ? 'green' : 'red'}
          size="lg"
          onClick={onRematch}
          fullWidth
        >
          {isWin ? '🔁 Rematch' : '🔁 Try Again'}
        </Button>
        <Button variant="ghost" onClick={onReturnToQueue} fullWidth>
          Back to Queue
        </Button>
      </div>
    </div>
  )
}

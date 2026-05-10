const BLINK_THRESHOLD = 0.20
const WARN_THRESHOLD  = 0.26

export default function EARBar({ ear = 0.3, showValue = true }) {
  // Normalise EAR (0–0.4 typical range) to 0–100%
  const pct = Math.min(100, Math.round((ear / 0.4) * 100))

  const variant =
    ear < BLINK_THRESHOLD ? 'blink'
    : ear < WARN_THRESHOLD ? 'warning'
    : ''

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', width: '100%' }}>
      <div className="ear-bar-track" style={{ flex: 1 }}>
        <div
          className={`ear-bar-fill${variant ? ` ear-bar-fill--${variant}` : ''}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={Math.round(ear * 100) / 100}
          aria-valuemin={0}
          aria-valuemax={0.4}
          aria-label="Eye Aspect Ratio"
        />
      </div>
      {showValue && (
        <span className="font-mono" style={{ fontSize: 10, minWidth: 30, textAlign: 'right' }}>
          {ear.toFixed(2)}
        </span>
      )}
    </div>
  )
}

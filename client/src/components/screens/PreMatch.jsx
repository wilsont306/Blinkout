import { useState, useEffect } from 'react'
import CameraPreview from '../camera/CameraPreview.jsx'
import Button from '../ui/Button.jsx'

const SEQUENCE = [3, 2, 1, 'GO']

export default function PreMatch({ camera, blink, matchData, playerName, onMatchStart, onCancel }) {
  const [step, setStep] = useState(0)
  const [flashing, setFlashing] = useState(false)

  const { attachRef, stream } = camera
  const { faceDetected, loading } = blink
  const current = SEQUENCE[step]

  useEffect(() => {
    if (step >= SEQUENCE.length - 1) {
      // GO
      setFlashing(true)
      const t = setTimeout(() => {
        setFlashing(false)
        onMatchStart()
      }, 500)
      return () => clearTimeout(t)
    }

    const t = setTimeout(() => setStep(s => s + 1), 1000)
    return () => clearTimeout(t)
  }, [step])

  return (
    <div
      className="prematch"
      style={flashing ? { background: 'rgba(107,94,240,0.25)' } : undefined}
    >
      <div className="prematch__feeds">
        {/* Local feed */}
        <div className="prematch__feed">
          <span className="prematch__label">You</span>
          <CameraPreview
            attachRef={attachRef}
            faceDetected={faceDetected}
            loading={loading}
            style={{ width: 160, height: 120, borderRadius: 'var(--radius-md)' }}
          />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
            {playerName}
          </span>
        </div>

        {/* Countdown */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 140 }}>
          <div
            key={step}
            className="prematch__countdown-digit"
            aria-live="assertive"
            aria-label={`Countdown: ${current}`}
          >
            {current}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {step < 3 ? 'Get ready…' : 'Don\'t blink!'}
          </p>
        </div>

        {/* Opponent placeholder */}
        <div className="prematch__feed">
          <span className="prematch__label">Opponent</span>
          <div style={{
            width: 160, height: 120, borderRadius: 'var(--radius-md)',
            background: 'var(--surface-primary)',
            border: '1px solid var(--border-emphasis)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 4,
          }}>
            <span style={{ fontSize: 24 }}>👤</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {matchData?.opponentName}
            </span>
          </div>
        </div>
      </div>

      {/* Status line */}
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)',
        letterSpacing: '0.1em', textTransform: 'uppercase',
        display: 'flex', gap: 'var(--sp-4)',
      }}>
        <span style={{ color: faceDetected ? 'var(--accent-green)' : 'var(--accent-amber)' }}>
          {faceDetected ? '● FACE DETECTED' : '○ NO FACE'}
        </span>
        <span style={{ color: 'var(--accent-green)' }}>● LIGHTING OK</span>
      </div>

      {step < SEQUENCE.length - 1 && (
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      )}
    </div>
  )
}

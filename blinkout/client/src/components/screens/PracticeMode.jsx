import { useEffect, useState, useRef } from 'react'
import CameraPreview from '../camera/CameraPreview.jsx'
import EARBar from '../camera/EARBar.jsx'

function formatMs(ms) {
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(2)}s`
  return `${Math.floor(s / 60)}m ${(s % 60).toFixed(2)}s`
}

export default function PracticeMode({ camera, blink, personalBest, onEnd }) {
  const [phase, setPhase]           = useState('idle')   // 'idle' | 'running' | 'blinked'
  const [elapsed, setElapsed]       = useState(0)
  const [sessionBest, setSessionBest] = useState(0)
  const startRef       = useRef(null)
  const blinkFiredRef  = useRef(false)

  const { attachRef } = camera
  const { ear, faceDetected, loading, eyeBoxes, blinking, warning } = blink

  // idle → running when face arrives
  useEffect(() => {
    if (phase === 'idle' && faceDetected && !blinking) {
      startRef.current = Date.now()
      setPhase('running')
    }
  }, [phase, faceDetected, blinking])

  // running → idle when face is lost
  useEffect(() => {
    if (phase === 'running' && !faceDetected) {
      setPhase('idle')
      setElapsed(0)
    }
  }, [phase, faceDetected])

  // timer tick during running
  useEffect(() => {
    if (phase !== 'running') return
    const t = setInterval(() => setElapsed(Date.now() - startRef.current), 50)
    return () => clearInterval(t)
  }, [phase])

  // running → blinked on leading edge of blinking
  useEffect(() => {
    if (phase === 'running' && blinking && !blinkFiredRef.current) {
      blinkFiredRef.current = true
      const held = Date.now() - startRef.current
      setSessionBest(prev => Math.max(prev, held))
      setElapsed(held)
      setPhase('blinked')
    }
    if (!blinking) blinkFiredRef.current = false
  }, [blinking, phase])

  // blinked → idle after delay
  useEffect(() => {
    if (phase !== 'blinked') return
    const t = setTimeout(() => {
      setPhase('idle')
      setElapsed(0)
    }, 1400)
    return () => clearTimeout(t)
  }, [phase])

  const personalBestFormatted = personalBest > 0 ? formatMs(personalBest) : '—'
  const sessionBestFormatted  = sessionBest > 0  ? formatMs(sessionBest)  : '—'
  const newRecord = sessionBest > 0 && sessionBest > personalBest

  return (
    <div className="poster-screen poster-screen--practice">
      <div className="poster-card poster-card--practice">
        <div className="poster-meta">Solo Training · No Opponent · Free Practice</div>
        <div className="poster-kicker">Practice</div>

        <h1 className="poster-headline">
          <span className="result-dim">Hold</span>{' '}
          <em>your gaze.</em>
        </h1>

        <div className="practice-timer">
          <em>
            {phase === 'idle'    ? (faceDetected ? 'READY' : 'NO FACE')
            : phase === 'blinked' ? 'BLINKED'
            : 'HOLDING'}
          </em>
          <strong>
            {phase === 'blinked' ? formatMs(sessionBest)
            : phase === 'idle' && elapsed === 0 ? '0.00s'
            : formatMs(elapsed)}
          </strong>
          {phase === 'blinked' && newRecord && (
            <span className="practice-timer__record">NEW RECORD</span>
          )}
        </div>

        <div className="practice-feed">
          <CameraPreview
            attachRef={attachRef}
            videoEl={camera.videoEl}
            faceDetected={faceDetected}
            loading={loading}
            eyeBoxes={eyeBoxes}
            blinking={blinking}
            style={{ width: '100%', aspectRatio: '4 / 3', borderRadius: 0 }}
          />
          <div className="practice-ear">
            <span>EAR</span>
            <EARBar ear={ear} />
          </div>
        </div>

        <div className="result-stats-strip practice-stats-strip">
          <div>
            <span>Session best</span>
            <strong>{sessionBestFormatted}</strong>
          </div>
          <div>
            <span>All-time best</span>
            <strong>{personalBestFormatted}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>
              {phase === 'running' ? 'Holding' : phase === 'blinked' ? 'Blinked' : faceDetected ? 'Ready' : 'No face'}
            </strong>
          </div>
        </div>

        <button
          className="poster-cta poster-cta--result"
          type="button"
          onClick={() => onEnd(sessionBest)}
        >
          Done
          <small>return to lobby</small>
        </button>

        <div className="poster-footnote">BlinkOut · Solo Training</div>
        <div className="poster-footnote poster-footnote--right">No opponent</div>
      </div>
    </div>
  )
}

import { useEffect, useState, useRef } from 'react'
import StatusPill from '../ui/StatusPill.jsx'
import CameraPreview from '../camera/CameraPreview.jsx'
import EARBar from '../camera/EARBar.jsx'

export default function LiveMatch({
  camera,
  blink,
  matchData,
  playerName,
  sendEAR,
  onBlinkDetected,
}) {
  const [elapsed, setElapsed] = useState(0)
  const [opponentEAR, setOpponentEAR] = useState(0.3)
  const [alertVisible, setAlertVisible] = useState(false)
  const startRef = useRef(Date.now())

  const { attachRef } = camera
  const { ear, faceDetected, loading } = blink

  // Match timer
  useEffect(() => {
    const t = setInterval(() => {
      setElapsed(Date.now() - startRef.current)
    }, 100)
    return () => clearInterval(t)
  }, [])

  // Send EAR to server on every update
  useEffect(() => {
    if (matchData?.matchId) sendEAR(matchData.matchId, ear)
  }, [ear, matchData?.matchId])

  // Show alert when EAR nears threshold
  useEffect(() => {
    setAlertVisible(ear < 0.28)
  }, [ear])

  const formatTime = (ms) => {
    const s = ms / 1000
    const m = Math.floor(s / 60)
    const sec = (s % 60).toFixed(1)
    return `${String(m).padStart(2, '0')}:${sec.padStart(4, '0')}`
  }

  return (
    <div className="match">
      {/* Top bar */}
      <div className="match__topbar">
        <span className="match__timer" aria-label="Match timer" aria-live="off">
          {formatTime(elapsed)}
        </span>
        <StatusPill variant="live" pulse>LIVE</StatusPill>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          EAR threshold: 0.20
        </span>
      </div>

      {/* Arena */}
      <div className="match__arena">
        {/* Local player */}
        <div className="player-panel">
          <div className="player-panel__handle">
            <span
              style={{
                width: 8, height: 8, borderRadius: '50%',
                background: faceDetected ? 'var(--accent-violet)' : 'var(--accent-red)',
                flexShrink: 0,
              }}
            />
            {playerName}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
              YOU
            </span>
          </div>

          <CameraPreview
            attachRef={attachRef}
            faceDetected={faceDetected}
            loading={loading}
            style={{ flex: 1 }}
          />

          <div className="player-panel__ear-row">
            <span>EAR</span>
            <EARBar ear={ear} />
          </div>
        </div>

        {/* VS divider */}
        <div className="match__vs">VS</div>

        {/* Opponent panel */}
        <div className="player-panel">
          <div className="player-panel__handle">
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--border-emphasis)', flexShrink: 0 }} />
            {matchData?.opponentName ?? 'Opponent'}
          </div>

          <div
            className="camera-window camera-window--opponent"
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}
          >
            <span style={{ fontSize: 40, opacity: 0.4 }}>👤</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
              Remote feed not streamed
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
              (WebRTC — Phase 2)
            </span>
          </div>

          <div className="player-panel__ear-row">
            <span>EAR</span>
            <EARBar ear={opponentEAR} />
          </div>
        </div>
      </div>

      {/* Alert strip */}
      {alertVisible && (
        <div
          className="match__alert"
          role="alert"
          aria-live="polite"
        >
          Monitoring eye aspect ratio — stay focused
        </div>
      )}

      {/* Status bar */}
      <div className="match__statusbar">
        <span>threshold: 0.20</span>
        <span>30 fps</span>
        <span style={{ marginLeft: 'auto', color: faceDetected ? 'var(--accent-green)' : 'var(--accent-red)' }}>
          {faceDetected ? '● face ok' : '○ no face'}
        </span>
      </div>
    </div>
  )
}

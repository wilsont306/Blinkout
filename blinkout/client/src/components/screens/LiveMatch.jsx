import { useEffect, useState, useRef } from 'react'
import CameraPreview from '../camera/CameraPreview.jsx'
import EARBar from '../camera/EARBar.jsx'

export default function LiveMatch({
  camera,
  blink,
  matchData,
  playerName,
  sendEAR,
  sendVideoFrame,
  opponentEAR = 0.3,
  opponentFrame = null,
  lives = { mine: 1, opponent: 1 },
  onForfeit,
}) {
  const [elapsed, setElapsed] = useState(0)
  const [alertVisible, setAlertVisible] = useState(false)
  const startRef = useRef(Date.now())
  const frameCanvasRef = useRef(null)

  const { attachRef } = camera
  const { ear, faceDetected, loading, warning, eyeBoxes, blinking } = blink
  const earRef = useRef(ear)
  const faceDetectedRef = useRef(faceDetected)
  const warningRef = useRef(warning)

  // Match timer
  useEffect(() => {
    const t = setInterval(() => {
      setElapsed(Date.now() - startRef.current)
    }, 100)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    earRef.current = ear
    faceDetectedRef.current = faceDetected
    warningRef.current = warning
  }, [ear, faceDetected, warning])

  // Send a steady EAR signal so covered/missing faces can strike like a blink.
  useEffect(() => {
    if (!matchData?.matchId) return

    const t = setInterval(() => {
      const shouldStrikeAsCovered = !faceDetectedRef.current || warningRef.current === 'covered'
      sendEAR(matchData.matchId, shouldStrikeAsCovered ? 0 : earRef.current, {
        covered: shouldStrikeAsCovered,
      })
    }, 120)

    return () => clearInterval(t)
  }, [matchData?.matchId, sendEAR])

  useEffect(() => {
    if (!matchData?.matchId || !sendVideoFrame) return

    const t = setInterval(() => {
      const video = camera.videoEl
      if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return

      const canvas = frameCanvasRef.current ?? document.createElement('canvas')
      frameCanvasRef.current = canvas
      canvas.width = 480
      canvas.height = Math.round(480 * (video.videoHeight / video.videoWidth))

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      sendVideoFrame(matchData.matchId, canvas.toDataURL('image/jpeg', 0.72))
    }, 300)

    return () => clearInterval(t)
  }, [camera.videoEl, matchData?.matchId, sendVideoFrame])

  // Show alert when EAR nears threshold
  useEffect(() => {
    setAlertVisible(ear < 0.28)
  }, [ear])

  // Notify parent when local blink fires (server also confirms via MATCH_END)
  useEffect(() => {
    blink.resetBlink && (window.__blinkResetRef = blink.resetBlink)
  }, [blink.resetBlink])

  const formatTime = (ms) => {
    const s = ms / 1000
    const m = Math.floor(s / 60)
    const sec = (s % 60).toFixed(1)
    return `${String(m).padStart(2, '0')}:${sec.padStart(4, '0')}`
  }

  return (
    <div className="poster-screen poster-screen--duel">
      <div className="poster-card poster-card--duel">
        <div className="poster-meta">Browser Coliseum · 10-May-MMXXVI · Best of Three Lives</div>
        <div className="poster-kicker">Round 01</div>
        <div className="duel-timer">
          <span>Elapsed</span>
          <strong aria-label="Match timer" aria-live="off">{formatTime(elapsed)}</strong>
          <em>
            {warning === 'bad-lighting'
              ? 'Bad lighting'
              : warning === 'covered'
              ? 'Face covered'
              : alertVisible
              ? 'Hold steady'
              : 'Stand ready'}
          </em>
        </div>

        <div className="poster-duel">
          <DuelCard
            corner="Blue corner · You"
            number="01"
            name={playerName}
            role="Challenger"
            statusColor={faceDetected ? 'var(--poster-amber)' : 'var(--poster-red)'}
            lives={lives.mine}
            ear={ear}
          >
            <CameraPreview
              attachRef={attachRef}
              videoEl={camera.videoEl}
              faceDetected={faceDetected}
              loading={loading}
              eyeBoxes={eyeBoxes}
              blinking={blinking}
              style={{ width: '100%', aspectRatio: '4 / 3', borderRadius: 0 }}
            />
          </DuelCard>

          <div className="poster-vs">VS</div>

          <DuelCard
            corner="Red corner"
            number="02"
            name={matchData?.opponentName ?? 'Opponent'}
            role="Champion"
            statusColor="var(--poster-ink-soft)"
            lives={lives.opponent}
            ear={opponentEAR}
          >
            <div className="poster-opponent-feed">
              {opponentFrame ? (
                <img
                  src={opponentFrame}
                  alt={`${matchData?.opponentName ?? 'Opponent'} camera feed`}
                />
              ) : (
                <>
                  <span>--</span>
                  <small>Waiting for feed</small>
                </>
              )}
            </div>
          </DuelCard>
        </div>

        <div className="poster-duel-cta">
          Don't blink. <small>first to blink loses</small>
          {onForfeit && (
            <button className="duel-forfeit-btn" type="button" onClick={onForfeit}>
              Leave
            </button>
          )}
        </div>
        <div className="poster-footnote">Blink Duel · Entry 04</div>
        <div className="poster-footnote poster-footnote--right">No video leaves your device</div>
      </div>
    </div>
  )
}

function DuelCard({ corner, number, name, role, statusColor, lives, ear, children }) {
  return (
    <article className="duel-card">
      <div className="duel-card__corner">
        <span>{corner}</span>
        <span>{number}</span>
      </div>
      <div className="duel-card__name">
        <span style={{ background: statusColor }} />
        <strong>{name}</strong>
        <em>{role}</em>
      </div>
      {children}
      <LifeBox label="Lives" value={lives} />
      <div className="duel-card__ear">
        <span>EAR</span>
        <EARBar ear={ear} />
      </div>
    </article>
  )
}

function LifeBox({ label, value }) {
  return (
    <div className="life-box" aria-label={`${value} lives remaining`}>
      <span className="life-box__label">{label}</span>
      {[0, 1, 2].map(index => (
        <span
          key={index}
          className={`life-heart${index < value ? ' life-heart--active' : ''}`}
          aria-hidden
        >
          {index < value ? '♥' : '♡'}
        </span>
      ))}
    </div>
  )
}

import { useEffect, useState, useRef } from 'react'
import CameraPreview from '../camera/CameraPreview.jsx'
import EARBar from '../camera/EARBar.jsx'
import { playClick, playLifeLost } from '../../lib/sounds.js'

const BAD_CAMERA_LOSS_MS = 1000
const BAD_CAMERA_WARNINGS = new Set(['bad-lighting', 'bad-glare'])

export default function LiveMatch({
  camera,
  blink,
  matchData,
  playerName,
  sendEAR,
  sendVideoFrame,
  opponentEAR = 0.3,
  opponentFrame = null,
  lives = { mine: 3, opponent: 3 },
  onForfeit,
}) {
  const [elapsed, setElapsed] = useState(0)
  const [alertVisible, setAlertVisible] = useState(false)
  const [myFlash, setMyFlash] = useState(false)
  const [oppFlash, setOppFlash] = useState(false)
  const startRef = useRef(Date.now())
  const frameCanvasRef = useRef(null)
  const prevMineRef = useRef(lives.mine)
  const prevOppRef = useRef(lives.opponent)

  const { attachRef } = camera
  const { ear, faceDetected, loading, warning, eyeBoxes, blinking } = blink
  const earRef = useRef(ear)
  const faceDetectedRef = useRef(faceDetected)
  const warningRef = useRef(warning)
  const onForfeitRef = useRef(onForfeit)
  const badCameraSinceRef = useRef(null)

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

  useEffect(() => {
    onForfeitRef.current = onForfeit
  }, [onForfeit])

  // Send a steady EAR signal so covered/missing faces can strike like a blink.
  useEffect(() => {
    if (!matchData?.matchId) return

    const t = setInterval(() => {
      const shouldStrikeAsCovered =
        !faceDetectedRef.current ||
        warningRef.current === 'covered' ||
        BAD_CAMERA_WARNINGS.has(warningRef.current)
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
      canvas.width = 640
      canvas.height = Math.round(640 * (video.videoHeight / video.videoWidth))

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      sendVideoFrame(matchData.matchId, canvas.toDataURL('image/jpeg', 0.94))
    }, 50)

    return () => clearInterval(t)
  }, [camera.videoEl, matchData?.matchId, sendVideoFrame])

  // Bad lighting/glare can hide blinks. Give it one second, then forfeit.
  useEffect(() => {
    if (!matchData?.matchId) return

    const t = setInterval(() => {
      const currentWarning = warningRef.current
      if (!BAD_CAMERA_WARNINGS.has(currentWarning)) {
        badCameraSinceRef.current = null
        return
      }

      if (!badCameraSinceRef.current) {
        badCameraSinceRef.current = Date.now()
        return
      }

      if (Date.now() - badCameraSinceRef.current >= BAD_CAMERA_LOSS_MS) {
        onForfeitRef.current?.(currentWarning)
      }
    }, 120)

    return () => clearInterval(t)
  }, [matchData?.matchId])

  // Show alert when EAR nears threshold
  useEffect(() => {
    setAlertVisible(ear < 0.28)
  }, [ear])

  // Life-lost flash + sound
  useEffect(() => {
    if (lives.mine < prevMineRef.current) {
      setMyFlash(true)
      playLifeLost()
      const t = setTimeout(() => setMyFlash(false), 600)
      prevMineRef.current = lives.mine
      return () => clearTimeout(t)
    }
    prevMineRef.current = lives.mine
  }, [lives.mine])

  useEffect(() => {
    if (lives.opponent < prevOppRef.current) {
      setOppFlash(true)
      const t = setTimeout(() => setOppFlash(false), 600)
      prevOppRef.current = lives.opponent
      return () => clearTimeout(t)
    }
    prevOppRef.current = lives.opponent
  }, [lives.opponent])

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
      {myFlash && <div className="life-lost-flash" aria-hidden />}
      <div className="poster-card poster-card--duel">
        <div className="poster-meta">Browser Coliseum · 10-May-MMXXVI · Best of Three Lives</div>
        <div className="poster-kicker">Round 01</div>
        <div className="duel-timer">
          <span>Elapsed</span>
          <strong aria-label="Match timer" aria-live="off">{formatTime(elapsed)}</strong>
          <em>
            {warning === 'photo-face'
              ? 'Photo detected'
              : warning === 'bad-lighting'
              ? 'Too dark'
              : warning === 'bad-glare'
              ? 'Too much glare'
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
            flash={myFlash}
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
            flash={oppFlash}
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
            <button className="duel-forfeit-btn" type="button" onClick={() => { playClick(); onForfeit?.() }}>
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

function DuelCard({ corner, number, name, role, statusColor, lives, ear, flash, children }) {
  return (
    <article className={`duel-card${flash ? ' duel-card--flash' : ''}`}>
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
  const prevRef = useRef(value)
  const [breaking, setBreaking] = useState(null)

  useEffect(() => {
    if (value < prevRef.current) {
      setBreaking(prevRef.current - 1)
      const t = setTimeout(() => setBreaking(null), 750)
      prevRef.current = value
      return () => clearTimeout(t)
    }
    prevRef.current = value
  }, [value])

  return (
    <div className="life-box" aria-label={`${value} lives remaining`}>
      <span className="life-box__label">{label}</span>
      {[0, 1, 2].map(index => (
        <span
          key={index}
          className={`life-heart${index < value ? ' life-heart--active' : ''}${index === breaking ? ' life-heart--breaking' : ''}`}
          aria-hidden
        >
          {index === breaking ? '💔' : index < value ? '♥' : '♡'}
        </span>
      ))}
    </div>
  )
}

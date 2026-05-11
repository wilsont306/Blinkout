import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { CLIENT_ID } from '../../hooks/useGame.js'
import CameraPreview from '../camera/CameraPreview.jsx'

const MIN_FRAME_MS = 200 // ~5 fps in lobby

export default function InviteLobby({ playerName, roomCode, camera, blink, onMatchStart, onLeave }) {
  const [opponent, setOpponent]         = useState(null)
  const [iAmReady, setIAmReady]         = useState(false)
  const [copied, setCopied]             = useState(false)
  const [starting, setStarting]         = useState(false)
  const [opponentFrame, setOpponentFrame] = useState(null)
  const [camConfirmed, setCamConfirmed] = useState(false)

  const channelRef   = useRef(null)
  const startedRef   = useRef(false)
  const lastFrameRef = useRef(0)
  const frameCanvas  = useRef(null)

  const { attachRef, permission, stream, requestCamera, videoEl } = camera
  const { faceDetected, loading, warning, eyeBoxes, blinking }    = blink

  const inviteUrl = `${window.location.origin}?invite=${roomCode}`
  const cameraOk  = camConfirmed && permission === 'granted' && faceDetected
  const canReady  = !!opponent && cameraOk && !iAmReady && !starting

  // Request camera on mount
  useEffect(() => {
    if (permission !== 'granted') requestCamera()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (permission === 'granted' && stream) setCamConfirmed(true)
  }, [permission, stream])

  // Presence + video relay channel
  useEffect(() => {
    const ch = supabase.channel(`invite:${roomCode}`, {
      config: { broadcast: { self: false } },
    })

    ch
      .on('presence', { event: 'sync' }, () => {
        const presences = Object.values(ch.presenceState()).flat()
        const opp = presences.find(p => p.clientId !== CLIENT_ID)
        setOpponent(opp ?? null)

        if (
          !startedRef.current &&
          presences.length === 2 &&
          presences.every(p => p.isReady)
        ) {
          startedRef.current = true
          setStarting(true)
          const oppP = presences.find(p => p.clientId !== CLIENT_ID)
          setTimeout(() => {
            onMatchStart(roomCode, oppP.handle, oppP.clientId)
          }, 900)
        }
      })
      .on('broadcast', { event: 'VIDEO_FRAME' }, ({ payload }) => {
        setOpponentFrame(payload.frame)
      })

    ch.subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ clientId: CLIENT_ID, handle: playerName, isReady: false })
      }
    })

    channelRef.current = ch
    return () => { supabase.removeChannel(ch) }
  }, [roomCode, playerName, onMatchStart])

  // Send own video frames to opponent
  useEffect(() => {
    const canvas = document.createElement('canvas')
    frameCanvas.current = canvas

    const t = setInterval(() => {
      const now = Date.now()
      if (now - lastFrameRef.current < MIN_FRAME_MS) return
      if (!videoEl || videoEl.readyState < 2 || !channelRef.current) return
      canvas.width = 96; canvas.height = 72
      canvas.getContext('2d').drawImage(videoEl, 0, 0, 96, 72)
      const frame = canvas.toDataURL('image/jpeg', 0.5)
      channelRef.current.send({ type: 'broadcast', event: 'VIDEO_FRAME', payload: { frame } })
      lastFrameRef.current = now
    }, 100)

    return () => clearInterval(t)
  }, [videoEl])

  const handleReady = async () => {
    if (!canReady) return
    setIAmReady(true)
    await channelRef.current?.track({ clientId: CLIENT_ID, handle: playerName, isReady: true })
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const camWarning =
    warning === 'covered'         ? 'Eyes covered — uncover them before readying up.'
    : warning === 'partial-covered' ? 'One eye blocked — clear your view.'
    : warning === 'bad-lighting'    ? 'Too dark — brighten your face.'
    : warning === 'cv-error'        ? 'Face detection failed.'
    : !faceDetected && camConfirmed ? 'Position your face in frame to ready up.'
    : null

  return (
    <div className="poster-screen poster-screen--invite">
      <div className="poster-card poster-card--invite">
        <div className="poster-meta">Blink Duel · Private Match · {roomCode}</div>
        <div className="poster-kicker">Invite</div>

        <h1 className="poster-headline">
          Private <span>duel.</span>
        </h1>
        <p className="poster-subline">
          {starting
            ? 'Both ready — entering the duel…'
            : opponent
            ? `${opponent.handle} has joined`
            : 'Share the link — waiting for your opponent'}
        </p>

        {/* Camera previews */}
        <div className="invite-cameras">
          <div className="invite-cam-slot">
            <div className="invite-cam-label">YOU · {playerName}</div>
            <div className="invite-cam-window">
              {camConfirmed && permission === 'granted' ? (
                <CameraPreview
                  attachRef={attachRef}
                  videoEl={videoEl}
                  faceDetected={faceDetected}
                  loading={loading}
                  eyeBoxes={eyeBoxes}
                  blinking={blinking}
                  style={{ width: '100%', height: '100%', borderRadius: 8 }}
                />
              ) : (
                <div className="invite-cam-placeholder">
                  <span>{loading ? 'Loading…' : 'Camera needed'}</span>
                </div>
              )}
            </div>
            {camWarning && (
              <p className="invite-cam-warning">{camWarning}</p>
            )}
            <span className={`invite-player__status${iAmReady ? ' is-ready' : ''}`}>
              {iAmReady ? 'READY' : cameraOk ? 'CAMERA OK' : 'CAMERA NEEDED'}
            </span>
          </div>

          <div className="invite-vs">VS</div>

          <div className="invite-cam-slot">
            <div className="invite-cam-label">
              {opponent ? `OPP · ${opponent.handle}` : 'WAITING…'}
            </div>
            <div className="invite-cam-window invite-cam-window--opp">
              {opponentFrame ? (
                <img src={opponentFrame} alt="opponent" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
              ) : (
                <div className="invite-cam-placeholder">
                  <span>{opponent ? 'Loading cam…' : '???'}</span>
                </div>
              )}
            </div>
            <span className={`invite-player__status${opponent?.isReady ? ' is-ready' : ''}`}>
              {opponent ? (opponent.isReady ? 'READY' : 'NOT READY') : 'NOT JOINED'}
            </span>
          </div>
        </div>

        {!opponent && (
          <button className="invite-copy-btn" type="button" onClick={handleCopy}>
            {copied ? '✓ Copied!' : 'Copy invite link'}
            <small>{inviteUrl}</small>
          </button>
        )}

        <div className="invite-actions">
          <button
            className={`poster-cta poster-cta--ready${iAmReady ? ' poster-cta--waiting' : ''}${starting ? ' poster-cta--glow' : ''}`}
            type="button"
            onClick={handleReady}
            disabled={!canReady}
          >
            {starting ? 'Starting…' : iAmReady ? `Waiting for ${opponent?.handle}…` : 'Ready'}
            <small>
              {starting        ? 'entering the duel'
              : iAmReady       ? `waiting for ${opponent?.handle}`
              : !camConfirmed  ? 'camera required before readying up'
              : !faceDetected  ? 'face must be visible to ready up'
              : !opponent      ? 'waiting for opponent to join'
              :                  'both must click ready to start'}
            </small>
          </button>

          <button className="poster-cta poster-cta--cancel" type="button" onClick={onLeave}>
            Leave
            <small>return to lobby</small>
          </button>
        </div>

        <div className="poster-footnote">Blink Duel · Private Match</div>
      </div>
    </div>
  )
}

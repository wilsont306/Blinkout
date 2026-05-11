import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { CLIENT_ID } from '../../hooks/useGame.js'
import CameraPreview from '../camera/CameraPreview.jsx'
import EARBar from '../camera/EARBar.jsx'
import Button from '../ui/Button.jsx'

const MIN_FRAME_MS = 67 // ~15fps
const NAME_RE = /^[\w\s\-.]{1,30}$/

export default function InviteLobby({
  playerName, roomCode, isCreator = false, camera, blink,
  onMatchStart, onLeave, onSetName,
}) {
  // creator skips 'enter' and goes straight to camera setup
  const [phase, setPhase]           = useState(isCreator ? 'camera' : 'enter')
  const [openingBlink, setOpeningBlink] = useState(false)
  const [camConfirmed, setCamConfirmed] = useState(false)

  const [opponent, setOpponent]         = useState(null)
  const [iAmReady, setIAmReady]         = useState(false)
  const [copied, setCopied]             = useState(false)
  const [starting, setStarting]         = useState(false)
  const [opponentFrame, setOpponentFrame] = useState(null)

  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput]     = useState(playerName)
  const nameInputRef                  = useRef(null)

  const channelRef    = useRef(null)
  const startedRef    = useRef(false)
  const lastFrameRef  = useRef(0)
  const opponentRef   = useRef(null)
  const iAmReadyRef   = useRef(false)
  // Per-tab session ID — unlike CLIENT_ID this is NOT shared across same-browser tabs
  const sessionId     = useRef(crypto.randomUUID()).current

  const {
    attachRef, permission, error, devices, deviceId,
    stream, requestCamera, selectCamera, videoEl,
  } = camera
  const { ear, faceDetected, loading, warning, eyeBoxes, blinking } = blink

  const cameraReady = camConfirmed && permission === 'granted'
  const inviteUrl   = `${window.location.origin}?invite=${roomCode}`
  const canReady    = cameraReady && faceDetected && !iAmReady && !starting

  // ── Phase transitions ──────────────────────────────────────────
  const handleOpenEye = () => {
    setOpeningBlink(true)
    setTimeout(() => {
      setOpeningBlink(false)
      setPhase('camera')
      requestCamera()
    }, 260)
  }

  const handleConfirmCamera = async () => {
    if (permission !== 'granted' || !stream) { await requestCamera(); return }
    setCamConfirmed(true)
    setPhase('lobby')
  }

  // Creator skips intro — request camera immediately on mount
  useEffect(() => {
    if (isCreator && permission !== 'granted') requestCamera()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Join Supabase only when entering lobby (privacy) ───────────
  useEffect(() => {
    if (phase !== 'lobby') return

    const ch = supabase.channel(`invite:${roomCode}`, {
      config: { broadcast: { self: false } },
    })

    const myPayload = () => ({ sessionId, clientId: CLIENT_ID, handle: playerName, isReady: iAmReadyRef.current })

    const sendHello = () => ch.send({
      type: 'broadcast', event: 'LOBBY_HELLO', payload: myPayload(),
    })

    ch
      .on('broadcast', { event: 'LOBBY_HELLO' }, ({ payload }) => {
        if (payload.sessionId === sessionId) return
        // Someone announced themselves — record them and reply with our current state
        opponentRef.current = { ...payload }
        setOpponent({ ...payload })
        ch.send({ type: 'broadcast', event: 'LOBBY_HELLO_BACK', payload: myPayload() })
      })
      .on('broadcast', { event: 'LOBBY_HELLO_BACK' }, ({ payload }) => {
        if (payload.sessionId === sessionId) return
        // Reply from someone already in the lobby
        if (!opponentRef.current) {
          opponentRef.current = { ...payload }
          setOpponent({ ...payload })
        }
      })
      .on('broadcast', { event: 'LOBBY_READY' }, ({ payload }) => {
        if (payload.sessionId === sessionId) return
        setOpponent(prev => {
          if (!prev) return prev
          const next = { ...prev, isReady: payload.isReady }
          opponentRef.current = next
          return next
        })
      })
      .on('broadcast', { event: 'VIDEO_FRAME' }, ({ payload }) => {
        if (payload.fromSessionId === sessionId) return
        setOpponentFrame(payload.frame)
      })

    ch.subscribe(status => {
      if (status !== 'SUBSCRIBED') return
      sendHello()
    })

    // Re-send hello every 2s until opponent detected (handles late joiners)
    const helloT = setInterval(() => {
      if (!opponentRef.current) sendHello()
    }, 2000)

    channelRef.current = ch
    return () => {
      clearInterval(helloT)
      supabase.removeChannel(ch)
      channelRef.current = null
      opponentRef.current = null
    }
  }, [phase, roomCode, playerName])

  // ── Video frame relay ──────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'lobby') return
    const t = setInterval(() => {
      const now = Date.now()
      if (now - lastFrameRef.current < MIN_FRAME_MS) return
      if (!videoEl || videoEl.readyState < 2 || !channelRef.current) return
      const c = document.createElement('canvas')
      c.width = 480
      c.height = Math.round(480 * ((videoEl.videoHeight || 360) / (videoEl.videoWidth || 480)))
      c.getContext('2d').drawImage(videoEl, 0, 0, c.width, c.height)
      channelRef.current.send({
        type: 'broadcast', event: 'VIDEO_FRAME',
        payload: { frame: c.toDataURL('image/jpeg', 0.72), fromSessionId: sessionId },
      })
      lastFrameRef.current = now
    }, 100)
    return () => clearInterval(t)
  }, [phase, videoEl])

  // ── Ready ──────────────────────────────────────────────────────
  const handleReady = () => {
    if (!canReady) return
    iAmReadyRef.current = true
    setIAmReady(true)
    channelRef.current?.send({
      type: 'broadcast', event: 'LOBBY_READY', payload: { sessionId, isReady: true },
    })
  }

  // Start match when both players are ready
  useEffect(() => {
    if (!iAmReady || !opponent?.isReady || startedRef.current) return
    startedRef.current = true
    setStarting(true)
    setTimeout(() => onMatchStart(roomCode, opponent.handle, opponent.clientId), 900)
  }, [iAmReady, opponent?.isReady, opponent?.handle, opponent?.clientId, roomCode, onMatchStart])

  // ── Name edit ──────────────────────────────────────────────────
  useEffect(() => { if (editingName) nameInputRef.current?.focus() }, [editingName])
  const handleNameSubmit = () => {
    const trimmed = nameInput.trim()
    if (trimmed && NAME_RE.test(trimmed)) onSetName?.(trimmed)
    else setNameInput(playerName)
    setEditingName(false)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const camWarning =
    warning === 'covered'           ? 'Eyes covered — uncover them.'
    : warning === 'bad-lighting'    ? 'Too dark — brighten your face.'
    : warning === 'cv-error'        ? 'Face detection failed.'
    : null

  const nameStrip = (
    <div className="entrance-a__bottom-strip">
      <div>PRIVATE MATCH · {roomCode}</div>
      <div className="entrance-a__player">
        <small>PLAYING AS</small>
        {editingName ? (
          <input
            ref={nameInputRef}
            className="entrance-a__name-input"
            value={nameInput}
            maxLength={20}
            onChange={e => setNameInput(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={e => {
              if (e.key === 'Enter') handleNameSubmit()
              if (e.key === 'Escape') { setNameInput(playerName); setEditingName(false) }
            }}
          />
        ) : (
          <button
            className="entrance-a__name-btn"
            type="button"
            onClick={() => { setNameInput(playerName); setEditingName(true) }}
            title="Click to edit name"
          >
            {playerName} <span className="entrance-a__name-edit-icon">✎</span>
          </button>
        )}
      </div>
    </div>
  )

  // ── Render: enter + camera phases (entrance-style) ─────────────
  if (phase === 'enter' || phase === 'camera') {
    return (
      <div className={`entrance-a${openingBlink ? ' entrance-a__eye--opening-blink' : ''}`}>
        <div className="entrance-a__vignette" />
        <div className="entrance-a__system"><span /> BLINK DUEL / PRIVATE MATCH</div>
        <div className="entrance-a__status">
          <span className={permission === 'granted' ? 'is-live' : ''} />
          {permission === 'granted'
            ? 'CAMERA LIVE · NO VIDEO LEAVES YOUR DEVICE'
            : 'STAND BY · CAMERA NEEDED'}
        </div>

        <div className={`entrance-a__headline${phase === 'camera' ? ' entrance-a__headline--hidden' : ''}`}>
          <p>PRIVATE DUEL · {roomCode}</p>
          <h1>
            <span>{"You've been"}</span>{' '}
            <em>challenged.</em>
          </h1>
        </div>

        <div className={`entrance-a__eye${phase === 'camera' ? ' entrance-a__eye--armed' : ''}${openingBlink ? ' entrance-a__eye--opening-blink' : ''}`}>
          {phase === 'camera' && permission === 'granted' ? (
            <CameraPreview
              attachRef={attachRef}
              videoEl={videoEl}
              faceDetected={cameraReady ? faceDetected : false}
              loading={loading}
              eyeBoxes={cameraReady ? eyeBoxes : []}
              blinking={cameraReady ? blinking : false}
              style={{ width: '100%', height: '100%', borderRadius: 18 }}
            />
          ) : phase === 'camera' ? (
            <div className="entrance-a__camera-placeholder entrance-a__camera-placeholder--eye">
              <p>{error ? 'Camera unavailable' : 'Camera access required'}</p>
              <small>{error || 'Allow camera access to continue.'}</small>
              {(error || permission === 'denied') && (
                <Button variant="primary" onClick={requestCamera} fullWidth>Try again</Button>
              )}
            </div>
          ) : (
            <div className="entrance-a__iris" aria-hidden><span /></div>
          )}
        </div>

        {phase === 'camera' && permission === 'granted' && !camConfirmed && (
          <div className="entrance-a__camera-confirm-preview">
            {devices.length > 1 && (
              <label className="camera-source">
                <span>Camera source</span>
                <select
                  value={deviceId || devices[0]?.deviceId || ''}
                  onChange={e => selectCamera(e.target.value)}
                >
                  {devices.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Camera ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Button variant="primary" onClick={handleConfirmCamera} fullWidth>
              Confirm camera
            </Button>
          </div>
        )}

        <div className={`entrance-a__actions${phase === 'enter' ? ' entrance-a__actions--initial' : ''}`}>
          {phase === 'enter' && (
            <button
              className="entrance-a__open-pill"
              type="button"
              onClick={handleOpenEye}
            >
              <strong>Open your eye</strong>
              <span>Camera access required to join</span>
            </button>
          )}
        </div>

        {nameStrip}
      </div>
    )
  }

  // ── Render: lobby phase ────────────────────────────────────────
  return (
    <div className="poster-screen poster-screen--invite">
      <div className="poster-card poster-card--invite">
        <div className="poster-meta">Blink Duel · Private Match · {roomCode}</div>
        <div className="poster-kicker">Invite</div>
        <h1 className="poster-headline">Private <span>duel.</span></h1>
        <p className="poster-subline">
          {starting
            ? 'Both ready — entering the duel…'
            : opponent
            ? `${opponent.handle} has joined`
            : 'Share the link — waiting for your opponent'}
        </p>

        <div className="invite-cameras">
          <div className="invite-cam-slot">
            <div className="invite-cam-label">YOU · {playerName}</div>
            <div className="invite-cam-window">
              <CameraPreview
                attachRef={attachRef}
                videoEl={videoEl}
                faceDetected={faceDetected}
                loading={loading}
                eyeBoxes={eyeBoxes}
                blinking={blinking}
                style={{ width: '100%', height: '100%', borderRadius: 8 }}
              />
            </div>
            <p className="invite-cam-warning" style={{ visibility: camWarning ? 'visible' : 'hidden' }}>
              {camWarning || ' '}
            </p>
            <span className={`invite-player__status${iAmReady ? ' is-ready' : faceDetected ? ' is-ok' : ''}`}>
              {iAmReady ? 'READY' : faceDetected ? 'FACE DETECTED' : 'POSITION FACE'}
            </span>
          </div>

          <div className="invite-vs">VS</div>

          <div className="invite-cam-slot">
            <div className="invite-cam-label">
              {opponent ? `OPP · ${opponent.handle}` : 'WAITING…'}
            </div>
            <div className="invite-cam-window invite-cam-window--opp">
              {opponentFrame
                ? <img src={opponentFrame} alt="opponent" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                : <div className="invite-cam-placeholder"><span>{opponent ? 'Loading cam…' : '???'}</span></div>
              }
            </div>
            <span className={`invite-player__status${opponent?.isReady ? ' is-ready' : ''}`}>
              {opponent ? (opponent.isReady ? 'READY' : 'NOT READY') : 'NOT JOINED'}
            </span>
          </div>
        </div>

        <button
          className="invite-copy-btn"
          type="button"
          onClick={handleCopy}
          style={{ visibility: opponent ? 'hidden' : 'visible' }}
        >
          {copied ? '✓ Copied!' : 'Copy invite link'}
          <small>{inviteUrl}</small>
        </button>

        <div style={{ visibility: faceDetected ? 'visible' : 'hidden' }}>
          <EARBar ear={ear} />
        </div>

        <div className="invite-actions">
          <button
            className={`poster-cta poster-cta--ready${iAmReady ? ' poster-cta--waiting' : ''}${starting ? ' poster-cta--glow' : ''}`}
            type="button"
            onClick={handleReady}
            disabled={!canReady}
          >
            {starting ? 'Starting…' : iAmReady ? `Waiting for ${opponent?.handle}…` : 'Ready'}
            <small>
              {starting       ? 'entering the duel'
              : iAmReady      ? 'waiting for opponent to ready up'
              : !faceDetected ? 'face must be visible to ready up'
              :                 'click when your face is detected'}
            </small>
          </button>

          <button className="poster-cta poster-cta--leave" type="button" onClick={onLeave}>
            Leave
            <small>return to lobby</small>
          </button>
        </div>

        <div className="poster-footnote">Blink Duel · Private Match</div>
      </div>
    </div>
  )
}

import { useEffect, useState, useRef } from 'react'
import Button from '../ui/Button.jsx'
import CameraPreview from '../camera/CameraPreview.jsx'
import EARBar from '../camera/EARBar.jsx'
import { supabase } from '../../lib/supabase.js'

const DEMO_MP = [
  { handle: 'StareGod',    bestHold: 252000 },
  { handle: 'NoBlink99',   bestHold: 228000 },
  { handle: 'IronEyes',    bestHold: 201000 },
  { handle: 'glasspupil',  bestHold: 182000 },
  { handle: 'NoBlinkWins', bestHold: 165000 },
]

function formatMs(ms) {
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  return `${Math.floor(s / 60)}m ${(s % 60).toFixed(0)}s`
}

export default function Lobby({
  playerName,
  stats,
  camera,
  blink,
  connected,
  practiceBest = 0,
  onFindOpponent,
  onCreateInvite,
  onStartPractice,
  onSetName,
  isLeaving = false,
}) {
  const [calibrationStarted, setCalibrationStarted] = useState(false)
  const [openingBlink, setOpeningBlink]             = useState(false)
  const [menuRevealed, setMenuRevealed]             = useState(false)
  const [cameraConfirmed, setCameraConfirmed]       = useState(false)
  const [selectedAction, setSelectedAction]         = useState(null)
  const [mpLeaderboard, setMpLeaderboard]           = useState(DEMO_MP)
  const [editingName, setEditingName]               = useState(false)
  const [nameInput, setNameInput]                   = useState(playerName)
  const nameInputRef = useRef(null)

  const { attachRef, permission, error, devices, deviceId, requestCamera, selectCamera, stream } = camera
  const { ear, faceDetected, loading, warning, eyeBoxes, blinking } = blink
  const cameraReady = cameraConfirmed && permission === 'granted'
  const cameraBlocked = !faceDetected || warning === 'bad-lighting' || warning === 'bad-glare' || warning === 'cv-error'
  const canPlay     = connected && cameraReady && !loading && !cameraBlocked

  // Fetch live leaderboard when menu reveals
  useEffect(() => {
    if (!menuRevealed) return
    supabase
      .from('leaderboard')
      .select('handle, streak, best_hold, matches')
      .order('best_hold', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (Array.isArray(data) && data.length > 0) {
          setMpLeaderboard(data.map(r => ({ handle: r.handle, bestHold: r.best_hold })))
        }
      })
  }, [menuRevealed])

  // Focus name input when edit mode opens
  useEffect(() => {
    if (editingName) nameInputRef.current?.focus()
  }, [editingName])

  const triggerMenuAction = (action, callback) => {
    if (selectedAction) return
    setSelectedAction(action)
    window.setTimeout(() => {
      callback?.()
      setSelectedAction(null)
    }, 260)
  }

  const handleCameraSelect = (nextDeviceId) => {
    setCameraConfirmed(false)
    selectCamera(nextDeviceId)
  }

  const handleConfirmCamera = async () => {
    if (permission !== 'granted' || !stream) {
      const granted = await requestCamera()
      if (granted) setCameraConfirmed(true)
      return
    }
    setCameraConfirmed(true)
  }

  const NAME_RE = /^[\w\s\-.]{1,30}$/

  const handleNameSubmit = () => {
    const trimmed = nameInput.trim()
    if (trimmed && NAME_RE.test(trimmed)) {
      onSetName(trimmed)
    } else {
      setNameInput(playerName) // revert to current valid name
    }
    setEditingName(false)
  }

  useEffect(() => {
    if (calibrationStarted) requestCamera()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calibrationStarted])

  useEffect(() => {
    if (!calibrationStarted || !cameraReady) {
      setMenuRevealed(false)
      return
    }
    const t = setTimeout(() => setMenuRevealed(true), 860)
    return () => clearTimeout(t)
  }, [calibrationStarted, cameraReady])

  return (
    <div className={`entrance-a${isLeaving ? ' entrance-a--leaving' : ''}`}>
      <div className="entrance-a__vignette" />
      <div className="entrance-a__system"><span /> BLINK DUEL / ENTRANCE</div>
      <div className="entrance-a__status">
        <span className={permission === 'granted' ? 'is-live' : ''} />
        {permission === 'granted' ? 'CAMERA LIVE · FACE MESH STAYS ON DEVICE' : 'STAND BY · CALIBRATING'}
      </div>

      <div className={`entrance-a__headline${calibrationStarted ? ' entrance-a__headline--hidden' : ''}`}>
        <p>A MULTIPLAYER STARING MATCH</p>
        <h1>
          <span>{cameraReady ? "Who’s" : "Don’t"}</span>{' '}
          <em>{cameraReady ? 'next?' : 'blink.'}</em>
        </h1>
      </div>

      {calibrationStarted && cameraReady && menuRevealed && (
        <div className="entrance-a__blink-bar">
          <EARBar ear={ear} />
          <p className={warning === 'covered' || warning === 'bad-lighting' || warning === 'bad-glare' || warning === 'cv-error' || !faceDetected ? 'is-warning' : ''}>
            {warning === 'covered'         ? 'Eyes covered — that counts as a blink.'
            : warning === 'bad-lighting'    ? 'Lighting too dark — brighten your face.'
            : warning === 'bad-glare'       ? 'Too much glare — reduce bright light on your face.'
            : warning === 'cv-error'        ? 'Face detection failed.'
            : faceDetected                  ? 'Face detected.'
            : 'Position yourself in frame.'}
          </p>
        </div>
      )}

      <div className={`entrance-a__eye ${calibrationStarted ? 'entrance-a__eye--armed' : ''}${openingBlink ? ' entrance-a__eye--opening-blink' : ''}`}>
        {calibrationStarted ? (
          (cameraReady || permission === 'granted') ? (
            <CameraPreview
              attachRef={attachRef}
              videoEl={camera.videoEl}
              faceDetected={cameraReady ? faceDetected : false}
              loading={loading}
              eyeBoxes={cameraReady ? eyeBoxes : []}
              blinking={cameraReady ? blinking : false}
              style={{ width: '100%', height: '100%', borderRadius: 18 }}
            />
          ) : (
            <div className="entrance-a__camera-placeholder entrance-a__camera-placeholder--eye">
              <p>{error ? 'Camera unavailable' : 'Camera access required'}</p>
              <small>{error || 'Allow camera access to continue.'}</small>
              {(error || permission === 'denied') && (
                <Button variant="primary" onClick={handleConfirmCamera} fullWidth>
                  Try again
                </Button>
              )}
            </div>
          )
        ) : (
          <div className="entrance-a__iris" aria-hidden>
            <span />
          </div>
        )}
      </div>

      {calibrationStarted && permission === 'granted' && !cameraReady && (
        <div className="entrance-a__camera-confirm-preview">
          <CameraSourceSelect devices={devices} deviceId={deviceId} onChange={handleCameraSelect} />
          <Button variant="primary" onClick={handleConfirmCamera} fullWidth>
            Confirm camera
          </Button>
        </div>
      )}

      {/* Leaderboard sidebar — visible after menu reveals */}
      {menuRevealed && (
        <div className="entrance-a__sidebar">
          <div className="entrance-a__sidebar-section">
            <p className="entrance-a__sidebar-title">MULTIPLAYER · LONGEST HOLD</p>
            {mpLeaderboard.length === 0 ? (
              <p className="entrance-a__sidebar-empty">No records yet</p>
            ) : mpLeaderboard.map((row, i) => (
              <div className="entrance-a__sidebar-row" key={row.handle}>
                <span>{i + 1}</span>
                <strong>{row.handle}</strong>
                <em>{row.bestHold > 0 ? formatMs(row.bestHold) : '—'}</em>
              </div>
            ))}
          </div>

          <div className="entrance-a__sidebar-section entrance-a__sidebar-section--solo">
            <p className="entrance-a__sidebar-title">SOLO · YOUR BEST</p>
            <div className="entrance-a__sidebar-row entrance-a__sidebar-row--you">
              <span>★</span>
              <strong>{playerName}</strong>
              <em>{practiceBest > 0 ? formatMs(practiceBest) : '—'}</em>
            </div>
            {stats.bestHold > 0 && (
              <div className="entrance-a__sidebar-row">
                <span>MP</span>
                <strong>Best match</strong>
                <em>{formatMs(stats.bestHold)}</em>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={`entrance-a__actions${!calibrationStarted ? ' entrance-a__actions--initial' : ''}${menuRevealed ? ' entrance-a__actions--menu' : ''}`}>
        {!calibrationStarted ? (
          <button
            className="entrance-a__open-pill"
            type="button"
            onClick={() => {
              setOpeningBlink(true)
              setTimeout(() => {
                setCalibrationStarted(true)
                setOpeningBlink(false)
              }, 260)
            }}
          >
            <strong>Open your eye</strong>
            <span>Camera access required</span>
          </button>
        ) : !cameraReady || !menuRevealed ? null : (
          <div className="entrance-a__menu">
            <button
              className={`entrance-a__menu-item entrance-a__menu-item--primary${selectedAction === 'random' ? ' entrance-a__menu-item--selected' : ''}`}
              onClick={() => triggerMenuAction('random', onFindOpponent)}
              disabled={!canPlay || Boolean(selectedAction)}
            >
              <span>◎</span>
              <strong>Random opponent</strong>
              <small>Match me with anyone online · est. &lt; 10s</small>
              <em>↗</em>
            </button>
            <button
              className={`entrance-a__menu-item${selectedAction === 'invite' ? ' entrance-a__menu-item--selected' : ''}`}
              type="button"
              onClick={() => triggerMenuAction('invite', onCreateInvite)}
              disabled={!canPlay || Boolean(selectedAction)}
            >
              <span>◐</span>
              <strong>Invite a friend</strong>
              <small>Share a private match link</small>
              <em>↗</em>
            </button>
            <button
              className={`entrance-a__menu-item${selectedAction === 'practice' ? ' entrance-a__menu-item--selected' : ''}`}
              type="button"
              onClick={() => triggerMenuAction('practice', onStartPractice)}
              disabled={!canPlay || Boolean(selectedAction)}
            >
              <span>◯</span>
              <strong>Practice mode</strong>
              <small>Solo staring challenge · no opponent</small>
              <em>↗</em>
            </button>
          </div>
        )}
      </div>

      {permission !== 'granted' && (
        <div className="entrance-a__bottom-strip">
          <div>TODAY · TOP STREAKS</div>
          <span><strong>1</strong> StareGod <em>47w</em></span>
          <span>·</span>
          <span><strong>2</strong> NoBlink99 <em>31w</em></span>
          <span>·</span>
          <span><strong>3</strong> IronEyes <em>28w</em></span>
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
      )}
    </div>
  )
}

function CameraSourceSelect({ devices, deviceId, onChange }) {
  if (!devices.length) return null
  const selectedDeviceId = deviceId || devices[0]?.deviceId || ''
  return (
    <label className="camera-source">
      <span>Camera source</span>
      <select value={selectedDeviceId} onChange={e => onChange(e.target.value)}>
        {devices.map((device, index) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label || `Camera ${index + 1}`}
          </option>
        ))}
      </select>
    </label>
  )
}

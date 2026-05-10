import Button from '../ui/Button.jsx'
import StatusPill from '../ui/StatusPill.jsx'
import CameraPreview from '../camera/CameraPreview.jsx'
import EARBar from '../camera/EARBar.jsx'

export default function Lobby({
  playerName,
  stats,
  camera,
  blink,
  connected,
  onFindOpponent,
}) {
  const { attachRef, stream, permission, error, requestCamera } = camera
  const { ear, faceDetected, loading } = blink

  const canPlay = connected && permission === 'granted' && faceDetected

  return (
    <div className="lobby">
      {/* Hero column */}
      <div className="lobby__hero">
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
            Multiplayer · Browser · Real-time
          </p>
          <h1 className="lobby__tagline">
            Don't blink.<br /><span>Or lose.</span>
          </h1>
        </div>

        <div className="lobby__stats">
          {[
            { label: 'Wins',    value: stats.wins    },
            { label: 'Streak',  value: stats.streak  },
            { label: 'Best',    value: stats.bestHold ? `${(stats.bestHold / 1000).toFixed(1)}s` : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="stat-chip">
              <div className="stat-chip__label">{label}</div>
              <div className="stat-chip__value">{value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', maxWidth: 280 }}>
          <Button
            variant="primary"
            size="lg"
            onClick={onFindOpponent}
            disabled={!canPlay}
            fullWidth
          >
            Find Opponent
          </Button>

          {!connected && (
            <p style={{ fontSize: 12, color: 'var(--accent-amber)' }}>
              Connecting to server…
            </p>
          )}
          {connected && permission !== 'granted' && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Camera access required to play.
            </p>
          )}
          {connected && permission === 'granted' && !faceDetected && !loading && (
            <p style={{ fontSize: 12, color: 'var(--accent-amber)' }}>
              No face detected — position yourself in frame.
            </p>
          )}
        </div>
      </div>

      {/* Sidebar: camera + status */}
      <div className="lobby__sidebar">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Camera
          </span>
          {faceDetected
            ? <StatusPill variant="ok">Face detected</StatusPill>
            : <StatusPill variant="queue" pulse>Searching…</StatusPill>}
        </div>

        {permission === 'granted' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            <CameraPreview
              attachRef={attachRef}
              faceDetected={faceDetected}
              loading={loading}
              style={{ height: 240, borderRadius: 'var(--radius-lg)' }}
            />
            <EARBar ear={ear} />
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              EAR threshold: 0.20 · Target: 30 fps
            </p>
          </div>
        ) : permission === 'denied' ? (
          <div className="camera-denied">
            <div className="camera-denied__icon" aria-hidden>📷</div>
            <div className="camera-denied__title">Camera access blocked</div>
            <div className="camera-denied__body">
              Click the camera icon in your browser's address bar and allow access, then refresh.
            </div>
          </div>
        ) : (
          <div className="camera-denied">
            <div className="camera-denied__icon" aria-hidden>🎥</div>
            <div className="camera-denied__title">Camera required</div>
            <div className="camera-denied__body">
              BlinkOut needs your camera to detect blinks. No video leaves your device.
            </div>
            <Button variant="primary" onClick={requestCamera}>Allow Camera</Button>
          </div>
        )}

        <div className="card" style={{ padding: 'var(--sp-4)' }}>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            Playing as
          </p>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
            {playerName}
          </p>
        </div>
      </div>
    </div>
  )
}

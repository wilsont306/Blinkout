import { useEffect } from 'react'

export default function CameraPreview({
  videoRef,
  attachRef,
  faceDetected,
  loading,
  mirrored = true,
  style,
}) {
  // Corner brackets signal that CV tracking is active
  const bracketColor = faceDetected ? 'var(--accent-green)' : 'var(--accent-violet)'

  return (
    <div
      className={`camera-window${faceDetected ? ' camera-window--active' : ''}`}
      style={style}
      role="img"
      aria-label="Camera feed"
    >
      <video
        ref={attachRef || videoRef}
        autoPlay
        playsInline
        muted
        style={{ transform: mirrored ? 'scaleX(-1)' : 'none' }}
      />

      {/* Corner tracking brackets */}
      {['tl', 'tr', 'bl', 'br'].map(pos => (
        <span
          key={pos}
          className={`corner-bracket corner-bracket--${pos}`}
          style={{ borderColor: bracketColor }}
          aria-hidden
        />
      ))}

      {/* Face-detected indicator */}
      <div
        style={{
          position: 'absolute', top: 10, right: 10,
          width: 8, height: 8, borderRadius: '50%',
          background: faceDetected ? 'var(--accent-green)' : 'var(--border-emphasis)',
          transition: 'background 300ms',
        }}
        aria-hidden
      />

      {loading && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(15,14,13,0.7)',
          fontSize: 12, color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
        }}>
          Loading CV…
        </div>
      )}
    </div>
  )
}

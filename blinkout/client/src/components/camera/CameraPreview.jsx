import { useEffect, useRef } from 'react'

export default function CameraPreview({
  attachRef,
  videoEl,
  faceDetected,
  loading,
  mirrored = true,
  style,
  eyeBoxes,
  blinking,
}) {
  const canvasRef = useRef(null)
  const bracketColor = faceDetected ? 'var(--accent-green)' : 'var(--accent-violet)'

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const W = canvas.offsetWidth
    const H = canvas.offsetHeight
    if (!W || !H) return

    canvas.width = W
    canvas.height = H

    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, W, H)

    if (!eyeBoxes?.length) return

    const videoWidth = videoEl?.videoWidth || W
    const videoHeight = videoEl?.videoHeight || H
    const scale = Math.max(W / videoWidth, H / videoHeight)
    const drawnWidth = videoWidth * scale
    const drawnHeight = videoHeight * scale
    const offsetX = (W - drawnWidth) / 2
    const offsetY = (H - drawnHeight) / 2

    ctx.strokeStyle = blinking ? '#ef4444' : '#a78bfa'
    ctx.lineWidth = 1.5
    ctx.shadowColor = blinking ? '#ef4444' : '#a78bfa'
    ctx.shadowBlur = 6

    for (const box of eyeBoxes) {
      const w = box.w * drawnWidth
      const h = box.h * drawnHeight
      const sourceX = box.x * drawnWidth + offsetX
      const x = mirrored ? W - sourceX - w : sourceX
      const y = box.y * drawnHeight + offsetY
      ctx.strokeRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
    }
  }, [eyeBoxes, blinking, mirrored, videoEl])

  return (
    <div
      className={`camera-window${faceDetected ? ' camera-window--active' : ''}`}
      style={style}
      role="img"
      aria-label="Camera feed"
    >
      <video
        ref={attachRef}
        autoPlay
        playsInline
        muted
        style={{ transform: mirrored ? 'scaleX(-1)' : 'none' }}
      />

      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />

      {['tl', 'tr', 'bl', 'br'].map(pos => (
        <span
          key={pos}
          className={`corner-bracket corner-bracket--${pos}`}
          style={{ borderColor: bracketColor }}
          aria-hidden
        />
      ))}

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

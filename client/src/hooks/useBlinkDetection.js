import { useState, useEffect, useRef, useCallback } from 'react'
import { computeEAR } from '../lib/earDetection.js'

const BLINK_THRESHOLD  = 0.20
const BLINK_FRAMES     = 2   // must persist for ~66 ms at 30 fps
const FACE_STABLE_MS   = 500 // face must be present this long before match starts

export function useBlinkDetection({ videoRef, enabled = false, onBlink, onEARUpdate }) {
  const [ear, setEAR]               = useState(0.3)
  const [faceDetected, setFaceDetected] = useState(false)
  const [loading, setLoading]       = useState(true)
  const [warning, setWarning]       = useState(null) // null | 'no-face' | 'low-light' | 'angle'

  const rafRef        = useRef(null)
  const blinkCountRef = useRef(0)
  const blinkFiredRef = useRef(false)
  const faceSinceRef  = useRef(null)
  const enabledRef    = useRef(enabled)

  useEffect(() => { enabledRef.current = enabled }, [enabled])

  useEffect(() => {
    const video = videoRef?.current
    if (!video) return

    let cancelled = false
    let faceMesh = null

    async function init() {
      // Dynamic import avoids bundling WASM; locateFile points to CDN binaries
      const { FaceMesh } = await import('@mediapipe/face_mesh')
      if (cancelled) return

      faceMesh = new FaceMesh({
        locateFile: file =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`,
      })

      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.85,
        minTrackingConfidence: 0.5,
      })

      faceMesh.onResults(results => {
        if (cancelled) return

        if (!results.multiFaceLandmarks?.length) {
          setFaceDetected(false)
          faceSinceRef.current = null
          blinkCountRef.current = 0
          blinkFiredRef.current = false
          setWarning('no-face')
          return
        }

        setWarning(null)
        setFaceDetected(true)
        if (!faceSinceRef.current) faceSinceRef.current = Date.now()

        const landmarks = results.multiFaceLandmarks[0]
        const currentEAR = computeEAR(landmarks)
        setEAR(currentEAR)

        if (!enabledRef.current) return

        const faceStable = Date.now() - faceSinceRef.current >= FACE_STABLE_MS
        if (!faceStable) return

        onEARUpdate?.(currentEAR)

        if (currentEAR < BLINK_THRESHOLD) {
          blinkCountRef.current++
        } else {
          blinkCountRef.current = 0
          blinkFiredRef.current = false
        }

        if (blinkCountRef.current >= BLINK_FRAMES && !blinkFiredRef.current) {
          blinkFiredRef.current = true
          onBlink?.()
        }
      })

      setLoading(false)

      async function loop() {
        if (cancelled) return
        if (video.readyState >= 2) {
          try { await faceMesh.send({ image: video }) } catch { /* frame skip ok */ }
        }
        rafRef.current = requestAnimationFrame(loop)
      }
      loop()
    }

    init().catch(console.error)

    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      faceMesh?.close()
    }
  }, [videoRef?.current]) // re-init if video element changes

  const resetBlink = useCallback(() => {
    blinkCountRef.current = 0
    blinkFiredRef.current = false
  }, [])

  return { ear, faceDetected, loading, warning, resetBlink }
}

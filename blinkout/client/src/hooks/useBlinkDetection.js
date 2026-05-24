import { useState, useEffect, useRef, useCallback } from 'react'
import { averagePixelLuminance, computeEAR, computeEyeBoxes } from '../lib/earDetection.js'

const BLINK_THRESHOLD              = 0.20
const OCCLUDED_LUMINANCE_THRESHOLD = 55
const BAD_LIGHTING_LUMINANCE_THRESHOLD  = 42
const BAD_LIGHTING_DARK_RATIO_THRESHOLD = 0.72
const GLARE_LUMINANCE_THRESHOLD    = 218
const GLARE_PIXEL_RATIO_THRESHOLD  = 0.20
const BLINK_FRAMES                 = 2
const FACE_STABLE_MS               = 500
// Velocity gate: EAR must drop this fast (per frame) to enter blink state
const BLINK_VELOCITY_THRESHOLD     = 0.018
// Adaptive baseline: EAR must also drop this far below personal open-eye average
const OPEN_EAR_DROP_REQUIRED       = 0.055
const OPEN_EAR_UPDATE_ALPHA        = 0.10
// Liveness: iris relative to nose must show this much variance over N frames
const LIVENESS_BUFFER_SIZE         = 55
const LIVENESS_VARIANCE_THRESHOLD  = 2e-7
let faceMeshScriptPromise = null

async function loadFaceMeshScript() {
  if (window.FaceMesh) return
  if (faceMeshScriptPromise) return faceMeshScriptPromise

  faceMeshScriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = '/mediapipe/face_mesh.js'
    s.onload = resolve
    s.onerror = (err) => {
      faceMeshScriptPromise = null
      reject(err)
    }
    document.head.appendChild(s)
  })
  return faceMeshScriptPromise
}

// MediaPipe is not designed to be instantiated repeatedly — keep one instance for the page lifetime
let faceMeshSingleton = null
let activeRunId = 0

export function useBlinkDetection({ videoEl, enabled = false, onBlink }) {
  const [ear, setEAR]               = useState(0.3)
  const [faceDetected, setFaceDetected] = useState(false)
  const [loading, setLoading]       = useState(true)
  const [warning, setWarning]       = useState(null)
  const [eyeBoxes, setEyeBoxes]     = useState(null)
  const [blinking, setBlinking]     = useState(false)

  const rafRef        = useRef(null)
  const blinkCountRef = useRef(0)
  const blinkFiredRef = useRef(false)
  const faceSinceRef  = useRef(null)
  const hadStableFaceRef = useRef(false)
  const sampleCanvasRef = useRef(null)
  const lightingCanvasRef = useRef(null)
  const enabledRef    = useRef(enabled)
  const onBlinkRef    = useRef(onBlink)
  const cancelledRef  = useRef(false)
  // Cheekbone/smile fix: adaptive open-eye baseline + velocity gate
  const openEARRef      = useRef(0.3)
  const prevEARRef      = useRef(0.3)
  const blinkEnteredRef = useRef(false)
  // Liveness: rolling buffer of iris-relative-to-nose positions
  const irisBufferRef   = useRef([])

  useEffect(() => { enabledRef.current = enabled }, [enabled])
  useEffect(() => { onBlinkRef.current = onBlink }, [onBlink])

  const registerBlinkFrame = useCallback(() => {
    blinkCountRef.current++
    if (enabledRef.current && blinkCountRef.current >= BLINK_FRAMES && !blinkFiredRef.current) {
      blinkFiredRef.current = true
      onBlinkRef.current?.()
    }
  }, [])

  const registerOpenFrame = useCallback(() => {
    blinkCountRef.current = 0
    blinkFiredRef.current = false
  }, [])

  useEffect(() => {
    if (!videoEl) return

    cancelledRef.current = false
    const runId = ++activeRunId

    async function init() {
      try {
        await loadFaceMeshScript()
      } catch (err) {
        if (!cancelledRef.current && runId === activeRunId) {
          setWarning('cv-error')
          setLoading(false)
          console.error('Failed to load MediaPipe FaceMesh script', err)
        }
        return
      }
      if (cancelledRef.current || runId !== activeRunId) return

      if (!faceMeshSingleton) {
        faceMeshSingleton = new window.FaceMesh({
          locateFile: file => `/mediapipe/${file}`,
        })
        faceMeshSingleton.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.55,
          minTrackingConfidence: 0.5,
        })
      }

      faceMeshSingleton.onResults(results => {
        if (cancelledRef.current || runId !== activeRunId) return
        const lightingStats = sampleFrameLightingStats(videoEl, lightingCanvasRef)
        const lightingIssue = getLightingIssue(lightingStats)

        if (!results.multiFaceLandmarks?.length) {
          setFaceDetected(false)
          setEyeBoxes(null)
          irisBufferRef.current = []
          if (lightingIssue) {
            setEAR(0)
            setBlinking(false)
            setWarning(lightingIssue)
            registerOpenFrame()
          } else if (hadStableFaceRef.current) {
            setEAR(0)
            setBlinking(true)
            setWarning('covered')
            registerBlinkFrame()
          } else {
            setBlinking(false)
            registerOpenFrame()
            setWarning('no-face')
          }
          return
        }

        setWarning(null)
        setFaceDetected(true)
        if (!faceSinceRef.current) faceSinceRef.current = Date.now()

        const landmarks = results.multiFaceLandmarks[0]
        const currentEAR = computeEAR(landmarks)
        const currentEyeBoxes = computeEyeBoxes(landmarks)
        const faceStable = Date.now() - faceSinceRef.current >= FACE_STABLE_MS
        if (faceStable) hadStableFaceRef.current = true

        // Adaptive open-eye baseline (EMA of EAR when eyes are clearly open)
        if (currentEAR > BLINK_THRESHOLD + 0.02) {
          openEARRef.current = openEARRef.current * (1 - OPEN_EAR_UPDATE_ALPHA) + currentEAR * OPEN_EAR_UPDATE_ALPHA
        }

        // Velocity gate: only enter blink state on a fast EAR drop
        const earDrop = prevEARRef.current - currentEAR
        prevEARRef.current = currentEAR
        if (currentEAR < BLINK_THRESHOLD) {
          if (earDrop >= BLINK_VELOCITY_THRESHOLD) blinkEnteredRef.current = true
        } else {
          blinkEnteredRef.current = false
        }

        // Liveness check: static image (photo/screen) has near-zero iris-relative-to-nose variance
        if (landmarks[468] && landmarks[473] && landmarks[4]) {
          const nose = landmarks[4]
          irisBufferRef.current.push({
            lx: landmarks[468].x - nose.x, ly: landmarks[468].y - nose.y,
            rx: landmarks[473].x - nose.x, ry: landmarks[473].y - nose.y,
          })
          if (irisBufferRef.current.length > LIVENESS_BUFFER_SIZE) irisBufferRef.current.shift()
          if (
            irisBufferRef.current.length >= LIVENESS_BUFFER_SIZE &&
            computeIrisVariance(irisBufferRef.current) < LIVENESS_VARIANCE_THRESHOLD
          ) {
            irisBufferRef.current = []
            setFaceDetected(false)
            setWarning('photo-face')
            registerOpenFrame()
            return
          }
        }

        const eyeLuminances = sampleEyeLuminances(videoEl, currentEyeBoxes, sampleCanvasRef) ?? []
        const coveredEyeCount = eyeLuminances.filter(value => value < OCCLUDED_LUMINANCE_THRESHOLD).length
        const bothEyesCovered = eyeLuminances.length >= 2 && coveredEyeCount >= 2
        const badLighting = lightingIssue === 'bad-lighting'
        const coveredStrike = bothEyesCovered && !badLighting
        // Require: EAR below threshold AND entered via fast drop AND dropped from personal baseline
        const isBlinkingByEAR = currentEAR < BLINK_THRESHOLD &&
          blinkEnteredRef.current &&
          currentEAR < openEARRef.current - OPEN_EAR_DROP_REQUIRED
        const isBlinking = isBlinkingByEAR || coveredStrike

        setEAR(coveredStrike ? 0 : currentEAR)
        setEyeBoxes(currentEyeBoxes)
        setBlinking(isBlinking)

        if (lightingIssue) {
          setWarning(lightingIssue)
        } else if (bothEyesCovered) {
          setWarning('covered')
        }

        if (!faceStable) return

        if (isBlinking) {
          registerBlinkFrame()
        } else {
          registerOpenFrame()
        }
      })

      setLoading(false)

      async function loop() {
        if (cancelledRef.current || runId !== activeRunId) return
        if (videoEl.readyState >= 2 && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
          try {
            await faceMeshSingleton.send({ image: videoEl })
          } catch (err) {
            if (!cancelledRef.current && runId === activeRunId) {
              setWarning('cv-error')
              console.error('MediaPipe FaceMesh failed to process a frame', err)
            }
          }
        }
        rafRef.current = requestAnimationFrame(loop)
      }
      loop()
    }

    init().catch(console.error)

    return () => {
      cancelledRef.current = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      // Do NOT close faceMeshSingleton — MediaPipe cannot be re-initialized after close()
    }
  }, [registerBlinkFrame, registerOpenFrame, videoEl])

  const resetBlink = useCallback(() => {
    blinkCountRef.current = 0
    blinkFiredRef.current = false
  }, [])

  return { ear, faceDetected, loading, warning, resetBlink, eyeBoxes, blinking }
}

function sampleEyeLuminances(videoEl, eyeBoxes, canvasRef) {
  if (!videoEl.videoWidth || !videoEl.videoHeight || !eyeBoxes?.length) return []

  const canvas = canvasRef.current ?? document.createElement('canvas')
  canvasRef.current = canvas
  canvas.width = 24
  canvas.height = 12

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  const samples = []

  for (const box of eyeBoxes) {
    const sx = Math.max(0, Math.round(box.x * videoEl.videoWidth))
    const sy = Math.max(0, Math.round(box.y * videoEl.videoHeight))
    const sw = Math.min(videoEl.videoWidth - sx, Math.round(box.w * videoEl.videoWidth))
    const sh = Math.min(videoEl.videoHeight - sy, Math.round(box.h * videoEl.videoHeight))
    if (sw <= 0 || sh <= 0) continue

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    samples.push(averagePixelLuminance(ctx.getImageData(0, 0, canvas.width, canvas.height)))
  }

  return samples
}

function sampleFrameLightingStats(videoEl, canvasRef) {
  if (!videoEl.videoWidth || !videoEl.videoHeight) return null

  const canvas = canvasRef.current ?? document.createElement('canvas')
  canvasRef.current = canvas
  canvas.width = 32
  canvas.height = 18

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = imageData
  let sum = 0
  let dark = 0
  let bright = 0
  const count = data.length / 4

  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    sum += lum
    if (lum < 32) dark++
    if (lum > 238) bright++
  }

  return {
    average: sum / count,
    darkRatio: dark / count,
    brightRatio: bright / count,
  }
}

function computeIrisVariance(buf) {
  const n = buf.length
  const lxM = buf.reduce((s, p) => s + p.lx, 0) / n
  const lyM = buf.reduce((s, p) => s + p.ly, 0) / n
  const rxM = buf.reduce((s, p) => s + p.rx, 0) / n
  const ryM = buf.reduce((s, p) => s + p.ry, 0) / n
  return buf.reduce((s, p) =>
    s + (p.lx - lxM) ** 2 + (p.ly - lyM) ** 2 + (p.rx - rxM) ** 2 + (p.ry - ryM) ** 2
  , 0) / (n * 4)
}

function getLightingIssue(stats) {
  if (!stats) return null
  if (
    stats.average < BAD_LIGHTING_LUMINANCE_THRESHOLD ||
    stats.darkRatio > BAD_LIGHTING_DARK_RATIO_THRESHOLD
  ) {
    return 'bad-lighting'
  }
  if (
    stats.average > GLARE_LUMINANCE_THRESHOLD ||
    stats.brightRatio > GLARE_PIXEL_RATIO_THRESHOLD
  ) {
    return 'bad-glare'
  }
  return null
}

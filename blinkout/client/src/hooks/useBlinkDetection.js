import { useState, useEffect, useRef, useCallback } from 'react'
import { averagePixelLuminance, computeEAR, computeEyeBoxes } from '../lib/earDetection.js'

const BLINK_THRESHOLD = 0.20
const OCCLUDED_LUMINANCE_THRESHOLD = 55
const BAD_LIGHTING_LUMINANCE_THRESHOLD = 42
const BAD_LIGHTING_DARK_RATIO_THRESHOLD = 0.72
const GLARE_LUMINANCE_THRESHOLD = 218
const GLARE_PIXEL_RATIO_THRESHOLD = 0.20
const BLINK_FRAMES    = 2
const FACE_STABLE_MS  = 500
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
  // Stable ref checked by the singleton's onResults — avoids re-registering on every videoEl change
  const cancelledRef  = useRef(false)

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
        const eyeLuminances = sampleEyeLuminances(videoEl, currentEyeBoxes, sampleCanvasRef) ?? []
        const coveredEyeCount = eyeLuminances.filter(value => value < OCCLUDED_LUMINANCE_THRESHOLD).length
        const bothEyesCovered = eyeLuminances.length >= 2 && coveredEyeCount >= 2
        const badLighting = lightingIssue === 'bad-lighting'
        const coveredStrike = bothEyesCovered && !badLighting
        const isBlinking = currentEAR < BLINK_THRESHOLD || coveredStrike

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

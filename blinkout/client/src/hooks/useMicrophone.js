import { useState, useEffect, useRef, useCallback } from 'react'

export function useMicrophone() {
  const [permission, setPermission] = useState('prompt') // 'prompt' | 'granted' | 'denied'
  const [audioLevel, setAudioLevel] = useState(0)        // 0–1 normalized RMS
  const [isMuted, setIsMuted]       = useState(false)
  const [error, setError]           = useState(null)

  const streamRef   = useRef(null)
  const ctxRef      = useRef(null)
  const analyserRef = useRef(null)
  const rafRef      = useRef(null)

  function startLevelMeter(analyser) {
    const data = new Uint8Array(analyser.frequencyBinCount)
    function tick() {
      analyser.getByteFrequencyData(data)
      const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length) / 255
      setAudioLevel(rms)
      rafRef.current = requestAnimationFrame(tick)
    }
    tick()
  }

  const requestMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream

      const ctx      = new AudioContext()
      const source   = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize               = 256
      analyser.smoothingTimeConstant = 0.75
      source.connect(analyser)

      ctxRef.current      = ctx
      analyserRef.current = analyser

      setPermission('granted')
      setError(null)
      startLevelMeter(analyser)
    } catch (err) {
      setError(err.message)
      setPermission('denied')
    }
  }, [])

  const stopMic = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    ctxRef.current?.close()
    streamRef.current  = null
    ctxRef.current     = null
    analyserRef.current = null
    setAudioLevel(0)
  }, [])

  const toggleMute = useCallback(() => {
    const stream = streamRef.current
    if (!stream) return
    const enabled = !stream.getAudioTracks()[0]?.enabled
    stream.getAudioTracks().forEach(t => { t.enabled = enabled })
    setIsMuted(!enabled)
  }, [])

  // Stop tracks on unmount
  useEffect(() => () => stopMic(), [stopMic])

  return {
    permission,
    audioLevel,        // 0–1 float, ~20 fps updates
    isMuted,
    error,
    stream: streamRef, // ref to MediaStream (for WebRTC addTrack)
    requestMic,
    stopMic,
    toggleMute,
  }
}

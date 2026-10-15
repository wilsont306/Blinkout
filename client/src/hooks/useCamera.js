import { useState, useEffect, useRef, useCallback } from 'react'

export function useCamera() {
  const videoRef = useRef(null)
  const [videoEl, setVideoEl] = useState(null)
  const [stream, setStream] = useState(null)
  const streamRef = useRef(null)
  const [permission, setPermission] = useState('prompt') // 'prompt' | 'granted' | 'denied'
  const [error, setError] = useState(null)
  const [devices, setDevices] = useState([])
  const [deviceId, setDeviceId] = useState('')

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    const allDevices = await navigator.mediaDevices.enumerateDevices()
    setDevices(allDevices.filter(device => device.kind === 'videoinput'))
  }, [])

  const requestCamera = useCallback(async (nextDeviceId = deviceId) => {
    const preferredDeviceId = nextDeviceId || deviceId || devices[0]?.deviceId || ''

    const getStream = (selectedDeviceId) => navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        ...(selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId } }
          : { facingMode: 'user' }),
      },
      audio: false,
    })

    try {
      let s
      try {
        s = await getStream(preferredDeviceId)
      } catch (err) {
        if (!preferredDeviceId || err.name === 'NotAllowedError' || err.name === 'SecurityError') throw err
        s = await getStream('')
      }

      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = s
      setStream(s)
      setPermission('granted')
      setError(null)
      await refreshDevices()

      const [track] = s.getVideoTracks()
      const activeDeviceId = track?.getSettings?.().deviceId
      if (activeDeviceId) setDeviceId(activeDeviceId)
      return true
    } catch (err) {
      setError(err.message)
      setPermission(err.name === 'NotAllowedError' || err.name === 'SecurityError' ? 'denied' : 'prompt')
      return false
    }
  }, [deviceId, devices, refreshDevices])

  // Keep streamRef in sync and attach to video when stream changes
  useEffect(() => {
    streamRef.current = stream
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  // Stable callback ref — never changes identity, so React won't re-invoke it on re-renders
  const attachRef = useCallback((el) => {
    videoRef.current = el
    setVideoEl(el)
    if (el && streamRef.current) el.srcObject = streamRef.current
  }, [])

  useEffect(() => {
    return () => stream?.getTracks().forEach(t => t.stop())
  }, [stream])

  useEffect(() => {
    refreshDevices().catch(() => {})
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices)
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refreshDevices)
  }, [refreshDevices])

  const selectCamera = useCallback((nextDeviceId) => {
    setDeviceId(nextDeviceId)
    requestCamera(nextDeviceId)
  }, [requestCamera])

  return {
    videoRef,
    videoEl,
    attachRef,
    stream,
    permission,
    error,
    devices,
    deviceId,
    requestCamera,
    selectCamera,
  }
}

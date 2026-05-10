import { useState, useEffect, useRef } from 'react'

export function useCamera() {
  const videoRef = useRef(null)
  const [stream, setStream] = useState(null)
  const [permission, setPermission] = useState('prompt') // 'prompt' | 'granted' | 'denied'
  const [error, setError] = useState(null)

  async function requestCamera() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      })
      setStream(s)
      setPermission('granted')
      setError(null)
    } catch (err) {
      setError(err.message)
      setPermission('denied')
    }
  }

  // Attach stream to video element whenever either changes
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  // Attach when videoRef mounts after stream is already set
  function attachRef(el) {
    videoRef.current = el
    if (el && stream) el.srcObject = stream
  }

  useEffect(() => {
    return () => stream?.getTracks().forEach(t => t.stop())
  }, [stream])

  return { videoRef, attachRef, stream, permission, error, requestCamera }
}

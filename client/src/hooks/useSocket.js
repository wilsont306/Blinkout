import { useState, useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

export function useSocket({ onMatchFound, onBlinkDetected, onMatchEnd }) {
  const socketRef = useRef(null)
  const [connected, setConnected] = useState(false)

  // Keep callbacks in refs so socket listeners never need to re-subscribe
  const cbRefs = useRef({ onMatchFound, onBlinkDetected, onMatchEnd })
  useEffect(() => { cbRefs.current = { onMatchFound, onBlinkDetected, onMatchEnd } }, [onMatchFound, onBlinkDetected, onMatchEnd])

  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ['websocket'] })
    socketRef.current = socket

    socket.on('connect',    () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    socket.on('MATCH_FOUND',     data => cbRefs.current.onMatchFound?.(data))
    socket.on('BLINK_DETECTED',  data => cbRefs.current.onBlinkDetected?.(data))
    socket.on('MATCH_END',       data => cbRefs.current.onMatchEnd?.(data))

    return () => socket.disconnect()
  }, [])

  const joinQueue = useCallback((displayName) => {
    socketRef.current?.emit('QUEUE_JOIN', { displayName })
  }, [])

  const sendEAR = useCallback((matchId, ear) => {
    socketRef.current?.emit('EAR_UPDATE', { matchId, ear, timestamp: Date.now() })
  }, [])

  const forfeit = useCallback((matchId, reason = 'user') => {
    socketRef.current?.emit('FORFEIT', { matchId, reason })
  }, [])

  return { connected, joinQueue, sendEAR, forfeit }
}

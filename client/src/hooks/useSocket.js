import { useState, useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

export function useSocket({
  onMatchFound,
  onBlinkDetected,
  onMatchStrike,
  onMatchEnd,
  onOpponentEAR,
  onOpponentVideoFrame,
  onRematchRequested,
  onRematchDeclined,
}) {
  const socketRef = useRef(null)
  const [connected, setConnected] = useState(false)

  const cbRefs = useRef({
    onMatchFound, onBlinkDetected, onMatchStrike, onMatchEnd,
    onOpponentEAR, onOpponentVideoFrame, onRematchRequested, onRematchDeclined,
  })
  useEffect(() => {
    cbRefs.current = {
      onMatchFound, onBlinkDetected, onMatchStrike, onMatchEnd,
      onOpponentEAR, onOpponentVideoFrame, onRematchRequested, onRematchDeclined,
    }
  }, [onMatchFound, onBlinkDetected, onMatchStrike, onMatchEnd, onOpponentEAR, onOpponentVideoFrame, onRematchRequested, onRematchDeclined])

  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ['websocket'] })
    socketRef.current = socket

    socket.on('connect',    () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    socket.on('MATCH_FOUND',          data => cbRefs.current.onMatchFound?.(data))
    socket.on('BLINK_DETECTED',       data => cbRefs.current.onBlinkDetected?.(data))
    socket.on('MATCH_STRIKE',         data => cbRefs.current.onMatchStrike?.(data))
    socket.on('MATCH_END',            data => cbRefs.current.onMatchEnd?.(data))
    socket.on('OPPONENT_EAR',         data => cbRefs.current.onOpponentEAR?.(data))
    socket.on('OPPONENT_VIDEO_FRAME', data => cbRefs.current.onOpponentVideoFrame?.(data))
    socket.on('REMATCH_REQUESTED',    data => cbRefs.current.onRematchRequested?.(data))
    socket.on('REMATCH_DECLINED',     data => cbRefs.current.onRematchDeclined?.(data))

    return () => socket.disconnect()
  }, [])

  const joinQueue = useCallback((displayName) => {
    socketRef.current?.emit('QUEUE_JOIN', { displayName })
  }, [])

  const sendEAR = useCallback((matchId, ear, meta = {}) => {
    socketRef.current?.emit('EAR_UPDATE', { matchId, ear, timestamp: Date.now(), ...meta })
  }, [])

  const sendVideoFrame = useCallback((matchId, frame) => {
    socketRef.current?.volatile.emit('VIDEO_FRAME', { matchId, frame })
  }, [])

  const forfeit = useCallback((matchId, reason = 'user') => {
    socketRef.current?.emit('FORFEIT', { matchId, reason })
  }, [])

  const requestRematch = useCallback((matchId) => {
    socketRef.current?.emit('REMATCH_REQUEST', { matchId })
  }, [])

  const cancelRematch = useCallback((matchId) => {
    socketRef.current?.emit('REMATCH_CANCEL', { matchId })
  }, [])

  return { connected, joinQueue, sendEAR, sendVideoFrame, forfeit, requestRematch, cancelRematch }
}

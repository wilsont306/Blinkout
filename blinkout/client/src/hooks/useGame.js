import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'

function getClientId() {
  let id = localStorage.getItem('blinkout_client_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('blinkout_client_id', id)
  }
  return id
}

export const CLIENT_ID = getClientId()

function removeChannel(ref) {
  if (ref.current) {
    supabase.removeChannel(ref.current)
    ref.current = null
  }
}

export function useGame({
  onMatchFound,
  onMatchEnd,
  onOpponentEAR,
  onOpponentVideoFrame,
  onRematchRequested,
  onRematchDeclined,
}) {
  const [connected, setConnected] = useState(false)

  const gameChRef    = useRef(null)
  const queueChRef   = useRef(null)
  const matchDataRef = useRef(null)
  const myRematch    = useRef(false)
  const oppRematch   = useRef(false)

  // Always-current callback refs — never stale
  const cb = useRef({})
  useEffect(() => {
    cb.current = { onMatchFound, onMatchEnd, onOpponentEAR, onOpponentVideoFrame, onRematchRequested, onRematchDeclined }
  })

  // Connection health via a heartbeat channel
  useEffect(() => {
    const ch = supabase.channel('_hb')
    ch.subscribe(s => setConnected(s === 'SUBSCRIBED'))
    return () => { supabase.removeChannel(ch) }
  }, [])

  // ── Game channel setup ────────────────────────────────────────
  const setupGameChannel = useCallback((matchId, opponentHandle, opponentId) => {
    removeChannel(gameChRef)
    myRematch.current  = false
    oppRematch.current = false

    const ch = supabase.channel(`game:${matchId}`, {
      config: { broadcast: { self: false } },
    })

    ch
      .on('broadcast', { event: 'EAR_UPDATE' }, ({ payload }) => {
        cb.current.onOpponentEAR?.({ ear: payload.ear })
      })
      .on('broadcast', { event: 'VIDEO_FRAME' }, ({ payload }) => {
        cb.current.onOpponentVideoFrame?.({ frame: payload.frame })
      })
      .on('broadcast', { event: 'BLINKED' }, ({ payload }) => {
        cb.current.onMatchEnd?.({
          winner:         CLIENT_ID,
          loser:          payload.fromId,
          matchId,
          blinkTimestamp: payload.holdMs ?? 0,
          reason:         'blink',
        })
      })
      .on('broadcast', { event: 'FORFEIT' }, ({ payload }) => {
        cb.current.onMatchEnd?.({
          winner:         CLIENT_ID,
          loser:          payload.fromId,
          matchId,
          blinkTimestamp: 0,
          reason:         payload.reason ?? 'forfeit',
        })
      })
      .on('broadcast', { event: 'REMATCH_REQUEST' }, () => {
        oppRematch.current = true
        if (myRematch.current) {
          triggerRematch(matchId, opponentHandle, opponentId)
        } else {
          cb.current.onRematchRequested?.()
        }
      })
      .on('broadcast', { event: 'REMATCH_CANCEL' }, () => {
        oppRematch.current = false
        cb.current.onRematchDeclined?.()
      })
      .on('broadcast', { event: 'REMATCH_START' }, ({ payload }) => {
        // Guest (larger ID) receives the new matchId from host
        if (CLIENT_ID > opponentId) {
          doRematch(payload.newMatchId, opponentHandle, opponentId)
        }
      })

    ch.subscribe()
    gameChRef.current = ch
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Rematch helpers ───────────────────────────────────────────
  function doRematch(newMatchId, opponentHandle, opponentId) {
    const md = { matchId: newMatchId, myPlayerId: CLIENT_ID, opponentId, opponentName: opponentHandle }
    matchDataRef.current = md
    myRematch.current    = false
    oppRematch.current   = false
    setupGameChannel(newMatchId, opponentHandle, opponentId)
    cb.current.onMatchFound?.(md)
  }

  function triggerRematch(currentMatchId, opponentHandle, opponentId) {
    // Deterministic host: smaller ID generates the new match ID and broadcasts it
    const amHost = CLIENT_ID < opponentId
    if (amHost) {
      const newMatchId = crypto.randomUUID()
      gameChRef.current?.send({
        type: 'broadcast',
        event: 'REMATCH_START',
        payload: { newMatchId },
      })
      doRematch(newMatchId, opponentHandle, opponentId)
    }
    // Guest waits for REMATCH_START event (handled above in ch.on)
  }

  // ── Public API ────────────────────────────────────────────────
  const joinQueue = useCallback(async (displayName) => {
    removeChannel(queueChRef)

    // Subscribe to notification channel BEFORE calling RPC to avoid race
    const queueCh = supabase.channel(`queue:${CLIENT_ID}`, {
      config: { broadcast: { self: false } },
    })
    queueCh.on('broadcast', { event: 'MATCH_FOUND' }, ({ payload }) => {
      removeChannel(queueChRef)
      const md = {
        matchId:      payload.matchId,
        myPlayerId:   CLIENT_ID,
        opponentId:   payload.opponentId,
        opponentName: payload.opponentHandle,
      }
      matchDataRef.current = md
      setupGameChannel(payload.matchId, payload.opponentHandle, payload.opponentId)
      cb.current.onMatchFound?.(md)
    })
    await new Promise(resolve => {
      queueCh.subscribe(s => { if (s === 'SUBSCRIBED') resolve() })
    })
    queueChRef.current = queueCh

    const { data, error } = await supabase.rpc('join_queue', {
      p_handle:    displayName,
      p_client_id: CLIENT_ID,
    })

    if (error) {
      console.error('[joinQueue]', error)
      removeChannel(queueChRef)
      return
    }

    if (data?.matched) {
      // We matched a waiting player — notify them via their queue channel
      removeChannel(queueChRef)
      const md = {
        matchId:      data.matchId,
        myPlayerId:   CLIENT_ID,
        opponentId:   data.opponentId,
        opponentName: data.opponentHandle,
      }
      matchDataRef.current = md

      const notifyCh = supabase.channel(`queue:${data.opponentId}`)
      await new Promise(resolve => notifyCh.subscribe(s => { if (s === 'SUBSCRIBED') resolve() }))
      await notifyCh.send({
        type:    'broadcast',
        event:   'MATCH_FOUND',
        payload: {
          matchId:        data.matchId,
          opponentId:     CLIENT_ID,
          opponentHandle: displayName,
        },
      })
      supabase.removeChannel(notifyCh)

      setupGameChannel(data.matchId, data.opponentHandle, data.opponentId)
      cb.current.onMatchFound?.(md)
    }
    // else: waiting — queue channel will fire MATCH_FOUND when paired
  }, [setupGameChannel])

  const sendEAR = useCallback((_matchId, ear) => {
    gameChRef.current?.send({
      type:    'broadcast',
      event:   'EAR_UPDATE',
      payload: { ear },
    })
  }, [])

  const sendVideoFrame = useCallback((_matchId, frame) => {
    gameChRef.current?.send({
      type:    'broadcast',
      event:   'VIDEO_FRAME',
      payload: { frame },
    })
  }, [])

  // Call when I blinked (I lose). holdMs = time from MATCH_START to now.
  const sendBlink = useCallback((matchId, holdMs = 0) => {
    gameChRef.current?.send({
      type:    'broadcast',
      event:   'BLINKED',
      payload: { fromId: CLIENT_ID, holdMs },
    })
    cb.current.onMatchEnd?.({
      winner:         matchDataRef.current?.opponentId,
      loser:          CLIENT_ID,
      matchId,
      blinkTimestamp: 0,
      reason:         'blink',
    })
  }, [])

  const forfeit = useCallback((matchId, reason = 'user') => {
    gameChRef.current?.send({
      type:    'broadcast',
      event:   'FORFEIT',
      payload: { fromId: CLIENT_ID, matchId, reason },
    })
    removeChannel(gameChRef)
    removeChannel(queueChRef)
  }, [])

  const requestRematch = useCallback((matchId) => {
    myRematch.current = true
    gameChRef.current?.send({
      type:    'broadcast',
      event:   'REMATCH_REQUEST',
      payload: { fromId: CLIENT_ID },
    })
    if (oppRematch.current) {
      const { opponentName, opponentId } = matchDataRef.current ?? {}
      triggerRematch(matchId, opponentName, opponentId)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const cancelRematch = useCallback((_matchId) => {
    myRematch.current = false
    gameChRef.current?.send({
      type:    'broadcast',
      event:   'REMATCH_CANCEL',
      payload: { fromId: CLIENT_ID },
    })
  }, [])

  return { connected, joinQueue, sendEAR, sendVideoFrame, sendBlink, forfeit, requestRematch, cancelRematch }
}

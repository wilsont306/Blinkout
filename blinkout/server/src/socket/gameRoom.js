const BLINK_THRESHOLD    = 0.20
const BLINK_FRAMES       = 2
const STRIKE_COOLDOWN_MS = 1000
const STARTING_LIVES     = 3
const MAX_FRAME_BYTES    = 90_000        // base64 chars (~67KB decoded)
const MIN_FRAME_INTERVAL = 200           // ms — max ~5fps relay
const MAX_MATCH_MS       = 30 * 60_000  // 30 minutes absolute ceiling

export function createGameRoom({ matchId, player1, player2, io, onEnd }) {
  const players = {
    [player1.socketId]: { ...player1, blinkCount: 0, blinked: false, lastStrikeAt: 0, lastFrameAt: 0, lives: STARTING_LIVES },
    [player2.socketId]: { ...player2, blinkCount: 0, blinked: false, lastStrikeAt: 0, lastFrameAt: 0, lives: STARTING_LIVES },
  }

  const startMs = Date.now()
  let ended = false

  // Auto-end match if it runs impossibly long
  const ceilingTimer = setTimeout(() => {
    if (!ended) endMatch(player1.playerId, player2.playerId, MAX_MATCH_MS, 'timeout')
  }, MAX_MATCH_MS)

  const getOpponent = (socketId) =>
    players[socketId === player1.socketId ? player2.socketId : player1.socketId]

  function processEAR(socketId, ear, _clientTimestamp, options = {}) {
    if (ended) return
    const p = players[socketId]
    if (!p) return

    if (typeof ear !== 'number' || ear < 0 || ear > 1) return
    const covered = options.covered === true

    const opponent = getOpponent(socketId)
    io.to(opponent.socketId).emit('OPPONENT_EAR', { ear })

    if (ear < BLINK_THRESHOLD) {
      p.blinkCount++
    } else {
      p.blinkCount = 0
      p.blinked    = false
    }

    if (p.blinkCount >= BLINK_FRAMES && (!p.blinked || covered)) {
      const now = Date.now()
      p.blinked = true
      if (now - p.lastStrikeAt < STRIKE_COOLDOWN_MS) return

      p.lastStrikeAt = now
      p.lives = Math.max(0, p.lives - 1)

      const strikePayload = {
        matchId,
        strikePlayerId: p.playerId,
        remainingLives: p.lives,
        lives: getLivesByPlayerId(),
        timestamp: now - startMs,  // always server-side timestamp
      }
      io.to(player1.socketId).emit('MATCH_STRIKE', strikePayload)
      io.to(player2.socketId).emit('MATCH_STRIKE', strikePayload)

      if (p.lives <= 0) {
        io.to(player1.socketId).emit('BLINK_DETECTED', { blinkPlayerId: p.playerId, winnerPlayerId: opponent.playerId, matchId })
        io.to(player2.socketId).emit('BLINK_DETECTED', { blinkPlayerId: p.playerId, winnerPlayerId: opponent.playerId, matchId })
        endMatch(p.playerId, opponent.playerId, now - startMs)
      }
    }
  }

  function relayVideoFrame(socketId, frame) {
    if (ended) return
    const p = players[socketId]
    if (!p) return

    // Strict format: must be a JPEG data URL
    if (typeof frame !== 'string' || !frame.startsWith('data:image/jpeg;base64,')) return

    // Size check on base64 portion
    const b64 = frame.slice('data:image/jpeg;base64,'.length)
    if (b64.length > MAX_FRAME_BYTES) return

    // Rate limit per sender
    const now = Date.now()
    if (now - p.lastFrameAt < MIN_FRAME_INTERVAL) return
    p.lastFrameAt = now

    const opponent = getOpponent(socketId)
    io.to(opponent.socketId).volatile.emit('OPPONENT_VIDEO_FRAME', { frame })
  }

  function forfeit(socketId, reason) {
    if (ended) return
    const p        = players[socketId]
    const opponent = getOpponent(socketId)
    if (!p || !opponent) return
    endMatch(p.playerId, opponent.playerId, Date.now() - startMs, reason)
  }

  function endMatch(loserPlayerId, winnerPlayerId, blinkTimestamp, reason = null) {
    if (ended) return
    ended = true
    clearTimeout(ceilingTimer)

    const duration = Date.now() - startMs
    const payload  = { matchId, winner: winnerPlayerId, loser: loserPlayerId, duration, blinkTimestamp, reason }

    io.to(player1.socketId).emit('MATCH_END', payload)
    io.to(player2.socketId).emit('MATCH_END', payload)
    console.log(`[match] ${matchId} ended — winner: ${winnerPlayerId} reason: ${reason ?? 'blink'}`)
    onEnd()
  }

  function hasPlayer(socketId) {
    return socketId in players
  }

  function getLivesByPlayerId() {
    return {
      [player1.playerId]: players[player1.socketId].lives,
      [player2.playerId]: players[player2.socketId].lives,
    }
  }

  return { processEAR, relayVideoFrame, forfeit, hasPlayer }
}

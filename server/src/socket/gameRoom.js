const BLINK_THRESHOLD = 0.20
const BLINK_FRAMES    = 2

export function createGameRoom({ matchId, player1, player2, io, onEnd }) {
  const players = {
    [player1.socketId]: { ...player1, blinkCount: 0, blinked: false },
    [player2.socketId]: { ...player2, blinkCount: 0, blinked: false },
  }

  const startMs = Date.now()
  let ended = false

  function processEAR(socketId, ear) {
    if (ended) return
    const p = players[socketId]
    if (!p) return

    // Basic server-side EAR sanity check (cheat detection)
    if (typeof ear !== 'number' || ear < 0 || ear > 1) return

    if (ear < BLINK_THRESHOLD) {
      p.blinkCount++
    } else {
      p.blinkCount = 0
      p.blinked = false
    }

    if (p.blinkCount >= BLINK_FRAMES && !p.blinked) {
      p.blinked = true
      const blinkTs = Date.now() - startMs  // server-computed, not client-provided

      const winnerId = socketId === player1.socketId ? player2.socketId : player1.socketId
      const winner   = players[winnerId]

      io.to(player1.socketId).emit('BLINK_DETECTED', {
        blinkPlayerId:  p.playerId,
        winnerPlayerId: winner.playerId,
        matchId,
      })
      io.to(player2.socketId).emit('BLINK_DETECTED', {
        blinkPlayerId:  p.playerId,
        winnerPlayerId: winner.playerId,
        matchId,
      })

      endMatch(p.playerId, winner.playerId, blinkTs)
    }
  }

  function forfeit(socketId, reason) {
    if (ended) return
    const p = players[socketId]
    const other = socketId === player1.socketId ? players[player2.socketId] : players[player1.socketId]
    if (!p || !other) return
    endMatch(p.playerId, other.playerId, Date.now() - startMs, reason)
  }

  function endMatch(loserPlayerId, winnerPlayerId, blinkTimestamp, reason = null) {
    if (ended) return
    ended = true

    const payload = {
      matchId,
      winner: winnerPlayerId,
      loser:  loserPlayerId,
      duration: Date.now() - startMs,
      blinkTimestamp,
      reason,
    }

    io.to(player1.socketId).emit('MATCH_END', payload)
    io.to(player2.socketId).emit('MATCH_END', payload)
    console.log(`[match] ${matchId} ended — winner: ${winnerPlayerId} reason: ${reason ?? 'blink'}`)
    onEnd()
  }

  function hasPlayer(socketId) {
    return socketId in players
  }

  return { processEAR, forfeit, hasPlayer }
}

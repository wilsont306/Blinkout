import { v4 as uuidv4 } from 'uuid'
import { createGameRoom } from './gameRoom.js'

const queue          = new Map()
const rooms          = new Map()
const lastMatchInfo  = new Map()
const rematchPending = new Map()

const NAME_RE  = /^[\w\s\-\.]{1,30}$/
const MAX_QUEUE_WAIT_MS = 10 * 60 * 1000 // 10 min — evict stale queue entries

export function setupMatchmaking(io) {
  io.on('connection', (socket) => {
    // Payloads come from untrusted clients. A missing or non-object payload
    // would throw on destructuring and crash the process, so drop it instead.
    const on = (event, handler) => socket.on(event, (payload) => {
      if (!payload || typeof payload !== 'object') return
      try {
        handler(payload)
      } catch (err) {
        console.error(`[socket] ${event} handler failed`, err)
      }
    })

    on('QUEUE_JOIN', ({ displayName }) => {
      // Prevent duplicate entries
      if (queue.has(socket.id)) return

      const name = (typeof displayName === 'string' ? displayName : '').trim().slice(0, 30)
      if (!NAME_RE.test(name || 'x')) {
        socket.emit('QUEUE_ERROR', { message: 'Invalid display name' })
        return
      }

      const playerId = uuidv4()
      queue.set(socket.id, {
        socket,
        playerId,
        displayName: name || `Player_${socket.id.slice(0, 4)}`,
        joinedAt: Date.now(),
      })

      // Evict entries older than MAX_QUEUE_WAIT_MS
      const now = Date.now()
      for (const [id, entry] of queue) {
        if (now - entry.joinedAt > MAX_QUEUE_WAIT_MS) queue.delete(id)
      }

      tryPair(io)
    })

    // Verify socket belongs to the match before processing
    on('EAR_UPDATE', ({ matchId, ear, timestamp, covered }) => {
      const room = rooms.get(matchId)
      if (!room?.hasPlayer(socket.id)) return
      room.processEAR(socket.id, ear, timestamp, { covered })
    })

    on('VIDEO_FRAME', ({ matchId, frame }) => {
      const room = rooms.get(matchId)
      if (!room?.hasPlayer(socket.id)) return
      room.relayVideoFrame(socket.id, frame)
    })

    on('FORFEIT', ({ matchId, reason }) => {
      const room = rooms.get(matchId)
      if (!room?.hasPlayer(socket.id)) return
      room.forfeit(socket.id, reason)
    })

    on('REMATCH_REQUEST', ({ matchId }) => {
      const info = lastMatchInfo.get(socket.id)
      if (!info || info.matchId !== matchId) {
        socket.emit('REMATCH_DECLINED', { matchId, reason: 'expired' })
        return
      }

      const { opponentSocketId } = info
      const opponentSocket = io.sockets.sockets.get(opponentSocketId)
      if (!opponentSocket?.connected) {
        socket.emit('REMATCH_DECLINED', { matchId, reason: 'opponent-left' })
        return
      }

      const pending = rematchPending.get(matchId)
      if (pending?.has(opponentSocketId)) {
        rematchPending.delete(matchId)
        lastMatchInfo.delete(socket.id)
        lastMatchInfo.delete(opponentSocketId)

        const newMatchId = uuidv4()
        const p1 = { socketId: socket.id,        playerId: uuidv4(), displayName: info.player.displayName }
        const p2 = { socketId: opponentSocketId, playerId: uuidv4(), displayName: info.opponent.displayName }
        startMatch(io, newMatchId, p1, p2)
      } else {
        if (!rematchPending.has(matchId)) rematchPending.set(matchId, new Set())
        rematchPending.get(matchId).add(socket.id)
        opponentSocket.emit('REMATCH_REQUESTED', { matchId, opponentName: info.player.displayName })
      }
    })

    on('REMATCH_CANCEL', ({ matchId }) => {
      const pending = rematchPending.get(matchId)
      if (pending) {
        pending.delete(socket.id)
        if (pending.size === 0) rematchPending.delete(matchId)
      }
    })

    socket.on('disconnect', () => {
      queue.delete(socket.id)
      for (const [, room] of rooms) {
        if (room.hasPlayer(socket.id)) {
          room.forfeit(socket.id, 'disconnect')
          break
        }
      }

      const info = lastMatchInfo.get(socket.id)
      if (info) {
        const { matchId, opponentSocketId } = info
        const pending = rematchPending.get(matchId)
        if (pending?.has(opponentSocketId)) {
          io.to(opponentSocketId).emit('REMATCH_DECLINED', { matchId, reason: 'opponent-left' })
        }
        rematchPending.delete(matchId)
        lastMatchInfo.delete(socket.id)
      }
    })
  })
}

function tryPair(io) {
  if (queue.size < 2) return
  const [[id1, p1], [id2, p2]] = [...queue.entries()]
  if (id1 === id2) return
  queue.delete(id1)
  queue.delete(id2)
  startMatch(io, uuidv4(),
    { socketId: id1, playerId: p1.playerId, displayName: p1.displayName },
    { socketId: id2, playerId: p2.playerId, displayName: p2.displayName },
  )
}

function startMatch(io, matchId, player1, player2) {
  const room = createGameRoom({
    matchId, io, player1, player2,
    onEnd: () => rooms.delete(matchId),
  })
  rooms.set(matchId, room)

  lastMatchInfo.set(player1.socketId, {
    matchId, opponentSocketId: player2.socketId, player: player1, opponent: player2,
  })
  lastMatchInfo.set(player2.socketId, {
    matchId, opponentSocketId: player1.socketId, player: player2, opponent: player1,
  })

  const startAt = Date.now() + 500
  io.to(player1.socketId).emit('MATCH_FOUND', {
    matchId, myPlayerId: player1.playerId, opponentName: player2.displayName, opponentId: player2.playerId, startAt,
  })
  io.to(player2.socketId).emit('MATCH_FOUND', {
    matchId, myPlayerId: player2.playerId, opponentName: player1.displayName, opponentId: player1.playerId, startAt,
  })
  console.log(`[match] ${matchId} — ${player1.displayName} vs ${player2.displayName}`)
}

import { v4 as uuidv4 } from 'uuid'
import { createGameRoom } from './gameRoom.js'

const queue = new Map()  // socketId → { socket, playerId, displayName }
const rooms = new Map()  // matchId  → room

export function setupMatchmaking(io) {
  io.on('connection', (socket) => {
    socket.on('QUEUE_JOIN', ({ displayName }) => {
      if (queue.has(socket.id)) return  // already queued, ignore duplicate
      const playerId = uuidv4()
      const safeName = (typeof displayName === 'string' ? displayName : '')
        .replace(/[<>"'&]/g, '')
        .trim()
        .slice(0, 32) || `Player_${socket.id.slice(0, 4)}`
      queue.set(socket.id, {
        socket,
        playerId,
        displayName: safeName,
      })
      console.log(`[queue] ${displayName} joined — size: ${queue.size}`)
      tryPair(io)
    })

    socket.on('QUEUE_LEAVE', () => {
      if (queue.delete(socket.id)) {
        console.log(`[queue] ${socket.id} left — size: ${queue.size}`)
      }
    })

    socket.on('EAR_UPDATE', ({ matchId, ear }) => {
      rooms.get(matchId)?.processEAR(socket.id, ear)
    })

    socket.on('FORFEIT', ({ matchId, reason }) => {
      rooms.get(matchId)?.forfeit(socket.id, reason)
    })

    socket.on('disconnect', () => {
      queue.delete(socket.id)
      for (const [, room] of rooms) {
        if (room.hasPlayer(socket.id)) {
          room.forfeit(socket.id, 'disconnect')
          break
        }
      }
    })
  })
}

function tryPair(io) {
  if (queue.size < 2) return

  const [[id1, p1], [id2, p2]] = [...queue.entries()]
  queue.delete(id1)
  queue.delete(id2)

  const matchId = uuidv4()
  const startAt = Date.now() + 500

  const room = createGameRoom({
    matchId, io,
    player1: { socketId: id1, ...p1 },
    player2: { socketId: id2, ...p2 },
    onEnd: () => rooms.delete(matchId),
  })
  rooms.set(matchId, room)

  p1.socket.emit('MATCH_FOUND', {
    matchId,
    myPlayerId:   p1.playerId,
    opponentName: p2.displayName,
    opponentId:   p2.playerId,
    startAt,
  })
  p2.socket.emit('MATCH_FOUND', {
    matchId,
    myPlayerId:   p2.playerId,
    opponentName: p1.displayName,
    opponentId:   p1.playerId,
    startAt,
  })

  console.log(`[match] ${matchId} — ${p1.displayName} vs ${p2.displayName}`)
}

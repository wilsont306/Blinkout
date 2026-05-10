import Fastify from 'fastify'
import cors from '@fastify/cors'
import { Server } from 'socket.io'
import { setupMatchmaking } from './socket/matchmaking.js'

const PORT = process.env.PORT || 3001
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGINS || 'http://localhost:5173,http://localhost:4173').split(',')

const fastify = Fastify({ logger: true })

await fastify.register(cors, { origin: CLIENT_ORIGINS })

fastify.get('/health', async () => ({ status: 'ok', ts: Date.now() }))

// Leaderboard — backed by in-memory store for v1; swap for PostgreSQL in v2
const leaderboard = []

fastify.get('/leaderboard', async (req) => {
  const period = req.query.period || 'daily'
  // TODO: filter by period once DB is wired
  return leaderboard.slice(0, 50)
})

fastify.post('/leaderboard', async (req) => {
  const { handle, streak, bestHold, matches } = req.body
  const existing = leaderboard.find(r => r.handle === handle)
  if (existing) {
    existing.streak   = Math.max(existing.streak, streak)
    existing.bestHold = Math.max(existing.bestHold, bestHold)
    existing.matches += 1
  } else {
    leaderboard.push({ handle, streak, bestHold, matches: matches ?? 1 })
  }
  leaderboard.sort((a, b) => b.streak - a.streak)
  leaderboard.forEach((r, i) => (r.rank = i + 1))
  return { ok: true }
})

const io = new Server(fastify.server, {
  cors: { origin: CLIENT_ORIGINS, methods: ['GET', 'POST'] },
})

setupMatchmaking(io)

try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`BlinkOut server listening on :${PORT}`)
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}

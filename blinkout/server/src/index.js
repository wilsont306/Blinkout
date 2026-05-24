import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { Server } from 'socket.io'
import { supabase } from './db/supabase.js'
import { setupMatchmaking } from './socket/matchmaking.js'

const PORT     = process.env.PORT     || 3001
const NODE_ENV = process.env.NODE_ENV || 'development'
const isDev    = NODE_ENV === 'development'

const rawOrigins = process.env.CLIENT_ORIGINS || (isDev
  ? 'http://localhost:5173,http://localhost:5174,http://localhost:4173'
  : '')

if (!rawOrigins && !isDev) {
  console.error('FATAL: CLIENT_ORIGINS must be set in production')
  process.exit(1)
}

const CLIENT_ORIGINS = rawOrigins.split(',')
  .map(o => o.trim())
  .filter(o => { try { new URL(o); return true } catch { return false } })

const fastify = Fastify({ logger: true })

await fastify.register(helmet, {
  contentSecurityPolicy: false,
  crossOriginOpenerPolicy: false,
})

await fastify.register(cors, { origin: CLIENT_ORIGINS })

await fastify.register(rateLimit, { global: false })

fastify.get('/health', {
  config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
}, async () => ({ status: 'ok' }))

const NAME_RE = /^[\w\s\-\.]{1,30}$/

// ── GET /leaderboard ──────────────────────────────────────────────
fastify.get('/leaderboard', {
  config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
}, async (_req, reply) => {
  const { data, error } = await supabase
    .from('leaderboard')
    .select('handle, streak, best_hold, matches')
    .order('streak',    { ascending: false })
    .order('best_hold', { ascending: false })
    .limit(50)

  if (error) {
    fastify.log.error(error, '[leaderboard] GET failed')
    return reply.code(500).send({ error: 'Failed to load leaderboard' })
  }

  // Normalise column names to camelCase for the client
  return (data ?? []).map(r => ({
    handle:   r.handle,
    streak:   r.streak,
    bestHold: r.best_hold,
    matches:  r.matches,
  }))
})

// ── POST /leaderboard ─────────────────────────────────────────────
fastify.post('/leaderboard', {
  config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
}, async (req, reply) => {
  const { handle, streak, bestHold } = req.body ?? {}

  if (typeof handle !== 'string' || !NAME_RE.test(handle.trim())) {
    return reply.code(400).send({ error: 'Invalid handle' })
  }
  if (!Number.isInteger(streak)  || streak  < 0 || streak  > 10_000) {
    return reply.code(400).send({ error: 'Invalid streak' })
  }
  if (typeof bestHold !== 'number' || bestHold < 0 || bestHold > 3_600_000) {
    return reply.code(400).send({ error: 'Invalid bestHold' })
  }

  const cleanHandle = handle.trim()

  // Fetch existing row so we only ever improve the stored values
  const { data: existing } = await supabase
    .from('leaderboard')
    .select('streak, best_hold, matches')
    .eq('handle', cleanHandle)
    .maybeSingle()

  const newStreak   = Math.max(streak,   existing?.streak    ?? 0)
  const newBestHold = Math.max(bestHold, existing?.best_hold ?? 0)
  const newMatches  = (existing?.matches ?? 0) + 1

  const { error } = await supabase
    .from('leaderboard')
    .upsert({
      handle:     cleanHandle,
      streak:     newStreak,
      best_hold:  newBestHold,
      matches:    newMatches,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'handle' })

  if (error) {
    fastify.log.error(error, '[leaderboard] POST upsert failed')
    return reply.code(500).send({ error: 'Failed to save score' })
  }

  fastify.log.info(`[leaderboard] ${cleanHandle} streak=${newStreak} bestHold=${newBestHold} ip=${req.ip}`)
  return { ok: true }
})

const io = new Server(fastify.server, {
  cors: { origin: CLIENT_ORIGINS, methods: ['GET', 'POST'] },
  transports: ['websocket'],
})

setupMatchmaking(io)

try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`BlinkOut server listening on :${PORT}`)
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}

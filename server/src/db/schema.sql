-- BlinkOut PostgreSQL schema (Phase 2+)
-- Run against a PostgreSQL 15+ database.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Players (session-scoped for v1; expand to accounts in v2)
CREATE TABLE IF NOT EXISTS players (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  handle      TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Match records
CREATE TABLE IF NOT EXISTS matches (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  winner_id        UUID        REFERENCES players(id),
  loser_id         UUID        REFERENCES players(id),
  duration_ms      INTEGER     NOT NULL,
  blink_ts_ms      INTEGER     NOT NULL,  -- time-into-match when blink occurred
  ended_reason     TEXT        NOT NULL DEFAULT 'blink',  -- 'blink' | 'forfeit' | 'disconnect'
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Leaderboard view: win streaks (rolling 24 h)
CREATE OR REPLACE VIEW leaderboard_daily AS
SELECT
  p.handle,
  COUNT(*) FILTER (WHERE m.winner_id = p.id) AS wins,
  MAX(m.duration_ms) FILTER (WHERE m.winner_id = p.id) AS best_hold_ms,
  COUNT(*) AS matches_played
FROM players p
JOIN matches m ON p.id IN (m.winner_id, m.loser_id)
WHERE m.created_at >= now() - INTERVAL '24 hours'
GROUP BY p.id, p.handle
ORDER BY wins DESC;

-- Index on created_at for leaderboard time-range queries
CREATE INDEX IF NOT EXISTS matches_created_at_idx ON matches(created_at DESC);

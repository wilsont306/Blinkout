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

-- ── Matchmaking queue ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS queue (
  client_id  UUID        PRIMARY KEY,
  handle     TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Atomic matchmaking: either pairs caller with a waiting player or enqueues them
CREATE OR REPLACE FUNCTION join_queue(p_handle TEXT, p_client_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  opponent RECORD;
  new_match_id UUID;
BEGIN
  SELECT * INTO opponent
  FROM queue
  WHERE client_id != p_client_id
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF FOUND THEN
    DELETE FROM queue WHERE client_id = opponent.client_id;
    new_match_id := gen_random_uuid();
    RETURN json_build_object(
      'matched',        true,
      'matchId',        new_match_id,
      'opponentHandle', opponent.handle,
      'opponentId',     opponent.client_id
    );
  ELSE
    INSERT INTO queue (client_id, handle, created_at)
    VALUES (p_client_id, p_handle, now())
    ON CONFLICT (client_id) DO UPDATE SET handle = p_handle, created_at = now();
    RETURN json_build_object('matched', false);
  END IF;
END;
$$;

-- Stale queue cleanup (run periodically or on join): remove entries older than 5 min
CREATE OR REPLACE FUNCTION evict_stale_queue()
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  DELETE FROM queue WHERE created_at < now() - INTERVAL '5 minutes';
$$;

-- ── Simple leaderboard (upserted after each multiplayer match)
CREATE TABLE IF NOT EXISTS leaderboard (
  handle     TEXT        PRIMARY KEY,
  streak     INTEGER     NOT NULL DEFAULT 0,
  best_hold  INTEGER     NOT NULL DEFAULT 0,
  matches    INTEGER     NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leaderboard_streak_idx ON leaderboard(streak DESC, best_hold DESC);

-- Upsert leaderboard: only ever improve stored values
CREATE OR REPLACE FUNCTION upsert_leaderboard(
  p_handle    TEXT,
  p_streak    INTEGER,
  p_best_hold INTEGER
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO leaderboard (handle, streak, best_hold, matches, updated_at)
  VALUES (p_handle, p_streak, p_best_hold, 1, now())
  ON CONFLICT (handle) DO UPDATE SET
    streak     = GREATEST(leaderboard.streak,    EXCLUDED.streak),
    best_hold  = GREATEST(leaderboard.best_hold, EXCLUDED.best_hold),
    matches    = leaderboard.matches + 1,
    updated_at = now();
END;
$$;

-- ── Row Level Security ─────────────────────────────────────────────────────────
-- The anon key is public. RLS is what keeps it from reading or writing tables
-- directly. The service role (server only) bypasses RLS. SECURITY DEFINER
-- functions below run as their owner and are the intended write path.
ALTER TABLE players     ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue       ENABLE ROW LEVEL SECURITY;

-- Leaderboard is public-read; writes go through the RPC (SECURITY DEFINER bypasses RLS)
CREATE POLICY IF NOT EXISTS "leaderboard_public_read"
  ON leaderboard FOR SELECT USING (true);

-- Queue is not directly accessible; all ops go through join_queue RPC
-- (no SELECT policy = no direct client reads)

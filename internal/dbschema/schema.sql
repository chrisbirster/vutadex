CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS magic_link_challenges (
  id text PRIMARY KEY,
  email text NOT NULL,
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS magic_link_email_idx ON magic_link_challenges(email,created_at DESC);
CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS leagues (
  id text PRIMARY KEY,
  name text NOT NULL,
  season integer NOT NULL,
  owner_user_id text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS teams (
  id text PRIMARY KEY,
  league_id text NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  city text NOT NULL,
  name text NOT NULL,
  abbreviation text NOT NULL,
  primary_color text NOT NULL DEFAULT '#17ff7a',
  secondary_color text NOT NULL DEFAULT '#07110b'
);
CREATE TABLE IF NOT EXISTS franchise_memberships (
  league_id text NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK(role IN ('owner','gm','head_coach','oc','dc','player')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(team_id,user_id,role)
);
CREATE TABLE IF NOT EXISTS players (
  id text PRIMARY KEY,
  league_id text NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  team_id text REFERENCES teams(id) ON DELETE SET NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  position text NOT NULL,
  age integer NOT NULL,
  overall integer NOT NULL,
  potential integer NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS players_league_team_idx ON players(league_id,team_id);
CREATE TABLE IF NOT EXISTS contracts (
  id text PRIMARY KEY,
  league_id text NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  player_id text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  start_season integer NOT NULL,
  years integer NOT NULL CHECK(years BETWEEN 1 AND 7),
  annual_value bigint NOT NULL CHECK(annual_value > 0),
  guaranteed bigint NOT NULL DEFAULT 0 CHECK(guaranteed >= 0),
  signed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(player_id)
);
CREATE INDEX IF NOT EXISTS contracts_team_idx ON contracts(team_id);
CREATE TABLE IF NOT EXISTS draft_picks (
  id text PRIMARY KEY,
  league_id text NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  original_team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  season integer NOT NULL,
  round integer NOT NULL CHECK(round BETWEEN 1 AND 7),
  pick integer NOT NULL CHECK(pick > 0),
  used_player_id text REFERENCES players(id) ON DELETE SET NULL,
  UNIQUE(league_id,season,round,pick)
);
CREATE INDEX IF NOT EXISTS draft_picks_team_season_idx ON draft_picks(team_id,season,round,pick);
CREATE TABLE IF NOT EXISTS franchise_transactions (
  id text PRIMARY KEY,
  league_id text NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('trade','signing','release','draft','waiver')),
  team_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  player_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  pick_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS franchise_transactions_league_idx ON franchise_transactions(league_id,occurred_at DESC);
CREATE TABLE IF NOT EXISTS trade_offers (
  id text PRIMARY KEY,
  league_id text NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  from_team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  to_team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  from_player_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  to_player_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  from_pick_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  to_pick_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL CHECK(status IN ('open','accepted','rejected','expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trade_offers_team_status_idx ON trade_offers(to_team_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS waiver_claims (
  id text PRIMARY KEY,
  league_id text NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  player_id text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  priority integer NOT NULL CHECK(priority > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(player_id,team_id)
);
CREATE INDEX IF NOT EXISTS waiver_claims_league_player_idx ON waiver_claims(league_id,player_id,priority,created_at);
CREATE TABLE IF NOT EXISTS games (
  id text PRIMARY KEY,
  league_id text REFERENCES leagues(id) ON DELETE CASCADE,
  home_team_id text NOT NULL REFERENCES teams(id),
  away_team_id text NOT NULL REFERENCES teams(id),
  status text NOT NULL DEFAULT 'scheduled',
  engine_version text NOT NULL,
  seed bigint NOT NULL,
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  home_score integer NOT NULL DEFAULT 0,
  away_score integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS coach_games (
  id text PRIMARY KEY,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  engine_version text NOT NULL,
  seed bigint NOT NULL,
  status text NOT NULL CHECK(status IN ('in_progress','final')),
  snapshot jsonb NOT NULL,
  grade jsonb NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coach_games_status_updated_idx ON coach_games(status, updated_at DESC);
CREATE TABLE IF NOT EXISTS drives (
  id text PRIMARY KEY,
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  possession_team_id text NOT NULL REFERENCES teams(id),
  UNIQUE(game_id,sequence)
);
CREATE TABLE IF NOT EXISTS plays (
  id text PRIMARY KEY,
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  drive_id text REFERENCES drives(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  offense_call text,
  defense_call text,
  state_before jsonb NOT NULL,
  state_after jsonb NOT NULL,
  description text NOT NULL,
  UNIQUE(game_id,sequence)
);
CREATE TABLE IF NOT EXISTS game_events (
  id bigserial PRIMARY KEY,
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  play_id text REFERENCES plays(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  UNIQUE(game_id,sequence)
);
CREATE TABLE IF NOT EXISTS dex_entries (
  id text PRIMARY KEY,
  league_id text NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  kind text NOT NULL,
  subject_id text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(league_id,kind,subject_id)
);

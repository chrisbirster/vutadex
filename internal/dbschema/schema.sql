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

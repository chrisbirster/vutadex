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
CREATE TABLE IF NOT EXISTS seasons (
  league_id text NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  season integer NOT NULL,
  status text NOT NULL CHECK(status IN ('regular','postseason','complete')),
  current_week integer NOT NULL DEFAULT 1 CHECK(current_week > 0),
  champion_team_id text REFERENCES teams(id) ON DELETE SET NULL,
  seed bigint NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY(league_id,season)
);
CREATE INDEX IF NOT EXISTS seasons_status_idx ON seasons(status,season DESC);
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
  roster_status text NOT NULL DEFAULT 'roster' CHECK(roster_status IN ('roster','free_agent','waivers','draft','retired')),
  first_name text NOT NULL,
  last_name text NOT NULL,
  position text NOT NULL,
  age integer NOT NULL,
  overall integer NOT NULL,
  potential integer NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK((roster_status = 'roster' AND team_id IS NOT NULL) OR (roster_status <> 'roster' AND team_id IS NULL))
);
CREATE INDEX IF NOT EXISTS players_league_team_idx ON players(league_id,team_id);
CREATE INDEX IF NOT EXISTS players_league_status_idx ON players(league_id,roster_status,overall DESC);
CREATE TABLE IF NOT EXISTS player_lifecycle_state (
  player_id text PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  league_id text NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  experience integer NOT NULL DEFAULT 0 CHECK(experience >= 0),
  durability integer NOT NULL DEFAULT 75 CHECK(durability BETWEEN 1 AND 99),
  retired_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS player_lifecycle_league_idx ON player_lifecycle_state(league_id);
CREATE TABLE IF NOT EXISTS scouting_reports (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  league_id text NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  player_id text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  observations integer NOT NULL CHECK(observations > 0),
  overall_low integer NOT NULL CHECK(overall_low BETWEEN 1 AND 99),
  overall_high integer NOT NULL CHECK(overall_high BETWEEN 1 AND 99),
  potential_low integer NOT NULL CHECK(potential_low BETWEEN 1 AND 99),
  potential_high integer NOT NULL CHECK(potential_high BETWEEN 1 AND 99),
  confidence integer NOT NULL CHECK(confidence BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,player_id)
);
CREATE INDEX IF NOT EXISTS scouting_reports_league_user_idx ON scouting_reports(league_id,user_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS injuries (
  id text PRIMARY KEY,
  league_id text NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  player_id text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  kind text NOT NULL,
  severity text NOT NULL CHECK(severity IN ('minor','moderate','major')),
  weeks_remaining integer NOT NULL CHECK(weeks_remaining >= 0),
  occurred_season integer NOT NULL,
  occurred_week integer NOT NULL CHECK(occurred_week > 0),
  status text NOT NULL CHECK(status IN ('active','recovered')),
  created_at timestamptz NOT NULL DEFAULT now(),
  recovered_at timestamptz
);
CREATE INDEX IF NOT EXISTS injuries_league_status_idx ON injuries(league_id,status,weeks_remaining DESC);
CREATE INDEX IF NOT EXISTS injuries_player_idx ON injuries(player_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS player_lifecycle_events (
  id text PRIMARY KEY,
  league_id text NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  player_id text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season integer NOT NULL,
  kind text NOT NULL CHECK(kind IN ('development','retirement','injury','recovery')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS player_lifecycle_events_league_idx ON player_lifecycle_events(league_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS player_lifecycle_events_player_idx ON player_lifecycle_events(player_id,occurred_at DESC);
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
  league_id text NOT NULL,
  season integer NOT NULL,
  week integer NOT NULL CHECK(week > 0),
  phase text NOT NULL DEFAULT 'regular' CHECK(phase IN ('regular','semifinal','championship')),
  home_team_id text NOT NULL REFERENCES teams(id),
  away_team_id text NOT NULL REFERENCES teams(id),
  status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','final')),
  engine_version text NOT NULL,
  seed bigint NOT NULL,
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  home_score integer NOT NULL DEFAULT 0,
  away_score integer NOT NULL DEFAULT 0,
  winner_team_id text REFERENCES teams(id) ON DELETE SET NULL,
  FOREIGN KEY(league_id,season) REFERENCES seasons(league_id,season) ON DELETE CASCADE,
  CHECK(home_team_id <> away_team_id)
);
CREATE INDEX IF NOT EXISTS games_league_season_week_idx ON games(league_id,season,week,phase,status);
CREATE TABLE IF NOT EXISTS player_season_stats (
  league_id text NOT NULL,
  season integer NOT NULL,
  player_id text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  games integer NOT NULL DEFAULT 0 CHECK(games >= 0),
  passing_yards bigint NOT NULL DEFAULT 0 CHECK(passing_yards >= 0),
  passing_touchdowns bigint NOT NULL DEFAULT 0 CHECK(passing_touchdowns >= 0),
  interceptions_thrown bigint NOT NULL DEFAULT 0 CHECK(interceptions_thrown >= 0),
  rushing_yards bigint NOT NULL DEFAULT 0 CHECK(rushing_yards >= 0),
  rushing_touchdowns bigint NOT NULL DEFAULT 0 CHECK(rushing_touchdowns >= 0),
  receiving_yards bigint NOT NULL DEFAULT 0 CHECK(receiving_yards >= 0),
  receiving_touchdowns bigint NOT NULL DEFAULT 0 CHECK(receiving_touchdowns >= 0),
  tackles bigint NOT NULL DEFAULT 0 CHECK(tackles >= 0),
  sacks bigint NOT NULL DEFAULT 0 CHECK(sacks >= 0),
  defensive_interceptions bigint NOT NULL DEFAULT 0 CHECK(defensive_interceptions >= 0),
  PRIMARY KEY(league_id,season,player_id),
  FOREIGN KEY(league_id,season) REFERENCES seasons(league_id,season) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS player_season_stats_player_idx ON player_season_stats(league_id,player_id,season);
CREATE TABLE IF NOT EXISTS player_awards (
  id text PRIMARY KEY,
  league_id text NOT NULL,
  season integer NOT NULL,
  name text NOT NULL,
  player_id text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  score bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(league_id,season) REFERENCES seasons(league_id,season) ON DELETE CASCADE,
  UNIQUE(league_id,season,name)
);
CREATE INDEX IF NOT EXISTS player_awards_player_idx ON player_awards(league_id,player_id,season);
CREATE TABLE IF NOT EXISTS league_records (
  league_id text NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK(scope IN ('season','career')),
  category text NOT NULL,
  player_id text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season integer,
  value bigint NOT NULL CHECK(value >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(league_id,scope,category),
  CHECK((scope='season' AND season IS NOT NULL) OR (scope='career' AND season IS NULL))
);
CREATE TABLE IF NOT EXISTS hall_of_fame (
  league_id text NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  player_id text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  inducted_season integer NOT NULL,
  score bigint NOT NULL,
  reason text NOT NULL,
  inducted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(league_id,player_id)
);
CREATE INDEX IF NOT EXISTS hall_of_fame_score_idx ON hall_of_fame(league_id,score DESC);
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
  title text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(league_id,kind,subject_id)
);
CREATE INDEX IF NOT EXISTS dex_entries_search_idx ON dex_entries(league_id,kind,title);

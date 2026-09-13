package season

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

type PostgresRepository struct{ db *sql.DB }

func NewPostgresRepository(db *sql.DB) *PostgresRepository { return &PostgresRepository{db: db} }

func (r *PostgresRepository) Teams(ctx context.Context, leagueID string) ([]Team, error) {
	rows, err := r.db.QueryContext(ctx, `
SELECT id,city,name,abbreviation
FROM teams WHERE league_id=$1 ORDER BY id`, leagueID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Team, 0)
	for rows.Next() {
		var team Team
		if err := rows.Scan(&team.ID, &team.City, &team.Name, &team.Abbreviation); err != nil {
			return nil, err
		}
		out = append(out, team)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(out) == 0 {
		return nil, ErrNotFound
	}
	return out, nil
}

func (r *PostgresRepository) State(ctx context.Context, leagueID string, season int) (State, error) {
	var state State
	var seed int64
	var completed sql.NullTime
	err := r.db.QueryRowContext(ctx, `
SELECT league_id,season,status,current_week,COALESCE(champion_team_id,''),seed,started_at,completed_at
FROM seasons WHERE league_id=$1 AND season=$2`, leagueID, season).Scan(
		&state.LeagueID, &state.Season, &state.Status, &state.CurrentWeek, &state.ChampionTeamID,
		&seed, &state.StartedAt, &completed,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return State{}, ErrNotFound
	}
	if err != nil {
		return State{}, err
	}
	state.Seed = uint64(seed)
	if completed.Valid {
		value := completed.Time
		state.CompletedAt = &value
	}
	return state, nil
}

func (r *PostgresRepository) Games(ctx context.Context, leagueID string, season int) ([]Game, error) {
	rows, err := r.db.QueryContext(ctx, `
SELECT id,league_id,season,week,phase,home_team_id,away_team_id,status,seed,home_score,away_score,
       COALESCE(winner_team_id,''),scheduled_at,started_at,finished_at
FROM games WHERE league_id=$1 AND season=$2
ORDER BY week,phase,id`, leagueID, season)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Game, 0)
	for rows.Next() {
		game, err := scanGame(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, game)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if _, err := r.State(ctx, leagueID, season); err != nil {
		return nil, err
	}
	return out, nil
}

func (r *PostgresRepository) Game(ctx context.Context, id string) (Game, error) {
	row := r.db.QueryRowContext(ctx, `
SELECT id,league_id,season,week,phase,home_team_id,away_team_id,status,seed,home_score,away_score,
       COALESCE(winner_team_id,''),scheduled_at,started_at,finished_at
FROM games WHERE id=$1`, id)
	game, err := scanGame(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Game{}, ErrNotFound
	}
	return game, err
}

func (r *PostgresRepository) CreateSeason(ctx context.Context, state State, games []Game) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(ctx, `
INSERT INTO seasons(league_id,season,status,current_week,champion_team_id,seed,started_at,completed_at)
VALUES($1,$2,$3,$4,NULLIF($5,''),$6,$7,$8)`,
		state.LeagueID, state.Season, state.Status, state.CurrentWeek, state.ChampionTeamID, int64(state.Seed), state.StartedAt, state.CompletedAt)
	if err != nil {
		return err
	}
	for _, game := range games {
		if err := insertGame(ctx, tx, game); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (r *PostgresRepository) SaveResult(ctx context.Context, gameID string, homeScore, awayScore int, winner string, finishedAt time.Time) error {
	result, err := r.db.ExecContext(ctx, `
UPDATE games
SET home_score=$2,away_score=$3,winner_team_id=NULLIF($4,''),status='final',
    started_at=COALESCE(started_at,$5),finished_at=$5
WHERE id=$1 AND status='scheduled'`, gameID, homeScore, awayScore, winner, finishedAt)
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows != 1 {
		return errors.New("game is already final or not found")
	}
	return nil
}

func (r *PostgresRepository) AddGames(ctx context.Context, games []Game) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, game := range games {
		if err := insertGame(ctx, tx, game); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (r *PostgresRepository) UpdateState(ctx context.Context, state State) error {
	result, err := r.db.ExecContext(ctx, `
UPDATE seasons SET status=$3,current_week=$4,champion_team_id=NULLIF($5,''),completed_at=$6
WHERE league_id=$1 AND season=$2`, state.LeagueID, state.Season, state.Status, state.CurrentWeek, state.ChampionTeamID, state.CompletedAt)
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows != 1 {
		return ErrNotFound
	}
	return nil
}

type gameScanner interface{ Scan(...any) error }

func scanGame(scanner gameScanner) (Game, error) {
	var game Game
	var seed int64
	var scheduled, started, finished sql.NullTime
	err := scanner.Scan(
		&game.ID, &game.LeagueID, &game.Season, &game.Week, &game.Phase, &game.HomeTeamID, &game.AwayTeamID,
		&game.Status, &seed, &game.HomeScore, &game.AwayScore, &game.WinnerTeamID, &scheduled, &started, &finished,
	)
	if err != nil {
		return Game{}, err
	}
	game.Seed = uint64(seed)
	if scheduled.Valid {
		value := scheduled.Time
		game.ScheduledAt = &value
	}
	if started.Valid {
		value := started.Time
		game.StartedAt = &value
	}
	if finished.Valid {
		value := finished.Time
		game.FinishedAt = &value
	}
	return game, nil
}

func insertGame(ctx context.Context, tx *sql.Tx, game Game) error {
	result, err := tx.ExecContext(ctx, `
INSERT INTO games(id,league_id,season,week,phase,home_team_id,away_team_id,status,engine_version,seed,
                  scheduled_at,started_at,finished_at,home_score,away_score,winner_team_id)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,'sim-0.3',$9,$10,$11,$12,$13,$14,NULLIF($15,''))`,
		game.ID, game.LeagueID, game.Season, game.Week, game.Phase, game.HomeTeamID, game.AwayTeamID,
		game.Status, int64(game.Seed), game.ScheduledAt, game.StartedAt, game.FinishedAt,
		game.HomeScore, game.AwayScore, game.WinnerTeamID)
	if err != nil {
		return fmt.Errorf("insert season game %s: %w", game.ID, err)
	}
	rows, _ := result.RowsAffected()
	if rows != 1 {
		return fmt.Errorf("insert season game %s affected %d rows", game.ID, rows)
	}
	return nil
}

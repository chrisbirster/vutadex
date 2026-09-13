package franchise

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
)

func (r *PostgresRepository) LifecyclePlayer(ctx context.Context, playerID string) (LifecyclePlayer, error) {
	var player LifecyclePlayer
	err := r.db.QueryRowContext(ctx, `
SELECT p.id,p.league_id,COALESCE(p.team_id,''),p.roster_status,p.first_name,p.last_name,p.position,p.age,p.overall,p.potential,
       COALESCE(l.experience,0),COALESCE(l.durability,75)
FROM players p
LEFT JOIN player_lifecycle_state l ON l.player_id=p.id
WHERE p.id=$1`, playerID).Scan(
		&player.ID, &player.LeagueID, &player.TeamID, &player.Status, &player.FirstName, &player.LastName,
		&player.Position, &player.Age, &player.Overall, &player.Potential, &player.Experience, &player.Durability,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return LifecyclePlayer{}, ErrNotFound
	}
	return player, err
}

func (r *PostgresRepository) LeagueLifecyclePlayers(ctx context.Context, leagueID string) ([]LifecyclePlayer, error) {
	rows, err := r.db.QueryContext(ctx, `
SELECT p.id,p.league_id,COALESCE(p.team_id,''),p.roster_status,p.first_name,p.last_name,p.position,p.age,p.overall,p.potential,
       COALESCE(l.experience,0),COALESCE(l.durability,75)
FROM players p
LEFT JOIN player_lifecycle_state l ON l.player_id=p.id
WHERE p.league_id=$1
ORDER BY p.id`, leagueID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]LifecyclePlayer, 0)
	for rows.Next() {
		var player LifecyclePlayer
		if err := rows.Scan(&player.ID, &player.LeagueID, &player.TeamID, &player.Status, &player.FirstName, &player.LastName, &player.Position, &player.Age, &player.Overall, &player.Potential, &player.Experience, &player.Durability); err != nil {
			return nil, err
		}
		out = append(out, player)
	}
	return out, rows.Err()
}

func (r *PostgresRepository) LeagueSeason(ctx context.Context, leagueID string) (int, error) {
	var season int
	err := r.db.QueryRowContext(ctx, `SELECT season FROM leagues WHERE id=$1`, leagueID).Scan(&season)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrNotFound
	}
	return season, err
}

func (r *PostgresRepository) ScoutReport(ctx context.Context, userID, playerID string) (ScoutReport, error) {
	var report ScoutReport
	err := r.db.QueryRowContext(ctx, `
SELECT league_id,user_id,player_id,observations,overall_low,overall_high,potential_low,potential_high,confidence,updated_at
FROM scouting_reports WHERE user_id=$1 AND player_id=$2`, userID, playerID).Scan(
		&report.LeagueID, &report.UserID, &report.PlayerID, &report.Observations,
		&report.OverallLow, &report.OverallHigh, &report.PotentialLow, &report.PotentialHigh,
		&report.Confidence, &report.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return ScoutReport{}, ErrNotFound
	}
	return report, err
}

func (r *PostgresRepository) SaveScoutReport(ctx context.Context, report ScoutReport) error {
	_, err := r.db.ExecContext(ctx, `
INSERT INTO scouting_reports(user_id,league_id,player_id,observations,overall_low,overall_high,potential_low,potential_high,confidence,updated_at)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
ON CONFLICT(user_id,player_id) DO UPDATE SET
  league_id=EXCLUDED.league_id,
  observations=EXCLUDED.observations,
  overall_low=EXCLUDED.overall_low,
  overall_high=EXCLUDED.overall_high,
  potential_low=EXCLUDED.potential_low,
  potential_high=EXCLUDED.potential_high,
  confidence=EXCLUDED.confidence,
  updated_at=EXCLUDED.updated_at`,
		report.UserID, report.LeagueID, report.PlayerID, report.Observations, report.OverallLow, report.OverallHigh,
		report.PotentialLow, report.PotentialHigh, report.Confidence, report.UpdatedAt,
	)
	return err
}

func (r *PostgresRepository) ActiveInjuries(ctx context.Context, leagueID string) ([]Injury, error) {
	rows, err := r.db.QueryContext(ctx, `
SELECT id,league_id,player_id,team_id,kind,severity,weeks_remaining,occurred_season,occurred_week,status,created_at,recovered_at
FROM injuries WHERE league_id=$1 AND status='active'
ORDER BY weeks_remaining DESC,player_id`, leagueID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Injury, 0)
	for rows.Next() {
		injury, err := scanInjury(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, injury)
	}
	return out, rows.Err()
}

func (r *PostgresRepository) LifecycleEvents(ctx context.Context, leagueID string, limit int) ([]LifecycleEvent, error) {
	rows, err := r.db.QueryContext(ctx, `
SELECT id,league_id,player_id,season,kind,payload,occurred_at
FROM player_lifecycle_events WHERE league_id=$1
ORDER BY occurred_at DESC,id DESC LIMIT $2`, leagueID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]LifecycleEvent, 0)
	for rows.Next() {
		var event LifecycleEvent
		var payload []byte
		if err := rows.Scan(&event.ID, &event.LeagueID, &event.PlayerID, &event.Season, &event.Kind, &payload, &event.OccurredAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(payload, &event.Payload); err != nil {
			return nil, err
		}
		out = append(out, event)
	}
	return out, rows.Err()
}

func (r *PostgresRepository) ApplyInjuryWeek(ctx context.Context, updates []InjuryUpdate, created []Injury, events []LifecycleEvent) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, update := range updates {
		result, err := tx.ExecContext(ctx, `
UPDATE injuries SET weeks_remaining=$2,status=$3,recovered_at=$4
WHERE id=$1 AND status='active'`, update.ID, update.WeeksRemaining, update.Status, update.RecoveredAt)
		if err != nil {
			return err
		}
		if rows, _ := result.RowsAffected(); rows != 1 {
			return fmt.Errorf("injury %s changed while processing week", update.ID)
		}
	}
	for _, injury := range created {
		_, err := tx.ExecContext(ctx, `
INSERT INTO injuries(id,league_id,player_id,team_id,kind,severity,weeks_remaining,occurred_season,occurred_week,status,created_at,recovered_at)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
			injury.ID, injury.LeagueID, injury.PlayerID, injury.TeamID, injury.Kind, injury.Severity,
			injury.WeeksRemaining, injury.OccurredSeason, injury.OccurredWeek, injury.Status, injury.CreatedAt, injury.RecoveredAt)
		if err != nil {
			return err
		}
	}
	for _, event := range events {
		if err := insertLifecycleEvent(ctx, tx, event); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (r *PostgresRepository) ApplySeasonTransition(ctx context.Context, leagueID string, nextSeason int, changes []PlayerSeasonChange, events []LifecycleEvent) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var currentSeason int
	if err := tx.QueryRowContext(ctx, `SELECT season FROM leagues WHERE id=$1 FOR UPDATE`, leagueID).Scan(&currentSeason); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	if nextSeason != currentSeason+1 {
		return errors.New("league season changed")
	}
	for _, change := range changes {
		status := change.Status
		result, err := tx.ExecContext(ctx, `
UPDATE players SET age=$3,overall=$4,potential=$5,roster_status=$6,
  team_id=CASE WHEN $7 THEN NULL ELSE team_id END
WHERE id=$1 AND league_id=$2 AND roster_status<>'retired'`,
			change.PlayerID, leagueID, change.Age, change.Overall, change.Potential, status, change.Retired)
		if err != nil {
			return err
		}
		if rows, _ := result.RowsAffected(); rows != 1 {
			return fmt.Errorf("player %s changed while advancing season", change.PlayerID)
		}
		var retiredAt any
		if change.Retired {
			retiredAt = timeOrNil(events, change.PlayerID)
			if _, err := tx.ExecContext(ctx, `DELETE FROM contracts WHERE player_id=$1`, change.PlayerID); err != nil {
				return err
			}
		}
		_, err = tx.ExecContext(ctx, `
INSERT INTO player_lifecycle_state(player_id,league_id,experience,durability,retired_at,updated_at)
VALUES($1,$2,$3,$4,$5,now())
ON CONFLICT(player_id) DO UPDATE SET
  league_id=EXCLUDED.league_id,
  experience=EXCLUDED.experience,
  durability=EXCLUDED.durability,
  retired_at=COALESCE(player_lifecycle_state.retired_at,EXCLUDED.retired_at),
  updated_at=now()`, change.PlayerID, leagueID, change.Experience, change.Durability, retiredAt)
		if err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE leagues SET season=$2 WHERE id=$1`, leagueID, nextSeason); err != nil {
		return err
	}
	for _, event := range events {
		if err := insertLifecycleEvent(ctx, tx, event); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func insertLifecycleEvent(ctx context.Context, tx *sql.Tx, event LifecycleEvent) error {
	payload, err := json.Marshal(event.Payload)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `
INSERT INTO player_lifecycle_events(id,league_id,player_id,season,kind,payload,occurred_at)
VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)`, event.ID, event.LeagueID, event.PlayerID, event.Season, event.Kind, payload, event.OccurredAt)
	return err
}

func scanInjury(scanner interface{ Scan(...any) error }) (Injury, error) {
	var injury Injury
	var recovered sql.NullTime
	err := scanner.Scan(&injury.ID, &injury.LeagueID, &injury.PlayerID, &injury.TeamID, &injury.Kind, &injury.Severity,
		&injury.WeeksRemaining, &injury.OccurredSeason, &injury.OccurredWeek, &injury.Status, &injury.CreatedAt, &recovered)
	if recovered.Valid {
		value := recovered.Time
		injury.RecoveredAt = &value
	}
	return injury, err
}

func timeOrNil(events []LifecycleEvent, playerID string) any {
	for _, event := range events {
		if event.PlayerID == playerID && event.Kind == "retirement" {
			return event.OccurredAt
		}
	}
	return nil
}

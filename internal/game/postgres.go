package game

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

type PostgresRepository struct {
	db *sql.DB
}

func NewPostgresRepository(db *sql.DB) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) Save(ctx context.Context, current Demo) error {
	snapshot, err := json.Marshal(current)
	if err != nil {
		return err
	}
	gradeJSON, err := json.Marshal(current.Grade)
	if err != nil {
		return err
	}
	status := "in_progress"
	var finishedAt any
	if current.State.Finished {
		status = "final"
		finishedAt = time.Now().UTC()
	}
	_, err = r.db.ExecContext(ctx, `
		INSERT INTO coach_games (id, engine_version, seed, status, snapshot, grade, finished_at, updated_at)
		VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, now())
		ON CONFLICT (id) DO UPDATE SET
			status = EXCLUDED.status,
			snapshot = EXCLUDED.snapshot,
			grade = EXCLUDED.grade,
			finished_at = COALESCE(coach_games.finished_at, EXCLUDED.finished_at),
			updated_at = now()
	`, current.State.ID, "sim-0.3", int64(current.State.Seed), status, snapshot, gradeJSON, finishedAt)
	return err
}

func (r *PostgresRepository) Load(ctx context.Context, id string) (Demo, error) {
	var raw []byte
	err := r.db.QueryRowContext(ctx, `SELECT snapshot FROM coach_games WHERE id = $1`, id).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return Demo{}, ErrSnapshotNotFound
	}
	if err != nil {
		return Demo{}, err
	}
	var current Demo
	if err := json.Unmarshal(raw, &current); err != nil {
		return Demo{}, err
	}
	return current, nil
}

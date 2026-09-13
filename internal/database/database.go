package database

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func Open(ctx context.Context) (*sql.DB, error) {
	url := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	production := strings.EqualFold(os.Getenv("VUTADEX_ENV"), "production")
	if url == "" {
		if production { return nil, errors.New("DATABASE_URL is required in production") }
		return nil, nil
	}
	db, err := sql.Open("pgx", url)
	if err != nil { return nil, err }
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := db.PingContext(pingCtx); err != nil { db.Close(); return nil, err }
	return db, nil
}

package franchise

import (
	"context"
	"database/sql"
)

type Authorizer interface {
	CanManageTeam(context.Context, string, string) (bool, error)
}

type PostgresAuthorizer struct{ db *sql.DB }

func NewPostgresAuthorizer(db *sql.DB) *PostgresAuthorizer { return &PostgresAuthorizer{db: db} }

func (a *PostgresAuthorizer) CanManageTeam(ctx context.Context, userID, teamID string) (bool, error) {
	var allowed bool
	err := a.db.QueryRowContext(ctx, `
SELECT EXISTS(
  SELECT 1 FROM franchise_memberships
  WHERE user_id=$1 AND team_id=$2 AND role IN ('owner','gm')
)`, userID, teamID).Scan(&allowed)
	return allowed, err
}

type AllowAllAuthorizer struct{}

func (AllowAllAuthorizer) CanManageTeam(context.Context, string, string) (bool, error) { return true, nil }

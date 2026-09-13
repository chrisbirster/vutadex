package franchise

import (
	"context"
	"database/sql"
)

type Authorizer interface {
	CanManageTeam(context.Context, string, string) (bool, error)
	CanManageLeague(context.Context, string, string) (bool, error)
	CanAdminLeague(context.Context, string, string) (bool, error)
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

func (a *PostgresAuthorizer) CanManageLeague(ctx context.Context, userID, leagueID string) (bool, error) {
	var allowed bool
	err := a.db.QueryRowContext(ctx, `
SELECT EXISTS(
  SELECT 1 FROM leagues WHERE id=$2 AND owner_user_id=$1
  UNION ALL
  SELECT 1 FROM franchise_memberships WHERE league_id=$2 AND user_id=$1 AND role IN ('owner','gm')
)`, userID, leagueID).Scan(&allowed)
	return allowed, err
}

func (a *PostgresAuthorizer) CanAdminLeague(ctx context.Context, userID, leagueID string) (bool, error) {
	var allowed bool
	err := a.db.QueryRowContext(ctx, `
SELECT EXISTS(
  SELECT 1 FROM leagues WHERE id=$2 AND owner_user_id=$1
  UNION ALL
  SELECT 1 FROM franchise_memberships WHERE league_id=$2 AND user_id=$1 AND role='owner'
)`, userID, leagueID).Scan(&allowed)
	return allowed, err
}

type AllowAllAuthorizer struct{}

func (AllowAllAuthorizer) CanManageTeam(context.Context, string, string) (bool, error) { return true, nil }
func (AllowAllAuthorizer) CanManageLeague(context.Context, string, string) (bool, error) { return true, nil }
func (AllowAllAuthorizer) CanAdminLeague(context.Context, string, string) (bool, error) { return true, nil }

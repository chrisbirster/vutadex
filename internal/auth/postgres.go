package auth

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

type PostgresStore struct { db *sql.DB }
func NewPostgresStore(db *sql.DB) *PostgresStore { return &PostgresStore{db: db} }

func (s *PostgresStore) CreateChallenge(ctx context.Context, c Challenge) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO magic_link_challenges(id,email,token_hash,expires_at) VALUES($1,$2,$3,$4)`, c.ID,c.Email,c.TokenHash[:],c.ExpiresAt)
	return err
}
func (s *PostgresStore) ConsumeChallenge(ctx context.Context,h [32]byte,now time.Time)(string,error){
	var email string
	err:=s.db.QueryRowContext(ctx,`UPDATE magic_link_challenges SET consumed_at=$2 WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>$2 RETURNING email`,h[:],now).Scan(&email)
	if errors.Is(err,sql.ErrNoRows){return "",errors.New("invalid or expired magic link")};return email,err
}
func (s *PostgresStore) UpsertUser(ctx context.Context,email string)(User,error){
	u:=User{};err:=s.db.QueryRowContext(ctx,`INSERT INTO users(id,email) VALUES('usr_'||encode(gen_random_bytes(12),'hex'),$1) ON CONFLICT(email) DO UPDATE SET email=excluded.email RETURNING id,email`,email).Scan(&u.ID,&u.Email);return u,err
}
func (s *PostgresStore) CreateSession(ctx context.Context,ss Session)error{_,err:=s.db.ExecContext(ctx,`INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4)`,ss.ID,ss.UserID,ss.TokenHash[:],ss.ExpiresAt);return err}
func (s *PostgresStore) Session(ctx context.Context,h [32]byte,now time.Time)(User,error){u:=User{};err:=s.db.QueryRowContext(ctx,`SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>$2`,h[:],now).Scan(&u.ID,&u.Email);if errors.Is(err,sql.ErrNoRows){return User{},errors.New("invalid session")};return u,err}
func (s *PostgresStore) DeleteSession(ctx context.Context,h [32]byte)error{_,err:=s.db.ExecContext(ctx,`DELETE FROM sessions WHERE token_hash=$1`,h[:]);return err}

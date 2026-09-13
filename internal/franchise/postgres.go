package franchise

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

type PostgresRepository struct{ db *sql.DB }

func NewPostgresRepository(db *sql.DB) *PostgresRepository { return &PostgresRepository{db: db} }

func (r *PostgresRepository) Player(ctx context.Context, id string) (PlayerAsset, error) {
	var player PlayerAsset
	err := r.db.QueryRowContext(ctx, `
SELECT id,league_id,COALESCE(team_id,''),roster_status,first_name,last_name,position,age,overall,potential
FROM players WHERE id=$1`, id).Scan(
		&player.ID, &player.LeagueID, &player.TeamID, &player.Status, &player.FirstName, &player.LastName,
		&player.Position, &player.Age, &player.Overall, &player.Potential,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return PlayerAsset{}, ErrNotFound
	}
	return player, err
}

func (r *PostgresRepository) TeamContracts(ctx context.Context, teamID string) ([]Contract, error) {
	rows, err := r.db.QueryContext(ctx, `
SELECT id,league_id,player_id,team_id,start_season,years,annual_value,guaranteed,signed_at
FROM contracts WHERE team_id=$1 ORDER BY annual_value DESC,player_id`, teamID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Contract, 0)
	for rows.Next() {
		var contract Contract
		if err := rows.Scan(&contract.ID, &contract.LeagueID, &contract.PlayerID, &contract.TeamID, &contract.StartSeason, &contract.Years, &contract.AnnualValue, &contract.Guaranteed, &contract.SignedAt); err != nil {
			return nil, err
		}
		out = append(out, contract)
	}
	return out, rows.Err()
}

func (r *PostgresRepository) FreeAgents(ctx context.Context, leagueID string) ([]PlayerAsset, error) {
	rows, err := r.db.QueryContext(ctx, `
SELECT id,league_id,COALESCE(team_id,''),roster_status,first_name,last_name,position,age,overall,potential
FROM players WHERE league_id=$1 AND roster_status='free_agent' ORDER BY overall DESC,potential DESC,id`, leagueID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanPlayers(rows)
}

func (r *PostgresRepository) DraftPick(ctx context.Context, id string) (DraftPick, error) {
	var pick DraftPick
	err := r.db.QueryRowContext(ctx, `
SELECT id,league_id,original_team_id,team_id,season,round,pick
FROM draft_picks WHERE id=$1 AND used_player_id IS NULL`, id).Scan(
		&pick.ID, &pick.LeagueID, &pick.OriginalTeamID, &pick.TeamID, &pick.Season, &pick.Round, &pick.Pick,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return DraftPick{}, ErrNotFound
	}
	return pick, err
}

func (r *PostgresRepository) TeamDraftPicks(ctx context.Context, teamID string, season int) ([]DraftPick, error) {
	query := `SELECT id,league_id,original_team_id,team_id,season,round,pick FROM draft_picks WHERE team_id=$1 AND used_player_id IS NULL`
	args := []any{teamID}
	if season != 0 {
		query += ` AND season=$2`
		args = append(args, season)
	}
	query += ` ORDER BY season,round,pick`
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]DraftPick, 0)
	for rows.Next() {
		var pick DraftPick
		if err := rows.Scan(&pick.ID, &pick.LeagueID, &pick.OriginalTeamID, &pick.TeamID, &pick.Season, &pick.Round, &pick.Pick); err != nil {
			return nil, err
		}
		out = append(out, pick)
	}
	return out, rows.Err()
}

func (r *PostgresRepository) Transactions(ctx context.Context, leagueID string, limit int) ([]Transaction, error) {
	rows, err := r.db.QueryContext(ctx, `
SELECT id,league_id,kind,team_ids,player_ids,pick_ids,occurred_at,summary
FROM franchise_transactions WHERE league_id=$1 ORDER BY occurred_at DESC,id DESC LIMIT $2`, leagueID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Transaction, 0)
	for rows.Next() {
		var txn Transaction
		var teams, players, picks []byte
		if err := rows.Scan(&txn.ID, &txn.LeagueID, &txn.Type, &teams, &players, &picks, &txn.OccurredAt, &txn.Summary); err != nil {
			return nil, err
		}
		if err := decodeStringList(teams, &txn.TeamIDs); err != nil {
			return nil, err
		}
		if err := decodeStringList(players, &txn.PlayerIDs); err != nil {
			return nil, err
		}
		if err := decodeStringList(picks, &txn.PickIDs); err != nil {
			return nil, err
		}
		out = append(out, txn)
	}
	return out, rows.Err()
}

func (r *PostgresRepository) Offer(ctx context.Context, id string) (Offer, error) {
	_, _ = r.db.ExecContext(ctx, `UPDATE trade_offers SET status='expired' WHERE id=$1 AND status='open' AND expires_at <= now()`, id)
	row := r.db.QueryRowContext(ctx, `
SELECT id,league_id,from_team_id,to_team_id,from_player_ids,to_player_ids,from_pick_ids,to_pick_ids,status,expires_at,created_at
FROM trade_offers WHERE id=$1`, id)
	offer, err := scanOffer(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Offer{}, ErrNotFound
	}
	return offer, err
}

func (r *PostgresRepository) OffersForTeam(ctx context.Context, teamID string) ([]Offer, error) {
	_, _ = r.db.ExecContext(ctx, `UPDATE trade_offers SET status='expired' WHERE status='open' AND expires_at <= now() AND (from_team_id=$1 OR to_team_id=$1)`, teamID)
	rows, err := r.db.QueryContext(ctx, `
SELECT id,league_id,from_team_id,to_team_id,from_player_ids,to_player_ids,from_pick_ids,to_pick_ids,status,expires_at,created_at
FROM trade_offers WHERE from_team_id=$1 OR to_team_id=$1 ORDER BY created_at DESC`, teamID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Offer, 0)
	for rows.Next() {
		offer, err := scanOffer(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, offer)
	}
	return out, rows.Err()
}

func (r *PostgresRepository) WaiverClaims(ctx context.Context, leagueID string) ([]WaiverClaim, error) {
	rows, err := r.db.QueryContext(ctx, `
SELECT id,league_id,player_id,team_id,priority,created_at
FROM waiver_claims WHERE league_id=$1 ORDER BY player_id,priority,created_at,id`, leagueID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]WaiverClaim, 0)
	for rows.Next() {
		var claim WaiverClaim
		if err := rows.Scan(&claim.ID, &claim.LeagueID, &claim.PlayerID, &claim.TeamID, &claim.Priority, &claim.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, claim)
	}
	return out, rows.Err()
}

func (r *PostgresRepository) Sign(ctx context.Context, contract Contract, txn Transaction) error {
	return r.withTx(ctx, func(tx *sql.Tx) error {
		result, err := tx.ExecContext(ctx, `UPDATE players SET team_id=$1,roster_status='roster' WHERE id=$2 AND team_id IS NULL AND roster_status='free_agent'`, contract.TeamID, contract.PlayerID)
		if err != nil {
			return err
		}
		if err := requireOne(result, "player is no longer a free agent"); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `
INSERT INTO contracts(id,league_id,player_id,team_id,start_season,years,annual_value,guaranteed,signed_at)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, contract.ID, contract.LeagueID, contract.PlayerID, contract.TeamID, contract.StartSeason, contract.Years, contract.AnnualValue, contract.Guaranteed, contract.SignedAt); err != nil {
			return err
		}
		return insertTransaction(ctx, tx, txn)
	})
}

func (r *PostgresRepository) Release(ctx context.Context, teamID, playerID string, txn Transaction) error {
	return r.withTx(ctx, func(tx *sql.Tx) error {
		result, err := tx.ExecContext(ctx, `UPDATE players SET team_id=NULL,roster_status='waivers' WHERE id=$1 AND team_id=$2 AND roster_status='roster'`, playerID, teamID)
		if err != nil {
			return err
		}
		if err := requireOne(result, "team no longer controls player"); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM contracts WHERE player_id=$1 AND team_id=$2`, playerID, teamID); err != nil {
			return err
		}
		return insertTransaction(ctx, tx, txn)
	})
}

func (r *PostgresRepository) SubmitWaiverClaim(ctx context.Context, claim WaiverClaim) error {
	result, err := r.db.ExecContext(ctx, `
INSERT INTO waiver_claims(id,league_id,player_id,team_id,priority,created_at)
SELECT $1,$2,$3,$4,$5,$6
WHERE EXISTS(SELECT 1 FROM players WHERE id=$3 AND league_id=$2 AND roster_status='waivers' AND team_id IS NULL)`,
		claim.ID, claim.LeagueID, claim.PlayerID, claim.TeamID, claim.Priority, claim.CreatedAt)
	if err != nil {
		return err
	}
	return requireOne(result, "player is not on waivers")
}

func (r *PostgresRepository) AwardWaiver(ctx context.Context, claim WaiverClaim, contract Contract, txn Transaction) error {
	return r.withTx(ctx, func(tx *sql.Tx) error {
		result, err := tx.ExecContext(ctx, `UPDATE players SET team_id=$1,roster_status='roster' WHERE id=$2 AND team_id IS NULL AND roster_status='waivers'`, claim.TeamID, claim.PlayerID)
		if err != nil {
			return err
		}
		if err := requireOne(result, "player is no longer on waivers"); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `
INSERT INTO contracts(id,league_id,player_id,team_id,start_season,years,annual_value,guaranteed,signed_at)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, contract.ID, contract.LeagueID, contract.PlayerID, contract.TeamID, contract.StartSeason, contract.Years, contract.AnnualValue, contract.Guaranteed, contract.SignedAt); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM waiver_claims WHERE player_id=$1`, claim.PlayerID); err != nil {
			return err
		}
		return insertTransaction(ctx, tx, txn)
	})
}

func (r *PostgresRepository) DraftPlayer(ctx context.Context, pick DraftPick, playerID string, contract Contract, txn Transaction) error {
	return r.withTx(ctx, func(tx *sql.Tx) error {
		result, err := tx.ExecContext(ctx, `UPDATE draft_picks SET used_player_id=$1 WHERE id=$2 AND team_id=$3 AND used_player_id IS NULL`, playerID, pick.ID, pick.TeamID)
		if err != nil {
			return err
		}
		if err := requireOne(result, "draft pick is no longer available"); err != nil {
			return err
		}
		result, err = tx.ExecContext(ctx, `UPDATE players SET team_id=$1,roster_status='roster' WHERE id=$2 AND team_id IS NULL AND roster_status='draft'`, pick.TeamID, playerID)
		if err != nil {
			return err
		}
		if err := requireOne(result, "player is not an available draft prospect"); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `
INSERT INTO contracts(id,league_id,player_id,team_id,start_season,years,annual_value,guaranteed,signed_at)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, contract.ID, contract.LeagueID, contract.PlayerID, contract.TeamID, contract.StartSeason, contract.Years, contract.AnnualValue, contract.Guaranteed, contract.SignedAt); err != nil {
			return err
		}
		return insertTransaction(ctx, tx, txn)
	})
}

func (r *PostgresRepository) SaveOffer(ctx context.Context, offer Offer) error {
	fromPlayers, _ := json.Marshal(offer.FromPlayerIDs)
	toPlayers, _ := json.Marshal(offer.ToPlayerIDs)
	fromPicks, _ := json.Marshal(offer.FromPickIDs)
	toPicks, _ := json.Marshal(offer.ToPickIDs)
	_, err := r.db.ExecContext(ctx, `
INSERT INTO trade_offers(id,league_id,from_team_id,to_team_id,from_player_ids,to_player_ids,from_pick_ids,to_pick_ids,status,expires_at,created_at)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, offer.ID, offer.LeagueID, offer.FromTeamID, offer.ToTeamID, fromPlayers, toPlayers, fromPicks, toPicks, offer.Status, offer.ExpiresAt, offer.CreatedAt)
	return err
}

func (r *PostgresRepository) SetOfferStatus(ctx context.Context, id string, status OfferStatus) error {
	result, err := r.db.ExecContext(ctx, `UPDATE trade_offers SET status=$1 WHERE id=$2`, status, id)
	if err != nil {
		return err
	}
	if err := requireOne(result, "offer not found"); err != nil {
		return ErrNotFound
	}
	return nil
}

func (r *PostgresRepository) ExecuteTrade(ctx context.Context, execution TradeExecution, txn Transaction) error {
	return r.withTx(ctx, func(tx *sql.Tx) error {
		for _, playerID := range execution.FromPlayerIDs {
			if err := transferPlayer(ctx, tx, playerID, execution.FromTeamID, execution.ToTeamID); err != nil {
				return err
			}
		}
		for _, playerID := range execution.ToPlayerIDs {
			if err := transferPlayer(ctx, tx, playerID, execution.ToTeamID, execution.FromTeamID); err != nil {
				return err
			}
		}
		for _, pickID := range execution.FromPickIDs {
			if err := transferPick(ctx, tx, pickID, execution.FromTeamID, execution.ToTeamID); err != nil {
				return err
			}
		}
		for _, pickID := range execution.ToPickIDs {
			if err := transferPick(ctx, tx, pickID, execution.ToTeamID, execution.FromTeamID); err != nil {
				return err
			}
		}
		return insertTransaction(ctx, tx, txn)
	})
}

func (r *PostgresRepository) withTx(ctx context.Context, fn func(*sql.Tx) error) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

func transferPlayer(ctx context.Context, tx *sql.Tx, playerID, fromTeamID, toTeamID string) error {
	result, err := tx.ExecContext(ctx, `UPDATE players SET team_id=$1 WHERE id=$2 AND team_id=$3 AND roster_status='roster'`, toTeamID, playerID, fromTeamID)
	if err != nil {
		return err
	}
	if err := requireOne(result, "trade player ownership changed"); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `UPDATE contracts SET team_id=$1 WHERE player_id=$2 AND team_id=$3`, toTeamID, playerID, fromTeamID)
	return err
}

func transferPick(ctx context.Context, tx *sql.Tx, pickID, fromTeamID, toTeamID string) error {
	result, err := tx.ExecContext(ctx, `UPDATE draft_picks SET team_id=$1 WHERE id=$2 AND team_id=$3 AND used_player_id IS NULL`, toTeamID, pickID, fromTeamID)
	if err != nil {
		return err
	}
	return requireOne(result, "trade pick ownership changed")
}

func insertTransaction(ctx context.Context, tx *sql.Tx, txn Transaction) error {
	teams, err := json.Marshal(txn.TeamIDs)
	if err != nil {
		return err
	}
	players, err := json.Marshal(txn.PlayerIDs)
	if err != nil {
		return err
	}
	picks, err := json.Marshal(txn.PickIDs)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `
INSERT INTO franchise_transactions(id,league_id,kind,team_ids,player_ids,pick_ids,summary,occurred_at)
VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, txn.ID, txn.LeagueID, txn.Type, teams, players, picks, txn.Summary, txn.OccurredAt)
	return err
}

func requireOne(result sql.Result, message string) error {
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count != 1 {
		return errors.New(message)
	}
	return nil
}

type scanner interface{ Scan(...any) error }

func scanOffer(row scanner) (Offer, error) {
	var offer Offer
	var fromPlayers, toPlayers, fromPicks, toPicks []byte
	err := row.Scan(&offer.ID, &offer.LeagueID, &offer.FromTeamID, &offer.ToTeamID, &fromPlayers, &toPlayers, &fromPicks, &toPicks, &offer.Status, &offer.ExpiresAt, &offer.CreatedAt)
	if err != nil {
		return Offer{}, err
	}
	if err := decodeStringList(fromPlayers, &offer.FromPlayerIDs); err != nil {
		return Offer{}, err
	}
	if err := decodeStringList(toPlayers, &offer.ToPlayerIDs); err != nil {
		return Offer{}, err
	}
	if err := decodeStringList(fromPicks, &offer.FromPickIDs); err != nil {
		return Offer{}, err
	}
	if err := decodeStringList(toPicks, &offer.ToPickIDs); err != nil {
		return Offer{}, err
	}
	return offer, nil
}

func decodeStringList(raw []byte, out *[]string) error {
	if len(raw) == 0 {
		*out = []string{}
		return nil
	}
	return json.Unmarshal(raw, out)
}

func scanPlayers(rows *sql.Rows) ([]PlayerAsset, error) {
	out := make([]PlayerAsset, 0)
	for rows.Next() {
		var player PlayerAsset
		if err := rows.Scan(&player.ID, &player.LeagueID, &player.TeamID, &player.Status, &player.FirstName, &player.LastName, &player.Position, &player.Age, &player.Overall, &player.Potential); err != nil {
			return nil, err
		}
		out = append(out, player)
	}
	return out, rows.Err()
}

var _ Repository = (*PostgresRepository)(nil)
var _ = fmt.Sprintf
var _ = time.Now

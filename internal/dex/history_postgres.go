package dex

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

type PostgresHistoryRepository struct{ db *sql.DB }

func NewPostgresHistoryRepository(db *sql.DB) *PostgresHistoryRepository { return &PostgresHistoryRepository{db: db} }

func (r *PostgresHistoryRepository) AddStats(ctx context.Context, delta StatDelta) (PlayerSeasonStats,error){
	var out PlayerSeasonStats
	err:=r.db.QueryRowContext(ctx,`
INSERT INTO player_season_stats(
 league_id,season,player_id,team_id,games,passing_yards,passing_touchdowns,interceptions_thrown,
 rushing_yards,rushing_touchdowns,receiving_yards,receiving_touchdowns,tackles,sacks,defensive_interceptions)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
ON CONFLICT(league_id,season,player_id) DO UPDATE SET
 team_id=EXCLUDED.team_id,
 games=player_season_stats.games+EXCLUDED.games,
 passing_yards=player_season_stats.passing_yards+EXCLUDED.passing_yards,
 passing_touchdowns=player_season_stats.passing_touchdowns+EXCLUDED.passing_touchdowns,
 interceptions_thrown=player_season_stats.interceptions_thrown+EXCLUDED.interceptions_thrown,
 rushing_yards=player_season_stats.rushing_yards+EXCLUDED.rushing_yards,
 rushing_touchdowns=player_season_stats.rushing_touchdowns+EXCLUDED.rushing_touchdowns,
 receiving_yards=player_season_stats.receiving_yards+EXCLUDED.receiving_yards,
 receiving_touchdowns=player_season_stats.receiving_touchdowns+EXCLUDED.receiving_touchdowns,
 tackles=player_season_stats.tackles+EXCLUDED.tackles,
 sacks=player_season_stats.sacks+EXCLUDED.sacks,
 defensive_interceptions=player_season_stats.defensive_interceptions+EXCLUDED.defensive_interceptions
RETURNING league_id,season,player_id,team_id,games,passing_yards,passing_touchdowns,interceptions_thrown,
 rushing_yards,rushing_touchdowns,receiving_yards,receiving_touchdowns,tackles,sacks,defensive_interceptions`,
		delta.LeagueID,delta.Season,delta.PlayerID,delta.TeamID,delta.Games,delta.PassingYards,delta.PassingTouchdowns,delta.InterceptionsThrown,
		delta.RushingYards,delta.RushingTouchdowns,delta.ReceivingYards,delta.ReceivingTouchdowns,delta.Tackles,delta.Sacks,delta.DefensiveInterceptions).Scan(statScanArgs(&out)...)
	return out,err
}

func (r *PostgresHistoryRepository) SeasonStats(ctx context.Context,leagueID string,season int)([]PlayerSeasonStats,error){
	return r.queryStats(ctx,`SELECT league_id,season,player_id,team_id,games,passing_yards,passing_touchdowns,interceptions_thrown,rushing_yards,rushing_touchdowns,receiving_yards,receiving_touchdowns,tackles,sacks,defensive_interceptions FROM player_season_stats WHERE league_id=$1 AND season=$2 ORDER BY player_id`,leagueID,season)
}
func (r *PostgresHistoryRepository) PlayerSeasons(ctx context.Context,leagueID,playerID string)([]PlayerSeasonStats,error){
	return r.queryStats(ctx,`SELECT league_id,season,player_id,team_id,games,passing_yards,passing_touchdowns,interceptions_thrown,rushing_yards,rushing_touchdowns,receiving_yards,receiving_touchdowns,tackles,sacks,defensive_interceptions FROM player_season_stats WHERE league_id=$1 AND player_id=$2 ORDER BY season`,leagueID,playerID)
}
func (r *PostgresHistoryRepository) AllStats(ctx context.Context,leagueID string)([]PlayerSeasonStats,error){
	return r.queryStats(ctx,`SELECT league_id,season,player_id,team_id,games,passing_yards,passing_touchdowns,interceptions_thrown,rushing_yards,rushing_touchdowns,receiving_yards,receiving_touchdowns,tackles,sacks,defensive_interceptions FROM player_season_stats WHERE league_id=$1 ORDER BY season,player_id`,leagueID)
}
func (r *PostgresHistoryRepository) queryStats(ctx context.Context,q string,args ...any)([]PlayerSeasonStats,error){
	rows,err:=r.db.QueryContext(ctx,q,args...);if err!=nil{return nil,err};defer rows.Close();out:=make([]PlayerSeasonStats,0);for rows.Next(){var row PlayerSeasonStats;if err:=rows.Scan(statScanArgs(&row)...);err!=nil{return nil,err};out=append(out,row)};return out,rows.Err()
}

func (r *PostgresHistoryRepository) Awards(ctx context.Context,leagueID string,season int)([]Award,error){
	rows,err:=r.db.QueryContext(ctx,`SELECT id,league_id,season,name,player_id,team_id,score FROM player_awards WHERE league_id=$1 AND season=$2 ORDER BY name`,leagueID,season);if err!=nil{return nil,err};defer rows.Close();out:=make([]Award,0);for rows.Next(){var a Award;if err:=rows.Scan(&a.ID,&a.LeagueID,&a.Season,&a.Name,&a.PlayerID,&a.TeamID,&a.Score);err!=nil{return nil,err};out=append(out,a)};return out,rows.Err()
}
func (r *PostgresHistoryRepository) PlayerAwards(ctx context.Context,leagueID,playerID string)([]Award,error){
	rows,err:=r.db.QueryContext(ctx,`SELECT id,league_id,season,name,player_id,team_id,score FROM player_awards WHERE league_id=$1 AND player_id=$2 ORDER BY season,name`,leagueID,playerID);if err!=nil{return nil,err};defer rows.Close();out:=make([]Award,0);for rows.Next(){var a Award;if err:=rows.Scan(&a.ID,&a.LeagueID,&a.Season,&a.Name,&a.PlayerID,&a.TeamID,&a.Score);err!=nil{return nil,err};out=append(out,a)};return out,rows.Err()
}
func (r *PostgresHistoryRepository) ReplaceAwards(ctx context.Context,leagueID string,season int,awards []Award)error{
	tx,err:=r.db.BeginTx(ctx,nil);if err!=nil{return err};defer tx.Rollback();if _,err=tx.ExecContext(ctx,`DELETE FROM player_awards WHERE league_id=$1 AND season=$2`,leagueID,season);err!=nil{return err};for _,a:=range awards{if _,err=tx.ExecContext(ctx,`INSERT INTO player_awards(id,league_id,season,name,player_id,team_id,score) VALUES($1,$2,$3,$4,$5,$6,$7)`,a.ID,a.LeagueID,a.Season,a.Name,a.PlayerID,a.TeamID,a.Score);err!=nil{return err}};return tx.Commit()
}

func (r *PostgresHistoryRepository) Records(ctx context.Context,leagueID string)([]LeagueRecord,error){
	rows,err:=r.db.QueryContext(ctx,`SELECT league_id,scope,category,player_id,COALESCE(season,0),value FROM league_records WHERE league_id=$1 ORDER BY scope,category`,leagueID);if err!=nil{return nil,err};defer rows.Close();out:=make([]LeagueRecord,0);for rows.Next(){var rec LeagueRecord;if err:=rows.Scan(&rec.LeagueID,&rec.Scope,&rec.Category,&rec.PlayerID,&rec.Season,&rec.Value);err!=nil{return nil,err};out=append(out,rec)};return out,rows.Err()
}
func (r *PostgresHistoryRepository) ReplaceRecords(ctx context.Context,leagueID string,records []LeagueRecord)error{
	tx,err:=r.db.BeginTx(ctx,nil);if err!=nil{return err};defer tx.Rollback();if _,err=tx.ExecContext(ctx,`DELETE FROM league_records WHERE league_id=$1`,leagueID);err!=nil{return err};for _,rec:=range records{var season any;if rec.Season>0{season=rec.Season};if _,err=tx.ExecContext(ctx,`INSERT INTO league_records(league_id,scope,category,player_id,season,value) VALUES($1,$2,$3,$4,$5,$6)`,rec.LeagueID,rec.Scope,rec.Category,rec.PlayerID,season,rec.Value);err!=nil{return err}};return tx.Commit()
}

func (r *PostgresHistoryRepository) HallOfFame(ctx context.Context,leagueID string)([]HallOfFameEntry,error){
	rows,err:=r.db.QueryContext(ctx,`SELECT league_id,player_id,inducted_season,score,reason,inducted_at FROM hall_of_fame WHERE league_id=$1 ORDER BY score DESC,player_id`,leagueID);if err!=nil{return nil,err};defer rows.Close();out:=make([]HallOfFameEntry,0);for rows.Next(){var e HallOfFameEntry;if err:=rows.Scan(&e.LeagueID,&e.PlayerID,&e.InductedSeason,&e.Score,&e.Reason,&e.InductedAt);err!=nil{return nil,err};out=append(out,e)};return out,rows.Err()
}
func (r *PostgresHistoryRepository) UpsertHallOfFame(ctx context.Context,e HallOfFameEntry)error{_,err:=r.db.ExecContext(ctx,`INSERT INTO hall_of_fame(league_id,player_id,inducted_season,score,reason,inducted_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(league_id,player_id) DO NOTHING`,e.LeagueID,e.PlayerID,e.InductedSeason,e.Score,e.Reason,e.InductedAt);return err}

func (r *PostgresHistoryRepository) CompletedGames(ctx context.Context,leagueID string)([]HistoricalGame,error){
	rows,err:=r.db.QueryContext(ctx,`SELECT id,league_id,season,phase,home_team_id,away_team_id,home_score,away_score,COALESCE(winner_team_id,'') FROM games WHERE league_id=$1 AND status='final' ORDER BY season,week,id`,leagueID);if err!=nil{return nil,err};defer rows.Close();out:=make([]HistoricalGame,0);for rows.Next(){var g HistoricalGame;if err:=rows.Scan(&g.ID,&g.LeagueID,&g.Season,&g.Phase,&g.HomeTeamID,&g.AwayTeamID,&g.HomeScore,&g.AwayScore,&g.WinnerTeamID);err!=nil{return nil,err};out=append(out,g)};return out,rows.Err()
}

func (r *PostgresHistoryRepository) Search(ctx context.Context,leagueID,query string,limit int)([]SearchResult,error){
	pattern:="%"+query+"%"
	rows,err:=r.db.QueryContext(ctx,`
SELECT kind,id,title,subtitle,league_id FROM (
  SELECT 'player'::text AS kind,p.id,p.first_name||' '||p.last_name AS title,p.position||' · '||p.roster_status AS subtitle,p.league_id,1 AS rank
  FROM players p WHERE p.league_id=$1 AND (p.first_name ILIKE $2 OR p.last_name ILIKE $2 OR (p.first_name||' '||p.last_name) ILIKE $2)
  UNION ALL
  SELECT 'team',t.id,t.city||' '||t.name,t.abbreviation,t.league_id,2
  FROM teams t WHERE t.league_id=$1 AND (t.city ILIKE $2 OR t.name ILIKE $2 OR t.abbreviation ILIKE $2 OR (t.city||' '||t.name) ILIKE $2)
  UNION ALL
  SELECT 'dex',d.subject_id,d.title,d.summary,d.league_id,3
  FROM dex_entries d WHERE d.league_id=$1 AND (d.title ILIKE $2 OR d.summary ILIKE $2)
  UNION ALL
  SELECT 'award',a.player_id,a.name||' — '||p.first_name||' '||p.last_name,a.season::text,a.league_id,4
  FROM player_awards a JOIN players p ON p.id=a.player_id WHERE a.league_id=$1 AND (a.name ILIKE $2 OR p.first_name ILIKE $2 OR p.last_name ILIKE $2)
) q ORDER BY rank,title,id LIMIT $3`,leagueID,pattern,limit)
	if err!=nil{return nil,err};defer rows.Close();out:=make([]SearchResult,0);for rows.Next(){var result SearchResult;if err:=rows.Scan(&result.Kind,&result.ID,&result.Title,&result.Subtitle,&result.LeagueID);err!=nil{return nil,err};out=append(out,result)};return out,rows.Err()
}

func statScanArgs(row *PlayerSeasonStats)[]any{return []any{&row.LeagueID,&row.Season,&row.PlayerID,&row.TeamID,&row.Games,&row.PassingYards,&row.PassingTouchdowns,&row.InterceptionsThrown,&row.RushingYards,&row.RushingTouchdowns,&row.ReceivingYards,&row.ReceivingTouchdowns,&row.Tackles,&row.Sacks,&row.DefensiveInterceptions}}

var _ HistoryRepository = (*PostgresHistoryRepository)(nil)
var _ = fmt.Sprintf
var _ = errors.Is

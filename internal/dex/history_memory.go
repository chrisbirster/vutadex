package dex

import (
	"context"
	"sort"
	"strings"
	"sync"
)

type MemoryHistoryRepository struct {
	mu      sync.Mutex
	stats   map[string]PlayerSeasonStats
	awards  map[string][]Award
	records map[string][]LeagueRecord
	hof     map[string]HallOfFameEntry
	games   []HistoricalGame
	search  []SearchResult
}

func NewMemoryHistoryRepository() *MemoryHistoryRepository {
	return &MemoryHistoryRepository{
		stats: map[string]PlayerSeasonStats{}, awards: map[string][]Award{},
		records: map[string][]LeagueRecord{}, hof: map[string]HallOfFameEntry{},
	}
}

func statKey(leagueID string, season int, playerID string) string {
	return leagueID + "|" + itoa(season) + "|" + playerID
}

func awardKey(leagueID string, season int) string { return leagueID + "|" + itoa(season) }
func hofKey(leagueID, playerID string) string { return leagueID + "|" + playerID }

func (r *MemoryHistoryRepository) SeedGame(game HistoricalGame) {
	r.mu.Lock(); defer r.mu.Unlock()
	r.games = append(r.games, game)
}

func (r *MemoryHistoryRepository) SeedSearch(results ...SearchResult) {
	r.mu.Lock(); defer r.mu.Unlock()
	r.search = append(r.search, results...)
}

func (r *MemoryHistoryRepository) AddStats(_ context.Context, delta StatDelta) (PlayerSeasonStats, error) {
	r.mu.Lock(); defer r.mu.Unlock()
	key := statKey(delta.LeagueID, delta.Season, delta.PlayerID)
	current := r.stats[key]
	if current.PlayerID == "" {
		current.LeagueID, current.Season, current.PlayerID, current.TeamID = delta.LeagueID, delta.Season, delta.PlayerID, delta.TeamID
	}
	current.TeamID = delta.TeamID
	current.Games += delta.Games
	current.PassingYards += delta.PassingYards
	current.PassingTouchdowns += delta.PassingTouchdowns
	current.InterceptionsThrown += delta.InterceptionsThrown
	current.RushingYards += delta.RushingYards
	current.RushingTouchdowns += delta.RushingTouchdowns
	current.ReceivingYards += delta.ReceivingYards
	current.ReceivingTouchdowns += delta.ReceivingTouchdowns
	current.Tackles += delta.Tackles
	current.Sacks += delta.Sacks
	current.DefensiveInterceptions += delta.DefensiveInterceptions
	r.stats[key] = current
	return current, nil
}

func (r *MemoryHistoryRepository) SeasonStats(_ context.Context, leagueID string, season int) ([]PlayerSeasonStats, error) {
	r.mu.Lock(); defer r.mu.Unlock()
	out := make([]PlayerSeasonStats, 0)
	for _, row := range r.stats { if row.LeagueID == leagueID && row.Season == season { out = append(out, row) } }
	sortStats(out)
	return out, nil
}

func (r *MemoryHistoryRepository) PlayerSeasons(_ context.Context, leagueID, playerID string) ([]PlayerSeasonStats, error) {
	r.mu.Lock(); defer r.mu.Unlock()
	out := make([]PlayerSeasonStats, 0)
	for _, row := range r.stats { if row.LeagueID == leagueID && row.PlayerID == playerID { out = append(out, row) } }
	sort.Slice(out, func(i,j int) bool { return out[i].Season < out[j].Season })
	return out, nil
}

func (r *MemoryHistoryRepository) AllStats(_ context.Context, leagueID string) ([]PlayerSeasonStats, error) {
	r.mu.Lock(); defer r.mu.Unlock()
	out := make([]PlayerSeasonStats,0)
	for _, row := range r.stats { if row.LeagueID == leagueID { out=append(out,row) } }
	sort.Slice(out,func(i,j int)bool{ if out[i].Season!=out[j].Season{return out[i].Season<out[j].Season};return out[i].PlayerID<out[j].PlayerID })
	return out,nil
}

func (r *MemoryHistoryRepository) Awards(_ context.Context, leagueID string, season int) ([]Award,error){
	r.mu.Lock();defer r.mu.Unlock();return append([]Award(nil),r.awards[awardKey(leagueID,season)]...),nil
}
func (r *MemoryHistoryRepository) PlayerAwards(_ context.Context,leagueID,playerID string)([]Award,error){
	r.mu.Lock();defer r.mu.Unlock();out:=make([]Award,0);for key,rows:=range r.awards{_ = key;for _,award:=range rows{if award.LeagueID==leagueID&&award.PlayerID==playerID{out=append(out,award)}}};sort.Slice(out,func(i,j int)bool{return out[i].Season<out[j].Season});return out,nil
}
func (r *MemoryHistoryRepository) ReplaceAwards(_ context.Context,leagueID string,season int,awards []Award)error{
	r.mu.Lock();defer r.mu.Unlock();r.awards[awardKey(leagueID,season)]=append([]Award(nil),awards...);return nil
}
func (r *MemoryHistoryRepository) Records(_ context.Context,leagueID string)([]LeagueRecord,error){r.mu.Lock();defer r.mu.Unlock();return append([]LeagueRecord(nil),r.records[leagueID]...),nil}
func (r *MemoryHistoryRepository) ReplaceRecords(_ context.Context,leagueID string,records []LeagueRecord)error{r.mu.Lock();defer r.mu.Unlock();r.records[leagueID]=append([]LeagueRecord(nil),records...);return nil}
func (r *MemoryHistoryRepository) HallOfFame(_ context.Context,leagueID string)([]HallOfFameEntry,error){r.mu.Lock();defer r.mu.Unlock();out:=make([]HallOfFameEntry,0);for _,entry:=range r.hof{if entry.LeagueID==leagueID{out=append(out,entry)}};sort.Slice(out,func(i,j int)bool{if out[i].Score!=out[j].Score{return out[i].Score>out[j].Score};return out[i].PlayerID<out[j].PlayerID});return out,nil}
func (r *MemoryHistoryRepository) UpsertHallOfFame(_ context.Context,entry HallOfFameEntry)error{r.mu.Lock();defer r.mu.Unlock();r.hof[hofKey(entry.LeagueID,entry.PlayerID)]=entry;return nil}
func (r *MemoryHistoryRepository) CompletedGames(_ context.Context,leagueID string)([]HistoricalGame,error){r.mu.Lock();defer r.mu.Unlock();out:=make([]HistoricalGame,0);for _,game:=range r.games{if game.LeagueID==leagueID{out=append(out,game)}};return out,nil}
func (r *MemoryHistoryRepository) Search(_ context.Context,leagueID,query string,limit int)([]SearchResult,error){
	r.mu.Lock();defer r.mu.Unlock();needle:=strings.ToLower(query);out:=make([]SearchResult,0,limit);for _,result:=range r.search{if result.LeagueID!=leagueID{continue};hay:=strings.ToLower(result.Title+" "+result.Subtitle);if strings.Contains(hay,needle){out=append(out,result);if len(out)>=limit{break}}};return out,nil
}

func sortStats(rows []PlayerSeasonStats){sort.Slice(rows,func(i,j int)bool{if rows[i].PlayerID!=rows[j].PlayerID{return rows[i].PlayerID<rows[j].PlayerID};return rows[i].Season<rows[j].Season})}

func itoa(v int) string {
	if v == 0 { return "0" }
	negative := v < 0
	if negative { v = -v }
	buf := [32]byte{}
	i := len(buf)
	for v > 0 { i--; buf[i] = byte('0' + v%10); v /= 10 }
	if negative { i--; buf[i] = '-' }
	return string(buf[i:])
}

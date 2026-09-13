package dex

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
)

type PlayerSeasonStats struct {
	LeagueID              string `json:"leagueId"`
	Season                int    `json:"season"`
	PlayerID              string `json:"playerId"`
	TeamID                string `json:"teamId"`
	Games                 int    `json:"games"`
	PassingYards          int64  `json:"passingYards"`
	PassingTouchdowns     int64  `json:"passingTouchdowns"`
	InterceptionsThrown   int64  `json:"interceptionsThrown"`
	RushingYards          int64  `json:"rushingYards"`
	RushingTouchdowns     int64  `json:"rushingTouchdowns"`
	ReceivingYards        int64  `json:"receivingYards"`
	ReceivingTouchdowns   int64  `json:"receivingTouchdowns"`
	Tackles               int64  `json:"tackles"`
	Sacks                 int64  `json:"sacks"`
	DefensiveInterceptions int64 `json:"defensiveInterceptions"`
}

type StatDelta = PlayerSeasonStats

type CareerStats struct {
	PlayerID              string `json:"playerId"`
	Seasons               int    `json:"seasons"`
	Games                 int    `json:"games"`
	PassingYards          int64  `json:"passingYards"`
	PassingTouchdowns     int64  `json:"passingTouchdowns"`
	InterceptionsThrown   int64  `json:"interceptionsThrown"`
	RushingYards          int64  `json:"rushingYards"`
	RushingTouchdowns     int64  `json:"rushingTouchdowns"`
	ReceivingYards        int64  `json:"receivingYards"`
	ReceivingTouchdowns   int64  `json:"receivingTouchdowns"`
	Tackles               int64  `json:"tackles"`
	Sacks                 int64  `json:"sacks"`
	DefensiveInterceptions int64 `json:"defensiveInterceptions"`
	Awards                int    `json:"awards"`
}

type Award struct {
	ID       string `json:"id"`
	LeagueID string `json:"leagueId"`
	Season   int    `json:"season"`
	Name     string `json:"name"`
	PlayerID string `json:"playerId"`
	TeamID   string `json:"teamId"`
	Score    int64  `json:"score"`
}

type LeagueRecord struct {
	LeagueID string `json:"leagueId"`
	Scope    string `json:"scope"`
	Category string `json:"category"`
	PlayerID string `json:"playerId"`
	Season   int    `json:"season,omitempty"`
	Value    int64  `json:"value"`
}

type HallOfFameEntry struct {
	LeagueID      string    `json:"leagueId"`
	PlayerID      string    `json:"playerId"`
	InductedSeason int      `json:"inductedSeason"`
	Score         int64     `json:"score"`
	Reason        string    `json:"reason"`
	InductedAt    time.Time `json:"inductedAt"`
}

type HistoricalGame struct {
	ID           string `json:"id"`
	LeagueID     string `json:"leagueId"`
	Season       int    `json:"season"`
	Phase        string `json:"phase"`
	HomeTeamID   string `json:"homeTeamId"`
	AwayTeamID   string `json:"awayTeamId"`
	HomeScore    int    `json:"homeScore"`
	AwayScore    int    `json:"awayScore"`
	WinnerTeamID string `json:"winnerTeamId,omitempty"`
}

type Rivalry struct {
	LeagueID       string `json:"leagueId"`
	TeamAID        string `json:"teamAId"`
	TeamBID        string `json:"teamBId"`
	Games          int    `json:"games"`
	WinsA          int    `json:"winsA"`
	WinsB          int    `json:"winsB"`
	Ties           int    `json:"ties"`
	PointsA        int    `json:"pointsA"`
	PointsB        int    `json:"pointsB"`
	PostseasonGames int   `json:"postseasonGames"`
	CloseGames     int    `json:"closeGames"`
	Score          int    `json:"score"`
}

type SearchResult struct {
	Kind      string `json:"kind"`
	ID        string `json:"id"`
	Title     string `json:"title"`
	Subtitle  string `json:"subtitle,omitempty"`
	LeagueID  string `json:"leagueId"`
}

var ErrHistoryNotFound = errors.New("dex history not found")

type HistoryRepository interface {
	AddStats(context.Context, StatDelta) (PlayerSeasonStats, error)
	SeasonStats(context.Context, string, int) ([]PlayerSeasonStats, error)
	PlayerSeasons(context.Context, string, string) ([]PlayerSeasonStats, error)
	AllStats(context.Context, string) ([]PlayerSeasonStats, error)
	Awards(context.Context, string, int) ([]Award, error)
	PlayerAwards(context.Context, string, string) ([]Award, error)
	ReplaceAwards(context.Context, string, int, []Award) error
	Records(context.Context, string) ([]LeagueRecord, error)
	ReplaceRecords(context.Context, string, []LeagueRecord) error
	HallOfFame(context.Context, string) ([]HallOfFameEntry, error)
	UpsertHallOfFame(context.Context, HallOfFameEntry) error
	CompletedGames(context.Context, string) ([]HistoricalGame, error)
	Search(context.Context, string, string, int) ([]SearchResult, error)
}

type HistoryService struct{ repo HistoryRepository }

func NewHistoryService(repo HistoryRepository) *HistoryService { return &HistoryService{repo: repo} }

func (s *HistoryService) RecordStats(ctx context.Context, delta StatDelta) (PlayerSeasonStats, error) {
	delta.LeagueID = strings.TrimSpace(delta.LeagueID)
	delta.PlayerID = strings.TrimSpace(delta.PlayerID)
	delta.TeamID = strings.TrimSpace(delta.TeamID)
	if delta.LeagueID == "" || delta.PlayerID == "" || delta.TeamID == "" || delta.Season < 1 {
		return PlayerSeasonStats{}, errors.New("league, season, player and team are required")
	}
	if hasNegativeStats(delta) {
		return PlayerSeasonStats{}, errors.New("stat deltas cannot be negative")
	}
	return s.repo.AddStats(ctx, delta)
}

func (s *HistoryService) Career(ctx context.Context, leagueID, playerID string) (CareerStats, error) {
	rows, err := s.repo.PlayerSeasons(ctx, strings.TrimSpace(leagueID), strings.TrimSpace(playerID))
	if err != nil {
		return CareerStats{}, err
	}
	if len(rows) == 0 {
		return CareerStats{}, ErrHistoryNotFound
	}
	career := CareerStats{PlayerID: strings.TrimSpace(playerID), Seasons: len(rows)}
	for _, row := range rows {
		career.Games += row.Games
		career.PassingYards += row.PassingYards
		career.PassingTouchdowns += row.PassingTouchdowns
		career.InterceptionsThrown += row.InterceptionsThrown
		career.RushingYards += row.RushingYards
		career.RushingTouchdowns += row.RushingTouchdowns
		career.ReceivingYards += row.ReceivingYards
		career.ReceivingTouchdowns += row.ReceivingTouchdowns
		career.Tackles += row.Tackles
		career.Sacks += row.Sacks
		career.DefensiveInterceptions += row.DefensiveInterceptions
	}
	awards, err := s.repo.PlayerAwards(ctx, strings.TrimSpace(leagueID), strings.TrimSpace(playerID))
	if err != nil {
		return CareerStats{}, err
	}
	career.Awards = len(awards)
	return career, nil
}

func (s *HistoryService) FinalizeAwards(ctx context.Context, leagueID string, season int) ([]Award, error) {
	leagueID = strings.TrimSpace(leagueID)
	stats, err := s.repo.SeasonStats(ctx, leagueID, season)
	if err != nil {
		return nil, err
	}
	if len(stats) == 0 {
		return nil, errors.New("season has no player statistics")
	}
	definitions := []struct {
		name  string
		score func(PlayerSeasonStats) int64
	}{
		{name: "MVP", score: mvpScore},
		{name: "Offensive Player of the Year", score: offenseScore},
		{name: "Defensive Player of the Year", score: defenseScore},
	}
	awards := make([]Award, 0, len(definitions))
	for _, definition := range definitions {
		winner := stats[0]
		best := definition.score(winner)
		for _, candidate := range stats[1:] {
			score := definition.score(candidate)
			if score > best || (score == best && candidate.PlayerID < winner.PlayerID) {
				winner, best = candidate, score
			}
		}
		awards = append(awards, Award{
			ID: fmt.Sprintf("award_%d_%s", season, slug(definition.name)), LeagueID: leagueID, Season: season,
			Name: definition.name, PlayerID: winner.PlayerID, TeamID: winner.TeamID, Score: best,
		})
	}
	if err := s.repo.ReplaceAwards(ctx, leagueID, season, awards); err != nil {
		return nil, err
	}
	return awards, nil
}

func (s *HistoryService) RebuildRecords(ctx context.Context, leagueID string) ([]LeagueRecord, error) {
	leagueID = strings.TrimSpace(leagueID)
	rows, err := s.repo.AllStats(ctx, leagueID)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, errors.New("league has no player statistics")
	}
	type metric struct {
		category string
		value    func(PlayerSeasonStats) int64
	}
	metrics := []metric{
		{"passing_yards", func(v PlayerSeasonStats) int64 { return v.PassingYards }},
		{"passing_touchdowns", func(v PlayerSeasonStats) int64 { return v.PassingTouchdowns }},
		{"rushing_yards", func(v PlayerSeasonStats) int64 { return v.RushingYards }},
		{"rushing_touchdowns", func(v PlayerSeasonStats) int64 { return v.RushingTouchdowns }},
		{"receiving_yards", func(v PlayerSeasonStats) int64 { return v.ReceivingYards }},
		{"receiving_touchdowns", func(v PlayerSeasonStats) int64 { return v.ReceivingTouchdowns }},
		{"tackles", func(v PlayerSeasonStats) int64 { return v.Tackles }},
		{"sacks", func(v PlayerSeasonStats) int64 { return v.Sacks }},
		{"defensive_interceptions", func(v PlayerSeasonStats) int64 { return v.DefensiveInterceptions }},
	}
	records := make([]LeagueRecord, 0, len(metrics)*2)
	for _, m := range metrics {
		seasonBest := rows[0]
		seasonValue := m.value(seasonBest)
		career := map[string]int64{}
		for _, row := range rows {
			value := m.value(row)
			if value > seasonValue || (value == seasonValue && row.PlayerID < seasonBest.PlayerID) {
				seasonBest, seasonValue = row, value
			}
			career[row.PlayerID] += value
		}
		records = append(records, LeagueRecord{LeagueID: leagueID, Scope: "season", Category: m.category, PlayerID: seasonBest.PlayerID, Season: seasonBest.Season, Value: seasonValue})
		careerPlayer, careerValue := "", int64(-1)
		for playerID, value := range career {
			if value > careerValue || (value == careerValue && (careerPlayer == "" || playerID < careerPlayer)) {
				careerPlayer, careerValue = playerID, value
			}
		}
		records = append(records, LeagueRecord{LeagueID: leagueID, Scope: "career", Category: m.category, PlayerID: careerPlayer, Value: careerValue})
	}
	sort.Slice(records, func(i, j int) bool {
		if records[i].Scope != records[j].Scope { return records[i].Scope < records[j].Scope }
		return records[i].Category < records[j].Category
	})
	if err := s.repo.ReplaceRecords(ctx, leagueID, records); err != nil {
		return nil, err
	}
	return records, nil
}

func (s *HistoryService) EvaluateHallOfFame(ctx context.Context, leagueID string, inductedSeason int) ([]HallOfFameEntry, error) {
	leagueID = strings.TrimSpace(leagueID)
	stats, err := s.repo.AllStats(ctx, leagueID)
	if err != nil { return nil, err }
	players := map[string]struct{}{}
	for _, row := range stats { players[row.PlayerID] = struct{}{} }
	existing, err := s.repo.HallOfFame(ctx, leagueID)
	if err != nil { return nil, err }
	already := map[string]bool{}
	for _, entry := range existing { already[entry.PlayerID] = true }
	inducted := make([]HallOfFameEntry, 0)
	for playerID := range players {
		if already[playerID] { continue }
		career, err := s.Career(ctx, leagueID, playerID)
		if err != nil { return nil, err }
		score := hallScore(career)
		if career.Games < 48 || score < 350 { continue }
		entry := HallOfFameEntry{
			LeagueID: leagueID, PlayerID: playerID, InductedSeason: inductedSeason, Score: score,
			Reason: fmt.Sprintf("Career score %d across %d games with %d award(s)", score, career.Games, career.Awards),
			InductedAt: time.Now().UTC(),
		}
		if err := s.repo.UpsertHallOfFame(ctx, entry); err != nil { return nil, err }
		inducted = append(inducted, entry)
	}
	sort.Slice(inducted, func(i, j int) bool {
		if inducted[i].Score != inducted[j].Score { return inducted[i].Score > inducted[j].Score }
		return inducted[i].PlayerID < inducted[j].PlayerID
	})
	return inducted, nil
}

func (s *HistoryService) Rivalries(ctx context.Context, leagueID string) ([]Rivalry, error) {
	games, err := s.repo.CompletedGames(ctx, strings.TrimSpace(leagueID))
	if err != nil { return nil, err }
	byPair := map[string]*Rivalry{}
	for _, game := range games {
		a, b := game.HomeTeamID, game.AwayTeamID
		if a == "" || b == "" || a == b { continue }
		if b < a { a, b = b, a }
		key := a + "|" + b
		r := byPair[key]
		if r == nil {
			r = &Rivalry{LeagueID: game.LeagueID, TeamAID: a, TeamBID: b}
			byPair[key] = r
		}
		r.Games++
		var scoreA, scoreB int
		if game.HomeTeamID == a { scoreA, scoreB = game.HomeScore, game.AwayScore } else { scoreA, scoreB = game.AwayScore, game.HomeScore }
		r.PointsA += scoreA
		r.PointsB += scoreB
		switch {
		case scoreA > scoreB: r.WinsA++
		case scoreB > scoreA: r.WinsB++
		default: r.Ties++
		}
		if absInt(scoreA-scoreB) <= 7 { r.CloseGames++ }
		if game.Phase != "regular" { r.PostseasonGames++ }
	}
	out := make([]Rivalry, 0, len(byPair))
	for _, rivalry := range byPair {
		rivalry.Score = rivalry.Games*5 + rivalry.CloseGames*3 + rivalry.PostseasonGames*8
		out = append(out, *rivalry)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Score != out[j].Score { return out[i].Score > out[j].Score }
		if out[i].Games != out[j].Games { return out[i].Games > out[j].Games }
		if out[i].TeamAID != out[j].TeamAID { return out[i].TeamAID < out[j].TeamAID }
		return out[i].TeamBID < out[j].TeamBID
	})
	return out, nil
}

func (s *HistoryService) Search(ctx context.Context, leagueID, query string, limit int) ([]SearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" { return []SearchResult{}, nil }
	if limit <= 0 || limit > 100 { limit = 25 }
	return s.repo.Search(ctx, strings.TrimSpace(leagueID), query, limit)
}

func (s *HistoryService) Awards(ctx context.Context, leagueID string, season int) ([]Award, error) {
	return s.repo.Awards(ctx, strings.TrimSpace(leagueID), season)
}

func (s *HistoryService) Records(ctx context.Context, leagueID string) ([]LeagueRecord, error) {
	return s.repo.Records(ctx, strings.TrimSpace(leagueID))
}

func (s *HistoryService) HallOfFame(ctx context.Context, leagueID string) ([]HallOfFameEntry, error) {
	return s.repo.HallOfFame(ctx, strings.TrimSpace(leagueID))
}

func hasNegativeStats(v PlayerSeasonStats) bool {
	return v.Games < 0 || v.PassingYards < 0 || v.PassingTouchdowns < 0 || v.InterceptionsThrown < 0 ||
		v.RushingYards < 0 || v.RushingTouchdowns < 0 || v.ReceivingYards < 0 || v.ReceivingTouchdowns < 0 ||
		v.Tackles < 0 || v.Sacks < 0 || v.DefensiveInterceptions < 0
}

func offenseScore(v PlayerSeasonStats) int64 {
	return v.PassingYards/20 + v.PassingTouchdowns*6 - v.InterceptionsThrown*3 +
		v.RushingYards/8 + v.RushingTouchdowns*8 + v.ReceivingYards/8 + v.ReceivingTouchdowns*8
}

func defenseScore(v PlayerSeasonStats) int64 {
	return v.Tackles*2 + v.Sacks*14 + v.DefensiveInterceptions*20
}

func mvpScore(v PlayerSeasonStats) int64 { return offenseScore(v) + defenseScore(v) }

func hallScore(v CareerStats) int64 {
	return v.PassingYards/150 + v.PassingTouchdowns*2 + v.RushingYards/80 + v.RushingTouchdowns*3 +
		v.ReceivingYards/80 + v.ReceivingTouchdowns*3 + v.Tackles/8 + v.Sacks*6 + v.DefensiveInterceptions*8 + int64(v.Awards*60)
}

func slug(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.ReplaceAll(value, " ", "_")
	return strings.ReplaceAll(value, "-", "_")
}

func absInt(v int) int { if v < 0 { return -v }; return v }

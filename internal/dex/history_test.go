package dex

import (
	"context"
	"testing"
)

func TestCareerAwardsRecordsAndHallOfFame(t *testing.T) {
	ctx := context.Background()
	repo := NewMemoryHistoryRepository()
	service := NewHistoryService(repo)

	lines := []StatDelta{
		{LeagueID: "lg", Season: 2027, PlayerID: "qb", TeamID: "a", Games: 17, PassingYards: 5100, PassingTouchdowns: 48, InterceptionsThrown: 8},
		{LeagueID: "lg", Season: 2027, PlayerID: "rb", TeamID: "b", Games: 17, RushingYards: 1900, RushingTouchdowns: 19, ReceivingYards: 500, ReceivingTouchdowns: 4},
		{LeagueID: "lg", Season: 2027, PlayerID: "lb", TeamID: "c", Games: 17, Tackles: 150, Sacks: 16, DefensiveInterceptions: 4},
		{LeagueID: "lg", Season: 2028, PlayerID: "qb", TeamID: "a", Games: 17, PassingYards: 5300, PassingTouchdowns: 51, InterceptionsThrown: 7},
		{LeagueID: "lg", Season: 2029, PlayerID: "qb", TeamID: "a", Games: 17, PassingYards: 5000, PassingTouchdowns: 45, InterceptionsThrown: 9},
	}
	for _, line := range lines {
		if _, err := service.RecordStats(ctx, line); err != nil { t.Fatal(err) }
	}
	// Deltas accumulate instead of replacing a season line.
	if _, err := service.RecordStats(ctx, StatDelta{LeagueID: "lg", Season: 2027, PlayerID: "qb", TeamID: "a", Games: 1, PassingYards: 100, PassingTouchdowns: 1}); err != nil { t.Fatal(err) }

	career, err := service.Career(ctx, "lg", "qb")
	if err != nil { t.Fatal(err) }
	if career.Seasons != 3 || career.Games != 52 || career.PassingYards != 15500 || career.PassingTouchdowns != 145 {
		t.Fatalf("unexpected career aggregation: %#v", career)
	}

	awards, err := service.FinalizeAwards(ctx, "lg", 2027)
	if err != nil { t.Fatal(err) }
	if len(awards) != 3 { t.Fatalf("awards=%d", len(awards)) }
	winners := map[string]string{}
	for _, award := range awards { winners[award.Name] = award.PlayerID }
	if winners["MVP"] != "qb" || winners["Offensive Player of the Year"] != "qb" || winners["Defensive Player of the Year"] != "lb" {
		t.Fatalf("unexpected awards: %#v", winners)
	}

	if _, err := service.FinalizeAwards(ctx, "lg", 2028); err != nil { t.Fatal(err) }
	if _, err := service.FinalizeAwards(ctx, "lg", 2029); err != nil { t.Fatal(err) }
	career, err = service.Career(ctx, "lg", "qb")
	if err != nil { t.Fatal(err) }
	if career.Awards < 3 { t.Fatalf("expected career awards, got %#v", career) }

	records, err := service.RebuildRecords(ctx, "lg")
	if err != nil { t.Fatal(err) }
	var careerPass, seasonPass LeagueRecord
	for _, record := range records {
		if record.Category == "passing_yards" && record.Scope == "career" { careerPass = record }
		if record.Category == "passing_yards" && record.Scope == "season" { seasonPass = record }
	}
	if careerPass.PlayerID != "qb" || careerPass.Value != 15500 { t.Fatalf("career record=%#v", careerPass) }
	if seasonPass.PlayerID != "qb" || seasonPass.Season != 2028 || seasonPass.Value != 5300 { t.Fatalf("season record=%#v", seasonPass) }

	inducted, err := service.EvaluateHallOfFame(ctx, "lg", 2035)
	if err != nil { t.Fatal(err) }
	foundQB := false
	for _, entry := range inducted { if entry.PlayerID == "qb" { foundQB = true } }
	if !foundQB { t.Fatalf("expected elite 52-game QB to qualify under published threshold: %#v", inducted) }
	// Idempotent evaluation must not induct the same player again.
	again, err := service.EvaluateHallOfFame(ctx, "lg", 2036)
	if err != nil { t.Fatal(err) }
	for _, entry := range again { if entry.PlayerID == "qb" { t.Fatal("duplicate Hall of Fame induction") } }
}

func TestRivalryScoreUsesCloseAndPostseasonGames(t *testing.T) {
	repo := NewMemoryHistoryRepository()
	repo.SeedGame(HistoricalGame{ID: "1", LeagueID: "lg", Season: 2027, Phase: "regular", HomeTeamID: "a", AwayTeamID: "b", HomeScore: 24, AwayScore: 21, WinnerTeamID: "a"})
	repo.SeedGame(HistoricalGame{ID: "2", LeagueID: "lg", Season: 2028, Phase: "regular", HomeTeamID: "b", AwayTeamID: "a", HomeScore: 31, AwayScore: 30, WinnerTeamID: "b"})
	repo.SeedGame(HistoricalGame{ID: "3", LeagueID: "lg", Season: 2028, Phase: "championship", HomeTeamID: "a", AwayTeamID: "b", HomeScore: 20, AwayScore: 17, WinnerTeamID: "a"})
	repo.SeedGame(HistoricalGame{ID: "4", LeagueID: "lg", Season: 2028, Phase: "regular", HomeTeamID: "c", AwayTeamID: "d", HomeScore: 40, AwayScore: 3, WinnerTeamID: "c"})
	service := NewHistoryService(repo)
	rivalries, err := service.Rivalries(context.Background(), "lg")
	if err != nil { t.Fatal(err) }
	if len(rivalries) != 2 { t.Fatalf("rivalries=%d", len(rivalries)) }
	top := rivalries[0]
	if top.TeamAID != "a" || top.TeamBID != "b" || top.Games != 3 || top.CloseGames != 3 || top.PostseasonGames != 1 || top.WinsA != 2 || top.WinsB != 1 {
		t.Fatalf("unexpected top rivalry: %#v", top)
	}
	if top.Score != 32 { t.Fatalf("rivalry score=%d", top.Score) }
}

func TestSearchAndNegativeStats(t *testing.T) {
	repo := NewMemoryHistoryRepository()
	repo.SeedSearch(
		SearchResult{Kind: "player", ID: "p1", LeagueID: "lg", Title: "Marcus Vance", Subtitle: "QB"},
		SearchResult{Kind: "team", ID: "t1", LeagueID: "lg", Title: "Harrisburg Hounds", Subtitle: "HAR"},
	)
	service := NewHistoryService(repo)
	got, err := service.Search(context.Background(), "lg", "vance", 10)
	if err != nil { t.Fatal(err) }
	if len(got) != 1 || got[0].ID != "p1" { t.Fatalf("search=%#v", got) }
	if _, err := service.RecordStats(context.Background(), StatDelta{LeagueID: "lg", Season: 2027, PlayerID: "p1", TeamID: "t1", PassingYards: -1}); err == nil {
		t.Fatal("negative stat delta should fail")
	}
}

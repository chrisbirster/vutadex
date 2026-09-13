package season

import (
	"context"
	"reflect"
	"testing"

	"github.com/chrisbirster/vutadex/internal/football/simulation"
)

func testTeams() []Team {
	return []Team{
		{ID: "a", City: "Alpha", Name: "Aces", Abbreviation: "ALP"},
		{ID: "b", City: "Bravo", Name: "Bears", Abbreviation: "BRV"},
		{ID: "c", City: "Charlie", Name: "Comets", Abbreviation: "CHA"},
		{ID: "d", City: "Delta", Name: "Dragons", Abbreviation: "DEL"},
	}
}

func TestCreateSeasonBuildsDeterministicRoundRobin(t *testing.T) {
	build := func() Snapshot {
		repo := NewMemoryRepository()
		repo.SeedTeams("lg", testTeams())
		service := NewService(repo, simulation.New())
		snapshot, err := service.Create(context.Background(), "lg", 2027, 77)
		if err != nil {
			t.Fatal(err)
		}
		return snapshot
	}
	a := build()
	b := build()
	if len(a.Games) != 6 {
		t.Fatalf("expected 6 round-robin games, got %d", len(a.Games))
	}
	weeks := map[int]int{}
	for _, game := range a.Games {
		weeks[game.Week]++
		if game.Phase != PhaseRegular || game.Status != GameScheduled {
			t.Fatalf("unexpected initial game: %#v", game)
		}
	}
	if !reflect.DeepEqual(weeks, map[int]int{1: 2, 2: 2, 3: 2}) {
		t.Fatalf("unexpected weekly schedule: %#v", weeks)
	}
	for i := range a.Games {
		if a.Games[i].ID != b.Games[i].ID || a.Games[i].Seed != b.Games[i].Seed {
			t.Fatalf("same season seed produced different game identity at %d", i)
		}
	}
}

func TestStandingsUseHeadToHeadBeforePointDifferential(t *testing.T) {
	games := []Game{
		{ID: "ab", Phase: PhaseRegular, Status: GameFinal, HomeTeamID: "a", AwayTeamID: "b", HomeScore: 21, AwayScore: 20},
		{ID: "ac", Phase: PhaseRegular, Status: GameFinal, HomeTeamID: "a", AwayTeamID: "c", HomeScore: 0, AwayScore: 30},
		{ID: "bd", Phase: PhaseRegular, Status: GameFinal, HomeTeamID: "b", AwayTeamID: "d", HomeScore: 40, AwayScore: 0},
	}
	got := standings(games)
	if len(got) != 4 {
		t.Fatalf("standings length=%d", len(got))
	}
	// A and B are both 1-1. B has much better point differential, but A beat B.
	var aSeed, bSeed int
	for _, row := range got {
		switch row.TeamID {
		case "a":
			aSeed = row.Seed
		case "b":
			bSeed = row.Seed
		}
	}
	if aSeed >= bSeed {
		t.Fatalf("head-to-head should seed A ahead of B: A=%d B=%d standings=%#v", aSeed, bSeed, got)
	}
}

func TestFullSeasonProducesChampion(t *testing.T) {
	ctx := context.Background()
	repo := NewMemoryRepository()
	repo.SeedTeams("lg", testTeams())
	service := NewService(repo, simulation.New())
	snapshot, err := service.Create(ctx, "lg", 2027, 12345)
	if err != nil {
		t.Fatal(err)
	}
	for _, game := range snapshot.Games {
		if game.Phase == PhaseRegular {
			if _, err := service.Simulate(ctx, game.ID); err != nil {
				t.Fatal(err)
			}
		}
	}

	snapshot, err = service.AdvancePostseason(ctx, "lg", 2027)
	if err != nil {
		t.Fatal(err)
	}
	semis := filterPhase(snapshot.Games, PhaseSemifinal)
	if len(semis) != 2 || snapshot.State.Status != SeasonPostseason {
		t.Fatalf("expected two semifinals: %#v", snapshot)
	}
	for _, game := range semis {
		if _, err := service.Simulate(ctx, game.ID); err != nil {
			t.Fatal(err)
		}
	}

	snapshot, err = service.AdvancePostseason(ctx, "lg", 2027)
	if err != nil {
		t.Fatal(err)
	}
	finals := filterPhase(snapshot.Games, PhaseChampionship)
	if len(finals) != 1 {
		t.Fatalf("expected one championship game, got %d", len(finals))
	}
	if _, err := service.Simulate(ctx, finals[0].ID); err != nil {
		t.Fatal(err)
	}

	snapshot, err = service.AdvancePostseason(ctx, "lg", 2027)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.State.Status != SeasonComplete || snapshot.State.ChampionTeamID == "" || snapshot.State.CompletedAt == nil {
		t.Fatalf("season not completed: %#v", snapshot.State)
	}
	champion := snapshot.State.ChampionTeamID
	if champion != finals[0].HomeTeamID && champion != finals[0].AwayTeamID {
		t.Fatalf("champion %q did not play in championship %#v", champion, finals[0])
	}
}

func TestPostseasonWaitsForRegularSeason(t *testing.T) {
	repo := NewMemoryRepository()
	repo.SeedTeams("lg", testTeams())
	service := NewService(repo, simulation.New())
	if _, err := service.Create(context.Background(), "lg", 2027, 1); err != nil {
		t.Fatal(err)
	}
	if _, err := service.AdvancePostseason(context.Background(), "lg", 2027); err == nil {
		t.Fatal("expected postseason to reject incomplete regular season")
	}
}

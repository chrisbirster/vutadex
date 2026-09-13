package franchise

import (
	"context"
	"reflect"
	"testing"
	"time"
)

func TestScoutNarrowsRangesWithoutReturningTrueRatings(t *testing.T) {
	base := NewMemoryRepository()
	base.SeedPlayer(PlayerAsset{ID: "p1", LeagueID: "lg", Status: PlayerDraft, FirstName: "Ada", LastName: "Blitz", Position: "QB", Age: 22, Overall: 81, Potential: 93})
	life := NewMemoryLifecycleRepository(base)
	life.SeedLifecycle("p1", 0, 88)
	service := NewLifecycleService(life)

	first, err := service.Scout(context.Background(), "lg", "u1", "p1", 70)
	if err != nil {
		t.Fatal(err)
	}
	last := first
	for i := 0; i < 5; i++ {
		last, err = service.Scout(context.Background(), "lg", "u1", "p1", 70)
		if err != nil {
			t.Fatal(err)
		}
	}
	if last.Report.Observations != 6 {
		t.Fatalf("observations=%d", last.Report.Observations)
	}
	firstWidth := first.Report.OverallHigh - first.Report.OverallLow
	lastWidth := last.Report.OverallHigh - last.Report.OverallLow
	if lastWidth > firstWidth {
		t.Fatalf("expected scouting range to tighten: first=%d last=%d", firstWidth, lastWidth)
	}
	if last.Report.OverallLow > 81 || last.Report.OverallHigh < 81 || last.Report.PotentialLow > 93 || last.Report.PotentialHigh < 93 {
		t.Fatalf("true ratings should remain inside the uncertainty ranges: %#v", last.Report)
	}
	if last.Report.Confidence <= first.Report.Confidence {
		t.Fatalf("confidence did not improve: first=%d last=%d", first.Report.Confidence, last.Report.Confidence)
	}
}

func TestAdvanceSeasonIsDeterministic(t *testing.T) {
	build := func() (*LifecycleService, *MemoryLifecycleRepository) {
		base := NewMemoryRepository()
		base.SeedPlayer(PlayerAsset{ID: "young", LeagueID: "lg", TeamID: "x", Status: PlayerRoster, FirstName: "Young", Position: "WR", Age: 22, Overall: 70, Potential: 90})
		base.SeedPlayer(PlayerAsset{ID: "old", LeagueID: "lg", TeamID: "x", Status: PlayerRoster, FirstName: "Old", Position: "QB", Age: 39, Overall: 71, Potential: 73})
		base.SeedContract(Contract{ID: "c-old", LeagueID: "lg", PlayerID: "old", TeamID: "x", StartSeason: 2027, Years: 2, AnnualValue: 5_000_000})
		life := NewMemoryLifecycleRepository(base)
		life.SeedLeagueSeason("lg", 2027)
		life.SeedLifecycle("young", 1, 84)
		life.SeedLifecycle("old", 17, 58)
		return NewLifecycleService(life), life
	}

	a, repoA := build()
	b, repoB := build()
	gotA, err := a.AdvanceSeason(context.Background(), "lg", 2028, 99)
	if err != nil {
		t.Fatal(err)
	}
	gotB, err := b.AdvanceSeason(context.Background(), "lg", 2028, 99)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(gotA.Changes, gotB.Changes) {
		t.Fatalf("same seed diverged:\nA=%#v\nB=%#v", gotA.Changes, gotB.Changes)
	}
	old, err := repoA.LifecyclePlayer(context.Background(), "old")
	if err != nil {
		t.Fatal(err)
	}
	if old.Status != PlayerRetired || old.TeamID != "" {
		t.Fatalf("age-40 player should retire: %#v", old)
	}
	repoA.base.mu.Lock()
	_, contractExists := repoA.base.contracts["old"]
	repoA.base.mu.Unlock()
	if contractExists {
		t.Fatal("retirement should remove the active contract")
	}
	seasonA, _ := repoA.LeagueSeason(context.Background(), "lg")
	seasonB, _ := repoB.LeagueSeason(context.Background(), "lg")
	if seasonA != 2028 || seasonB != 2028 {
		t.Fatalf("season not advanced: %d %d", seasonA, seasonB)
	}
}

func TestAdvanceWeekCreatesAndRecoversInjuries(t *testing.T) {
	base := NewMemoryRepository()
	life := NewMemoryLifecycleRepository(base)
	life.SeedLeagueSeason("lg", 2027)
	for i := 0; i < 40; i++ {
		id := "p" + string(rune('A'+i))
		base.SeedPlayer(PlayerAsset{ID: id, LeagueID: "lg", TeamID: "x", Status: PlayerRoster, FirstName: id, Position: "LB", Age: 25, Overall: 75, Potential: 80})
		life.SeedLifecycle(id, 3, 1)
	}
	service := NewLifecycleService(life)
	result, err := service.AdvanceWeek(context.Background(), "lg", 2027, 1, 1234)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Created) == 0 {
		t.Fatal("expected deterministic low-durability roster to create at least one injury")
	}

	// Isolate a one-week injury so recovery timing is deterministic.
	life.mu.Lock()
	life.injuries = map[string]Injury{
		"inj_one": {ID: "inj_one", LeagueID: "lg", PlayerID: "pA", TeamID: "x", Kind: "ankle", Severity: "minor", WeeksRemaining: 1, OccurredSeason: 2027, OccurredWeek: 1, Status: InjuryActive, CreatedAt: time.Now().UTC()},
	}
	life.mu.Unlock()

	result, err = service.AdvanceWeek(context.Background(), "lg", 2027, 2, 9876)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, recovered := range result.Recovered {
		if recovered.ID == "inj_one" {
			found = true
		}
	}
	if !found {
		t.Fatalf("one-week injury did not recover: %#v", result.Recovered)
	}
}

func TestSeasonMustAdvanceExactlyOneYear(t *testing.T) {
	base := NewMemoryRepository()
	life := NewMemoryLifecycleRepository(base)
	life.SeedLeagueSeason("lg", 2027)
	service := NewLifecycleService(life)
	if _, err := service.AdvanceSeason(context.Background(), "lg", 2030, 1); err == nil {
		t.Fatal("expected invalid season transition to fail")
	}
}

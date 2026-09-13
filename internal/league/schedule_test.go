package league

import "testing"

func TestScheduleRoundRobin(t *testing.T) {
	l := Generate("test", 8)
	games := Schedule(l)
	if len(games) != 28 {
		t.Fatalf("expected 28 games, got %d", len(games))
	}
	seen := map[string]bool{}
	for _, game := range games {
		if game.HomeID == game.AwayID {
			t.Fatalf("team scheduled against itself: %#v", game)
		}
		keyA := game.HomeID + ":" + game.AwayID
		keyB := game.AwayID + ":" + game.HomeID
		if seen[keyA] || seen[keyB] {
			t.Fatalf("duplicate pairing: %#v", game)
		}
		seen[keyA] = true
	}
}

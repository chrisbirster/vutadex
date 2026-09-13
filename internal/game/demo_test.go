package game

import (
	"testing"

	"github.com/chrisbirster/vutadex/internal/football/simulation"
)

func TestDemoStorePlaysOneSnap(t *testing.T) {
	store := NewDemoStore(simulation.New())
	game := store.Create(42)
	next, event, err := store.Play(game.State.ID, simulation.Run)
	if err != nil {
		t.Fatal(err)
	}
	if next.State.PlayNumber != 1 || event.Sequence != 1 || len(next.Events) != 1 {
		t.Fatalf("unexpected snap state: %#v %#v", next, event)
	}
}

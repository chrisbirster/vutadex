package game

import (
	"testing"

	"github.com/chrisbirster/vutadex/internal/football/simulation"
)

func TestDemoStorePlaysOneSnap(t *testing.T) {
	store := NewDemoStore(simulation.New())
	game := store.Create(42)
	if game.State.Possession != game.State.HomeID {
		t.Fatalf("expected Team X to open on offense, got possession %q", game.State.Possession)
	}
	next, event, err := store.Play(game.State.ID, simulation.Run)
	if err != nil {
		t.Fatal(err)
	}
	if next.State.PlayNumber != 1 || event.Sequence != 1 || len(next.Events) != 1 {
		t.Fatalf("unexpected snap state: %#v %#v", next, event)
	}
}

func TestDemoStoreResolvesPlaybookConcept(t *testing.T) {
	store := NewDemoStore(simulation.New())
	game := store.Create(42)
	next, events, err := store.CallPlay(game.State.ID, "gun-doubles-inside-zone")
	if err != nil {
		t.Fatal(err)
	}
	if len(events) == 0 || next.State.PlayNumber == 0 {
		t.Fatalf("expected a resolved playbook snap, got %#v", next)
	}
}

func TestDemoStoreRunsCPUDriveAfterPossessionChange(t *testing.T) {
	store := NewDemoStore(simulation.New())
	game := store.Create(7)
	next, events, err := store.CallPlay(game.State.ID, "special-punt")
	if err != nil {
		t.Fatal(err)
	}
	if len(events) < 2 {
		t.Fatalf("expected punt plus CPU possession, got %d events", len(events))
	}
	if !next.State.Finished && next.State.Possession != next.State.HomeID {
		t.Fatalf("expected control to return to Team X, got possession %q", next.State.Possession)
	}
}

func TestDemoStoreRejectsUnknownPlay(t *testing.T) {
	store := NewDemoStore(simulation.New())
	game := store.Create(99)
	if _, _, err := store.CallPlay(game.State.ID, "not-a-play"); err == nil {
		t.Fatal("expected unknown play to fail")
	}
}

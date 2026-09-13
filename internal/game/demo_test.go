package game

import (
	"testing"
	"time"

	"github.com/chrisbirster/vutadex/internal/football/simulation"
)

func TestDemoStorePlaysOneSnap(t *testing.T) {
	store := NewDemoStore(simulation.New())
	game := store.Create(42)
	if game.State.Possession != game.State.HomeID {
		t.Fatalf("expected Team X to open on offense, got possession %q", game.State.Possession)
	}
	if game.PlayClock < 39 || game.PlayClock > 40 {
		t.Fatalf("expected fresh 40 second play clock, got %d", game.PlayClock)
	}
	next, event, err := store.Play(game.State.ID, simulation.Run)
	if err != nil {
		t.Fatal(err)
	}
	if next.State.PlayNumber != 1 || event.Sequence != 1 || len(next.Events) != 1 {
		t.Fatalf("unexpected snap state: %#v %#v", next, event)
	}
}

func TestDemoStoreResolvesOffensivePlaybookConcept(t *testing.T) {
	store := NewDemoStore(simulation.New())
	game := store.Create(42)
	next, events, err := store.CallPlay(game.State.ID, "gun-doubles-inside-zone")
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 1 || next.State.PlayNumber == 0 {
		t.Fatalf("expected one resolved offensive snap, got %#v", next)
	}
}

func TestDemoStoreAcceptsDefensiveCallAfterPunt(t *testing.T) {
	store := NewDemoStore(simulation.New())
	game := store.Create(7)
	defending, _, err := store.CallPlay(game.State.ID, "special-punt")
	if err != nil {
		t.Fatal(err)
	}
	if defending.State.Possession != defending.State.AwayID {
		t.Fatalf("expected CPU offense after punt, got possession %q", defending.State.Possession)
	}
	next, events, err := store.CallPlay(game.State.ID, "nickel-cover-3")
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 1 || next.State.PlayNumber <= defending.State.PlayNumber {
		t.Fatalf("expected one CPU snap against selected defense, got %#v", next)
	}
}

func TestDemoStoreAssessesDelayOfGame(t *testing.T) {
	store := NewDemoStore(simulation.New())
	game := store.Create(99)
	store.mu.Lock()
	store.games[game.State.ID].PlayDeadline = time.Now().Add(-time.Second)
	store.mu.Unlock()

	next, events, err := store.CallPlay(game.State.ID, "gun-trips-mesh")
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 1 || events[0].Type != "penalty" {
		t.Fatalf("expected delay-of-game event, got %#v", events)
	}
	if next.State.Ball != 20 || next.State.Distance != 15 || next.State.PlayNumber != 0 {
		t.Fatalf("unexpected delay-of-game state: %#v", next.State)
	}
}

func TestDemoStoreRejectsWrongSidePlay(t *testing.T) {
	store := NewDemoStore(simulation.New())
	game := store.Create(11)
	if _, _, err := store.CallPlay(game.State.ID, "nickel-cover-3"); err == nil {
		t.Fatal("expected defensive call to fail while Team X is on offense")
	}
}

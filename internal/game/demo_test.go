package game

import (
	"strings"
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
	if game.Timeouts != 3 || game.HurryUp {
		t.Fatalf("unexpected initial coaching state: %#v", game)
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

func TestTimeoutAndHurryUpActions(t *testing.T) {
	store := NewDemoStore(simulation.New())
	game := store.Create(13)

afterTimeout, timeoutEvent, err := store.Action(game.State.ID, "timeout")
	if err != nil {
		t.Fatal(err)
	}
	if afterTimeout.Timeouts != 2 || timeoutEvent.Type != "timeout" {
		t.Fatalf("unexpected timeout state: %#v %#v", afterTimeout, timeoutEvent)
	}

	hurry, _, err := store.Action(game.State.ID, "hurry_up_on")
	if err != nil {
		t.Fatal(err)
	}
	if !hurry.HurryUp || hurry.PlayClock < 19 || hurry.PlayClock > 20 {
		t.Fatalf("expected 20 second hurry-up clock, got %#v", hurry)
	}
}

func TestAudibleIsRecorded(t *testing.T) {
	store := NewDemoStore(simulation.New())
	game := store.Create(21)
	_, events, err := store.CallDecision(game.State.ID, Decision{PlayID: "gun-trips-stick", AudibleFrom: "gun-trips-mesh"})
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 1 || !strings.Contains(events[0].Description, "Audible Mesh → Stick") {
		t.Fatalf("audible not represented in event: %#v", events)
	}
}

func TestFourthDownAdvice(t *testing.T) {
	store := NewDemoStore(simulation.New())
	game := store.Create(31)
	store.mu.Lock()
	state := &store.games[game.State.ID].State
	state.Down = 4
	state.Distance = 1
	state.Ball = 50
	store.mu.Unlock()

	current, err := store.Get(game.State.ID)
	if err != nil {
		t.Fatal(err)
	}
	if current.FourthDown == nil || current.FourthDown.Kind != "go" {
		t.Fatalf("expected go-for-it advice, got %#v", current.FourthDown)
	}
}

func TestTimeoutsResetAtHalftime(t *testing.T) {
	store := NewDemoStore(simulation.New())
	game := store.Create(41)
	store.mu.Lock()
	current := store.games[game.State.ID]
	current.State.Quarter = 2
	current.State.Clock = 1
	current.Timeouts = 0
	store.mu.Unlock()

	after, _, err := store.CallPlay(game.State.ID, "special-spike")
	if err != nil {
		t.Fatal(err)
	}
	if after.State.Quarter != 3 || after.Timeouts != 3 {
		t.Fatalf("expected halftime timeout reset, got %#v", after)
	}
}

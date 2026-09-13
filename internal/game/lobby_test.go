package game

import (
	"context"
	"fmt"
	"sync"
	"testing"

	"github.com/chrisbirster/vutadex/internal/football/simulation"
)

func newLobbyTestService() *LobbyService {
	games := NewService(simulation.New(), NewMemoryRepository())
	return NewLobbyService(games)
}

func TestLobbyLocksCallsPrivatelyThenRevealsBoth(t *testing.T) {
	ctx := context.Background()
	lobbies := newLobbyTestService()
	created, err := lobbies.Create(ctx, "owner", 42)
	if err != nil {
		t.Fatal(err)
	}
	joined, err := lobbies.Join(created.InviteCode, "guest")
	if err != nil {
		t.Fatal(err)
	}
	if joined.Room.Status != LobbyReady || joined.Room.Round.Round != 1 {
		t.Fatalf("expected ready first round, got %#v", joined.Room)
	}

	first, err := lobbies.LockCall(ctx, created.Room.ID, "owner", "Gun Trips Right", "gun-trips-stick")
	if err != nil {
		t.Fatal(err)
	}
	last := first.Events[len(first.Events)-1]
	if last.Kind != "call_locked" || last.Resolution != nil || last.Game != nil {
		t.Fatalf("first private call leaked details: %#v", last)
	}
	if !first.Room.Round.XLocked || first.Room.Round.OLocked {
		t.Fatalf("unexpected lock state after Team X: %#v", first.Room.Round)
	}
	sequenceBeforeResolution := first.Room.Sequence

	resolved, err := lobbies.LockCall(ctx, created.Room.ID, "guest", "Nickel 4-2", "nickel-cover-3")
	if err != nil {
		t.Fatal(err)
	}
	var reveal *LobbyEvent
	for i := range resolved.Events {
		if resolved.Events[i].Kind == "calls_revealed" {
			reveal = &resolved.Events[i]
		}
	}
	if reveal == nil || reveal.Resolution == nil || reveal.Game == nil {
		t.Fatalf("expected both calls and game result after second lock: %#v", resolved.Events)
	}
	if reveal.Resolution.X.PlayID != "gun-trips-stick" || reveal.Resolution.O.PlayID != "nickel-cover-3" {
		t.Fatalf("unexpected revealed calls: %#v", reveal.Resolution)
	}
	if reveal.Game.State.PlayNumber != 1 {
		t.Fatalf("expected one resolved multiplayer snap, got %#v", reveal.Game.State)
	}
	if resolved.Room.Round.Round != 2 || resolved.Room.Round.XLocked || resolved.Room.Round.OLocked {
		t.Fatalf("expected a fresh second round, got %#v", resolved.Room.Round)
	}

	missed, err := lobbies.CatchUp(created.Room.ID, "owner", sequenceBeforeResolution)
	if err != nil {
		t.Fatal(err)
	}
	if len(missed.Events) != 2 || missed.Events[0].Kind != "calls_revealed" || missed.Events[1].Kind != "round_started" {
		t.Fatalf("reconnect catch-up returned wrong sequence window: %#v", missed.Events)
	}
}

func TestLobbyRejectsWrongSideCallWithoutLockingRound(t *testing.T) {
	ctx := context.Background()
	lobbies := newLobbyTestService()
	created, err := lobbies.Create(ctx, "owner", 7)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := lobbies.Join(created.InviteCode, "guest"); err != nil {
		t.Fatal(err)
	}
	if _, err := lobbies.LockCall(ctx, created.Room.ID, "owner", "Nickel 4-2", "nickel-cover-3"); err == nil {
		t.Fatal("expected Team X defensive call to be rejected while Team X has possession")
	}
	current, err := lobbies.CatchUp(created.Room.ID, "owner", 0)
	if err != nil {
		t.Fatal(err)
	}
	if current.Room.Round.XLocked || current.Room.Round.OLocked {
		t.Fatalf("invalid call consumed a private lock: %#v", current.Room.Round)
	}
}

func TestLobbyForfeitAndParticipantAuthorization(t *testing.T) {
	ctx := context.Background()
	lobbies := newLobbyTestService()
	created, err := lobbies.Create(ctx, "owner", 9)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := lobbies.Join(created.InviteCode, "guest"); err != nil {
		t.Fatal(err)
	}
	if _, err := lobbies.CatchUp(created.Room.ID, "outsider", 0); err == nil {
		t.Fatal("expected outsider to be rejected")
	}
	forfeited, err := lobbies.Forfeit(created.Room.ID, "guest")
	if err != nil {
		t.Fatal(err)
	}
	if forfeited.Room.Status != LobbyForfeited || forfeited.Room.WinnerUserID != "owner" {
		t.Fatalf("unexpected forfeit result: %#v", forfeited.Room)
	}
	if forfeited.Events[len(forfeited.Events)-1].Kind != "forfeit" {
		t.Fatalf("missing forfeit event: %#v", forfeited.Events)
	}
}

func TestLobbyConcurrentRoomsDoNotLeakState(t *testing.T) {
	ctx := context.Background()
	lobbies := newLobbyTestService()
	const rooms = 64
	var wg sync.WaitGroup
	errCh := make(chan error, rooms)
	ids := make(chan string, rooms)

	for i := 0; i < rooms; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			owner := fmt.Sprintf("owner-%d", i)
			guest := fmt.Sprintf("guest-%d", i)
			created, err := lobbies.Create(ctx, owner, uint64(i+1))
			if err != nil {
				errCh <- err
				return
			}
			ids <- created.Room.ID
			if _, err := lobbies.Join(created.InviteCode, guest); err != nil {
				errCh <- err
				return
			}
			if _, err := lobbies.LockCall(ctx, created.Room.ID, owner, "Gun Trips Right", "gun-trips-stick"); err != nil {
				errCh <- err
				return
			}
			result, err := lobbies.LockCall(ctx, created.Room.ID, guest, "Nickel 4-2", "nickel-cover-3")
			if err != nil {
				errCh <- err
				return
			}
			if result.Room.OwnerUserID != owner || result.Room.GuestUserID != guest || result.Room.Round.Round != 2 {
				errCh <- fmt.Errorf("room %d leaked state: %#v", i, result.Room)
			}
		}(i)
	}
	wg.Wait()
	close(errCh)
	close(ids)
	for err := range errCh {
		if err != nil {
			t.Fatal(err)
		}
	}
	seen := map[string]bool{}
	for id := range ids {
		if seen[id] {
			t.Fatalf("duplicate room id %q", id)
		}
		seen[id] = true
	}
	if len(seen) != rooms {
		t.Fatalf("expected %d unique rooms, got %d", rooms, len(seen))
	}
}

package game

import (
	"context"
	"errors"
	"testing"

	"github.com/chrisbirster/vutadex/internal/football/simulation"
)

func TestServiceRestoresPersistedGameAcrossInstances(t *testing.T) {
	ctx := context.Background()
	repo := NewMemoryRepository()
	first := NewService(simulation.New(), repo)

	created, err := first.Create(ctx, 4242)
	if err != nil {
		t.Fatal(err)
	}
	played, _, err := first.CallDecision(ctx, created.State.ID, Decision{
		PlayID:      "gun-trips-stick",
		AudibleFrom: "gun-trips-mesh",
	})
	if err != nil {
		t.Fatal(err)
	}
	if played.Metrics.Audibles != 1 {
		t.Fatalf("expected audible metric before restart, got %#v", played.Metrics)
	}

	restarted := NewService(simulation.New(), repo)
	restored, err := restarted.Get(ctx, created.State.ID)
	if err != nil {
		t.Fatal(err)
	}
	if restored.State != played.State {
		t.Fatalf("state changed across restart: got %#v want %#v", restored.State, played.State)
	}
	if len(restored.Events) != len(played.Events) || restored.Metrics != played.Metrics {
		t.Fatalf("semantic history changed across restart: got %#v want %#v", restored, played)
	}
	if restored.Grade.Samples != played.Grade.Samples || restored.Grade.Overall != played.Grade.Overall {
		t.Fatalf("grade did not reproduce from persisted metrics: got %#v want %#v", restored.Grade, played.Grade)
	}
	if restored.PlayClock < 39 || restored.PlayClock > 40 {
		t.Fatalf("restored game should receive a fresh server play clock, got %d", restored.PlayClock)
	}

	afterTimeout, _, err := restarted.Action(ctx, created.State.ID, "timeout")
	if err != nil {
		t.Fatal(err)
	}
	thirdProcess := NewService(simulation.New(), repo)
	restoredAgain, err := thirdProcess.Get(ctx, created.State.ID)
	if err != nil {
		t.Fatal(err)
	}
	if restoredAgain.Timeouts != afterTimeout.Timeouts || len(restoredAgain.Events) != len(afterTimeout.Events) {
		t.Fatalf("coaching action was not durable: got %#v want %#v", restoredAgain, afterTimeout)
	}
}

type failingRepository struct {
	inner *MemoryRepository
	fail  bool
}

func (r *failingRepository) Save(ctx context.Context, current Demo) error {
	if r.fail {
		return errors.New("persistence unavailable")
	}
	return r.inner.Save(ctx, current)
}

func (r *failingRepository) Load(ctx context.Context, id string) (Demo, error) {
	return r.inner.Load(ctx, id)
}

func TestServiceRollsBackMutationWhenSaveFails(t *testing.T) {
	ctx := context.Background()
	repo := &failingRepository{inner: NewMemoryRepository()}
	service := NewService(simulation.New(), repo)
	created, err := service.Create(ctx, 99)
	if err != nil {
		t.Fatal(err)
	}

	repo.fail = true
	if _, _, err := service.CallDecision(ctx, created.State.ID, Decision{PlayID: "gun-trips-stick"}); err == nil {
		t.Fatal("expected persistence error")
	}

	current, err := service.store.Get(created.State.ID)
	if err != nil {
		t.Fatal(err)
	}
	if current.State.PlayNumber != created.State.PlayNumber || len(current.Events) != len(created.Events) {
		t.Fatalf("failed save leaked an in-memory snap: got %#v want %#v", current, created)
	}
}

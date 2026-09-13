package game

import (
	"context"
	"errors"
	"sync"

	"github.com/chrisbirster/vutadex/internal/football/model"
	"github.com/chrisbirster/vutadex/internal/football/simulation"
)

var ErrSnapshotNotFound = errors.New("coach game not found")

type Repository interface {
	Save(context.Context, Demo) error
	Load(context.Context, string) (Demo, error)
}

type Service struct {
	store *DemoStore
	repo  Repository
}

func NewService(engine *simulation.Engine, repo Repository) *Service {
	return &Service{store: NewDemoStore(engine), repo: repo}
}

func (s *Service) Create(ctx context.Context, seed uint64) (Demo, error) {
	current := s.store.Create(seed)
	if err := s.save(ctx, current); err != nil {
		return Demo{}, err
	}
	return current, nil
}

func (s *Service) Get(ctx context.Context, id string) (Demo, error) {
	current, err := s.store.Get(id)
	if err == nil {
		return current, nil
	}
	if s.repo == nil {
		return Demo{}, err
	}
	persisted, loadErr := s.repo.Load(ctx, id)
	if loadErr != nil {
		if errors.Is(loadErr, ErrSnapshotNotFound) {
			return Demo{}, errors.New("game not found")
		}
		return Demo{}, loadErr
	}
	return s.store.Restore(persisted), nil
}

func (s *Service) CallDecision(ctx context.Context, id string, decision Decision) (Demo, []model.Event, error) {
	if err := s.ensureLoaded(ctx, id); err != nil {
		return Demo{}, nil, err
	}
	current, events, err := s.store.CallDecision(id, decision)
	if err != nil {
		return Demo{}, nil, err
	}
	if err := s.save(ctx, current); err != nil {
		return Demo{}, nil, err
	}
	return current, events, nil
}

func (s *Service) Action(ctx context.Context, id, action string) (Demo, model.Event, error) {
	if err := s.ensureLoaded(ctx, id); err != nil {
		return Demo{}, model.Event{}, err
	}
	current, event, err := s.store.Action(id, action)
	if err != nil {
		return Demo{}, model.Event{}, err
	}
	if err := s.save(ctx, current); err != nil {
		return Demo{}, model.Event{}, err
	}
	return current, event, nil
}

func (s *Service) ensureLoaded(ctx context.Context, id string) error {
	if _, err := s.store.Get(id); err == nil {
		return nil
	}
	_, err := s.Get(ctx, id)
	return err
}

func (s *Service) save(ctx context.Context, current Demo) error {
	if s.repo == nil {
		return nil
	}
	return s.repo.Save(ctx, current)
}

type MemoryRepository struct {
	mu    sync.Mutex
	games map[string]Demo
}

func NewMemoryRepository() *MemoryRepository {
	return &MemoryRepository{games: map[string]Demo{}}
}

func (r *MemoryRepository) Save(_ context.Context, current Demo) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	current.Events = append([]model.Event(nil), current.Events...)
	r.games[current.State.ID] = current
	return nil
}

func (r *MemoryRepository) Load(_ context.Context, id string) (Demo, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	current, ok := r.games[id]
	if !ok {
		return Demo{}, ErrSnapshotNotFound
	}
	current.Events = append([]model.Event(nil), current.Events...)
	return current, nil
}

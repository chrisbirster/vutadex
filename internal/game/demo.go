package game

import (
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/chrisbirster/vutadex/internal/football/model"
	"github.com/chrisbirster/vutadex/internal/football/simulation"
)

type Demo struct {
	State  model.GameState `json:"state"`
	Events []model.Event   `json:"events"`
}

type DemoStore struct {
	mu     sync.Mutex
	engine *simulation.Engine
	games  map[string]*Demo
	nextID atomic.Uint64
}

func NewDemoStore(engine *simulation.Engine) *DemoStore {
	return &DemoStore{engine: engine, games: map[string]*Demo{}}
}

func (s *DemoStore) Create(seed uint64) Demo {
	id := fmt.Sprintf("demo_%x_%x", time.Now().UnixMilli(), s.nextID.Add(1))
	game := &Demo{State: simulation.NewGame(id, "team-x", "team-o", seed)}
	s.mu.Lock()
	s.games[id] = game
	s.mu.Unlock()
	return cloneDemo(game)
}

func (s *DemoStore) Get(id string) (Demo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	game := s.games[id]
	if game == nil {
		return Demo{}, errors.New("game not found")
	}
	return cloneDemo(game), nil
}

func (s *DemoStore) Play(id string, call simulation.Call) (Demo, model.Event, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	game := s.games[id]
	if game == nil {
		return Demo{}, model.Event{}, errors.New("game not found")
	}
	if game.State.Finished {
		return cloneDemo(game), model.Event{}, errors.New("game is final")
	}
	event := s.engine.Play(&game.State, call)
	game.Events = append(game.Events, event)
	return cloneDemo(game), event, nil
}

func cloneDemo(in *Demo) Demo {
	out := Demo{State: in.State}
	out.Events = append([]model.Event(nil), in.Events...)
	return out
}

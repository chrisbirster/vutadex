package game

import (
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/chrisbirster/vutadex/internal/football/model"
	"github.com/chrisbirster/vutadex/internal/football/playbook"
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
	state := simulation.NewGame(id, "team-x", "team-o", seed)
	state.Possession = state.HomeID
	game := &Demo{State: state}
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

// CallPlay applies one human offensive play and, when possession changes, lets
// the transparent CPU finish its possession before control returns to Team X.
// This keeps the first Coach Mode slice focused on offensive play-calling while
// defense remains a later milestone.
func (s *DemoStore) CallPlay(id, playID string) (Demo, []model.Event, error) {
	call, err := resolvePlay(playID)
	if err != nil {
		return Demo{}, nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	game := s.games[id]
	if game == nil {
		return Demo{}, nil, errors.New("game not found")
	}
	if game.State.Finished {
		return cloneDemo(game), nil, errors.New("game is final")
	}
	if game.State.Possession != game.State.HomeID {
		return cloneDemo(game), nil, errors.New("waiting for opponent possession")
	}

	newEvents := make([]model.Event, 0, 12)
	event := s.engine.Play(&game.State, call)
	game.Events = append(game.Events, event)
	newEvents = append(newEvents, event)

	for snaps := 0; !game.State.Finished && game.State.Possession != game.State.HomeID && snaps < 80; snaps++ {
		event = s.engine.Play(&game.State, cpuCall(game.State))
		game.Events = append(game.Events, event)
		newEvents = append(newEvents, event)
	}

	return cloneDemo(game), newEvents, nil
}

func resolvePlay(id string) (simulation.Call, error) {
	switch id {
	case "special-punt":
		return simulation.Punt, nil
	case "special-field-goal":
		return simulation.FieldGoal, nil
	}
	for _, play := range playbook.OffenseCore {
		if play.ID != id {
			continue
		}
		switch play.Concept {
		case "inside-zone", "counter", "wide-zone", "option", "power":
			return simulation.Run, nil
		case "mesh", "stick", "spacing":
			return simulation.ShortPass, nil
		case "verticals", "play-action":
			return simulation.DeepPass, nil
		default:
			return "", fmt.Errorf("play %s has unsupported concept %s", play.ID, play.Concept)
		}
	}
	return "", fmt.Errorf("unknown offensive play %q", id)
}

func cpuCall(state model.GameState) simulation.Call {
	if state.Down == 4 {
		if state.Ball >= 65 {
			return simulation.FieldGoal
		}
		return simulation.Punt
	}
	if state.PlayNumber%7 == 0 {
		return simulation.DeepPass
	}
	if state.PlayNumber%3 == 0 {
		return simulation.Run
	}
	return simulation.ShortPass
}

func cloneDemo(in *Demo) Demo {
	out := Demo{State: in.State}
	out.Events = append([]model.Event(nil), in.Events...)
	return out
}

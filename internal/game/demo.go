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

const playClockDuration = 40 * time.Second

type Demo struct {
	State        model.GameState `json:"state"`
	Events       []model.Event   `json:"events"`
	PlayDeadline time.Time       `json:"playDeadline"`
	PlayClock    int             `json:"playClock"`
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
	game := &Demo{State: state, PlayDeadline: time.Now().Add(playClockDuration)}
	s.mu.Lock()
	s.games[id] = game
	s.mu.Unlock()
	return cloneDemo(game, time.Now())
}

func (s *DemoStore) Get(id string) (Demo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	game := s.games[id]
	if game == nil {
		return Demo{}, errors.New("game not found")
	}
	return cloneDemo(game, time.Now()), nil
}

func (s *DemoStore) Play(id string, call simulation.Call) (Demo, model.Event, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	game := s.games[id]
	if game == nil {
		return Demo{}, model.Event{}, errors.New("game not found")
	}
	if game.State.Finished {
		return cloneDemo(game, time.Now()), model.Event{}, errors.New("game is final")
	}
	event := s.engine.Play(&game.State, call)
	game.Events = append(game.Events, event)
	resetPlayClock(game, time.Now())
	return cloneDemo(game, time.Now()), event, nil
}

// CallPlay applies one human coaching decision. Team X calls its offensive play
// when it owns possession and calls a defensive concept against the CPU offense
// when Team O owns possession. The server owns the play deadline on both sides.
func (s *DemoStore) CallPlay(id, playID string) (Demo, []model.Event, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	game := s.games[id]
	if game == nil {
		return Demo{}, nil, errors.New("game not found")
	}
	if game.State.Finished {
		return cloneDemo(game, time.Now()), nil, errors.New("game is final")
	}

	now := time.Now()
	if !game.PlayDeadline.IsZero() && !now.Before(game.PlayDeadline) {
		event := s.expirePlayClock(game)
		game.Events = append(game.Events, event)
		resetPlayClock(game, now)
		return cloneDemo(game, now), []model.Event{event}, nil
	}

	var event model.Event
	if game.State.Possession == game.State.HomeID {
		call, name, err := resolveOffense(playID)
		if err != nil {
			return Demo{}, nil, err
		}
		event = s.engine.Play(&game.State, call)
		event.Description = name + " — " + event.Description
	} else {
		defense, name, err := resolveDefense(playID)
		if err != nil {
			return Demo{}, nil, err
		}
		event = s.engine.PlayAgainst(&game.State, cpuCall(game.State), defense)
		event.Description = name + " vs CPU — " + event.Description
	}

	game.Events = append(game.Events, event)
	resetPlayClock(game, now)
	return cloneDemo(game, now), []model.Event{event}, nil
}

func (s *DemoStore) expirePlayClock(game *Demo) model.Event {
	if game.State.Possession == game.State.HomeID {
		game.State.Ball -= 5
		if game.State.Ball < 1 {
			game.State.Ball = 1
		}
		game.State.Distance += 5
		return model.Event{
			Sequence:    len(game.Events) + 1,
			Type:        "penalty",
			Quarter:     game.State.Quarter,
			Clock:       game.State.Clock,
			Description: "Delay of game — Team X, 5 yards",
		}
	}

	event := s.engine.PlayAgainst(&game.State, cpuCall(game.State), simulation.DefenseZone)
	event.Description = "Play clock expired — default Cover 3 vs CPU — " + event.Description
	return event
}

func resolveOffense(id string) (simulation.Call, string, error) {
	switch id {
	case "special-punt":
		return simulation.Punt, "Punt", nil
	case "special-field-goal":
		return simulation.FieldGoal, "Field Goal", nil
	}
	for _, play := range playbook.OffenseCore {
		if play.ID != id {
			continue
		}
		switch play.Concept {
		case "inside-zone", "counter", "wide-zone", "option", "power":
			return simulation.Run, play.Name, nil
		case "mesh", "stick", "spacing":
			return simulation.ShortPass, play.Name, nil
		case "verticals", "play-action":
			return simulation.DeepPass, play.Name, nil
		default:
			return "", "", fmt.Errorf("play %s has unsupported concept %s", play.ID, play.Concept)
		}
	}
	return "", "", fmt.Errorf("unknown offensive play %q", id)
}

func resolveDefense(id string) (simulation.Defense, string, error) {
	for _, play := range playbook.DefenseCore {
		if play.ID != id {
			continue
		}
		switch play.Concept {
		case "cover-1", "cover-2-man":
			return simulation.DefenseMan, play.Name, nil
		case "cover-2", "cover-3", "quarters":
			return simulation.DefenseZone, play.Name, nil
		case "blitz", "zone-blitz":
			return simulation.DefenseBlitz, play.Name, nil
		case "run-blitz":
			return simulation.DefenseRunFit, play.Name, nil
		default:
			return "", "", fmt.Errorf("defensive play %s has unsupported concept %s", play.ID, play.Concept)
		}
	}
	return "", "", fmt.Errorf("unknown defensive play %q", id)
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

func resetPlayClock(game *Demo, now time.Time) {
	if game.State.Finished {
		game.PlayDeadline = time.Time{}
		return
	}
	game.PlayDeadline = now.Add(playClockDuration)
}

func cloneDemo(in *Demo, now time.Time) Demo {
	out := Demo{State: in.State, PlayDeadline: in.PlayDeadline}
	out.Events = append([]model.Event(nil), in.Events...)
	if !in.State.Finished && !in.PlayDeadline.IsZero() {
		remaining := int(time.Until(in.PlayDeadline).Seconds()) + 1
		if remaining < 0 {
			remaining = 0
		}
		if remaining > int(playClockDuration/time.Second) {
			remaining = int(playClockDuration / time.Second)
		}
		out.PlayClock = remaining
	}
	_ = now
	return out
}

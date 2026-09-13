package game

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/chrisbirster/vutadex/internal/football/model"
	"github.com/chrisbirster/vutadex/internal/football/playbook"
	"github.com/chrisbirster/vutadex/internal/football/simulation"
)

const (
	normalPlayClock = 40 * time.Second
	hurryPlayClock  = 20 * time.Second
)

type Advice struct {
	Kind   string `json:"kind"`
	Label  string `json:"label"`
	Reason string `json:"reason"`
}

type Decision struct {
	PlayID      string `json:"playId"`
	AudibleFrom string `json:"audibleFrom,omitempty"`
}

type Demo struct {
	State          model.GameState `json:"state"`
	Events         []model.Event   `json:"events"`
	PlayDeadline   time.Time       `json:"playDeadline"`
	PlayClock      int             `json:"playClock"`
	Timeouts       int             `json:"timeouts"`
	HurryUp        bool            `json:"hurryUp"`
	FourthDown     *Advice         `json:"fourthDown,omitempty"`
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
	now := time.Now()
	game := &Demo{State: state, Timeouts: 3}
	resetPlayClock(game, now)
	s.mu.Lock()
	s.games[id] = game
	s.mu.Unlock()
	return cloneDemo(game, now)
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
	now := time.Now()
	beforeQuarter := game.State.Quarter
	event := s.engine.Play(&game.State, call)
	appendEvent(game, &event)
	resetTimeoutsAtHalftime(game, beforeQuarter)
	resetPlayClock(game, now)
	return cloneDemo(game, now), event, nil
}

func (s *DemoStore) CallPlay(id, playID string) (Demo, []model.Event, error) {
	return s.CallDecision(id, Decision{PlayID: playID})
}

// CallDecision applies one human coaching decision. Team X calls its offensive
// play when it owns possession and calls a defensive concept against the CPU
// offense when Team O owns possession. Audibles are recorded as semantic event
// context while the final selected play remains the authoritative snap input.
func (s *DemoStore) CallDecision(id string, decision Decision) (Demo, []model.Event, error) {
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
		appendEvent(game, &event)
		resetPlayClock(game, now)
		return cloneDemo(game, now), []model.Event{event}, nil
	}

	decision.PlayID = strings.TrimSpace(decision.PlayID)
	decision.AudibleFrom = strings.TrimSpace(decision.AudibleFrom)
	beforeQuarter := game.State.Quarter
	var event model.Event

	if game.State.Possession == game.State.HomeID {
		call, name, err := resolveOffense(decision.PlayID)
		if err != nil {
			return Demo{}, nil, err
		}
		prefix, err := audiblePrefix(decision.AudibleFrom, decision.PlayID, true, name)
		if err != nil {
			return Demo{}, nil, err
		}
		event = s.engine.Play(&game.State, call)
		event.Description = prefix + event.Description
	} else {
		defense, name, err := resolveDefense(decision.PlayID)
		if err != nil {
			return Demo{}, nil, err
		}
		prefix, err := audiblePrefix(decision.AudibleFrom, decision.PlayID, false, name)
		if err != nil {
			return Demo{}, nil, err
		}
		event = s.engine.PlayAgainst(&game.State, cpuCall(game.State), defense)
		event.Description = prefix + "vs CPU — " + event.Description
	}

	appendEvent(game, &event)
	resetTimeoutsAtHalftime(game, beforeQuarter)
	resetPlayClock(game, now)
	return cloneDemo(game, now), []model.Event{event}, nil
}

func (s *DemoStore) Action(id, action string) (Demo, model.Event, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	game := s.games[id]
	if game == nil {
		return Demo{}, model.Event{}, errors.New("game not found")
	}
	if game.State.Finished {
		return cloneDemo(game, time.Now()), model.Event{}, errors.New("game is final")
	}

	now := time.Now()
	action = strings.TrimSpace(action)
	event := model.Event{Type: "coaching", Quarter: game.State.Quarter, Clock: game.State.Clock}
	switch action {
	case "timeout":
		if game.Timeouts <= 0 {
			return Demo{}, model.Event{}, errors.New("no timeouts remaining")
		}
		game.Timeouts--
		event.Type = "timeout"
		event.Description = fmt.Sprintf("Team X timeout — %d remaining", game.Timeouts)
	case "hurry_up_on":
		game.HurryUp = true
		event.Description = "Team X enters hurry-up tempo"
	case "hurry_up_off":
		game.HurryUp = false
		event.Description = "Team X returns to normal tempo"
	default:
		return Demo{}, model.Event{}, fmt.Errorf("unknown coaching action %q", action)
	}
	appendEvent(game, &event)
	resetPlayClock(game, now)
	return cloneDemo(game, now), event, nil
}

func (s *DemoStore) expirePlayClock(game *Demo) model.Event {
	if game.State.Possession == game.State.HomeID {
		game.State.Ball -= 5
		if game.State.Ball < 1 {
			game.State.Ball = 1
		}
		game.State.Distance += 5
		return model.Event{
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
	case "special-kneel":
		return simulation.Kneel, "Kneel", nil
	case "special-spike":
		return simulation.Spike, "Spike", nil
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

func audiblePrefix(fromID, toID string, offense bool, finalName string) (string, error) {
	if fromID == "" || fromID == toID {
		return finalName + " — ", nil
	}
	var fromName string
	if offense {
		_, name, err := resolveOffense(fromID)
		if err != nil {
			return "", fmt.Errorf("invalid offensive audible: %w", err)
		}
		fromName = name
	} else {
		_, name, err := resolveDefense(fromID)
		if err != nil {
			return "", fmt.Errorf("invalid defensive audible: %w", err)
		}
		fromName = name
	}
	return fmt.Sprintf("Audible %s → %s — ", fromName, finalName), nil
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

func appendEvent(game *Demo, event *model.Event) {
	event.Sequence = len(game.Events) + 1
	game.Events = append(game.Events, *event)
}

func resetTimeoutsAtHalftime(game *Demo, beforeQuarter int) {
	if beforeQuarter <= 2 && game.State.Quarter >= 3 {
		game.Timeouts = 3
	}
}

func playClockDuration(game *Demo) time.Duration {
	if game.HurryUp {
		return hurryPlayClock
	}
	return normalPlayClock
}

func resetPlayClock(game *Demo, now time.Time) {
	if game.State.Finished {
		game.PlayDeadline = time.Time{}
		return
	}
	game.PlayDeadline = now.Add(playClockDuration(game))
}

func fourthDownAdvice(state model.GameState) *Advice {
	if state.Finished || state.Possession != state.HomeID || state.Down != 4 {
		return nil
	}
	fieldGoalDistance := 117 - state.Ball
	if state.Distance <= 2 && state.Ball >= 45 {
		return &Advice{Kind: "go", Label: "Go for it", Reason: fmt.Sprintf("4th & %d near midfield or better favors keeping the offense on the field.", state.Distance)}
	}
	if fieldGoalDistance <= 57 {
		return &Advice{Kind: "field_goal", Label: "Try field goal", Reason: fmt.Sprintf("Estimated kick distance is %d yards.", fieldGoalDistance)}
	}
	if state.Ball < 60 {
		return &Advice{Kind: "punt", Label: "Punt", Reason: "Field position and distance favor pinning the opponent deep."}
	}
	return &Advice{Kind: "go", Label: "Go for it", Reason: "You are beyond comfortable punt territory and outside the preferred field-goal window."}
}

func cloneDemo(in *Demo, now time.Time) Demo {
	out := Demo{
		State:        in.State,
		PlayDeadline: in.PlayDeadline,
		Timeouts:     in.Timeouts,
		HurryUp:      in.HurryUp,
		FourthDown:   fourthDownAdvice(in.State),
	}
	out.Events = append([]model.Event(nil), in.Events...)
	if !in.State.Finished && !in.PlayDeadline.IsZero() {
		remaining := int(in.PlayDeadline.Sub(now).Seconds()) + 1
		if remaining < 0 {
			remaining = 0
		}
		maximum := int(playClockDuration(in) / time.Second)
		if remaining > maximum {
			remaining = maximum
		}
		out.PlayClock = remaining
	}
	return out
}

package game

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/chrisbirster/vutadex/internal/football/model"
)

// ResolveMatchup resolves one snap from two human calls. Team X and Team O
// always submit calls for their own team; possession determines which call is
// interpreted as offense and which as defense.
func (s *DemoStore) ResolveMatchup(id, xPlayID, oPlayID string) (Demo, []model.Event, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	current := s.games[id]
	if current == nil {
		return Demo{}, nil, errors.New("game not found")
	}
	if current.State.Finished {
		return cloneDemo(current, time.Now()), nil, errors.New("game is final")
	}

	beforeQuarter := current.State.Quarter
	var offenseID, defenseID, offenseTeam, defenseTeam string
	if current.State.Possession == current.State.HomeID {
		offenseID, defenseID = xPlayID, oPlayID
		offenseTeam, defenseTeam = "Team X", "Team O"
	} else {
		offenseID, defenseID = oPlayID, xPlayID
		offenseTeam, defenseTeam = "Team O", "Team X"
	}
	offense, offenseName, err := resolveOffense(offenseID)
	if err != nil {
		return Demo{}, nil, fmt.Errorf("%s offensive call: %w", offenseTeam, err)
	}
	defense, defenseName, err := resolveDefense(defenseID)
	if err != nil {
		return Demo{}, nil, fmt.Errorf("%s defensive call: %w", defenseTeam, err)
	}

	event := s.engine.PlayAgainst(&current.State, offense, defense)
	event.Description = fmt.Sprintf("%s %s vs %s %s — %s", offenseTeam, offenseName, defenseTeam, defenseName, event.Description)
	appendEvent(current, &event)
	resetTimeoutsAtHalftime(current, beforeQuarter)
	resetPlayClock(current, time.Now())
	return cloneDemo(current, time.Now()), []model.Event{event}, nil
}

func (s *Service) ResolveMatchup(ctx context.Context, id, xPlayID, oPlayID string) (Demo, []model.Event, error) {
	if err := s.ensureLoaded(ctx, id); err != nil {
		return Demo{}, nil, err
	}
	before, err := s.store.Get(id)
	if err != nil {
		return Demo{}, nil, err
	}
	current, events, err := s.store.ResolveMatchup(id, xPlayID, oPlayID)
	if err != nil {
		return Demo{}, nil, err
	}
	if err := s.save(ctx, current); err != nil {
		s.store.Restore(before)
		return Demo{}, nil, err
	}
	return current, events, nil
}

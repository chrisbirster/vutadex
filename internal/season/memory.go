package season

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"sync"
	"time"
)

type MemoryRepository struct {
	mu     sync.Mutex
	teams  map[string][]Team
	states map[string]State
	games  map[string]Game
}

func NewMemoryRepository() *MemoryRepository {
	return &MemoryRepository{teams: map[string][]Team{}, states: map[string]State{}, games: map[string]Game{}}
}

func (r *MemoryRepository) SeedTeams(leagueID string, teams []Team) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.teams[leagueID] = append([]Team(nil), teams...)
}

func seasonKey(leagueID string, season int) string { return fmt.Sprintf("%s|%d", leagueID, season) }

func (r *MemoryRepository) Teams(_ context.Context, leagueID string) ([]Team, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	teams := r.teams[leagueID]
	if len(teams) == 0 {
		return nil, ErrNotFound
	}
	return append([]Team(nil), teams...), nil
}

func (r *MemoryRepository) State(_ context.Context, leagueID string, season int) (State, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	state, ok := r.states[seasonKey(leagueID, season)]
	if !ok {
		return State{}, ErrNotFound
	}
	return state, nil
}

func (r *MemoryRepository) Games(_ context.Context, leagueID string, season int) ([]Game, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.states[seasonKey(leagueID, season)]; !ok {
		return nil, ErrNotFound
	}
	out := make([]Game, 0)
	for _, game := range r.games {
		if game.LeagueID == leagueID && game.Season == season {
			out = append(out, game)
		}
	}
	sortGames(out)
	return out, nil
}

func (r *MemoryRepository) Game(_ context.Context, id string) (Game, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	game, ok := r.games[id]
	if !ok {
		return Game{}, ErrNotFound
	}
	return game, nil
}

func (r *MemoryRepository) CreateSeason(_ context.Context, state State, games []Game) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	key := seasonKey(state.LeagueID, state.Season)
	if _, exists := r.states[key]; exists {
		return errors.New("season already exists")
	}
	for _, game := range games {
		if _, exists := r.games[game.ID]; exists {
			return errors.New("game already exists")
		}
	}
	r.states[key] = state
	for _, game := range games {
		r.games[game.ID] = game
	}
	return nil
}

func (r *MemoryRepository) SaveResult(_ context.Context, gameID string, homeScore, awayScore int, winner string, finishedAt time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	game, ok := r.games[gameID]
	if !ok {
		return ErrNotFound
	}
	if game.Status == GameFinal {
		return errors.New("game is already final")
	}
	game.HomeScore = homeScore
	game.AwayScore = awayScore
	game.WinnerTeamID = winner
	game.Status = GameFinal
	game.FinishedAt = &finishedAt
	r.games[gameID] = game
	return nil
}

func (r *MemoryRepository) AddGames(_ context.Context, games []Game) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, game := range games {
		if _, exists := r.games[game.ID]; exists {
			return errors.New("game already exists")
		}
		if _, ok := r.states[seasonKey(game.LeagueID, game.Season)]; !ok {
			return ErrNotFound
		}
	}
	for _, game := range games {
		r.games[game.ID] = game
	}
	return nil
}

func (r *MemoryRepository) UpdateState(_ context.Context, state State) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	key := seasonKey(state.LeagueID, state.Season)
	if _, ok := r.states[key]; !ok {
		return ErrNotFound
	}
	r.states[key] = state
	return nil
}

func sortGames(games []Game) {
	sort.Slice(games, func(i, j int) bool {
		if games[i].Week != games[j].Week {
			return games[i].Week < games[j].Week
		}
		if games[i].Phase != games[j].Phase {
			return games[i].Phase < games[j].Phase
		}
		return games[i].ID < games[j].ID
	})
}

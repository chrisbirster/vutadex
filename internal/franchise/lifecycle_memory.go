package franchise

import (
	"context"
	"errors"
	"sort"
	"sync"
	"time"
)

type lifecycleState struct {
	Experience int
	Durability int
	RetiredAt  *time.Time
}

type MemoryLifecycleRepository struct {
	base      *MemoryRepository
	mu        sync.Mutex
	seasons   map[string]int
	states    map[string]lifecycleState
	reports   map[string]ScoutReport
	injuries  map[string]Injury
	events    []LifecycleEvent
}

func NewMemoryLifecycleRepository(base *MemoryRepository) *MemoryLifecycleRepository {
	if base == nil {
		base = NewMemoryRepository()
	}
	return &MemoryLifecycleRepository{
		base: base,
		seasons: map[string]int{},
		states: map[string]lifecycleState{},
		reports: map[string]ScoutReport{},
		injuries: map[string]Injury{},
	}
}

func (r *MemoryLifecycleRepository) SeedLeagueSeason(leagueID string, season int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.seasons[leagueID] = season
}

func (r *MemoryLifecycleRepository) SeedLifecycle(playerID string, experience, durability int) {
	if durability < 1 {
		durability = 75
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.states[playerID] = lifecycleState{Experience: experience, Durability: durability}
}

func (r *MemoryLifecycleRepository) LifecyclePlayer(_ context.Context, playerID string) (LifecyclePlayer, error) {
	r.base.mu.Lock()
	player, ok := r.base.players[playerID]
	r.base.mu.Unlock()
	if !ok {
		return LifecyclePlayer{}, ErrNotFound
	}
	r.mu.Lock()
	state := r.states[playerID]
	r.mu.Unlock()
	return memoryLifecyclePlayer(player, state), nil
}

func (r *MemoryLifecycleRepository) LeagueLifecyclePlayers(_ context.Context, leagueID string) ([]LifecyclePlayer, error) {
	r.base.mu.Lock()
	players := make([]PlayerAsset, 0)
	for _, player := range r.base.players {
		if player.LeagueID == leagueID {
			players = append(players, player)
		}
	}
	r.base.mu.Unlock()
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]LifecyclePlayer, 0, len(players))
	for _, player := range players {
		out = append(out, memoryLifecyclePlayer(player, r.states[player.ID]))
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, nil
}

func (r *MemoryLifecycleRepository) LeagueSeason(_ context.Context, leagueID string) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	season, ok := r.seasons[leagueID]
	if !ok {
		return 0, ErrNotFound
	}
	return season, nil
}

func (r *MemoryLifecycleRepository) ScoutReport(_ context.Context, userID, playerID string) (ScoutReport, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	report, ok := r.reports[userID+"|"+playerID]
	if !ok {
		return ScoutReport{}, ErrNotFound
	}
	return report, nil
}

func (r *MemoryLifecycleRepository) SaveScoutReport(_ context.Context, report ScoutReport) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.reports[report.UserID+"|"+report.PlayerID] = report
	return nil
}

func (r *MemoryLifecycleRepository) ActiveInjuries(_ context.Context, leagueID string) ([]Injury, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]Injury, 0)
	for _, injury := range r.injuries {
		if injury.LeagueID == leagueID && injury.Status == InjuryActive {
			out = append(out, injury)
		}
	}
	sortInjuries(out)
	return out, nil
}

func (r *MemoryLifecycleRepository) LifecycleEvents(_ context.Context, leagueID string, limit int) ([]LifecycleEvent, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]LifecycleEvent, 0)
	for i := len(r.events) - 1; i >= 0 && len(out) < limit; i-- {
		if r.events[i].LeagueID == leagueID {
			out = append(out, cloneLifecycleEvent(r.events[i]))
		}
	}
	return out, nil
}

func (r *MemoryLifecycleRepository) ApplyInjuryWeek(_ context.Context, updates []InjuryUpdate, created []Injury, events []LifecycleEvent) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, update := range updates {
		injury, ok := r.injuries[update.ID]
		if !ok {
			return ErrNotFound
		}
		injury.WeeksRemaining = update.WeeksRemaining
		injury.Status = update.Status
		injury.RecoveredAt = update.RecoveredAt
		r.injuries[update.ID] = injury
	}
	for _, injury := range created {
		if _, exists := r.injuries[injury.ID]; exists {
			return errors.New("injury already exists")
		}
		r.injuries[injury.ID] = injury
	}
	for _, event := range events {
		r.events = append(r.events, cloneLifecycleEvent(event))
	}
	return nil
}

func (r *MemoryLifecycleRepository) ApplySeasonTransition(_ context.Context, leagueID string, nextSeason int, changes []PlayerSeasonChange, events []LifecycleEvent) error {
	r.base.mu.Lock()
	defer r.base.mu.Unlock()
	r.mu.Lock()
	defer r.mu.Unlock()
	current, ok := r.seasons[leagueID]
	if !ok {
		return ErrNotFound
	}
	if nextSeason != current+1 {
		return errors.New("league season changed")
	}
	for _, change := range changes {
		player, ok := r.base.players[change.PlayerID]
		if !ok || player.LeagueID != leagueID {
			return ErrNotFound
		}
	}
	now := time.Now().UTC()
	for _, change := range changes {
		player := r.base.players[change.PlayerID]
		player.Age = change.Age
		player.Overall = change.Overall
		player.Potential = change.Potential
		player.Status = change.Status
		state := r.states[player.ID]
		state.Experience = change.Experience
		state.Durability = change.Durability
		if state.Durability < 1 {
			state.Durability = 75
		}
		if change.Retired {
			player.TeamID = ""
			retiredAt := now
			state.RetiredAt = &retiredAt
			delete(r.base.contracts, player.ID)
		}
		r.base.players[player.ID] = player
		r.states[player.ID] = state
	}
	r.seasons[leagueID] = nextSeason
	for _, event := range events {
		r.events = append(r.events, cloneLifecycleEvent(event))
	}
	return nil
}

func memoryLifecyclePlayer(player PlayerAsset, state lifecycleState) LifecyclePlayer {
	durability := state.Durability
	if durability < 1 {
		durability = 75
	}
	return LifecyclePlayer{
		ID: player.ID, LeagueID: player.LeagueID, TeamID: player.TeamID, Status: player.Status,
		FirstName: player.FirstName, LastName: player.LastName, Position: player.Position,
		Age: player.Age, Overall: player.Overall, Potential: player.Potential,
		Experience: state.Experience, Durability: durability,
	}
}

func cloneLifecycleEvent(in LifecycleEvent) LifecycleEvent {
	out := in
	if in.Payload != nil {
		out.Payload = make(map[string]any, len(in.Payload))
		for key, value := range in.Payload {
			out.Payload[key] = value
		}
	}
	return out
}

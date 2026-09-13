package franchise

import (
	"context"
	"errors"
	"fmt"
	"hash/fnv"
	"sort"
	"strings"
	"time"
)

type LifecyclePlayer struct {
	ID         string       `json:"id"`
	LeagueID   string       `json:"leagueId"`
	TeamID     string       `json:"teamId,omitempty"`
	Status     PlayerStatus `json:"status"`
	FirstName  string       `json:"firstName"`
	LastName   string       `json:"lastName"`
	Position   string       `json:"position"`
	Age        int          `json:"age"`
	Overall    int          `json:"-"`
	Potential  int          `json:"-"`
	Experience int          `json:"experience"`
	Durability int          `json:"durability"`
}

type ScoutReport struct {
	LeagueID      string    `json:"leagueId"`
	UserID        string    `json:"userId"`
	PlayerID      string    `json:"playerId"`
	Observations  int       `json:"observations"`
	OverallLow    int       `json:"overallLow"`
	OverallHigh   int       `json:"overallHigh"`
	PotentialLow  int       `json:"potentialLow"`
	PotentialHigh int       `json:"potentialHigh"`
	Confidence    int       `json:"confidence"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

type ScoutedPlayer struct {
	ID         string       `json:"id"`
	LeagueID   string       `json:"leagueId"`
	TeamID     string       `json:"teamId,omitempty"`
	Status     PlayerStatus `json:"status"`
	FirstName  string       `json:"firstName"`
	LastName   string       `json:"lastName"`
	Position   string       `json:"position"`
	Age        int          `json:"age"`
	Experience int          `json:"experience"`
	Report     ScoutReport  `json:"report"`
}

type InjuryStatus string

const (
	InjuryActive    InjuryStatus = "active"
	InjuryRecovered InjuryStatus = "recovered"
)

type Injury struct {
	ID             string       `json:"id"`
	LeagueID       string       `json:"leagueId"`
	PlayerID       string       `json:"playerId"`
	TeamID         string       `json:"teamId"`
	Kind           string       `json:"kind"`
	Severity       string       `json:"severity"`
	WeeksRemaining int          `json:"weeksRemaining"`
	OccurredSeason int          `json:"occurredSeason"`
	OccurredWeek   int          `json:"occurredWeek"`
	Status         InjuryStatus `json:"status"`
	CreatedAt      time.Time    `json:"createdAt"`
	RecoveredAt    *time.Time   `json:"recoveredAt,omitempty"`
}

type LifecycleEvent struct {
	ID         string         `json:"id"`
	LeagueID   string         `json:"leagueId"`
	PlayerID   string         `json:"playerId"`
	Season     int            `json:"season"`
	Kind       string         `json:"kind"`
	Payload    map[string]any `json:"payload"`
	OccurredAt time.Time      `json:"occurredAt"`
}

type PlayerSeasonChange struct {
	PlayerID        string       `json:"playerId"`
	PreviousAge     int          `json:"previousAge"`
	Age             int          `json:"age"`
	PreviousOverall int          `json:"previousOverall"`
	Overall         int          `json:"overall"`
	PreviousPotential int        `json:"previousPotential"`
	Potential       int          `json:"potential"`
	Experience      int          `json:"experience"`
	Durability      int          `json:"durability"`
	Status          PlayerStatus `json:"status"`
	Retired         bool         `json:"retired"`
}

type SeasonTransition struct {
	LeagueID string               `json:"leagueId"`
	Season   int                  `json:"season"`
	Changes  []PlayerSeasonChange `json:"changes"`
}

type InjuryWeekResult struct {
	LeagueID  string   `json:"leagueId"`
	Season    int      `json:"season"`
	Week      int      `json:"week"`
	Created   []Injury `json:"created"`
	Recovered []Injury `json:"recovered"`
	Active    []Injury `json:"active"`
}

type InjuryUpdate struct {
	ID             string
	WeeksRemaining int
	Status         InjuryStatus
	RecoveredAt    *time.Time
}

type LifecycleRepository interface {
	LifecyclePlayer(context.Context, string) (LifecyclePlayer, error)
	LeagueLifecyclePlayers(context.Context, string) ([]LifecyclePlayer, error)
	LeagueSeason(context.Context, string) (int, error)
	ScoutReport(context.Context, string, string) (ScoutReport, error)
	SaveScoutReport(context.Context, ScoutReport) error
	ActiveInjuries(context.Context, string) ([]Injury, error)
	LifecycleEvents(context.Context, string, int) ([]LifecycleEvent, error)
	ApplyInjuryWeek(context.Context, []InjuryUpdate, []Injury, []LifecycleEvent) error
	ApplySeasonTransition(context.Context, string, int, []PlayerSeasonChange, []LifecycleEvent) error
}

type LifecycleService struct{ repo LifecycleRepository }

func NewLifecycleService(repo LifecycleRepository) *LifecycleService { return &LifecycleService{repo: repo} }

func (s *LifecycleService) Scout(ctx context.Context, leagueID, userID, playerID string, scoutSkill int) (ScoutedPlayer, error) {
	leagueID = strings.TrimSpace(leagueID)
	userID = strings.TrimSpace(userID)
	playerID = strings.TrimSpace(playerID)
	if leagueID == "" || userID == "" || playerID == "" {
		return ScoutedPlayer{}, errors.New("league, user and player are required")
	}
	player, err := s.repo.LifecyclePlayer(ctx, playerID)
	if err != nil {
		return ScoutedPlayer{}, err
	}
	if player.LeagueID != leagueID {
		return ScoutedPlayer{}, errors.New("player is not in league")
	}
	if player.Status == PlayerRetired {
		return ScoutedPlayer{}, errors.New("retired players cannot be scouted")
	}
	if scoutSkill < 40 {
		scoutSkill = 40
	}
	if scoutSkill > 99 {
		scoutSkill = 99
	}
	previous, err := s.repo.ScoutReport(ctx, userID, playerID)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return ScoutedPlayer{}, err
	}
	observations := previous.Observations + 1
	width := 18 - observations*2 - (scoutSkill-40)/12
	if width < 2 {
		width = 2
	}
	potentialWidth := width + 4
	seed := stableHash(fmt.Sprintf("%s|%s|%d", userID, playerID, observations))
	oLow, oHigh := scoutingRange(player.Overall, width, seed)
	pLow, pHigh := scoutingRange(player.Potential, potentialWidth, seed>>17)
	confidence := 28 + observations*11 + (scoutSkill-40)/4
	if confidence > 97 {
		confidence = 97
	}
	report := ScoutReport{
		LeagueID: leagueID, UserID: userID, PlayerID: playerID, Observations: observations,
		OverallLow: oLow, OverallHigh: oHigh, PotentialLow: pLow, PotentialHigh: pHigh,
		Confidence: confidence, UpdatedAt: time.Now().UTC(),
	}
	if err := s.repo.SaveScoutReport(ctx, report); err != nil {
		return ScoutedPlayer{}, err
	}
	return scouted(player, report), nil
}

func (s *LifecycleService) ScoutingReport(ctx context.Context, userID, playerID string) (ScoutReport, error) {
	return s.repo.ScoutReport(ctx, strings.TrimSpace(userID), strings.TrimSpace(playerID))
}

func (s *LifecycleService) ActiveInjuries(ctx context.Context, leagueID string) ([]Injury, error) {
	return s.repo.ActiveInjuries(ctx, strings.TrimSpace(leagueID))
}

func (s *LifecycleService) Events(ctx context.Context, leagueID string, limit int) ([]LifecycleEvent, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	return s.repo.LifecycleEvents(ctx, strings.TrimSpace(leagueID), limit)
}

func (s *LifecycleService) AdvanceWeek(ctx context.Context, leagueID string, season, week int, seed uint64) (InjuryWeekResult, error) {
	leagueID = strings.TrimSpace(leagueID)
	if leagueID == "" || season < 1 || week < 1 {
		return InjuryWeekResult{}, errors.New("valid league, season and week are required")
	}
	players, err := s.repo.LeagueLifecyclePlayers(ctx, leagueID)
	if err != nil {
		return InjuryWeekResult{}, err
	}
	active, err := s.repo.ActiveInjuries(ctx, leagueID)
	if err != nil {
		return InjuryWeekResult{}, err
	}
	now := time.Now().UTC()
	initiallyInjured := map[string]bool{}
	updates := make([]InjuryUpdate, 0, len(active))
	recovered := make([]Injury, 0)
	events := make([]LifecycleEvent, 0)
	for _, injury := range active {
		initiallyInjured[injury.PlayerID] = true
		remaining := injury.WeeksRemaining - 1
		if remaining <= 0 {
			when := now
			updates = append(updates, InjuryUpdate{ID: injury.ID, Status: InjuryRecovered, WeeksRemaining: 0, RecoveredAt: &when})
			injury.Status = InjuryRecovered
			injury.WeeksRemaining = 0
			injury.RecoveredAt = &when
			recovered = append(recovered, injury)
			events = append(events, lifecycleEvent(leagueID, injury.PlayerID, season, "recovery", map[string]any{"injuryId": injury.ID, "kind": injury.Kind}, now))
		} else {
			updates = append(updates, InjuryUpdate{ID: injury.ID, Status: InjuryActive, WeeksRemaining: remaining})
		}
	}
	created := make([]Injury, 0)
	for _, player := range players {
		if player.Status != PlayerRoster || player.TeamID == "" || initiallyInjured[player.ID] {
			continue
		}
		chance := 2 + (100-player.Durability)/7
		if chance < 1 {
			chance = 1
		}
		roll := int(stableHash(fmt.Sprintf("injury|%d|%s|%d|%d", seed, player.ID, season, week)) % 100)
		if roll >= chance {
			continue
		}
		injury := makeInjury(player, season, week, seed, now)
		created = append(created, injury)
		events = append(events, lifecycleEvent(leagueID, player.ID, season, "injury", map[string]any{"injuryId": injury.ID, "kind": injury.Kind, "severity": injury.Severity, "weeks": injury.WeeksRemaining}, now))
	}
	if err := s.repo.ApplyInjuryWeek(ctx, updates, created, events); err != nil {
		return InjuryWeekResult{}, err
	}
	finalActive, err := s.repo.ActiveInjuries(ctx, leagueID)
	if err != nil {
		return InjuryWeekResult{}, err
	}
	return InjuryWeekResult{LeagueID: leagueID, Season: season, Week: week, Created: created, Recovered: recovered, Active: finalActive}, nil
}

func (s *LifecycleService) AdvanceSeason(ctx context.Context, leagueID string, nextSeason int, seed uint64) (SeasonTransition, error) {
	leagueID = strings.TrimSpace(leagueID)
	current, err := s.repo.LeagueSeason(ctx, leagueID)
	if err != nil {
		return SeasonTransition{}, err
	}
	if nextSeason != current+1 {
		return SeasonTransition{}, fmt.Errorf("next season must be %d", current+1)
	}
	players, err := s.repo.LeagueLifecyclePlayers(ctx, leagueID)
	if err != nil {
		return SeasonTransition{}, err
	}
	now := time.Now().UTC()
	changes := make([]PlayerSeasonChange, 0, len(players))
	events := make([]LifecycleEvent, 0, len(players))
	for _, player := range players {
		if player.Status == PlayerRetired {
			continue
		}
		change := seasonChange(player, seed, nextSeason)
		changes = append(changes, change)
		kind := "development"
		if change.Retired {
			kind = "retirement"
		}
		events = append(events, lifecycleEvent(leagueID, player.ID, nextSeason, kind, map[string]any{
			"age": change.Age, "overallBefore": change.PreviousOverall, "overallAfter": change.Overall,
			"potentialBefore": change.PreviousPotential, "potentialAfter": change.Potential, "retired": change.Retired,
		}, now))
	}
	if err := s.repo.ApplySeasonTransition(ctx, leagueID, nextSeason, changes, events); err != nil {
		return SeasonTransition{}, err
	}
	return SeasonTransition{LeagueID: leagueID, Season: nextSeason, Changes: changes}, nil
}

func scoutingRange(actual, width int, seed uint64) (int, int) {
	if width < 2 {
		width = 2
	}
	left := 1 + int(seed%uint64(width))
	right := 1 + int((seed>>11)%uint64(width))
	low := clampRating(actual - left)
	high := clampRating(actual + right)
	if low == high {
		if high < 99 {
			high++
		} else if low > 1 {
			low--
		}
	}
	return low, high
}

func scouted(player LifecyclePlayer, report ScoutReport) ScoutedPlayer {
	return ScoutedPlayer{ID: player.ID, LeagueID: player.LeagueID, TeamID: player.TeamID, Status: player.Status, FirstName: player.FirstName, LastName: player.LastName, Position: player.Position, Age: player.Age, Experience: player.Experience, Report: report}
}

func seasonChange(player LifecyclePlayer, seed uint64, season int) PlayerSeasonChange {
	age := player.Age + 1
	roll := int(stableHash(fmt.Sprintf("develop|%d|%s|%d", seed, player.ID, season)) % 100)
	delta := 0
	switch {
	case age <= 23:
		headroom := maxInt(0, player.Potential-player.Overall)
		delta = minInt(4, headroom/8) + roll%3 - 1
	case age <= 26:
		delta = roll%4 - 1
	case age <= 29:
		delta = roll%3 - 1
	case age <= 32:
		delta = -(roll%3)
	default:
		delta = -(1 + roll%4)
	}
	potential := player.Potential
	if age >= 30 {
		potential = clampRating(potential - int((stableHash(fmt.Sprintf("potential|%d|%s|%d", seed, player.ID, season))%2)))
	}
	overall := clampRating(player.Overall + delta)
	if age <= 27 && overall > potential+2 {
		overall = potential + 2
	}
	durability := player.Durability
	if durability == 0 {
		durability = 75
	}
	if age >= 30 && durability > 35 {
		durability -= int(stableHash(fmt.Sprintf("durability|%d|%s|%d", seed, player.ID, season))%2)
	}
	experience := player.Experience
	if player.Status == PlayerRoster || player.Status == PlayerFreeAgent || player.Status == PlayerWaivers {
		experience++
	}
	retired := shouldRetire(player.ID, age, overall, seed, season)
	status := player.Status
	if retired {
		status = PlayerRetired
	}
	return PlayerSeasonChange{
		PlayerID: player.ID, PreviousAge: player.Age, Age: age, PreviousOverall: player.Overall, Overall: overall,
		PreviousPotential: player.Potential, Potential: potential, Experience: experience, Durability: durability, Status: status, Retired: retired,
	}
}

func shouldRetire(playerID string, age, overall int, seed uint64, season int) bool {
	if age >= 40 {
		return true
	}
	chance := 0
	if age >= 35 {
		chance = 20 + (age-35)*16
	} else if age >= 32 && overall < 60 {
		chance = 18
	}
	if chance <= 0 {
		return false
	}
	roll := int(stableHash(fmt.Sprintf("retire|%d|%s|%d", seed, playerID, season)) % 100)
	return roll < chance
}

func makeInjury(player LifecyclePlayer, season, week int, seed uint64, now time.Time) Injury {
	h := stableHash(fmt.Sprintf("injury-detail|%d|%s|%d|%d", seed, player.ID, season, week))
	kinds := []string{"ankle", "hamstring", "shoulder", "knee", "concussion"}
	kind := kinds[int(h%uint64(len(kinds)))]
	severityRoll := int((h >> 9) % 100)
	severity, weeks := "minor", 1
	switch {
	case severityRoll >= 92:
		severity, weeks = "major", 5+int((h>>17)%4)
	case severityRoll >= 65:
		severity, weeks = "moderate", 2+int((h>>17)%3)
	}
	return Injury{ID: id("inj_"), LeagueID: player.LeagueID, PlayerID: player.ID, TeamID: player.TeamID, Kind: kind, Severity: severity, WeeksRemaining: weeks, OccurredSeason: season, OccurredWeek: week, Status: InjuryActive, CreatedAt: now}
}

func lifecycleEvent(leagueID, playerID string, season int, kind string, payload map[string]any, now time.Time) LifecycleEvent {
	return LifecycleEvent{ID: id("life_"), LeagueID: leagueID, PlayerID: playerID, Season: season, Kind: kind, Payload: payload, OccurredAt: now}
}

func stableHash(value string) uint64 {
	h := fnv.New64a()
	_, _ = h.Write([]byte(value))
	return h.Sum64()
}

func clampRating(value int) int {
	if value < 1 {
		return 1
	}
	if value > 99 {
		return 99
	}
	return value
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func sortInjuries(injuries []Injury) {
	sort.Slice(injuries, func(i, j int) bool {
		if injuries[i].WeeksRemaining != injuries[j].WeeksRemaining {
			return injuries[i].WeeksRemaining > injuries[j].WeeksRemaining
		}
		return injuries[i].PlayerID < injuries[j].PlayerID
	})
}

package season

import (
	"context"
	"errors"
	"fmt"
	"hash/fnv"
	"sort"
	"strings"
	"time"

	football "github.com/chrisbirster/vutadex/internal/football/model"
	"github.com/chrisbirster/vutadex/internal/football/simulation"
	leaguepkg "github.com/chrisbirster/vutadex/internal/league"
)

var ErrNotFound = errors.New("season resource not found")

type Repository interface {
	Teams(context.Context, string) ([]Team, error)
	State(context.Context, string, int) (State, error)
	Games(context.Context, string, int) ([]Game, error)
	Game(context.Context, string) (Game, error)
	CreateSeason(context.Context, State, []Game) error
	SaveResult(context.Context, string, int, int, string, time.Time) error
	AddGames(context.Context, []Game) error
	UpdateState(context.Context, State) error
}

type Service struct {
	repo   Repository
	engine *simulation.Engine
}

func NewService(repo Repository, engine *simulation.Engine) *Service {
	if engine == nil {
		engine = simulation.New()
	}
	return &Service{repo: repo, engine: engine}
}

func (s *Service) Create(ctx context.Context, leagueID string, season int, seed uint64) (Snapshot, error) {
	leagueID = strings.TrimSpace(leagueID)
	if leagueID == "" || season < 1 {
		return Snapshot{}, errors.New("league and season are required")
	}
	teams, err := s.repo.Teams(ctx, leagueID)
	if err != nil {
		return Snapshot{}, err
	}
	if len(teams) < 2 {
		return Snapshot{}, errors.New("season requires at least two teams")
	}
	modelLeague := football.League{ID: leagueID, Season: season, Teams: make([]football.Team, 0, len(teams))}
	for _, team := range teams {
		modelLeague.Teams = append(modelLeague.Teams, football.Team{ID: team.ID, City: team.City, Name: team.Name, Abbreviation: team.Abbreviation})
	}
	matchups := leaguepkg.Schedule(modelLeague)
	now := time.Now().UTC()
	state := State{LeagueID: leagueID, Season: season, Status: SeasonRegular, CurrentWeek: 1, Seed: seed, StartedAt: now}
	games := make([]Game, 0, len(matchups))
	for _, matchup := range matchups {
		id := gameID(leagueID, season, PhaseRegular, matchup.Week, matchup.HomeID, matchup.AwayID)
		games = append(games, Game{
			ID: id, LeagueID: leagueID, Season: season, Week: matchup.Week, Phase: PhaseRegular,
			HomeTeamID: matchup.HomeID, AwayTeamID: matchup.AwayID, Status: GameScheduled,
			Seed: seed ^ stableHash(id),
		})
	}
	if err := s.repo.CreateSeason(ctx, state, games); err != nil {
		return Snapshot{}, err
	}
	return s.Snapshot(ctx, leagueID, season)
}

func (s *Service) Snapshot(ctx context.Context, leagueID string, season int) (Snapshot, error) {
	state, err := s.repo.State(ctx, leagueID, season)
	if err != nil {
		return Snapshot{}, err
	}
	games, err := s.repo.Games(ctx, leagueID, season)
	if err != nil {
		return Snapshot{}, err
	}
	return Snapshot{State: state, Games: games, Standings: standings(games)}, nil
}

func (s *Service) Standings(ctx context.Context, leagueID string, season int) ([]Standing, error) {
	games, err := s.repo.Games(ctx, strings.TrimSpace(leagueID), season)
	if err != nil {
		return nil, err
	}
	return standings(games), nil
}

func (s *Service) RecordResult(ctx context.Context, gameID string, homeScore, awayScore int) (Game, error) {
	if homeScore < 0 || awayScore < 0 {
		return Game{}, errors.New("scores cannot be negative")
	}
	game, err := s.repo.Game(ctx, strings.TrimSpace(gameID))
	if err != nil {
		return Game{}, err
	}
	if game.Status == GameFinal {
		return Game{}, errors.New("game is already final")
	}
	winner := winnerFor(game, homeScore, awayScore)
	finished := time.Now().UTC()
	if err := s.repo.SaveResult(ctx, game.ID, homeScore, awayScore, winner, finished); err != nil {
		return Game{}, err
	}
	return s.repo.Game(ctx, game.ID)
}

func (s *Service) Simulate(ctx context.Context, gameID string) (Game, error) {
	game, err := s.repo.Game(ctx, strings.TrimSpace(gameID))
	if err != nil {
		return Game{}, err
	}
	if game.Status == GameFinal {
		return Game{}, errors.New("game is already final")
	}
	state, _ := s.engine.Simulate(game.ID, game.HomeTeamID, game.AwayTeamID, game.Seed)
	return s.RecordResult(ctx, game.ID, state.HomeScore, state.AwayScore)
}

func (s *Service) AdvancePostseason(ctx context.Context, leagueID string, season int) (Snapshot, error) {
	leagueID = strings.TrimSpace(leagueID)
	state, err := s.repo.State(ctx, leagueID, season)
	if err != nil {
		return Snapshot{}, err
	}
	if state.Status == SeasonComplete {
		return s.Snapshot(ctx, leagueID, season)
	}
	games, err := s.repo.Games(ctx, leagueID, season)
	if err != nil {
		return Snapshot{}, err
	}
	regular := filterPhase(games, PhaseRegular)
	if !allFinal(regular) {
		return Snapshot{}, errors.New("regular season is not complete")
	}
	semis := filterPhase(games, PhaseSemifinal)
	championship := filterPhase(games, PhaseChampionship)
	if len(semis) == 0 && len(championship) == 0 {
		seeds := standings(games)
		if len(seeds) < 2 {
			return Snapshot{}, errors.New("not enough teams for postseason")
		}
		state.Status = SeasonPostseason
		if len(seeds) >= 4 {
			week := maxWeek(regular) + 1
			newGames := []Game{
				postseasonGame(state, PhaseSemifinal, week, seeds[0].TeamID, seeds[3].TeamID, 1),
				postseasonGame(state, PhaseSemifinal, week, seeds[1].TeamID, seeds[2].TeamID, 2),
			}
			state.CurrentWeek = week
			if err := s.repo.AddGames(ctx, newGames); err != nil {
				return Snapshot{}, err
			}
		} else {
			week := maxWeek(regular) + 1
			newGame := postseasonGame(state, PhaseChampionship, week, seeds[0].TeamID, seeds[1].TeamID, 1)
			state.CurrentWeek = week
			if err := s.repo.AddGames(ctx, []Game{newGame}); err != nil {
				return Snapshot{}, err
			}
		}
		if err := s.repo.UpdateState(ctx, state); err != nil {
			return Snapshot{}, err
		}
		return s.Snapshot(ctx, leagueID, season)
	}
	if len(semis) > 0 && len(championship) == 0 {
		if !allFinal(semis) {
			return Snapshot{}, errors.New("semifinals are not complete")
		}
		winners := []string{semis[0].WinnerTeamID, semis[1].WinnerTeamID}
		if winners[0] == "" || winners[1] == "" {
			return Snapshot{}, errors.New("semifinal winner missing")
		}
		week := maxWeek(semis) + 1
		final := postseasonGame(state, PhaseChampionship, week, winners[0], winners[1], 1)
		state.Status = SeasonPostseason
		state.CurrentWeek = week
		if err := s.repo.AddGames(ctx, []Game{final}); err != nil {
			return Snapshot{}, err
		}
		if err := s.repo.UpdateState(ctx, state); err != nil {
			return Snapshot{}, err
		}
		return s.Snapshot(ctx, leagueID, season)
	}
	championship = filterPhase(games, PhaseChampionship)
	if len(championship) != 1 || championship[0].Status != GameFinal {
		return Snapshot{}, errors.New("championship is not complete")
	}
	if championship[0].WinnerTeamID == "" {
		return Snapshot{}, errors.New("championship winner missing")
	}
	completed := time.Now().UTC()
	state.Status = SeasonComplete
	state.ChampionTeamID = championship[0].WinnerTeamID
	state.CompletedAt = &completed
	state.CurrentWeek = championship[0].Week
	if err := s.repo.UpdateState(ctx, state); err != nil {
		return Snapshot{}, err
	}
	return s.Snapshot(ctx, leagueID, season)
}

func standings(games []Game) []Standing {
	records := map[string]*Standing{}
	headToHead := map[string]map[string][3]int{}
	for _, game := range games {
		if game.Phase != PhaseRegular {
			continue
		}
		ensureStanding(records, game.HomeTeamID)
		ensureStanding(records, game.AwayTeamID)
		if game.Status != GameFinal {
			continue
		}
		home, away := records[game.HomeTeamID], records[game.AwayTeamID]
		home.Games++
		away.Games++
		home.PointsFor += game.HomeScore
		home.PointsAgainst += game.AwayScore
		away.PointsFor += game.AwayScore
		away.PointsAgainst += game.HomeScore
		if headToHead[game.HomeTeamID] == nil {
			headToHead[game.HomeTeamID] = map[string][3]int{}
		}
		if headToHead[game.AwayTeamID] == nil {
			headToHead[game.AwayTeamID] = map[string][3]int{}
		}
		h := headToHead[game.HomeTeamID][game.AwayTeamID]
		a := headToHead[game.AwayTeamID][game.HomeTeamID]
		switch {
		case game.HomeScore > game.AwayScore:
			home.Wins++
			away.Losses++
			h[0]++
			a[1]++
		case game.HomeScore < game.AwayScore:
			away.Wins++
			home.Losses++
			a[0]++
			h[1]++
		default:
			home.Ties++
			away.Ties++
			h[2]++
			a[2]++
		}
		headToHead[game.HomeTeamID][game.AwayTeamID] = h
		headToHead[game.AwayTeamID][game.HomeTeamID] = a
	}
	out := make([]Standing, 0, len(records))
	for _, record := range records {
		record.PointDiff = record.PointsFor - record.PointsAgainst
		if record.Games > 0 {
			record.WinPct = float64(record.Wins*2+record.Ties) / float64(record.Games*2)
		}
		out = append(out, *record)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if cmp := comparePct(out[i], out[j]); cmp != 0 {
			return cmp > 0
		}
		if h2h := headToHeadCompare(out[i].TeamID, out[j].TeamID, headToHead); h2h != 0 {
			return h2h > 0
		}
		if out[i].PointDiff != out[j].PointDiff {
			return out[i].PointDiff > out[j].PointDiff
		}
		if out[i].PointsFor != out[j].PointsFor {
			return out[i].PointsFor > out[j].PointsFor
		}
		return out[i].TeamID < out[j].TeamID
	})
	for i := range out {
		out[i].Seed = i + 1
	}
	return out
}

func ensureStanding(records map[string]*Standing, teamID string) {
	if teamID == "" || records[teamID] != nil {
		return
	}
	records[teamID] = &Standing{TeamID: teamID}
}

func comparePct(a, b Standing) int {
	if a.Games == 0 && b.Games == 0 {
		return 0
	}
	if a.Games == 0 {
		return -1
	}
	if b.Games == 0 {
		return 1
	}
	left := (a.Wins*2 + a.Ties) * b.Games
	right := (b.Wins*2 + b.Ties) * a.Games
	switch {
	case left > right:
		return 1
	case left < right:
		return -1
	default:
		return 0
	}
}

func headToHeadCompare(a, b string, records map[string]map[string][3]int) int {
	ra := records[a][b]
	rb := records[b][a]
	gamesA := ra[0] + ra[1] + ra[2]
	gamesB := rb[0] + rb[1] + rb[2]
	if gamesA == 0 || gamesB == 0 {
		return 0
	}
	pointsA := ra[0]*2 + ra[2]
	pointsB := rb[0]*2 + rb[2]
	if pointsA > pointsB {
		return 1
	}
	if pointsA < pointsB {
		return -1
	}
	return 0
}

func winnerFor(game Game, homeScore, awayScore int) string {
	if homeScore > awayScore {
		return game.HomeTeamID
	}
	if awayScore > homeScore {
		return game.AwayTeamID
	}
	if game.Phase == PhaseRegular {
		return ""
	}
	// Provisional deterministic postseason tie resolution until the core engine
	// gains full overtime rules. The persisted winner keeps bracket advancement
	// deterministic without pretending the tied score itself was not a tie.
	if stableHash(fmt.Sprintf("postseason-tie|%s|%d", game.ID, game.Seed))%2 == 0 {
		return game.HomeTeamID
	}
	return game.AwayTeamID
}

func postseasonGame(state State, phase Phase, week int, home, away string, slot int) Game {
	id := gameID(state.LeagueID, state.Season, phase, week, home, away) + fmt.Sprintf("_%d", slot)
	return Game{ID: id, LeagueID: state.LeagueID, Season: state.Season, Week: week, Phase: phase, HomeTeamID: home, AwayTeamID: away, Status: GameScheduled, Seed: state.Seed ^ stableHash(id)}
}

func gameID(leagueID string, season int, phase Phase, week int, home, away string) string {
	return fmt.Sprintf("g_%x", stableHash(fmt.Sprintf("%s|%d|%s|%d|%s|%s", leagueID, season, phase, week, home, away)))
}

func stableHash(value string) uint64 {
	h := fnv.New64a()
	_, _ = h.Write([]byte(value))
	return h.Sum64()
}

func filterPhase(games []Game, phase Phase) []Game {
	out := make([]Game, 0)
	for _, game := range games {
		if game.Phase == phase {
			out = append(out, game)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Week != out[j].Week {
			return out[i].Week < out[j].Week
		}
		return out[i].ID < out[j].ID
	})
	return out
}

func allFinal(games []Game) bool {
	if len(games) == 0 {
		return false
	}
	for _, game := range games {
		if game.Status != GameFinal {
			return false
		}
	}
	return true
}

func maxWeek(games []Game) int {
	week := 0
	for _, game := range games {
		if game.Week > week {
			week = game.Week
		}
	}
	return week
}

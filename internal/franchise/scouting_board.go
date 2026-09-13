package franchise

import (
	"context"
	"errors"
	"sort"
	"strings"
)

type PlayerBoardEntry struct {
	ID         string        `json:"id"`
	LeagueID   string        `json:"leagueId"`
	TeamID     string        `json:"teamId,omitempty"`
	Status     PlayerStatus  `json:"status"`
	FirstName  string        `json:"firstName"`
	LastName   string        `json:"lastName"`
	Position   string        `json:"position"`
	Age        int           `json:"age"`
	Experience int           `json:"experience"`
	Scouting   *ScoutReport  `json:"scouting,omitempty"`
}

func (s *LifecycleService) FreeAgentBoard(ctx context.Context, leagueID, userID string) ([]PlayerBoardEntry, error) {
	return s.playerBoard(ctx, leagueID, userID, PlayerFreeAgent)
}

func (s *LifecycleService) DraftBoard(ctx context.Context, leagueID, userID string) ([]PlayerBoardEntry, error) {
	return s.playerBoard(ctx, leagueID, userID, PlayerDraft)
}

func (s *LifecycleService) playerBoard(ctx context.Context, leagueID, userID string, status PlayerStatus) ([]PlayerBoardEntry, error) {
	leagueID = strings.TrimSpace(leagueID)
	userID = strings.TrimSpace(userID)
	players, err := s.repo.LeagueLifecyclePlayers(ctx, leagueID)
	if err != nil {
		return nil, err
	}
	out := make([]PlayerBoardEntry, 0)
	for _, player := range players {
		if player.Status != status {
			continue
		}
		entry := PlayerBoardEntry{
			ID: player.ID, LeagueID: player.LeagueID, TeamID: player.TeamID, Status: player.Status,
			FirstName: player.FirstName, LastName: player.LastName, Position: player.Position,
			Age: player.Age, Experience: player.Experience,
		}
		report, reportErr := s.repo.ScoutReport(ctx, userID, player.ID)
		if reportErr == nil {
			entry.Scouting = &report
		} else if !errors.Is(reportErr, ErrNotFound) {
			return nil, reportErr
		}
		out = append(out, entry)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Position != out[j].Position {
			return out[i].Position < out[j].Position
		}
		if out[i].Age != out[j].Age {
			return out[i].Age < out[j].Age
		}
		return out[i].ID < out[j].ID
	})
	return out, nil
}

package live

import (
	"context"
	"encoding/json"
	"time"
)

// Provider isolates external football feeds from the rest of VutaDex. Provider
// implementations must normalize facts into VutaDex types and must not invent
// tracking data that the source does not actually contain.
type Provider interface {
	Game(context.Context, string) (json.RawMessage, error)
	Plays(context.Context, string) ([]Play, error)
	Situation(context.Context, string) (Situation, error)
	Gamecast(context.Context, string) (Gamecast, error)
}

type Situation struct {
	GameID       string `json:"gameId"`
	Down         int    `json:"down"`
	Distance     int    `json:"distance"`
	YardLine     int    `json:"yardLine"`
	Possession   string `json:"possession"`
	IsRedZone    bool   `json:"isRedZone"`
	HomeTimeouts int    `json:"homeTimeouts"`
	AwayTimeouts int    `json:"awayTimeouts"`
	LastPlayID   string `json:"lastPlayId,omitempty"`
}

type Drive struct {
	ID            string   `json:"id"`
	Possession    string   `json:"possession,omitempty"`
	PlayIDs       []string `json:"playIds"`
	StartYardLine int      `json:"startYardLine,omitempty"`
	EndYardLine   int      `json:"endYardLine,omitempty"`
	Yards         int      `json:"yards"`
	Scoring       bool     `json:"scoring"`
}

type Gamecast struct {
	GameID      string    `json:"gameId"`
	Source      string    `json:"source"`
	Situation   Situation `json:"situation"`
	Drives      []Drive   `json:"drives"`
	Plays       []Play    `json:"plays"`
	RefreshedAt time.Time `json:"refreshedAt"`
}

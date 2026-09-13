package season

import "time"

type Phase string

const (
	PhaseRegular      Phase = "regular"
	PhaseSemifinal    Phase = "semifinal"
	PhaseChampionship Phase = "championship"
)

type SeasonStatus string

const (
	SeasonRegular     SeasonStatus = "regular"
	SeasonPostseason  SeasonStatus = "postseason"
	SeasonComplete    SeasonStatus = "complete"
)

type GameStatus string

const (
	GameScheduled GameStatus = "scheduled"
	GameFinal     GameStatus = "final"
)

type Team struct {
	ID           string `json:"id"`
	City         string `json:"city"`
	Name         string `json:"name"`
	Abbreviation string `json:"abbreviation"`
}

type State struct {
	LeagueID       string       `json:"leagueId"`
	Season         int          `json:"season"`
	Status         SeasonStatus `json:"status"`
	CurrentWeek    int          `json:"currentWeek"`
	ChampionTeamID string       `json:"championTeamId,omitempty"`
	Seed           uint64       `json:"seed"`
	StartedAt      time.Time    `json:"startedAt"`
	CompletedAt    *time.Time   `json:"completedAt,omitempty"`
}

type Game struct {
	ID           string     `json:"id"`
	LeagueID     string     `json:"leagueId"`
	Season       int        `json:"season"`
	Week         int        `json:"week"`
	Phase        Phase      `json:"phase"`
	HomeTeamID   string     `json:"homeTeamId"`
	AwayTeamID   string     `json:"awayTeamId"`
	Status       GameStatus `json:"status"`
	Seed         uint64     `json:"seed"`
	HomeScore    int        `json:"homeScore"`
	AwayScore    int        `json:"awayScore"`
	WinnerTeamID string     `json:"winnerTeamId,omitempty"`
	ScheduledAt  *time.Time `json:"scheduledAt,omitempty"`
	StartedAt    *time.Time `json:"startedAt,omitempty"`
	FinishedAt   *time.Time `json:"finishedAt,omitempty"`
}

type Standing struct {
	Seed       int     `json:"seed"`
	TeamID     string  `json:"teamId"`
	Games      int     `json:"games"`
	Wins       int     `json:"wins"`
	Losses     int     `json:"losses"`
	Ties       int     `json:"ties"`
	PointsFor  int     `json:"pointsFor"`
	PointsAgainst int  `json:"pointsAgainst"`
	PointDiff  int     `json:"pointDiff"`
	WinPct     float64 `json:"winPct"`
}

type Snapshot struct {
	State     State      `json:"state"`
	Games     []Game     `json:"games"`
	Standings []Standing `json:"standings"`
}

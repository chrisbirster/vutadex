package live

type Play struct {
	ID string `json:"id"`
	GameID string `json:"gameId"`
	DriveID string `json:"driveId"`
	Quarter int `json:"quarter"`
	Clock string `json:"clock"`
	Down int `json:"down"`
	Distance int `json:"distance"`
	YardLine int `json:"yardLine"`
	Possession string `json:"possession"`
	Type string `json:"type"`
	Description string `json:"description"`
	Yards int `json:"yards"`
	Scoring bool `json:"scoring"`
}

// Movement is intentionally not inferred here. Ordinary play-by-play does not
// contain tracking for all 22 players; renderers may reconstruct a clearly
// labelled approximation while simulated VutaDex games retain exact assignments.

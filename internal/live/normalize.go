package live

type Play struct{ID,GameID,DriveID string `json:"-"`;Quarter int `json:"quarter"`;Clock string `json:"clock"`;Down,Distance,YardLine int `json:"down"`;Possession,Type,Description string `json:"possession"`;Yards int `json:"yards"`;Scoring bool `json:"scoring"`}

// Movement is intentionally not inferred here. Ordinary play-by-play does not
// contain tracking for all 22 players; renderers may reconstruct a clearly
// labelled approximation while simulated VutaDex games retain exact assignments.

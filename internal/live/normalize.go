package live

type Play struct {
	ID          string `json:"id"`
	GameID      string `json:"gameId"`
	DriveID     string `json:"driveId"`
	Quarter     int    `json:"quarter"`
	Clock       string `json:"clock"`
	Down        int    `json:"down"`
	Distance    int    `json:"distance"`
	YardLine    int    `json:"yardLine"`
	EndYardLine int    `json:"endYardLine"`
	Possession  string `json:"possession"`
	Type        string `json:"type"`
	Description string `json:"description"`
	Yards       int    `json:"yards"`
	Scoring     bool   `json:"scoring"`
}

// DrivesFromPlays derives a replay-friendly drive index from normalized plays.
// ESPN normally includes a drive reference on each play. If that reference is
// absent, a synthetic drive is started when possession changes so callers still
// receive a stable grouping without pretending to know more than the source.
func DrivesFromPlays(plays []Play) []Drive {
	if len(plays) == 0 {
		return nil
	}

	drives := make([]Drive, 0, 16)
	index := make(map[string]int, 16)
	synthetic := 0
	lastPossession := ""
	lastSyntheticID := ""

	for _, play := range plays {
		driveID := play.DriveID
		if driveID == "" {
			if lastSyntheticID == "" || play.Possession != lastPossession {
				synthetic++
				lastSyntheticID = "synthetic-" + itoa(synthetic)
			}
			driveID = lastSyntheticID
		}
		lastPossession = play.Possession

		idx, ok := index[driveID]
		if !ok {
			idx = len(drives)
			index[driveID] = idx
			drives = append(drives, Drive{
				ID:            driveID,
				Possession:    play.Possession,
				StartYardLine: play.YardLine,
				EndYardLine:   play.EndYardLine,
			})
		}
		drive := &drives[idx]
		drive.PlayIDs = append(drive.PlayIDs, play.ID)
		drive.Yards += play.Yards
		drive.EndYardLine = play.EndYardLine
		drive.Scoring = drive.Scoring || play.Scoring
	}
	return drives
}

func itoa(v int) string {
	if v == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for v > 0 {
		i--
		buf[i] = byte('0' + v%10)
		v /= 10
	}
	return string(buf[i:])
}

// Movement is intentionally not inferred here. Ordinary play-by-play does not
// contain tracking for all 22 players; renderers may reconstruct a clearly
// labelled approximation while simulated VutaDex games retain exact assignments.

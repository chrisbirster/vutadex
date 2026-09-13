package league

import "github.com/chrisbirster/vutadex/internal/football/model"

type Matchup struct {
	Week   int    `json:"week"`
	HomeID string `json:"homeId"`
	AwayID string `json:"awayId"`
}

// Schedule generates a deterministic single round-robin. Odd team counts get
// a bye represented internally by an empty slot and never emitted as a game.
func Schedule(l model.League) []Matchup {
	ids := make([]string, 0, len(l.Teams)+1)
	for _, team := range l.Teams {
		ids = append(ids, team.ID)
	}
	if len(ids)%2 != 0 {
		ids = append(ids, "")
	}
	if len(ids) < 2 {
		return nil
	}

	rounds := len(ids) - 1
	half := len(ids) / 2
	out := make([]Matchup, 0, rounds*half)
	rotation := append([]string(nil), ids...)
	for week := 1; week <= rounds; week++ {
		for i := 0; i < half; i++ {
			a := rotation[i]
			b := rotation[len(rotation)-1-i]
			if a == "" || b == "" {
				continue
			}
			if (week+i)%2 == 0 {
				a, b = b, a
			}
			out = append(out, Matchup{Week: week, HomeID: a, AwayID: b})
		}
		last := rotation[len(rotation)-1]
		copy(rotation[2:], rotation[1:len(rotation)-1])
		rotation[1] = last
	}
	return out
}

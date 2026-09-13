package game

import "fmt"

type CoachingMetrics struct {
	FourthDownDecisions int `json:"fourthDownDecisions"`
	FourthDownCorrect   int `json:"fourthDownCorrect"`
	DelayOfGames        int `json:"delayOfGames"`
	ClockDecisions      int `json:"clockDecisions"`
	ClockCorrect        int `json:"clockCorrect"`
	Audibles            int `json:"audibles"`
}

type CoachingGrade struct {
	Overall         int      `json:"overall"`
	DecisionMaking  int      `json:"decisionMaking"`
	Discipline      int      `json:"discipline"`
	ClockManagement int      `json:"clockManagement"`
	Samples         int      `json:"samples"`
	Summary         []string `json:"summary"`
}

func grade(metrics CoachingMetrics) CoachingGrade {
	decision := 100
	if metrics.FourthDownDecisions > 0 {
		decision = percentage(metrics.FourthDownCorrect, metrics.FourthDownDecisions)
	}
	discipline := maxGrade(0, 100-metrics.DelayOfGames*25)
	clock := 100
	if metrics.ClockDecisions > 0 {
		clock = percentage(metrics.ClockCorrect, metrics.ClockDecisions)
	}

	summary := make([]string, 0, 4)
	if metrics.FourthDownDecisions > metrics.FourthDownCorrect {
		summary = append(summary, fmt.Sprintf("Matched the fourth-down recommendation on %d of %d graded decisions.", metrics.FourthDownCorrect, metrics.FourthDownDecisions))
	}
	if metrics.DelayOfGames > 0 {
		summary = append(summary, fmt.Sprintf("Committed %d delay-of-game violation(s).", metrics.DelayOfGames))
	}
	if metrics.ClockDecisions > metrics.ClockCorrect {
		summary = append(summary, fmt.Sprintf("Made %d of %d graded clock-management choices in the preferred situation.", metrics.ClockCorrect, metrics.ClockDecisions))
	}
	if metrics.Audibles > 0 {
		summary = append(summary, fmt.Sprintf("Changed the original pre-snap call %d time(s); audibles are recorded but not automatically rewarded.", metrics.Audibles))
	}
	if len(summary) == 0 {
		summary = append(summary, "No graded situational mistakes recorded yet.")
	}

	return CoachingGrade{
		Overall:         (decision + discipline + clock) / 3,
		DecisionMaking:  decision,
		Discipline:      discipline,
		ClockManagement: clock,
		Samples:         metrics.FourthDownDecisions + metrics.DelayOfGames + metrics.ClockDecisions,
		Summary:         summary,
	}
}

func recordFourthDown(game *Demo, playID string) {
	advice := fourthDownAdvice(game.State)
	if advice == nil {
		return
	}
	game.Metrics.FourthDownDecisions++
	if decisionKind(playID) == advice.Kind {
		game.Metrics.FourthDownCorrect++
	}
}

func recordClockPlay(game *Demo, playID string) {
	switch playID {
	case "special-spike":
		game.Metrics.ClockDecisions++
		if (game.State.Quarter == 2 || game.State.Quarter == 4) && game.State.Clock <= 120 && game.State.Down < 4 {
			game.Metrics.ClockCorrect++
		}
	case "special-kneel":
		game.Metrics.ClockDecisions++
		if game.State.Quarter == 4 && game.State.Clock <= 120 && game.State.HomeScore > game.State.AwayScore {
			game.Metrics.ClockCorrect++
		}
	}
}

func recordHurryUp(game *Demo) {
	game.Metrics.ClockDecisions++
	if (game.State.Quarter == 2 || game.State.Quarter == 4) && game.State.Clock <= 180 && game.State.HomeScore < game.State.AwayScore {
		game.Metrics.ClockCorrect++
	}
}

func decisionKind(playID string) string {
	switch playID {
	case "special-punt":
		return "punt"
	case "special-field-goal":
		return "field_goal"
	case "special-kneel", "special-spike":
		return "other"
	default:
		return "go"
	}
}

func percentage(correct, total int) int {
	if total <= 0 {
		return 100
	}
	return correct * 100 / total
}

func maxGrade(a, b int) int {
	if a > b {
		return a
	}
	return b
}

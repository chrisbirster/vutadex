package game

import "testing"

func TestGradePenalizesObservableMistakes(t *testing.T) {
	metrics := CoachingMetrics{
		FourthDownDecisions: 2,
		FourthDownCorrect:   1,
		DelayOfGames:        1,
		ClockDecisions:      2,
		ClockCorrect:        1,
		Audibles:            3,
	}
	got := grade(metrics)
	if got.DecisionMaking != 50 || got.Discipline != 75 || got.ClockManagement != 50 {
		t.Fatalf("unexpected grade: %#v", got)
	}
	if got.Overall != 58 || got.Samples != 5 {
		t.Fatalf("unexpected aggregate grade: %#v", got)
	}
	if len(got.Summary) == 0 {
		t.Fatal("expected human-readable grading notes")
	}
}

func TestDecisionKindDoesNotRewardSituationalNonPlay(t *testing.T) {
	if got := decisionKind("special-kneel"); got != "other" {
		t.Fatalf("kneel should not satisfy a go-for-it recommendation: %q", got)
	}
	if got := decisionKind("gun-trips-stick"); got != "go" {
		t.Fatalf("normal offensive play should be a go-for-it decision: %q", got)
	}
}

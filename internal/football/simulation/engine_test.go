package simulation

import "testing"

func TestSimulationDeterministic(t *testing.T) {
	e := New()
	a, ae := e.Simulate("g", "X", "O", 42)
	b, be := e.Simulate("g", "X", "O", 42)
	if a.HomeScore != b.HomeScore || a.AwayScore != b.AwayScore || len(ae) != len(be) {
		t.Fatalf("same seed diverged: %#v %#v", a, b)
	}
}

func TestSimulationFinishes(t *testing.T) {
	e := New()
	s, _ := e.Simulate("g", "X", "O", 99)
	if !s.Finished {
		t.Fatal("game did not finish")
	}
	if s.Quarter != 5 {
		t.Fatalf("unexpected terminal quarter %d", s.Quarter)
	}
}

func TestPuntAtPeriodEndAdvancesQuarter(t *testing.T) {
	e := New()
	s := NewGame("g", "X", "O", 7)
	s.Clock = 1
	s.Down = 4
	e.Play(&s, Punt)
	if s.Quarter != 2 || s.Clock != 900 {
		t.Fatalf("punt did not advance period: %#v", s)
	}
	if s.Down != 1 {
		t.Fatalf("punt did not reset series: %#v", s)
	}
}

func TestDefensiveMatchupDeterministic(t *testing.T) {
	e := New()
	a := NewGame("g", "X", "O", 1234)
	b := a
	a.Possession = a.HomeID
	b.Possession = b.HomeID
	aEvent := e.PlayAgainst(&a, DeepPass, DefenseBlitz)
	bEvent := e.PlayAgainst(&b, DeepPass, DefenseBlitz)
	if a != b || aEvent != bEvent {
		t.Fatalf("same offensive/defensive calls diverged: %#v %#v / %#v %#v", a, b, aEvent, bEvent)
	}
}

func TestSpikeStopsClockAndConsumesDown(t *testing.T) {
	e := New()
	s := NewGame("g", "X", "O", 77)
	s.Possession = s.HomeID
	s.Clock = 55
	event := e.Play(&s, Spike)
	if event.Type != "spike" || s.Clock != 54 || s.Down != 2 || s.Ball != 25 {
		t.Fatalf("unexpected spike result: %#v %#v", s, event)
	}
}

func TestKneelBurnsClockAndLosesOneYard(t *testing.T) {
	e := New()
	s := NewGame("g", "X", "O", 88)
	s.Possession = s.HomeID
	s.Clock = 90
	event := e.Play(&s, Kneel)
	if event.Type != "kneel" || s.Clock != 50 || s.Down != 2 || s.Ball != 24 {
		t.Fatalf("unexpected kneel result: %#v %#v", s, event)
	}
}

package auth

import (
	"testing"
	"time"
)

func TestLimiterWindow(t *testing.T) {
	l := NewLimiter(2, time.Minute)
	now := time.Unix(1_000, 0)
	if !l.Allow("a", now) || !l.Allow("a", now) {
		t.Fatal("initial requests should pass")
	}
	if l.Allow("a", now) {
		t.Fatal("third request should be rejected")
	}
	if !l.Allow("a", now.Add(time.Minute+time.Second)) {
		t.Fatal("request after window should pass")
	}
}

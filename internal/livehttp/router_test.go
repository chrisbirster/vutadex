package livehttp

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/chrisbirster/vutadex/internal/live"
)

type fakeProvider struct{}

func (fakeProvider) Game(context.Context, string) (json.RawMessage, error) {
	return json.RawMessage(`{}`), nil
}
func (fakeProvider) Plays(context.Context, string) ([]live.Play, error) {
	return []live.Play{{ID: "p1", GameID: "g1"}}, nil
}
func (fakeProvider) Situation(context.Context, string) (live.Situation, error) {
	return live.Situation{GameID: "g1", Down: 2}, nil
}
func (fakeProvider) Gamecast(context.Context, string) (live.Gamecast, error) {
	return live.Gamecast{GameID: "g1", Source: "test", RefreshedAt: time.Unix(0, 0).UTC()}, nil
}

func TestGamecastRoute(t *testing.T) {
	h := New(http.NotFoundHandler(), Options{Provider: fakeProvider{}})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/live/espn/g1/gamecast", nil)
	res := httptest.NewRecorder()
	h.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", res.Code, res.Body.String())
	}
	if got := res.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("content-type=%q", got)
	}
}

package espn

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

func TestNormalizedGamecastAndCache(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.URL.Path == "/v2/sports/football/leagues/nfl/events/401/competitions/401/plays":
			_, _ = w.Write([]byte(`{"items":[{"id":"p1","text":"Runner right tackle for 13 yards","scoringPlay":false,"statYardage":13,"type":{"text":"Rush"},"period":{"number":1},"clock":{"displayValue":"14:55"},"start":{"down":1,"distance":10,"yardLine":24,"team":{"$ref":"https://example.test/teams/sea"}},"end":{"yardLine":37},"drive":{"$ref":"https://example.test/drives/d1"}}]}`))
		case r.URL.Path == "/v2/sports/football/leagues/nfl/events/401/competitions/401/situation":
			_, _ = w.Write([]byte(`{"down":2,"distance":7,"yardLine":37,"isRedZone":false,"homeTimeouts":3,"awayTimeouts":3,"possession":{"$ref":"https://example.test/teams/sea"},"lastPlay":{"$ref":"https://example.test/plays/p1"}}`))
		case r.URL.Path == "/apis/site/v2/sports/football/nfl/summary":
			_, _ = w.Write([]byte(`{"header":{"id":"401"}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	provider := NewWithBases(server.URL, server.URL, server.Client())
	ctx := context.Background()
	gamecast, err := provider.Gamecast(ctx, "401")
	if err != nil {
		t.Fatal(err)
	}
	if len(gamecast.Plays) != 1 || len(gamecast.Drives) != 1 {
		t.Fatalf("unexpected gamecast: %#v", gamecast)
	}
	play := gamecast.Plays[0]
	if play.Possession != "sea" || play.DriveID != "d1" || play.Yards != 13 {
		t.Fatalf("unexpected play: %#v", play)
	}
	if gamecast.Situation.LastPlayID != "p1" || gamecast.Situation.Down != 2 {
		t.Fatalf("unexpected situation: %#v", gamecast.Situation)
	}

	if _, err := provider.Plays(ctx, "401"); err != nil {
		t.Fatal(err)
	}
	if got := requests.Load(); got != 2 {
		t.Fatalf("expected cached plays request; upstream requests=%d", got)
	}
}

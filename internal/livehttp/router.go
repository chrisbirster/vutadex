package livehttp

import (
	"encoding/json"
	"net/http"

	"github.com/chrisbirster/vutadex/internal/live"
)

type Options struct {
	Provider live.Provider
}

func New(next http.Handler, o Options) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/live/espn/{gameID}/plays", func(w http.ResponseWriter, r *http.Request) {
		if o.Provider == nil {
			problem(w, http.StatusServiceUnavailable, "live provider unavailable")
			return
		}
		plays, err := o.Provider.Plays(r.Context(), r.PathValue("gameID"))
		if err != nil {
			problem(w, http.StatusBadGateway, err.Error())
			return
		}
		jsonOut(w, http.StatusOK, map[string]any{"plays": plays})
	})
	mux.HandleFunc("GET /api/v1/live/espn/{gameID}/situation", func(w http.ResponseWriter, r *http.Request) {
		if o.Provider == nil {
			problem(w, http.StatusServiceUnavailable, "live provider unavailable")
			return
		}
		situation, err := o.Provider.Situation(r.Context(), r.PathValue("gameID"))
		if err != nil {
			problem(w, http.StatusBadGateway, err.Error())
			return
		}
		jsonOut(w, http.StatusOK, situation)
	})
	mux.HandleFunc("GET /api/v1/live/espn/{gameID}/gamecast", func(w http.ResponseWriter, r *http.Request) {
		if o.Provider == nil {
			problem(w, http.StatusServiceUnavailable, "live provider unavailable")
			return
		}
		gamecast, err := o.Provider.Gamecast(r.Context(), r.PathValue("gameID"))
		if err != nil {
			problem(w, http.StatusBadGateway, err.Error())
			return
		}
		jsonOut(w, http.StatusOK, gamecast)
	})
	mux.Handle("/", next)
	return mux
}

func jsonOut(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func problem(w http.ResponseWriter, status int, detail string) {
	jsonOut(w, status, map[string]any{"status": status, "detail": detail})
}

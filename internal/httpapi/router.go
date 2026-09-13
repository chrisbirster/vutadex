package httpapi

import (
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/chrisbirster/vutadex/internal/auth"
	"github.com/chrisbirster/vutadex/internal/football/playbook"
	"github.com/chrisbirster/vutadex/internal/football/simulation"
	"github.com/chrisbirster/vutadex/internal/game"
	"github.com/chrisbirster/vutadex/internal/live/espn"
	"github.com/chrisbirster/vutadex/internal/realtime"
)

type Options struct {
	MarketingOrigin string
	GameOrigin      string
	CookieSecure    bool
	Auth            *auth.Service
	Hub             *realtime.Hub
	ESPN            *espn.Provider
}

func New(web http.Handler, o Options) http.Handler {
	mux := http.NewServeMux()
	engine := simulation.New()
	games := game.NewDemoStore(engine)
	emailLimiter := auth.NewLimiter(5, 10*time.Minute)
	ipLimiter := auth.NewLimiter(20, 10*time.Minute)

	mux.HandleFunc("GET /api/v1/healthz", func(w http.ResponseWriter, r *http.Request) {
		jsonOut(w, http.StatusOK, map[string]any{"ok": true, "time": time.Now().UTC()})
	})
	mux.HandleFunc("GET /api/v1/meta", func(w http.ResponseWriter, r *http.Request) {
		jsonOut(w, http.StatusOK, map[string]any{"marketingOrigin": o.MarketingOrigin, "gameOrigin": o.GameOrigin, "engineVersion": engine.Version()})
	})
	mux.HandleFunc("GET /api/v1/playbooks", func(w http.ResponseWriter, r *http.Request) {
		jsonOut(w, http.StatusOK, map[string]any{"offense": playbook.OffenseCore, "defense": playbook.DefenseCore})
	})
	mux.HandleFunc("POST /api/v1/demo/simulate", func(w http.ResponseWriter, r *http.Request) {
		seed := parseSeed(r, 42)
		state, events := engine.Simulate("demo", "team-x", "team-o", seed)
		if o.Hub != nil {
			o.Hub.Broadcast(r.Context(), "demo", map[string]any{"type": "simulation", "state": state, "events": events})
		}
		jsonOut(w, http.StatusOK, map[string]any{"state": state, "events": events})
	})
	mux.HandleFunc("POST /api/v1/demo/games", func(w http.ResponseWriter, r *http.Request) {
		created := games.Create(parseSeed(r, uint64(time.Now().UnixNano())))
		jsonOut(w, http.StatusCreated, created)
	})
	mux.HandleFunc("GET /api/v1/demo/games/{gameID}", func(w http.ResponseWriter, r *http.Request) {
		current, err := games.Get(r.PathValue("gameID"))
		if err != nil {
			gameProblem(w, err)
			return
		}
		jsonOut(w, http.StatusOK, current)
	})
	mux.HandleFunc("POST /api/v1/demo/games/{gameID}/plays", func(w http.ResponseWriter, r *http.Request) {
		var in game.Decision
		if err := decode(r, &in); err != nil {
			problem(w, http.StatusBadRequest, "invalid json")
			return
		}
		current, newEvents, err := games.CallDecision(r.PathValue("gameID"), in)
		if err != nil {
			gameProblem(w, err)
			return
		}
		if o.Hub != nil {
			o.Hub.Broadcast(r.Context(), current.State.ID, map[string]any{"type": "snap", "game": current, "newEvents": newEvents})
		}
		jsonOut(w, http.StatusOK, current)
	})
	mux.HandleFunc("POST /api/v1/demo/games/{gameID}/actions", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Action string `json:"action"`
		}
		if err := decode(r, &in); err != nil {
			problem(w, http.StatusBadRequest, "invalid json")
			return
		}
		current, event, err := games.Action(r.PathValue("gameID"), in.Action)
		if err != nil {
			gameProblem(w, err)
			return
		}
		if o.Hub != nil {
			o.Hub.Broadcast(r.Context(), current.State.ID, map[string]any{"type": "coaching", "game": current, "event": event})
		}
		jsonOut(w, http.StatusOK, current)
	})
	mux.HandleFunc("POST /api/v1/auth/magic-link", func(w http.ResponseWriter, r *http.Request) {
		if o.Auth == nil {
			problem(w, http.StatusServiceUnavailable, "auth unavailable")
			return
		}
		var in struct {
			Email string `json:"email"`
		}
		if err := decode(r, &in); err != nil {
			problem(w, http.StatusBadRequest, "invalid json")
			return
		}
		email := strings.ToLower(strings.TrimSpace(in.Email))
		now := time.Now()
		if !ipLimiter.Allow(clientKey(r), now) || !emailLimiter.Allow(email, now) {
			w.Header().Set("Retry-After", "600")
			problem(w, http.StatusTooManyRequests, "too many sign-in requests")
			return
		}
		if err := o.Auth.Request(r.Context(), email); err != nil {
			problem(w, http.StatusBadRequest, err.Error())
			return
		}
		jsonOut(w, http.StatusAccepted, map[string]bool{"sent": true})
	})
	mux.HandleFunc("POST /api/v1/auth/verify", func(w http.ResponseWriter, r *http.Request) {
		if o.Auth == nil {
			problem(w, http.StatusServiceUnavailable, "auth unavailable")
			return
		}
		var in struct {
			Token string `json:"token"`
		}
		if err := decode(r, &in); err != nil {
			problem(w, http.StatusBadRequest, "invalid json")
			return
		}
		raw, u, err := o.Auth.Verify(r.Context(), in.Token)
		if err != nil {
			problem(w, http.StatusUnauthorized, err.Error())
			return
		}
		http.SetCookie(w, &http.Cookie{Name: "vutadex_session", Value: raw, Path: "/", HttpOnly: true, Secure: o.CookieSecure, SameSite: http.SameSiteLaxMode, MaxAge: 30 * 24 * 3600})
		jsonOut(w, http.StatusOK, u)
	})
	mux.HandleFunc("GET /api/v1/auth/session", func(w http.ResponseWriter, r *http.Request) {
		u, err := session(r, o.Auth)
		if err != nil {
			problem(w, http.StatusUnauthorized, "not authenticated")
			return
		}
		jsonOut(w, http.StatusOK, u)
	})
	mux.HandleFunc("POST /api/v1/auth/logout", func(w http.ResponseWriter, r *http.Request) {
		if c, err := r.Cookie("vutadex_session"); err == nil && o.Auth != nil {
			_ = o.Auth.Logout(r.Context(), c.Value)
		}
		http.SetCookie(w, &http.Cookie{Name: "vutadex_session", Value: "", Path: "/", HttpOnly: true, Secure: o.CookieSecure, MaxAge: -1, SameSite: http.SameSiteLaxMode})
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("GET /api/v1/live/espn/{gameID}", func(w http.ResponseWriter, r *http.Request) {
		if o.ESPN == nil {
			problem(w, http.StatusServiceUnavailable, "live provider unavailable")
			return
		}
		raw, err := o.ESPN.Game(r.Context(), r.PathValue("gameID"))
		if err != nil {
			problem(w, http.StatusBadGateway, err.Error())
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(raw)
	})
	mux.HandleFunc("GET /ws/v1/games/{gameID}", func(w http.ResponseWriter, r *http.Request) {
		if o.Hub == nil {
			http.Error(w, "realtime unavailable", http.StatusServiceUnavailable)
			return
		}
		o.Hub.ServeGame(w, r, r.PathValue("gameID"))
	})
	mux.Handle("/", web)
	return securityHeaders(mux, o)
}

func parseSeed(r *http.Request, fallback uint64) uint64 {
	raw := r.URL.Query().Get("seed")
	if raw == "" {
		return fallback
	}
	seed, err := strconv.ParseUint(raw, 10, 64)
	if err != nil {
		return fallback
	}
	return seed
}

func gameProblem(w http.ResponseWriter, err error) {
	status := http.StatusBadRequest
	switch {
	case strings.Contains(err.Error(), "not found"):
		status = http.StatusNotFound
	case strings.Contains(err.Error(), "final"), strings.Contains(err.Error(), "waiting"):
		status = http.StatusConflict
	}
	problem(w, status, err.Error())
}

func clientKey(r *http.Request) string {
	if ip := strings.TrimSpace(r.Header.Get("Fly-Client-IP")); ip != "" {
		return ip
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil && host != "" {
		return host
	}
	if r.RemoteAddr != "" {
		return r.RemoteAddr
	}
	return "unknown"
}

func securityHeaders(next http.Handler, o Options) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		next.ServeHTTP(w, r)
	})
}

func session(r *http.Request, s *auth.Service) (auth.User, error) {
	if s == nil {
		return auth.User{}, errors.New("auth disabled")
	}
	c, err := r.Cookie("vutadex_session")
	if err != nil {
		return auth.User{}, err
	}
	return s.Session(r.Context(), c.Value)
}

func decode(r *http.Request, v any) error {
	defer r.Body.Close()
	return json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20)).Decode(v)
}

func jsonOut(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func problem(w http.ResponseWriter, status int, msg string) {
	jsonOut(w, status, map[string]any{"error": strings.TrimSpace(msg)})
}

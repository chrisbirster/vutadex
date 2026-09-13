package seasonhttp

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/chrisbirster/vutadex/internal/auth"
	"github.com/chrisbirster/vutadex/internal/franchise"
	"github.com/chrisbirster/vutadex/internal/season"
)

type Options struct {
	Service *season.Service
	Access  franchise.Authorizer
	Auth    *auth.Service
}

func New(next http.Handler, o Options) http.Handler {
	if o.Service == nil || o.Access == nil || o.Auth == nil {
		return next
	}
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/v1/seasons/{leagueID}/{season}", func(w http.ResponseWriter, r *http.Request) {
		leagueID := r.PathValue("leagueID")
		if _, ok := requireLeagueManager(w, r, o, leagueID); !ok {
			return
		}
		year, ok := parseSeason(w, r.PathValue("season"))
		if !ok {
			return
		}
		snapshot, err := o.Service.Snapshot(r.Context(), leagueID, year)
		if err != nil {
			seasonProblem(w, err)
			return
		}
		jsonOut(w, http.StatusOK, snapshot)
	})
	mux.HandleFunc("GET /api/v1/seasons/{leagueID}/{season}/standings", func(w http.ResponseWriter, r *http.Request) {
		leagueID := r.PathValue("leagueID")
		if _, ok := requireLeagueManager(w, r, o, leagueID); !ok {
			return
		}
		year, ok := parseSeason(w, r.PathValue("season"))
		if !ok {
			return
		}
		rows, err := o.Service.Standings(r.Context(), leagueID, year)
		if err != nil {
			seasonProblem(w, err)
			return
		}
		jsonOut(w, http.StatusOK, rows)
	})
	mux.HandleFunc("POST /api/v1/seasons/{leagueID}/{season}", func(w http.ResponseWriter, r *http.Request) {
		leagueID := r.PathValue("leagueID")
		if !requireLeagueAdmin(w, r, o, leagueID) {
			return
		}
		year, ok := parseSeason(w, r.PathValue("season"))
		if !ok {
			return
		}
		var in struct{ Seed uint64 `json:"seed"` }
		if err := decodeOptional(r, &in); err != nil {
			problem(w, http.StatusBadRequest, "invalid json")
			return
		}
		if in.Seed == 0 {
			in.Seed = uint64(year) * 0x9e3779b97f4a7c15
		}
		snapshot, err := o.Service.Create(r.Context(), leagueID, year, in.Seed)
		if err != nil {
			seasonProblem(w, err)
			return
		}
		jsonOut(w, http.StatusCreated, snapshot)
	})
	mux.HandleFunc("POST /api/v1/seasons/{leagueID}/{season}/postseason", func(w http.ResponseWriter, r *http.Request) {
		leagueID := r.PathValue("leagueID")
		if !requireLeagueAdmin(w, r, o, leagueID) {
			return
		}
		year, ok := parseSeason(w, r.PathValue("season"))
		if !ok {
			return
		}
		snapshot, err := o.Service.AdvancePostseason(r.Context(), leagueID, year)
		if err != nil {
			seasonProblem(w, err)
			return
		}
		jsonOut(w, http.StatusOK, snapshot)
	})
	mux.HandleFunc("POST /api/v1/seasons/games/{gameID}/simulate", func(w http.ResponseWriter, r *http.Request) {
		game, err := o.Service.Game(r.Context(), r.PathValue("gameID"))
		if err != nil {
			seasonProblem(w, err)
			return
		}
		if !requireLeagueAdmin(w, r, o, game.LeagueID) {
			return
		}
		final, err := o.Service.Simulate(r.Context(), game.ID)
		if err != nil {
			seasonProblem(w, err)
			return
		}
		jsonOut(w, http.StatusOK, final)
	})
	mux.HandleFunc("POST /api/v1/seasons/games/{gameID}/result", func(w http.ResponseWriter, r *http.Request) {
		game, err := o.Service.Game(r.Context(), r.PathValue("gameID"))
		if err != nil {
			seasonProblem(w, err)
			return
		}
		if !requireLeagueAdmin(w, r, o, game.LeagueID) {
			return
		}
		var in struct {
			HomeScore int `json:"homeScore"`
			AwayScore int `json:"awayScore"`
		}
		if err := decode(r, &in); err != nil {
			problem(w, http.StatusBadRequest, "invalid json")
			return
		}
		final, err := o.Service.RecordResult(r.Context(), game.ID, in.HomeScore, in.AwayScore)
		if err != nil {
			seasonProblem(w, err)
			return
		}
		jsonOut(w, http.StatusOK, final)
	})

	mux.Handle("/", next)
	return mux
}

func requireLeagueManager(w http.ResponseWriter, r *http.Request, o Options, leagueID string) (auth.User, bool) {
	u, err := currentUser(r, o.Auth)
	if err != nil {
		problem(w, http.StatusUnauthorized, "not authenticated")
		return auth.User{}, false
	}
	allowed, err := o.Access.CanManageLeague(r.Context(), u.ID, strings.TrimSpace(leagueID))
	if err != nil {
		problem(w, http.StatusInternalServerError, "could not verify league access")
		return auth.User{}, false
	}
	if !allowed {
		problem(w, http.StatusForbidden, "owner or GM role required")
		return auth.User{}, false
	}
	return u, true
}

func requireLeagueAdmin(w http.ResponseWriter, r *http.Request, o Options, leagueID string) bool {
	u, err := currentUser(r, o.Auth)
	if err != nil {
		problem(w, http.StatusUnauthorized, "not authenticated")
		return false
	}
	allowed, err := o.Access.CanAdminLeague(r.Context(), u.ID, strings.TrimSpace(leagueID))
	if err != nil {
		problem(w, http.StatusInternalServerError, "could not verify league ownership")
		return false
	}
	if !allowed {
		problem(w, http.StatusForbidden, "league owner role required")
		return false
	}
	return true
}

func currentUser(r *http.Request, service *auth.Service) (auth.User, error) {
	if service == nil {
		return auth.User{}, errors.New("auth disabled")
	}
	cookie, err := r.Cookie("vutadex_session")
	if err != nil {
		return auth.User{}, err
	}
	return service.Session(r.Context(), cookie.Value)
}

func parseSeason(w http.ResponseWriter, raw string) (int, bool) {
	year, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || year < 1 {
		problem(w, http.StatusBadRequest, "invalid season")
		return 0, false
	}
	return year, true
}

func decode(r *http.Request, value any) error {
	defer r.Body.Close()
	return json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20)).Decode(value)
}

func decodeOptional(r *http.Request, value any) error {
	if r.Body == nil || r.ContentLength == 0 {
		return nil
	}
	return decode(r, value)
}

func jsonOut(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func problem(w http.ResponseWriter, status int, message string) {
	jsonOut(w, status, map[string]string{"error": strings.TrimSpace(message)})
}

func seasonProblem(w http.ResponseWriter, err error) {
	status := http.StatusBadRequest
	if errors.Is(err, season.ErrNotFound) || strings.Contains(err.Error(), "not found") {
		status = http.StatusNotFound
	} else if strings.Contains(err.Error(), "already") || strings.Contains(err.Error(), "not complete") {
		status = http.StatusConflict
	}
	problem(w, status, err.Error())
}

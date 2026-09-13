package lifecyclehttp

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/chrisbirster/vutadex/internal/auth"
	"github.com/chrisbirster/vutadex/internal/franchise"
)

type Options struct {
	Service *franchise.LifecycleService
	Access  franchise.Authorizer
	Auth    *auth.Service
}

func New(next http.Handler, o Options) http.Handler {
	if o.Service == nil || o.Access == nil || o.Auth == nil {
		return next
	}
	mux := http.NewServeMux()

	// Override the legacy free-agent route with a scouting-safe board. True ratings
	// remain server-side; the browser receives ranges only after scouting.
	mux.HandleFunc("GET /api/v1/franchise/leagues/{leagueID}/free-agents", func(w http.ResponseWriter, r *http.Request) {
		u, ok := requireLeagueManager(w, r, o, r.PathValue("leagueID"))
		if !ok {
			return
		}
		board, err := o.Service.FreeAgentBoard(r.Context(), r.PathValue("leagueID"), u.ID)
		if err != nil {
			lifecycleProblem(w, err)
			return
		}
		jsonOut(w, http.StatusOK, board)
	})
	mux.HandleFunc("GET /api/v1/franchise/leagues/{leagueID}/draft-board", func(w http.ResponseWriter, r *http.Request) {
		u, ok := requireLeagueManager(w, r, o, r.PathValue("leagueID"))
		if !ok {
			return
		}
		board, err := o.Service.DraftBoard(r.Context(), r.PathValue("leagueID"), u.ID)
		if err != nil {
			lifecycleProblem(w, err)
			return
		}
		jsonOut(w, http.StatusOK, board)
	})
	mux.HandleFunc("GET /api/v1/franchise/leagues/{leagueID}/scouting/{playerID}", func(w http.ResponseWriter, r *http.Request) {
		u, ok := requireLeagueManager(w, r, o, r.PathValue("leagueID"))
		if !ok {
			return
		}
		report, err := o.Service.ScoutingReport(r.Context(), u.ID, r.PathValue("playerID"))
		if err != nil {
			lifecycleProblem(w, err)
			return
		}
		if report.LeagueID != r.PathValue("leagueID") {
			problem(w, http.StatusNotFound, "scouting report not found")
			return
		}
		jsonOut(w, http.StatusOK, report)
	})
	mux.HandleFunc("POST /api/v1/franchise/leagues/{leagueID}/scouting/{playerID}", func(w http.ResponseWriter, r *http.Request) {
		u, ok := requireLeagueManager(w, r, o, r.PathValue("leagueID"))
		if !ok {
			return
		}
		var in struct{ ScoutSkill int `json:"scoutSkill"` }
		if err := decode(r, &in); err != nil {
			problem(w, http.StatusBadRequest, "invalid json")
			return
		}
		if in.ScoutSkill == 0 {
			in.ScoutSkill = 70
		}
		player, err := o.Service.Scout(r.Context(), r.PathValue("leagueID"), u.ID, r.PathValue("playerID"), in.ScoutSkill)
		if err != nil {
			lifecycleProblem(w, err)
			return
		}
		jsonOut(w, http.StatusOK, player)
	})
	mux.HandleFunc("GET /api/v1/franchise/leagues/{leagueID}/injuries", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireLeagueManager(w, r, o, r.PathValue("leagueID")); !ok {
			return
		}
		injuries, err := o.Service.ActiveInjuries(r.Context(), r.PathValue("leagueID"))
		if err != nil {
			lifecycleProblem(w, err)
			return
		}
		jsonOut(w, http.StatusOK, injuries)
	})
	mux.HandleFunc("GET /api/v1/franchise/leagues/{leagueID}/lifecycle-events", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireLeagueManager(w, r, o, r.PathValue("leagueID")); !ok {
			return
		}
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		events, err := o.Service.Events(r.Context(), r.PathValue("leagueID"), limit)
		if err != nil {
			lifecycleProblem(w, err)
			return
		}
		jsonOut(w, http.StatusOK, events)
	})
	mux.HandleFunc("POST /api/v1/franchise/leagues/{leagueID}/process-week", func(w http.ResponseWriter, r *http.Request) {
		if !requireLeagueAdmin(w, r, o, r.PathValue("leagueID")) {
			return
		}
		var in struct {
			Season int    `json:"season"`
			Week   int    `json:"week"`
			Seed   uint64 `json:"seed"`
		}
		if err := decode(r, &in); err != nil {
			problem(w, http.StatusBadRequest, "invalid json")
			return
		}
		result, err := o.Service.AdvanceWeek(r.Context(), r.PathValue("leagueID"), in.Season, in.Week, in.Seed)
		if err != nil {
			lifecycleProblem(w, err)
			return
		}
		jsonOut(w, http.StatusOK, result)
	})
	mux.HandleFunc("POST /api/v1/franchise/leagues/{leagueID}/advance-season", func(w http.ResponseWriter, r *http.Request) {
		if !requireLeagueAdmin(w, r, o, r.PathValue("leagueID")) {
			return
		}
		var in struct {
			NextSeason int    `json:"nextSeason"`
			Seed       uint64 `json:"seed"`
		}
		if err := decode(r, &in); err != nil {
			problem(w, http.StatusBadRequest, "invalid json")
			return
		}
		transition, err := o.Service.AdvanceSeason(r.Context(), r.PathValue("leagueID"), in.NextSeason, in.Seed)
		if err != nil {
			lifecycleProblem(w, err)
			return
		}
		jsonOut(w, http.StatusOK, transition)
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

func decode(r *http.Request, value any) error {
	defer r.Body.Close()
	return json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20)).Decode(value)
}

func jsonOut(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func problem(w http.ResponseWriter, status int, message string) {
	jsonOut(w, status, map[string]string{"error": strings.TrimSpace(message)})
}

func lifecycleProblem(w http.ResponseWriter, err error) {
	status := http.StatusBadRequest
	if errors.Is(err, franchise.ErrNotFound) || strings.Contains(err.Error(), "not found") {
		status = http.StatusNotFound
	} else if strings.Contains(err.Error(), "changed") {
		status = http.StatusConflict
	}
	problem(w, status, err.Error())
}

package franchisehttp

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/chrisbirster/vutadex/internal/auth"
	"github.com/chrisbirster/vutadex/internal/franchise"
)

type Options struct {
	Service *franchise.Service
	Access  franchise.Authorizer
	Auth    *auth.Service
}

func New(next http.Handler, o Options) http.Handler {
	if o.Service == nil || o.Access == nil || o.Auth == nil {
		return next
	}
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/v1/franchise/leagues/{leagueID}/free-agents", func(w http.ResponseWriter, r *http.Request) {
		if _, err := currentUser(r, o.Auth); err != nil {
			problem(w, http.StatusUnauthorized, "not authenticated")
			return
		}
		players, err := o.Service.FreeAgents(r.Context(), r.PathValue("leagueID"))
		if err != nil {
			franchiseProblem(w, err)
			return
		}
		jsonOut(w, http.StatusOK, players)
	})
	mux.HandleFunc("GET /api/v1/franchise/leagues/{leagueID}/transactions", func(w http.ResponseWriter, r *http.Request) {
		if _, err := currentUser(r, o.Auth); err != nil {
			problem(w, http.StatusUnauthorized, "not authenticated")
			return
		}
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		txns, err := o.Service.Transactions(r.Context(), r.PathValue("leagueID"), limit)
		if err != nil {
			franchiseProblem(w, err)
			return
		}
		jsonOut(w, http.StatusOK, txns)
	})
	mux.HandleFunc("GET /api/v1/franchise/teams/{teamID}/cap", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireManager(w, r, o, r.PathValue("teamID")); !ok {
			return
		}
		hit, remaining, err := o.Service.TeamCap(r.Context(), r.PathValue("teamID"))
		if err != nil {
			franchiseProblem(w, err)
			return
		}
		jsonOut(w, http.StatusOK, map[string]any{"cap": o.Service.SalaryCap(), "hit": hit, "remaining": remaining})
	})
	mux.HandleFunc("GET /api/v1/franchise/teams/{teamID}/contracts", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireManager(w, r, o, r.PathValue("teamID")); !ok {
			return
		}
		contracts, err := o.Service.TeamContracts(r.Context(), r.PathValue("teamID"))
		if err != nil {
			franchiseProblem(w, err)
			return
		}
		jsonOut(w, http.StatusOK, contracts)
	})
	mux.HandleFunc("GET /api/v1/franchise/teams/{teamID}/picks", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireManager(w, r, o, r.PathValue("teamID")); !ok {
			return
		}
		season, _ := strconv.Atoi(r.URL.Query().Get("season"))
		picks, err := o.Service.TeamDraftPicks(r.Context(), r.PathValue("teamID"), season)
		if err != nil {
			franchiseProblem(w, err)
			return
		}
		jsonOut(w, http.StatusOK, picks)
	})
	mux.HandleFunc("GET /api/v1/franchise/teams/{teamID}/offers", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireManager(w, r, o, r.PathValue("teamID")); !ok {
			return
		}
		offers, err := o.Service.OffersForTeam(r.Context(), r.PathValue("teamID"))
		if err != nil {
			franchiseProblem(w, err)
			return
		}
		jsonOut(w, http.StatusOK, offers)
	})

	mux.HandleFunc("POST /api/v1/franchise/teams/{teamID}/signings", func(w http.ResponseWriter, r *http.Request) {
		teamID := r.PathValue("teamID")
		if _, ok := requireManager(w, r, o, teamID); !ok {
			return
		}
		var in struct {
			LeagueID    string `json:"leagueId"`
			PlayerID    string `json:"playerId"`
			Season      int    `json:"season"`
			Years       int    `json:"years"`
			AnnualValue int64  `json:"annualValue"`
			Guaranteed  int64  `json:"guaranteed"`
		}
		if err := decode(r, &in); err != nil {
			problem(w, http.StatusBadRequest, "invalid json")
			return
		}
		contract, err := o.Service.SignFreeAgent(r.Context(), in.LeagueID, teamID, in.PlayerID, in.Season, in.Years, in.AnnualValue, in.Guaranteed)
		if err != nil {
			franchiseProblem(w, err)
			return
		}
		jsonOut(w, http.StatusCreated, contract)
	})
	mux.HandleFunc("POST /api/v1/franchise/teams/{teamID}/players/{playerID}/release", func(w http.ResponseWriter, r *http.Request) {
		teamID := r.PathValue("teamID")
		if _, ok := requireManager(w, r, o, teamID); !ok {
			return
		}
		var in struct{ LeagueID string `json:"leagueId"` }
		if err := decode(r, &in); err != nil {
			problem(w, http.StatusBadRequest, "invalid json")
			return
		}
		if err := o.Service.Release(r.Context(), in.LeagueID, teamID, r.PathValue("playerID")); err != nil {
			franchiseProblem(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("POST /api/v1/franchise/teams/{teamID}/waiver-claims", func(w http.ResponseWriter, r *http.Request) {
		teamID := r.PathValue("teamID")
		if _, ok := requireManager(w, r, o, teamID); !ok {
			return
		}
		var in struct {
			LeagueID string `json:"leagueId"`
			PlayerID string `json:"playerId"`
			Priority int    `json:"priority"`
		}
		if err := decode(r, &in); err != nil {
			problem(w, http.StatusBadRequest, "invalid json")
			return
		}
		claim, err := o.Service.SubmitWaiverClaim(r.Context(), in.LeagueID, teamID, in.PlayerID, in.Priority)
		if err != nil {
			franchiseProblem(w, err)
			return
		}
		jsonOut(w, http.StatusCreated, claim)
	})
	mux.HandleFunc("POST /api/v1/franchise/teams/{teamID}/draft", func(w http.ResponseWriter, r *http.Request) {
		teamID := r.PathValue("teamID")
		if _, ok := requireManager(w, r, o, teamID); !ok {
			return
		}
		var in struct {
			LeagueID string `json:"leagueId"`
			PickID   string `json:"pickId"`
			PlayerID string `json:"playerId"`
			Season   int    `json:"season"`
		}
		if err := decode(r, &in); err != nil {
			problem(w, http.StatusBadRequest, "invalid json")
			return
		}
		selection, err := o.Service.DraftPlayer(r.Context(), in.LeagueID, teamID, in.PickID, in.PlayerID, in.Season)
		if err != nil {
			franchiseProblem(w, err)
			return
		}
		jsonOut(w, http.StatusCreated, selection)
	})
	mux.HandleFunc("POST /api/v1/franchise/teams/{teamID}/offers", func(w http.ResponseWriter, r *http.Request) {
		teamID := r.PathValue("teamID")
		if _, ok := requireManager(w, r, o, teamID); !ok {
			return
		}
		var in struct {
			LeagueID      string   `json:"leagueId"`
			ToTeamID      string   `json:"toTeamId"`
			FromPlayerIDs []string `json:"fromPlayerIds"`
			ToPlayerIDs   []string `json:"toPlayerIds"`
			FromPickIDs   []string `json:"fromPickIds"`
			ToPickIDs     []string `json:"toPickIds"`
			TTLHours      int      `json:"ttlHours"`
		}
		if err := decode(r, &in); err != nil {
			problem(w, http.StatusBadRequest, "invalid json")
			return
		}
		offer, err := o.Service.CreateOffer(r.Context(), in.LeagueID, teamID, in.ToTeamID, in.FromPlayerIDs, in.ToPlayerIDs, in.FromPickIDs, in.ToPickIDs, time.Duration(in.TTLHours)*time.Hour)
		if err != nil {
			franchiseProblem(w, err)
			return
		}
		jsonOut(w, http.StatusCreated, offer)
	})
	mux.HandleFunc("POST /api/v1/franchise/offers/{offerID}/accept", func(w http.ResponseWriter, r *http.Request) {
		offer, err := o.Service.Offer(r.Context(), r.PathValue("offerID"))
		if err != nil {
			franchiseProblem(w, err)
			return
		}
		if _, ok := requireManager(w, r, o, offer.ToTeamID); !ok {
			return
		}
		txn, err := o.Service.AcceptOffer(r.Context(), offer.ID, offer.ToTeamID)
		if err != nil {
			franchiseProblem(w, err)
			return
		}
		jsonOut(w, http.StatusOK, txn)
	})
	mux.HandleFunc("POST /api/v1/franchise/offers/{offerID}/cpu-decision", func(w http.ResponseWriter, r *http.Request) {
		offer, err := o.Service.Offer(r.Context(), r.PathValue("offerID"))
		if err != nil {
			franchiseProblem(w, err)
			return
		}
		if _, ok := requireManager(w, r, o, offer.FromTeamID); !ok {
			return
		}
		evaluation, err := o.Service.CPUDecision(r.Context(), offer.ID, offer.ToTeamID)
		if err != nil {
			franchiseProblem(w, err)
			return
		}
		jsonOut(w, http.StatusOK, evaluation)
	})
	mux.HandleFunc("POST /api/v1/franchise/teams/{teamID}/cpu/free-agent-evaluation", func(w http.ResponseWriter, r *http.Request) {
		teamID := r.PathValue("teamID")
		if _, ok := requireManager(w, r, o, teamID); !ok {
			return
		}
		var in struct {
			PlayerID    string `json:"playerId"`
			AnnualValue int64  `json:"annualValue"`
		}
		if err := decode(r, &in); err != nil {
			problem(w, http.StatusBadRequest, "invalid json")
			return
		}
		accept, reason, err := o.Service.CPUFreeAgentDecision(r.Context(), teamID, in.PlayerID, in.AnnualValue)
		if err != nil {
			franchiseProblem(w, err)
			return
		}
		jsonOut(w, http.StatusOK, map[string]any{"accept": accept, "reason": reason})
	})

	mux.Handle("/", next)
	return mux
}

func requireManager(w http.ResponseWriter, r *http.Request, o Options, teamID string) (auth.User, bool) {
	u, err := currentUser(r, o.Auth)
	if err != nil {
		problem(w, http.StatusUnauthorized, "not authenticated")
		return auth.User{}, false
	}
	allowed, err := o.Access.CanManageTeam(r.Context(), u.ID, strings.TrimSpace(teamID))
	if err != nil {
		problem(w, http.StatusInternalServerError, "could not verify franchise access")
		return auth.User{}, false
	}
	if !allowed {
		problem(w, http.StatusForbidden, "owner or GM role required")
		return auth.User{}, false
	}
	return u, true
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

func franchiseProblem(w http.ResponseWriter, err error) {
	status := http.StatusBadRequest
	if errors.Is(err, franchise.ErrNotFound) || strings.Contains(err.Error(), "not found") {
		status = http.StatusNotFound
	} else if strings.Contains(err.Error(), "no longer") || strings.Contains(err.Error(), "already") || strings.Contains(err.Error(), "ownership changed") || strings.Contains(err.Error(), "not open") {
		status = http.StatusConflict
	}
	problem(w, status, err.Error())
}

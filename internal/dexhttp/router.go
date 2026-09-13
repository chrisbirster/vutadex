package dexhttp

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/chrisbirster/vutadex/internal/auth"
	"github.com/chrisbirster/vutadex/internal/dex"
	"github.com/chrisbirster/vutadex/internal/franchise"
)

type Options struct {
	Service *dex.HistoryService
	Access  franchise.Authorizer
	Auth    *auth.Service
}

func New(next http.Handler, o Options) http.Handler {
	if o.Service == nil || o.Access == nil || o.Auth == nil { return next }
	mux := http.NewServeMux()

	mux.HandleFunc("POST /api/v1/dex/{leagueID}/stats", func(w http.ResponseWriter,r *http.Request){
		leagueID:=r.PathValue("leagueID");if !requireAdmin(w,r,o,leagueID){return}
		var in dex.StatDelta;if err:=decode(r,&in);err!=nil{problem(w,http.StatusBadRequest,"invalid json");return};in.LeagueID=leagueID
		row,err:=o.Service.RecordStats(r.Context(),in);if err!=nil{dexProblem(w,err);return};jsonOut(w,http.StatusOK,row)
	})
	mux.HandleFunc("GET /api/v1/dex/{leagueID}/players/{playerID}/career", func(w http.ResponseWriter,r *http.Request){
		leagueID:=r.PathValue("leagueID");if !requireManager(w,r,o,leagueID){return}
		career,err:=o.Service.Career(r.Context(),leagueID,r.PathValue("playerID"));if err!=nil{dexProblem(w,err);return};jsonOut(w,http.StatusOK,career)
	})
	mux.HandleFunc("GET /api/v1/dex/{leagueID}/awards/{season}", func(w http.ResponseWriter,r *http.Request){
		leagueID:=r.PathValue("leagueID");if !requireManager(w,r,o,leagueID){return};year,ok:=parseYear(w,r.PathValue("season"));if !ok{return}
		awards,err:=o.Service.Awards(r.Context(),leagueID,year);if err!=nil{dexProblem(w,err);return};jsonOut(w,http.StatusOK,awards)
	})
	mux.HandleFunc("POST /api/v1/dex/{leagueID}/awards/{season}/finalize", func(w http.ResponseWriter,r *http.Request){
		leagueID:=r.PathValue("leagueID");if !requireAdmin(w,r,o,leagueID){return};year,ok:=parseYear(w,r.PathValue("season"));if !ok{return}
		awards,err:=o.Service.FinalizeAwards(r.Context(),leagueID,year);if err!=nil{dexProblem(w,err);return};jsonOut(w,http.StatusOK,awards)
	})
	mux.HandleFunc("GET /api/v1/dex/{leagueID}/records", func(w http.ResponseWriter,r *http.Request){
		leagueID:=r.PathValue("leagueID");if !requireManager(w,r,o,leagueID){return};records,err:=o.Service.Records(r.Context(),leagueID);if err!=nil{dexProblem(w,err);return};jsonOut(w,http.StatusOK,records)
	})
	mux.HandleFunc("POST /api/v1/dex/{leagueID}/records/rebuild", func(w http.ResponseWriter,r *http.Request){
		leagueID:=r.PathValue("leagueID");if !requireAdmin(w,r,o,leagueID){return};records,err:=o.Service.RebuildRecords(r.Context(),leagueID);if err!=nil{dexProblem(w,err);return};jsonOut(w,http.StatusOK,records)
	})
	mux.HandleFunc("GET /api/v1/dex/{leagueID}/hall-of-fame", func(w http.ResponseWriter,r *http.Request){
		leagueID:=r.PathValue("leagueID");if !requireManager(w,r,o,leagueID){return};entries,err:=o.Service.HallOfFame(r.Context(),leagueID);if err!=nil{dexProblem(w,err);return};jsonOut(w,http.StatusOK,entries)
	})
	mux.HandleFunc("POST /api/v1/dex/{leagueID}/hall-of-fame/evaluate", func(w http.ResponseWriter,r *http.Request){
		leagueID:=r.PathValue("leagueID");if !requireAdmin(w,r,o,leagueID){return};var in struct{Season int `json:"season"`};if err:=decode(r,&in);err!=nil||in.Season<1{problem(w,http.StatusBadRequest,"valid season required");return}
		entries,err:=o.Service.EvaluateHallOfFame(r.Context(),leagueID,in.Season);if err!=nil{dexProblem(w,err);return};jsonOut(w,http.StatusOK,entries)
	})
	mux.HandleFunc("GET /api/v1/dex/{leagueID}/rivalries", func(w http.ResponseWriter,r *http.Request){
		leagueID:=r.PathValue("leagueID");if !requireManager(w,r,o,leagueID){return};rows,err:=o.Service.Rivalries(r.Context(),leagueID);if err!=nil{dexProblem(w,err);return};jsonOut(w,http.StatusOK,rows)
	})
	mux.HandleFunc("GET /api/v1/dex/{leagueID}/search", func(w http.ResponseWriter,r *http.Request){
		leagueID:=r.PathValue("leagueID");if !requireManager(w,r,o,leagueID){return};limit,_:=strconv.Atoi(r.URL.Query().Get("limit"));results,err:=o.Service.Search(r.Context(),leagueID,r.URL.Query().Get("q"),limit);if err!=nil{dexProblem(w,err);return};jsonOut(w,http.StatusOK,results)
	})

	mux.Handle("/",next);return mux
}

func requireManager(w http.ResponseWriter,r *http.Request,o Options,leagueID string)bool{u,err:=currentUser(r,o.Auth);if err!=nil{problem(w,http.StatusUnauthorized,"not authenticated");return false};allowed,err:=o.Access.CanManageLeague(r.Context(),u.ID,strings.TrimSpace(leagueID));if err!=nil{problem(w,http.StatusInternalServerError,"could not verify league access");return false};if !allowed{problem(w,http.StatusForbidden,"owner or GM role required");return false};return true}
func requireAdmin(w http.ResponseWriter,r *http.Request,o Options,leagueID string)bool{u,err:=currentUser(r,o.Auth);if err!=nil{problem(w,http.StatusUnauthorized,"not authenticated");return false};allowed,err:=o.Access.CanAdminLeague(r.Context(),u.ID,strings.TrimSpace(leagueID));if err!=nil{problem(w,http.StatusInternalServerError,"could not verify league ownership");return false};if !allowed{problem(w,http.StatusForbidden,"league owner role required");return false};return true}
func currentUser(r *http.Request,s *auth.Service)(auth.User,error){if s==nil{return auth.User{},errors.New("auth disabled")};c,err:=r.Cookie("vutadex_session");if err!=nil{return auth.User{},err};return s.Session(r.Context(),c.Value)}
func parseYear(w http.ResponseWriter,raw string)(int,bool){year,err:=strconv.Atoi(strings.TrimSpace(raw));if err!=nil||year<1{problem(w,http.StatusBadRequest,"invalid season");return 0,false};return year,true}
func decode(r *http.Request,v any)error{defer r.Body.Close();return json.NewDecoder(http.MaxBytesReader(nil,r.Body,1<<20)).Decode(v)}
func jsonOut(w http.ResponseWriter,status int,v any){w.Header().Set("Content-Type","application/json");w.WriteHeader(status);_ = json.NewEncoder(w).Encode(v)}
func problem(w http.ResponseWriter,status int,message string){jsonOut(w,status,map[string]string{"error":strings.TrimSpace(message)})}
func dexProblem(w http.ResponseWriter,err error){status:=http.StatusBadRequest;if errors.Is(err,dex.ErrHistoryNotFound)||strings.Contains(err.Error(),"not found"){status=http.StatusNotFound};problem(w,status,err.Error())}

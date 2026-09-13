package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/chrisbirster/vutadex/internal/auth"
	"github.com/chrisbirster/vutadex/internal/database"
	"github.com/chrisbirster/vutadex/internal/httpapi"
	"github.com/chrisbirster/vutadex/internal/live/espn"
	"github.com/chrisbirster/vutadex/internal/realtime"
	webapp "github.com/chrisbirster/vutadex/internal/web"
)

func main(){
	ctx,stop:=signal.NotifyContext(context.Background(),syscall.SIGINT,syscall.SIGTERM);defer stop()
	db,err:=database.Open(ctx);if err!=nil{slog.Error("database", "error",err);os.Exit(1)};if db!=nil{defer db.Close()}
	production:=strings.EqualFold(env("VUTADEX_ENV","development"),"production")
	gameOrigin:=env("VUTADEX_GAME_ORIGIN","http://localhost:5173");marketingOrigin:=env("VUTADEX_MARKETING_ORIGIN","http://localhost:5173")
	var store auth.Store
	if db!=nil{store=auth.NewPostgresStore(db)}else{store=auth.NewMemoryStore()}
	sender,err:=emailSender(production);if err!=nil{slog.Error("auth email", "error",err);os.Exit(1)}
	authService:=auth.NewService(store,sender,gameOrigin)
	hub:=realtime.New(hostPattern(gameOrigin),hostPattern(marketingOrigin),"localhost:5173","127.0.0.1:5173")
	handler:=httpapi.New(webapp.Handler(),httpapi.Options{MarketingOrigin:marketingOrigin,GameOrigin:gameOrigin,CookieSecure:env("VUTADEX_COOKIE_SECURE","0")=="1",Auth:authService,Hub:hub,ESPN:espn.New(env("VUTADEX_ESPN_BASE_URL","https://site.api.espn.com"))})
	server:=&http.Server{Addr:":"+env("PORT","8080"),Handler:handler,ReadHeaderTimeout:5*time.Second,ReadTimeout:30*time.Second,WriteTimeout:30*time.Second,IdleTimeout:90*time.Second}
	go func(){<-ctx.Done();shutdown,cancel:=context.WithTimeout(context.Background(),10*time.Second);defer cancel();_ = server.Shutdown(shutdown)}()
	slog.Info("vutadex listening","addr",server.Addr,"environment",env("VUTADEX_ENV","development"));if err:=server.ListenAndServe();err!=nil&&err!=http.ErrServerClosed{slog.Error("server", "error",err);os.Exit(1)}
}
func emailSender(production bool)(auth.Sender,error){
	if env("VUTADEX_AUTH_LOG_LINKS","0")=="1" { if production{return nil,errors.New("VUTADEX_AUTH_LOG_LINKS is development-only")};return auth.LogSender{},nil }
	addr:=strings.TrimSpace(os.Getenv("VUTADEX_SMTP_ADDR"));user:=strings.TrimSpace(os.Getenv("VUTADEX_SMTP_USERNAME"));pass:=os.Getenv("VUTADEX_SMTP_PASSWORD");from:=strings.TrimSpace(os.Getenv("VUTADEX_AUTH_FROM"))
	if addr==""||user==""||pass==""||from==""{if production{return nil,errors.New("SES SMTP settings are required in production")};return auth.LogSender{},nil}
	return auth.SMTPSender{Addr:addr,Username:user,Password:pass,From:from},nil
}
func env(k,d string)string{if v:=strings.TrimSpace(os.Getenv(k));v!=""{return v};return d}
func hostPattern(origin string)string{v:=strings.TrimPrefix(strings.TrimPrefix(origin,"https://"),"http://");return strings.TrimSuffix(v,"/")}

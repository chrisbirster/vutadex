package espn

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Provider struct { base string; client *http.Client }
func New(base string)*Provider{if strings.TrimSpace(base)==""{base="https://site.api.espn.com"};return &Provider{base:strings.TrimRight(base,"/"),client:&http.Client{Timeout:10*time.Second}}}
func(p *Provider)Game(ctx context.Context,id string)(json.RawMessage,error){
	u:=p.base+"/apis/site/v2/sports/football/nfl/summary?event="+url.QueryEscape(id)
	req,err:=http.NewRequestWithContext(ctx,http.MethodGet,u,nil);if err!=nil{return nil,err};req.Header.Set("User-Agent","VutaDex-development-adapter/0.1")
	resp,err:=p.client.Do(req);if err!=nil{return nil,err};defer resp.Body.Close();if resp.StatusCode!=http.StatusOK{return nil,fmt.Errorf("espn status %s",resp.Status)};b,err:=io.ReadAll(io.LimitReader(resp.Body,8<<20));if err!=nil{return nil,err};if !json.Valid(b){return nil,fmt.Errorf("espn returned invalid json")};return json.RawMessage(b),nil
}

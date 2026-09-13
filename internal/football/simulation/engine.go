package simulation

import (
	"fmt"
	"github.com/chrisbirster/vutadex/internal/football/model"
)

type Call string
const (Run Call="run"; ShortPass Call="short_pass"; DeepPass Call="deep_pass"; Punt Call="punt"; FieldGoal Call="field_goal")

type Engine struct { version string }
func New() *Engine { return &Engine{version:"sim-0.1"} }
func (e *Engine) Version() string { return e.version }
func NewGame(id,home,away string,seed uint64) model.GameState { return model.GameState{ID:id,Seed:seed,HomeID:home,AwayID:away,Possession:away,Quarter:1,Clock:15*60,Down:1,Distance:10,Ball:25} }

func (e *Engine) Play(s *model.GameState, call Call) model.Event {
	if s.Finished { return model.Event{Sequence:s.PlayNumber,Type:"final",Quarter:s.Quarter,Clock:s.Clock,Description:"Game is final"} }
	rng:=newRNG(s.Seed ^ uint64(s.PlayNumber+1)*0x9e3779b97f4a7c15)
	beforeClock:=s.Clock
	elapsed:=int(18+rng.next()%23)
	if elapsed>s.Clock { elapsed=s.Clock }
	s.Clock-=elapsed
	yards:=0; typ:="play"; desc:=""; scoring:=false
	switch call {
	case Run:
		yards=int(int64(rng.next()%14)-3); desc=fmt.Sprintf("Run for %d yards",yards)
	case ShortPass:
		if rng.next()%100<70 { yards=int(rng.next()%15); desc=fmt.Sprintf("Short pass complete for %d yards",yards) } else { desc="Short pass incomplete"; s.Clock=max(0,beforeClock-6) }
	case DeepPass:
		if rng.next()%100<38 { yards=12+int(rng.next()%34); desc=fmt.Sprintf("Deep pass complete for %d yards",yards) } else { desc="Deep pass incomplete"; s.Clock=max(0,beforeClock-7) }
	case Punt:
		typ="punt"; dist:=38+int(rng.next()%18); switchPossession(s); s.Ball=clamp(100-(s.Ball+dist),10,80); resetSeries(s); s.PlayNumber++; advancePeriod(s); return model.Event{Sequence:s.PlayNumber,Type:typ,Quarter:eventQuarter(s),Clock:s.Clock,Description:fmt.Sprintf("Punt %d yards",dist)}
	case FieldGoal:
		typ="field_goal"; distance:=117-s.Ball; chance:=90-(distance-30)*2; if chance<10{chance=10}; good:=int(rng.next()%100)<chance; if good { addScore(s,3); desc=fmt.Sprintf("%d-yard field goal is good",distance) } else { desc=fmt.Sprintf("%d-yard field goal is no good",distance) }; scoring=good; switchPossession(s); s.Ball=25; resetSeries(s); s.PlayNumber++; advancePeriod(s); return model.Event{Sequence:s.PlayNumber,Type:typ,Quarter:eventQuarter(s),Clock:s.Clock,Description:desc,Scoring:scoring}
	}
	s.Ball+=yards
	if s.Ball>=100 { addScore(s,6); scoring=true; typ="touchdown"; desc="Touchdown — "+desc; switchPossession(s); s.Ball=25; resetSeries(s) } else if yards>=s.Distance { resetSeries(s) } else { s.Distance-=yards; if s.Distance<1{s.Distance=1}; s.Down++; if s.Down>4 { typ="turnover_on_downs"; desc="Turnover on downs — "+desc; switchPossession(s); s.Ball=clamp(100-s.Ball,1,99); resetSeries(s) } }
	s.PlayNumber++; advancePeriod(s)
	return model.Event{Sequence:s.PlayNumber,Type:typ,Quarter:eventQuarter(s),Clock:s.Clock,Description:desc,Yards:yards,Scoring:scoring}
}

func (e *Engine) Simulate(id,home,away string,seed uint64) (model.GameState,[]model.Event) {
	s:=NewGame(id,home,away,seed); events:=make([]model.Event,0,160)
	for !s.Finished && len(events)<260 { call:=ShortPass; if s.Down==4 { if s.Ball>=65 { call=FieldGoal } else { call=Punt } } else if (s.PlayNumber%3)==0 { call=Run } else if (s.PlayNumber%7)==0 { call=DeepPass }; events=append(events,e.Play(&s,call)) }
	return s,events
}

func advancePeriod(s *model.GameState){if s.Clock!=0{return};s.Quarter++;if s.Quarter>4{s.Finished=true;return};s.Clock=15*60}
func eventQuarter(s *model.GameState)int{if s.Finished{return 4};if s.Clock==15*60&&s.Quarter>1{return s.Quarter-1};return s.Quarter}
func resetSeries(s *model.GameState){s.Down=1;s.Distance=min(10,100-s.Ball);if s.Distance<1{s.Distance=1}}
func switchPossession(s *model.GameState){if s.Possession==s.HomeID{s.Possession=s.AwayID}else{s.Possession=s.HomeID}}
func addScore(s *model.GameState,n int){if s.Possession==s.HomeID{s.HomeScore+=n}else{s.AwayScore+=n}}
func clamp(v,lo,hi int)int{if v<lo{return lo};if v>hi{return hi};return v}
func min(a,b int)int{if a<b{return a};return b}
func max(a,b int)int{if a>b{return a};return b}

type rng struct{state uint64}
func newRNG(seed uint64)*rng{if seed==0{seed=0x6a09e667f3bcc909};return &rng{state:seed}}
func(r *rng)next()uint64{r.state+=0x9e3779b97f4a7c15;z:=r.state;z=(z^(z>>30))*0xbf58476d1ce4e5b9;z=(z^(z>>27))*0x94d049bb133111eb;return z^(z>>31)}

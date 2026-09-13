package league

import (
	"fmt"
	"hash/fnv"

	"github.com/chrisbirster/vutadex/internal/football/model"
)

var cities=[]string{"Harrisburg","Baltimore","Philadelphia","Pittsburgh","Cleveland","New York","Richmond","Columbus"}
var names=[]string{"Hounds","Barracudas","Foundry","Iron","Lakehawks","Empire","Captains","Comets"}
var first=[]string{"Marcus","Jordan","Darius","Caleb","Malik","Evan","Andre","Noah","Isaiah","Cameron","Devin","Miles"}
var last=[]string{"Vance","Carter","Harris","Brooks","Turner","Reed","Coleman","Bennett","Hayes","Foster","Price","Ward"}
var positions=[]model.Position{model.QB,model.RB,model.WR,model.WR,model.TE,model.LT,model.LG,model.C,model.RG,model.RT,model.EDGE,model.DT,model.DT,model.LB,model.LB,model.CB,model.CB,model.S,model.S,model.K,model.P}

func Generate(seed string,teams int)model.League{
	if teams<2{teams=2};if teams>len(cities){teams=len(cities)}
	r:=newRNG(hash(seed));l:=model.League{ID:"lg_"+seed,Name:"Vuta League",Season:2027,Teams:make([]model.Team,0,teams)}
	for i:=0;i<teams;i++{t:=model.Team{ID:fmt.Sprintf("tm_%02d",i+1),City:cities[i],Name:names[i],Abbreviation:abbr(cities[i]),PrimaryColor:"#17ff7a",SecondaryColor:"#07110b"};for j:=0;j<53;j++{pos:=positions[j%len(positions)];o:=62+int(r.next()%27);p:=o+int(r.next()%13);if p>99{p=99};t.Players=append(t.Players,model.Player{ID:fmt.Sprintf("pl_%02d_%03d",i+1,j+1),FirstName:first[int(r.next()%uint64(len(first)))],LastName:last[int(r.next()%uint64(len(last)))],Position:pos,Age:21+int(r.next()%13),TeamID:t.ID,Overall:o,Potential:p,Attributes:attributes(r,o,pos)})};l.Teams=append(l.Teams,t)}
	return l
}
func attributes(r *rng,o int,p model.Position)model.Attributes{a:=model.Attributes{Speed:o+int(r.next()%13)-6,Strength:o+int(r.next()%13)-6,Agility:o+int(r.next()%13)-6,Awareness:o+int(r.next()%13)-6,Stamina:o+int(r.next()%13)-6};if p==model.QB{a.ThrowPower=o+6;a.ThrowAccuracy=o+4};if p==model.WR||p==model.TE{a.RouteRunning=o+4;a.Hands=o+3};if p==model.CB||p==model.S{a.Coverage=o+4};if p==model.LB||p==model.EDGE||p==model.DT{a.Tackling=o+4};return a}
func abbr(s string)string{if len(s)>=3{return s[:3]};return s}
func hash(s string)uint64{h:=fnv.New64a();_,_=h.Write([]byte(s));return h.Sum64()}
type rng struct{v uint64};func newRNG(v uint64)*rng{return &rng{v:v}};func(r *rng)next()uint64{r.v^=r.v<<13;r.v^=r.v>>7;r.v^=r.v<<17;return r.v}

package stats

import "github.com/chrisbirster/vutadex/internal/football/model"

type TeamLine struct{Points,Plays,TotalYards,Touchdowns,FieldGoals int}
type BoxScore struct{Home,Away TeamLine}
func FromEvents(state model.GameState,events []model.Event)BoxScore{b:=BoxScore{};b.Home.Points=state.HomeScore;b.Away.Points=state.AwayScore;for _,e:=range events{if e.Type=="touchdown"{b.Home.Touchdowns++};if e.Type=="field_goal"&&e.Scoring{b.Home.FieldGoals++};b.Home.Plays++;b.Home.TotalYards+=e.Yards};return b}

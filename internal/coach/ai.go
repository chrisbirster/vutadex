package coach

import (
	"github.com/chrisbirster/vutadex/internal/football/model"
	"github.com/chrisbirster/vutadex/internal/football/simulation"
)

// Choose is intentionally transparent and deterministic. Smarter tendency and
// opponent models can replace it without changing the simulation engine.
func Choose(s model.GameState)simulation.Call{
	if s.Down==4{if s.Ball>=65{return simulation.FieldGoal};return simulation.Punt}
	if s.Distance<=3{return simulation.Run}
	if s.Distance>=11{return simulation.DeepPass}
	if s.PlayNumber%4==0{return simulation.Run}
	return simulation.ShortPass
}

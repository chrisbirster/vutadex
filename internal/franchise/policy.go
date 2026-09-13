package franchise

import "fmt"

// AssetValue is intentionally transparent and deterministic. It is not meant
// to perfectly price an NFL player; it gives CPU GMs one inspectable baseline
// that can later be adjusted by scheme fit, scouting confidence and personality.
func AssetValue(player PlayerAsset) int {
	ageFactor := 0
	switch {
	case player.Age <= 23:
		ageFactor = 14
	case player.Age <= 26:
		ageFactor = 9
	case player.Age <= 29:
		ageFactor = 3
	case player.Age >= 33:
		ageFactor = -10
	default:
		ageFactor = -3
	}
	potentialGap := player.Potential - player.Overall
	if potentialGap < 0 {
		potentialGap = 0
	}
	return player.Overall*2 + potentialGap + ageFactor
}

func DraftPickValue(pick DraftPick) int {
	// Approximate relative value by round and slot while remaining easy to read.
	base := map[int]int{1: 220, 2: 130, 3: 85, 4: 55, 5: 35, 6: 22, 7: 14}[pick.Round]
	if base == 0 {
		return 0
	}
	if pick.Pick <= 0 {
		return base
	}
	penalty := (pick.Pick - 1) / 4
	value := base - penalty
	if value < base/2 {
		value = base / 2
	}
	return value
}

func PackageValue(players []PlayerAsset, picks []DraftPick) int {
	total := 0
	for _, player := range players {
		total += AssetValue(player)
	}
	for _, pick := range picks {
		total += DraftPickValue(pick)
	}
	return total
}

// EvaluateTrade evaluates an offer from the perspective of the receiving CPU
// team. The CPU requires a small edge because accepting a trade has execution
// risk and roster opportunity cost.
func EvaluateTrade(incomingPlayers []PlayerAsset, incomingPicks []DraftPick, outgoingPlayers []PlayerAsset, outgoingPicks []DraftPick) TradeEvaluation {
	incoming := PackageValue(incomingPlayers, incomingPicks)
	outgoing := PackageValue(outgoingPlayers, outgoingPicks)
	requiredEdge := 8 + outgoing/20
	net := incoming - outgoing
	accept := net >= requiredEdge
	reason := fmt.Sprintf("incoming value %d vs outgoing %d; CPU requires +%d", incoming, outgoing, requiredEdge)
	return TradeEvaluation{Accept: accept, Incoming: incoming, Outgoing: outgoing, NetValue: net, RequiredEdge: requiredEdge, Reason: reason}
}

func ShouldSign(player PlayerAsset, annualValue, remainingCap int64) (bool, string) {
	if annualValue <= 0 {
		return false, "annual value must be positive"
	}
	if annualValue > remainingCap {
		return false, "contract does not fit under the salary cap"
	}
	// A simple price ceiling scales sharply for premium players. Values are in
	// dollars and intentionally visible so this can be tuned from simulation data.
	maxAnnual := int64(player.Overall*player.Overall) * 4_000
	if player.Age >= 32 {
		maxAnnual = maxAnnual * 80 / 100
	}
	if annualValue > maxAnnual {
		return false, fmt.Sprintf("asking price %d exceeds CPU value ceiling %d", annualValue, maxAnnual)
	}
	return true, fmt.Sprintf("asking price %d is within CPU value ceiling %d", annualValue, maxAnnual)
}

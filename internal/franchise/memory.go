package franchise

import (
	"context"
	"errors"
	"sort"
	"sync"
	"time"
)

type MemoryRepository struct {
	mu           sync.Mutex
	players      map[string]PlayerAsset
	contracts    map[string]Contract
	picks        map[string]DraftPick
	transactions []Transaction
	offers       map[string]Offer
	claims       map[string]WaiverClaim
}

func NewMemoryRepository() *MemoryRepository {
	return &MemoryRepository{
		players:   map[string]PlayerAsset{},
		contracts: map[string]Contract{},
		picks:     map[string]DraftPick{},
		offers:    map[string]Offer{},
		claims:    map[string]WaiverClaim{},
	}
}

func (r *MemoryRepository) SeedPlayer(player PlayerAsset) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if player.Status == "" {
		if player.TeamID == "" {
			player.Status = PlayerFreeAgent
		} else {
			player.Status = PlayerRoster
		}
	}
	r.players[player.ID] = player
}

func (r *MemoryRepository) SeedContract(contract Contract) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.contracts[contract.PlayerID] = contract
}

func (r *MemoryRepository) SeedDraftPick(pick DraftPick) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.picks[pick.ID] = pick
}

func (r *MemoryRepository) Player(_ context.Context, id string) (PlayerAsset, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	player, ok := r.players[id]
	if !ok {
		return PlayerAsset{}, ErrNotFound
	}
	return player, nil
}

func (r *MemoryRepository) TeamContracts(_ context.Context, teamID string) ([]Contract, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]Contract, 0)
	for _, contract := range r.contracts {
		if contract.TeamID == teamID {
			out = append(out, contract)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].AnnualValue > out[j].AnnualValue })
	return out, nil
}

func (r *MemoryRepository) FreeAgents(_ context.Context, leagueID string) ([]PlayerAsset, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]PlayerAsset, 0)
	for _, player := range r.players {
		if player.LeagueID == leagueID && player.Status == PlayerFreeAgent {
			out = append(out, player)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Overall == out[j].Overall {
			return out[i].ID < out[j].ID
		}
		return out[i].Overall > out[j].Overall
	})
	return out, nil
}

func (r *MemoryRepository) DraftPick(_ context.Context, id string) (DraftPick, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	pick, ok := r.picks[id]
	if !ok || pick.TeamID == "" {
		return DraftPick{}, ErrNotFound
	}
	return pick, nil
}

func (r *MemoryRepository) TeamDraftPicks(_ context.Context, teamID string, season int) ([]DraftPick, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]DraftPick, 0)
	for _, pick := range r.picks {
		if pick.TeamID == teamID && (season == 0 || pick.Season == season) {
			out = append(out, pick)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Season != out[j].Season {
			return out[i].Season < out[j].Season
		}
		if out[i].Round != out[j].Round {
			return out[i].Round < out[j].Round
		}
		return out[i].Pick < out[j].Pick
	})
	return out, nil
}

func (r *MemoryRepository) Transactions(_ context.Context, leagueID string, limit int) ([]Transaction, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]Transaction, 0)
	for i := len(r.transactions) - 1; i >= 0 && len(out) < limit; i-- {
		if r.transactions[i].LeagueID == leagueID {
			out = append(out, cloneTransaction(r.transactions[i]))
		}
	}
	return out, nil
}

func (r *MemoryRepository) Offer(_ context.Context, id string) (Offer, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	offer, ok := r.offers[id]
	if !ok {
		return Offer{}, ErrNotFound
	}
	if offer.Status == OfferOpen && time.Now().UTC().After(offer.ExpiresAt) {
		offer.Status = OfferExpired
		r.offers[id] = offer
	}
	return cloneOffer(offer), nil
}

func (r *MemoryRepository) OffersForTeam(_ context.Context, teamID string) ([]Offer, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]Offer, 0)
	now := time.Now().UTC()
	for id, offer := range r.offers {
		if offer.Status == OfferOpen && now.After(offer.ExpiresAt) {
			offer.Status = OfferExpired
			r.offers[id] = offer
		}
		if offer.FromTeamID == teamID || offer.ToTeamID == teamID {
			out = append(out, cloneOffer(offer))
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out, nil
}

func (r *MemoryRepository) WaiverClaims(_ context.Context, leagueID string) ([]WaiverClaim, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]WaiverClaim, 0)
	for _, claim := range r.claims {
		if claim.LeagueID == leagueID {
			out = append(out, claim)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].PlayerID != out[j].PlayerID {
			return out[i].PlayerID < out[j].PlayerID
		}
		if out[i].Priority != out[j].Priority {
			return out[i].Priority < out[j].Priority
		}
		return out[i].CreatedAt.Before(out[j].CreatedAt)
	})
	return out, nil
}

func (r *MemoryRepository) Sign(_ context.Context, contract Contract, txn Transaction) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	player, ok := r.players[contract.PlayerID]
	if !ok {
		return ErrNotFound
	}
	if player.Status != PlayerFreeAgent || player.TeamID != "" {
		return errors.New("player is no longer a free agent")
	}
	if _, exists := r.contracts[player.ID]; exists {
		return errors.New("player already has a contract")
	}
	player.TeamID = contract.TeamID
	player.Status = PlayerRoster
	r.players[player.ID] = player
	r.contracts[player.ID] = contract
	r.transactions = append(r.transactions, cloneTransaction(txn))
	return nil
}

func (r *MemoryRepository) Release(_ context.Context, teamID, playerID string, txn Transaction) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	player, ok := r.players[playerID]
	if !ok {
		return ErrNotFound
	}
	if player.TeamID != teamID || player.Status != PlayerRoster {
		return errors.New("team no longer controls player")
	}
	player.TeamID = ""
	player.Status = PlayerWaivers
	r.players[playerID] = player
	delete(r.contracts, playerID)
	r.transactions = append(r.transactions, cloneTransaction(txn))
	return nil
}

func (r *MemoryRepository) SubmitWaiverClaim(_ context.Context, claim WaiverClaim) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	player, ok := r.players[claim.PlayerID]
	if !ok {
		return ErrNotFound
	}
	if player.Status != PlayerWaivers || player.TeamID != "" {
		return errors.New("player is not on waivers")
	}
	for _, existing := range r.claims {
		if existing.PlayerID == claim.PlayerID && existing.TeamID == claim.TeamID {
			return errors.New("team already claimed player")
		}
	}
	r.claims[claim.ID] = claim
	return nil
}

func (r *MemoryRepository) AwardWaiver(_ context.Context, claim WaiverClaim, contract Contract, txn Transaction) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	player, ok := r.players[claim.PlayerID]
	if !ok {
		return ErrNotFound
	}
	if player.Status != PlayerWaivers || player.TeamID != "" {
		return errors.New("player is no longer on waivers")
	}
	if _, ok := r.claims[claim.ID]; !ok {
		return ErrNotFound
	}
	player.TeamID = claim.TeamID
	player.Status = PlayerRoster
	r.players[player.ID] = player
	r.contracts[player.ID] = contract
	for id, existing := range r.claims {
		if existing.PlayerID == claim.PlayerID {
			delete(r.claims, id)
		}
	}
	r.transactions = append(r.transactions, cloneTransaction(txn))
	return nil
}

func (r *MemoryRepository) DraftPlayer(_ context.Context, pick DraftPick, playerID string, contract Contract, txn Transaction) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	currentPick, ok := r.picks[pick.ID]
	if !ok || currentPick.TeamID == "" {
		return ErrNotFound
	}
	if currentPick.TeamID != pick.TeamID {
		return errors.New("draft pick ownership changed")
	}
	player, ok := r.players[playerID]
	if !ok {
		return ErrNotFound
	}
	if player.Status != PlayerDraft || player.TeamID != "" {
		return errors.New("player is not an available draft prospect")
	}
	player.TeamID = pick.TeamID
	player.Status = PlayerRoster
	r.players[player.ID] = player
	r.contracts[player.ID] = contract
	currentPick.TeamID = ""
	r.picks[pick.ID] = currentPick
	r.transactions = append(r.transactions, cloneTransaction(txn))
	return nil
}

func (r *MemoryRepository) SaveOffer(_ context.Context, offer Offer) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.offers[offer.ID]; exists {
		return errors.New("offer already exists")
	}
	r.offers[offer.ID] = cloneOffer(offer)
	return nil
}

func (r *MemoryRepository) SetOfferStatus(_ context.Context, id string, status OfferStatus) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	offer, ok := r.offers[id]
	if !ok {
		return ErrNotFound
	}
	offer.Status = status
	r.offers[id] = offer
	return nil
}

func (r *MemoryRepository) ExecuteTrade(_ context.Context, execution TradeExecution, txn Transaction) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, playerID := range execution.FromPlayerIDs {
		player, ok := r.players[playerID]
		if !ok || player.TeamID != execution.FromTeamID || player.Status != PlayerRoster {
			return errors.New("trade player ownership changed")
		}
	}
	for _, playerID := range execution.ToPlayerIDs {
		player, ok := r.players[playerID]
		if !ok || player.TeamID != execution.ToTeamID || player.Status != PlayerRoster {
			return errors.New("trade player ownership changed")
		}
	}
	for _, pickID := range execution.FromPickIDs {
		pick, ok := r.picks[pickID]
		if !ok || pick.TeamID != execution.FromTeamID {
			return errors.New("trade pick ownership changed")
		}
	}
	for _, pickID := range execution.ToPickIDs {
		pick, ok := r.picks[pickID]
		if !ok || pick.TeamID != execution.ToTeamID {
			return errors.New("trade pick ownership changed")
		}
	}
	for _, playerID := range execution.FromPlayerIDs {
		player := r.players[playerID]
		player.TeamID = execution.ToTeamID
		r.players[playerID] = player
		if contract, ok := r.contracts[playerID]; ok {
			contract.TeamID = execution.ToTeamID
			r.contracts[playerID] = contract
		}
	}
	for _, playerID := range execution.ToPlayerIDs {
		player := r.players[playerID]
		player.TeamID = execution.FromTeamID
		r.players[playerID] = player
		if contract, ok := r.contracts[playerID]; ok {
			contract.TeamID = execution.FromTeamID
			r.contracts[playerID] = contract
		}
	}
	for _, pickID := range execution.FromPickIDs {
		pick := r.picks[pickID]
		pick.TeamID = execution.ToTeamID
		r.picks[pickID] = pick
	}
	for _, pickID := range execution.ToPickIDs {
		pick := r.picks[pickID]
		pick.TeamID = execution.FromTeamID
		r.picks[pickID] = pick
	}
	r.transactions = append(r.transactions, cloneTransaction(txn))
	return nil
}

func cloneTransaction(in Transaction) Transaction {
	in.TeamIDs = cloneStrings(in.TeamIDs)
	in.PlayerIDs = cloneStrings(in.PlayerIDs)
	in.PickIDs = cloneStrings(in.PickIDs)
	return in
}

func cloneOffer(in Offer) Offer {
	in.FromPlayerIDs = cloneStrings(in.FromPlayerIDs)
	in.ToPlayerIDs = cloneStrings(in.ToPlayerIDs)
	in.FromPickIDs = cloneStrings(in.FromPickIDs)
	in.ToPickIDs = cloneStrings(in.ToPickIDs)
	return in
}

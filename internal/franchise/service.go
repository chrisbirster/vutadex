package franchise

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"
)

var ErrNotFound = errors.New("franchise resource not found")

type TradeExecution struct {
	LeagueID      string
	FromTeamID    string
	ToTeamID      string
	FromPlayerIDs []string
	ToPlayerIDs   []string
	FromPickIDs   []string
	ToPickIDs     []string
}

type Repository interface {
	Player(context.Context, string) (PlayerAsset, error)
	TeamContracts(context.Context, string) ([]Contract, error)
	FreeAgents(context.Context, string) ([]PlayerAsset, error)
	DraftPick(context.Context, string) (DraftPick, error)
	TeamDraftPicks(context.Context, string, int) ([]DraftPick, error)
	Transactions(context.Context, string, int) ([]Transaction, error)
	Offer(context.Context, string) (Offer, error)
	OffersForTeam(context.Context, string) ([]Offer, error)
	WaiverClaims(context.Context, string) ([]WaiverClaim, error)

	Sign(context.Context, Contract, Transaction) error
	Release(context.Context, string, string, Transaction) error
	SubmitWaiverClaim(context.Context, WaiverClaim) error
	AwardWaiver(context.Context, WaiverClaim, Contract, Transaction) error
	DraftPlayer(context.Context, DraftPick, string, Contract, Transaction) error
	SaveOffer(context.Context, Offer) error
	SetOfferStatus(context.Context, string, OfferStatus) error
	ExecuteTrade(context.Context, TradeExecution, Transaction) error
}

type Service struct {
	repo Repository
	cap  int64
}

func NewService(repo Repository, salaryCap int64) *Service {
	if salaryCap <= 0 {
		salaryCap = DefaultSalaryCap
	}
	return &Service{repo: repo, cap: salaryCap}
}

func (s *Service) SalaryCap() int64 { return s.cap }

func (s *Service) TeamCap(ctx context.Context, teamID string) (int64, int64, error) {
	contracts, err := s.repo.TeamContracts(ctx, strings.TrimSpace(teamID))
	if err != nil {
		return 0, 0, err
	}
	hit := CapHit(contracts)
	return hit, s.cap - hit, nil
}

func (s *Service) FreeAgents(ctx context.Context, leagueID string) ([]PlayerAsset, error) {
	return s.repo.FreeAgents(ctx, strings.TrimSpace(leagueID))
}

func (s *Service) SignFreeAgent(ctx context.Context, leagueID, teamID, playerID string, season, years int, annualValue, guaranteed int64) (Contract, error) {
	if years < 1 || years > 7 {
		return Contract{}, errors.New("contract years must be between 1 and 7")
	}
	if annualValue <= 0 || guaranteed < 0 || guaranteed > annualValue*int64(years) {
		return Contract{}, errors.New("invalid contract value")
	}
	player, err := s.repo.Player(ctx, strings.TrimSpace(playerID))
	if err != nil {
		return Contract{}, err
	}
	if player.TeamID != "" {
		return Contract{}, errors.New("player is not a free agent")
	}
	contracts, err := s.repo.TeamContracts(ctx, strings.TrimSpace(teamID))
	if err != nil {
		return Contract{}, err
	}
	if !CanAfford(s.cap, contracts, annualValue) {
		return Contract{}, errors.New("contract would exceed salary cap")
	}
	now := time.Now().UTC()
	contract := Contract{
		ID: id("ctr_"), LeagueID: strings.TrimSpace(leagueID), PlayerID: player.ID, TeamID: strings.TrimSpace(teamID),
		StartSeason: season, Years: years, AnnualValue: annualValue, Guaranteed: guaranteed, SignedAt: now,
	}
	txn := Transaction{
		ID: id("txn_"), LeagueID: contract.LeagueID, Type: Signing, TeamIDs: []string{contract.TeamID}, PlayerIDs: []string{player.ID},
		OccurredAt: now, Summary: fmt.Sprintf("%s %s signed a %d-year contract", player.FirstName, player.LastName, years),
	}
	if err := s.repo.Sign(ctx, contract, txn); err != nil {
		return Contract{}, err
	}
	return contract, nil
}

func (s *Service) Release(ctx context.Context, leagueID, teamID, playerID string) error {
	player, err := s.repo.Player(ctx, strings.TrimSpace(playerID))
	if err != nil {
		return err
	}
	if player.TeamID != strings.TrimSpace(teamID) {
		return errors.New("team does not control player")
	}
	now := time.Now().UTC()
	txn := Transaction{
		ID: id("txn_"), LeagueID: strings.TrimSpace(leagueID), Type: Release, TeamIDs: []string{strings.TrimSpace(teamID)}, PlayerIDs: []string{player.ID},
		OccurredAt: now, Summary: fmt.Sprintf("%s %s was released", player.FirstName, player.LastName),
	}
	return s.repo.Release(ctx, strings.TrimSpace(teamID), player.ID, txn)
}

func (s *Service) SubmitWaiverClaim(ctx context.Context, leagueID, teamID, playerID string, priority int) (WaiverClaim, error) {
	if priority < 1 {
		return WaiverClaim{}, errors.New("waiver priority must be positive")
	}
	player, err := s.repo.Player(ctx, strings.TrimSpace(playerID))
	if err != nil {
		return WaiverClaim{}, err
	}
	if player.TeamID != "" {
		return WaiverClaim{}, errors.New("player is not available on waivers")
	}
	claim := WaiverClaim{ID: id("wvr_"), LeagueID: strings.TrimSpace(leagueID), PlayerID: player.ID, TeamID: strings.TrimSpace(teamID), Priority: priority, CreatedAt: time.Now().UTC()}
	if err := s.repo.SubmitWaiverClaim(ctx, claim); err != nil {
		return WaiverClaim{}, err
	}
	return claim, nil
}

func (s *Service) ProcessWaivers(ctx context.Context, leagueID string, season int, annualValue int64) ([]WaiverClaim, error) {
	claims, err := s.repo.WaiverClaims(ctx, strings.TrimSpace(leagueID))
	if err != nil {
		return nil, err
	}
	awarded := make([]WaiverClaim, 0)
	seenPlayers := map[string]bool{}
	for _, claim := range claims {
		if seenPlayers[claim.PlayerID] {
			continue
		}
		player, err := s.repo.Player(ctx, claim.PlayerID)
		if err != nil || player.TeamID != "" {
			continue
		}
		contracts, err := s.repo.TeamContracts(ctx, claim.TeamID)
		if err != nil || !CanAfford(s.cap, contracts, annualValue) {
			continue
		}
		now := time.Now().UTC()
		contract := Contract{ID: id("ctr_"), LeagueID: claim.LeagueID, PlayerID: claim.PlayerID, TeamID: claim.TeamID, StartSeason: season, Years: 1, AnnualValue: annualValue, SignedAt: now}
		txn := Transaction{ID: id("txn_"), LeagueID: claim.LeagueID, Type: Waiver, TeamIDs: []string{claim.TeamID}, PlayerIDs: []string{claim.PlayerID}, OccurredAt: now, Summary: fmt.Sprintf("%s %s was awarded on waivers", player.FirstName, player.LastName)}
		if err := s.repo.AwardWaiver(ctx, claim, contract, txn); err != nil {
			return awarded, err
		}
		seenPlayers[claim.PlayerID] = true
		awarded = append(awarded, claim)
	}
	return awarded, nil
}

func (s *Service) DraftPlayer(ctx context.Context, leagueID, teamID, pickID, playerID string, season int) (DraftSelection, error) {
	pick, err := s.repo.DraftPick(ctx, strings.TrimSpace(pickID))
	if err != nil {
		return DraftSelection{}, err
	}
	if pick.LeagueID != strings.TrimSpace(leagueID) || pick.TeamID != strings.TrimSpace(teamID) || pick.Season != season {
		return DraftSelection{}, errors.New("team does not control draft pick")
	}
	player, err := s.repo.Player(ctx, strings.TrimSpace(playerID))
	if err != nil {
		return DraftSelection{}, err
	}
	if player.TeamID != "" {
		return DraftSelection{}, errors.New("draft prospect is already on a team")
	}
	annual := int64(1_000_000 + max(0, 8-pick.Round)*350_000)
	contracts, err := s.repo.TeamContracts(ctx, strings.TrimSpace(teamID))
	if err != nil {
		return DraftSelection{}, err
	}
	if !CanAfford(s.cap, contracts, annual) {
		return DraftSelection{}, errors.New("rookie contract would exceed salary cap")
	}
	now := time.Now().UTC()
	contract := Contract{ID: id("ctr_"), LeagueID: pick.LeagueID, PlayerID: player.ID, TeamID: pick.TeamID, StartSeason: season, Years: 4, AnnualValue: annual, Guaranteed: annual * 2, SignedAt: now}
	txn := Transaction{ID: id("txn_"), LeagueID: pick.LeagueID, Type: Draft, TeamIDs: []string{pick.TeamID}, PlayerIDs: []string{player.ID}, PickIDs: []string{pick.ID}, OccurredAt: now, Summary: fmt.Sprintf("%s selected %s %s in round %d", pick.TeamID, player.FirstName, player.LastName, pick.Round)}
	if err := s.repo.DraftPlayer(ctx, pick, player.ID, contract, txn); err != nil {
		return DraftSelection{}, err
	}
	return DraftSelection{Pick: pick, Player: player}, nil
}

func (s *Service) CreateOffer(ctx context.Context, leagueID, fromTeamID, toTeamID string, fromPlayers, toPlayers, fromPicks, toPicks []string, ttl time.Duration) (Offer, error) {
	if fromTeamID == toTeamID || strings.TrimSpace(fromTeamID) == "" || strings.TrimSpace(toTeamID) == "" {
		return Offer{}, errors.New("trade requires two different teams")
	}
	if len(fromPlayers)+len(toPlayers)+len(fromPicks)+len(toPicks) == 0 {
		return Offer{}, errors.New("trade offer must contain assets")
	}
	if ttl <= 0 {
		ttl = 24 * time.Hour
	}
	now := time.Now().UTC()
	offer := Offer{
		ID: id("off_"), LeagueID: strings.TrimSpace(leagueID), FromTeamID: strings.TrimSpace(fromTeamID), ToTeamID: strings.TrimSpace(toTeamID),
		FromPlayerIDs: cloneStrings(fromPlayers), ToPlayerIDs: cloneStrings(toPlayers), FromPickIDs: cloneStrings(fromPicks), ToPickIDs: cloneStrings(toPicks),
		Status: OfferOpen, ExpiresAt: now.Add(ttl), CreatedAt: now,
	}
	if err := s.validateOfferAssets(ctx, offer); err != nil {
		return Offer{}, err
	}
	if err := s.repo.SaveOffer(ctx, offer); err != nil {
		return Offer{}, err
	}
	return offer, nil
}

func (s *Service) EvaluateOffer(ctx context.Context, offerID, receivingTeamID string) (TradeEvaluation, error) {
	offer, err := s.repo.Offer(ctx, strings.TrimSpace(offerID))
	if err != nil {
		return TradeEvaluation{}, err
	}
	if offer.Status != OfferOpen || time.Now().UTC().After(offer.ExpiresAt) {
		return TradeEvaluation{}, errors.New("trade offer is not open")
	}
	if strings.TrimSpace(receivingTeamID) != offer.ToTeamID {
		return TradeEvaluation{}, errors.New("team is not the receiving team")
	}
	incomingPlayers, incomingPicks, outgoingPlayers, outgoingPicks, err := s.offerPackages(ctx, offer)
	if err != nil {
		return TradeEvaluation{}, err
	}
	return EvaluateTrade(incomingPlayers, incomingPicks, outgoingPlayers, outgoingPicks), nil
}

func (s *Service) AcceptOffer(ctx context.Context, offerID, receivingTeamID string) (Transaction, error) {
	offer, err := s.repo.Offer(ctx, strings.TrimSpace(offerID))
	if err != nil {
		return Transaction{}, err
	}
	if offer.Status != OfferOpen || time.Now().UTC().After(offer.ExpiresAt) {
		return Transaction{}, errors.New("trade offer is not open")
	}
	if strings.TrimSpace(receivingTeamID) != offer.ToTeamID {
		return Transaction{}, errors.New("team is not the receiving team")
	}
	if err := s.validateOfferAssets(ctx, offer); err != nil {
		return Transaction{}, err
	}
	if err := s.validatePostTradeCaps(ctx, offer); err != nil {
		return Transaction{}, err
	}
	now := time.Now().UTC()
	txn := Transaction{
		ID: id("txn_"), LeagueID: offer.LeagueID, Type: Trade, TeamIDs: []string{offer.FromTeamID, offer.ToTeamID},
		PlayerIDs: append(cloneStrings(offer.FromPlayerIDs), offer.ToPlayerIDs...), PickIDs: append(cloneStrings(offer.FromPickIDs), offer.ToPickIDs...),
		OccurredAt: now, Summary: fmt.Sprintf("%s and %s completed a trade", offer.FromTeamID, offer.ToTeamID),
	}
	execution := TradeExecution{LeagueID: offer.LeagueID, FromTeamID: offer.FromTeamID, ToTeamID: offer.ToTeamID, FromPlayerIDs: cloneStrings(offer.FromPlayerIDs), ToPlayerIDs: cloneStrings(offer.ToPlayerIDs), FromPickIDs: cloneStrings(offer.FromPickIDs), ToPickIDs: cloneStrings(offer.ToPickIDs)}
	if err := s.repo.ExecuteTrade(ctx, execution, txn); err != nil {
		return Transaction{}, err
	}
	if err := s.repo.SetOfferStatus(ctx, offer.ID, OfferAccepted); err != nil {
		return Transaction{}, err
	}
	return txn, nil
}

func (s *Service) CPUDecision(ctx context.Context, offerID, cpuTeamID string) (TradeEvaluation, error) {
	evaluation, err := s.EvaluateOffer(ctx, offerID, cpuTeamID)
	if err != nil {
		return TradeEvaluation{}, err
	}
	if !evaluation.Accept {
		_ = s.repo.SetOfferStatus(ctx, strings.TrimSpace(offerID), OfferRejected)
		return evaluation, nil
	}
	_, err = s.AcceptOffer(ctx, offerID, cpuTeamID)
	return evaluation, err
}

func (s *Service) Transactions(ctx context.Context, leagueID string, limit int) ([]Transaction, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	return s.repo.Transactions(ctx, strings.TrimSpace(leagueID), limit)
}

func (s *Service) validateOfferAssets(ctx context.Context, offer Offer) error {
	for _, playerID := range offer.FromPlayerIDs {
		player, err := s.repo.Player(ctx, playerID)
		if err != nil {
			return err
		}
		if player.TeamID != offer.FromTeamID {
			return fmt.Errorf("%s does not control player %s", offer.FromTeamID, playerID)
		}
	}
	for _, playerID := range offer.ToPlayerIDs {
		player, err := s.repo.Player(ctx, playerID)
		if err != nil {
			return err
		}
		if player.TeamID != offer.ToTeamID {
			return fmt.Errorf("%s does not control player %s", offer.ToTeamID, playerID)
		}
	}
	for _, pickID := range offer.FromPickIDs {
		pick, err := s.repo.DraftPick(ctx, pickID)
		if err != nil {
			return err
		}
		if pick.TeamID != offer.FromTeamID {
			return fmt.Errorf("%s does not control pick %s", offer.FromTeamID, pickID)
		}
	}
	for _, pickID := range offer.ToPickIDs {
		pick, err := s.repo.DraftPick(ctx, pickID)
		if err != nil {
			return err
		}
		if pick.TeamID != offer.ToTeamID {
			return fmt.Errorf("%s does not control pick %s", offer.ToTeamID, pickID)
		}
	}
	return nil
}

func (s *Service) offerPackages(ctx context.Context, offer Offer) ([]PlayerAsset, []DraftPick, []PlayerAsset, []DraftPick, error) {
	incomingPlayers, err := s.players(ctx, offer.FromPlayerIDs)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	incomingPicks, err := s.picks(ctx, offer.FromPickIDs)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	outgoingPlayers, err := s.players(ctx, offer.ToPlayerIDs)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	outgoingPicks, err := s.picks(ctx, offer.ToPickIDs)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	return incomingPlayers, incomingPicks, outgoingPlayers, outgoingPicks, nil
}

func (s *Service) players(ctx context.Context, ids []string) ([]PlayerAsset, error) {
	out := make([]PlayerAsset, 0, len(ids))
	for _, playerID := range ids {
		player, err := s.repo.Player(ctx, playerID)
		if err != nil {
			return nil, err
		}
		out = append(out, player)
	}
	return out, nil
}

func (s *Service) picks(ctx context.Context, ids []string) ([]DraftPick, error) {
	out := make([]DraftPick, 0, len(ids))
	for _, pickID := range ids {
		pick, err := s.repo.DraftPick(ctx, pickID)
		if err != nil {
			return nil, err
		}
		out = append(out, pick)
	}
	return out, nil
}

func (s *Service) validatePostTradeCaps(ctx context.Context, offer Offer) error {
	fromContracts, err := s.repo.TeamContracts(ctx, offer.FromTeamID)
	if err != nil {
		return err
	}
	toContracts, err := s.repo.TeamContracts(ctx, offer.ToTeamID)
	if err != nil {
		return err
	}
	fromHit := CapHit(fromContracts) - annualForPlayers(fromContracts, offer.FromPlayerIDs) + annualForPlayers(toContracts, offer.ToPlayerIDs)
	toHit := CapHit(toContracts) - annualForPlayers(toContracts, offer.ToPlayerIDs) + annualForPlayers(fromContracts, offer.FromPlayerIDs)
	if fromHit > s.cap || toHit > s.cap {
		return errors.New("trade would exceed salary cap")
	}
	return nil
}

func annualForPlayers(contracts []Contract, playerIDs []string) int64 {
	wanted := map[string]bool{}
	for _, id := range playerIDs {
		wanted[id] = true
	}
	var total int64
	for _, contract := range contracts {
		if wanted[contract.PlayerID] {
			total += contract.AnnualValue
		}
	}
	return total
}

func cloneStrings(in []string) []string { return append([]string(nil), in...) }

func id(prefix string) string {
	var buf [12]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return prefix + fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return prefix + base64.RawURLEncoding.EncodeToString(buf[:])
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
